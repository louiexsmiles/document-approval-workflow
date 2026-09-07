import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { EntityManager, defineConfig } from '@mikro-orm/postgresql';
import { ApprovalEvent } from '../src/documents/approval-event.entity';
import { ApprovalStage } from '../src/documents/approval-stage.entity';
import { Document } from '../src/documents/document.entity';
import { StageApprovalPolicy } from '../src/documents/stage-approval-policy.enum';
import { StageApprover } from '../src/documents/stage-approver.entity';
import { User } from '../src/users/user.entity';
import { DocumentsModule } from '../src/documents/documents.module';
import { UsersModule } from '../src/users/users.module';

/**
 * Tests get their own database, rebuilt before each test — dev data untouched, no
 * dependence on test order.
 *
 * SeedModule (src/seed/) is left out on purpose: it auto-inserts demo data, and a test
 * should create what it needs rather than inherit it.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/document_approval_test';

export type UserResponse = {
  id: string;
  name: string;
  email: string;
};

export type StageResponse = {
  id: string;
  position: number;
  name: string;
  policy: string;
  approvers: { user: UserResponse }[];
};

export type DocumentResponse = {
  id: string;
  title: string;
  body: string;
  status: string;
  approvalRound: number;
  stages: StageResponse[];
  currentStage: { id: string } | null;
};

export type TestContext = {
  app: INestApplication;
  orm: MikroORM;
  em: EntityManager;
  close: () => Promise<void>;
};

export type TestAppOptions = {
  /**
   * Collect every SQL statement the app runs. Lets a test assert on SQL the service emits
   * but no response can reveal — the row lock, for one, which is invisible from outside
   * until two processes contend for it.
   */
  sql?: string[];
};

export async function createTestApp(options: TestAppOptions = {}): Promise<TestContext> {
  const { sql } = options;
  const moduleRef = await Test.createTestingModule({
    imports: [
      MikroOrmModule.forRoot(
        defineConfig({
          entities: [User, Document, ApprovalStage, StageApprover, ApprovalEvent],
          clientUrl: TEST_DATABASE_URL,
          allowGlobalContext: true,
          debug: sql ? ['query'] : process.env.ORM_DEBUG === '1',
          // resetSchema runs the migrations before every test, so the migrator would
          // print hundreds of lines between results. ORM_DEBUG=1 brings it all back.
          logger: sql
            ? (message: string) => sql.push(message)
            : process.env.ORM_DEBUG === '1'
              ? console.log
              : () => undefined,
          // Registered so the migration tests can run the real migrations. Ordinary
          // tests still build their schema straight from the entities.
          migrations: { path: join(__dirname, '..', 'src', 'migrations') },
          extensions: [Migrator],
        }),
      ),
      UsersModule,
      DocumentsModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();

  // Must mirror main.ts exactly, or tests exercise different validation than production.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  const orm = app.get(MikroORM);
  const em = app.get(EntityManager);

  return {
    app,
    orm,
    em,
    close: async () => {
      await app.close();
    },
  };
}

/**
 * Rebuild the test schema by running the real migrations.
 *
 * Not refreshDatabase(), which builds from the entity classes. Anything a migration
 * creates but an entity cannot describe — triggers, functions, views — would be missing,
 * and the tests would pass against a schema production never uses.
 *
 * ensureDatabase first, so a fresh clone needs no createdb.
 */
export async function resetSchema(orm: MikroORM): Promise<void> {
  const generator = orm.getSchemaGenerator();
  await generator.ensureDatabase();
  await generator.dropSchema({ dropMigrationsTable: true });
  await orm.getMigrator().up();
}

export type Fixture = {
  users: User[];
  document: Document;
};

/**
 * A document sitting at the first stage, with a different approver at each stage —
 * so tests can prove authority is scoped to the stage, not the whole document.
 */
export async function seedDocument(em: EntityManager): Promise<Fixture> {
  const users = ['Alice', 'Bob', 'Cara', 'Dan'].map((name) =>
    em.create(User, {
      name: `${name} Test`,
      email: `${name.toLowerCase()}@test.example`,
    }),
  );

  const document = em.create(Document, {
    title: 'Invariant Fixture',
    body: 'A document used to assert workflow invariants.',
  });

  const stages = ['Draft Review', 'Legal Review', 'Final Approval'].map((name, position) => {
    const stage = em.create(ApprovalStage, {
      document,
      position,
      name,
      policy: StageApprovalPolicy.ANY,
    });
    em.create(StageApprover, { stage, user: users[position] });
    return stage;
  });

  document.currentStage = stages[0];

  await em.flush();
  em.clear();

  return { users, document };
}

/** Just the people. Documents are then created through the API, so tests exercise
 *  validation and the create path rather than reaching past them. */
export async function seedUsers(em: EntityManager): Promise<User[]> {
  const users = ['Alice', 'Bob', 'Cara', 'Dan'].map((name) =>
    em.create(User, {
      name: `${name} Test`,
      email: `${name.toLowerCase()}@test.example`,
    }),
  );
  await em.flush();
  em.clear();
  return users;
}
