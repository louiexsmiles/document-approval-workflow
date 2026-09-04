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
import { DocumentStage } from '../src/documents/document-stage.enum';
import { DocumentStatus } from '../src/documents/document-status.enum';
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

export type DocumentResponse = {
  id: string;
  title: string;
  body: string;
  currentStage: string;
  status: string;
  draftReviewApprover: UserResponse;
  legalReviewApprover: UserResponse;
  finalApprovalApprover: UserResponse;
};

export type TestContext = {
  app: INestApplication;
  orm: MikroORM;
  em: EntityManager;
  close: () => Promise<void>;
};

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      MikroOrmModule.forRoot(
        defineConfig({
          entities: [User, Document, ApprovalStage, StageApprover, ApprovalEvent],
          clientUrl: TEST_DATABASE_URL,
          allowGlobalContext: true,
          debug: false,
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

/** Rebuild the test schema. ensureDatabase first, so a fresh clone needs no createdb. */
export async function resetSchema(orm: MikroORM): Promise<void> {
  const generator = orm.getSchemaGenerator();
  await generator.ensureDatabase();
  await generator.refreshDatabase();
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
    currentStage: DocumentStage.DRAFT_REVIEW,
    status: DocumentStatus.IN_PROGRESS,
    draftReviewApprover: users[0],
    legalReviewApprover: users[1],
    finalApprovalApprover: users[2],
  });

  await em.flush();
  em.clear();

  return { users, document };
}
