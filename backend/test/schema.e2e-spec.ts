import { EntityManager } from '@mikro-orm/postgresql';
import { ApprovalStage } from '../src/documents/approval-stage.entity';
import { Document } from '../src/documents/document.entity';
import { DocumentStage } from '../src/documents/document-stage.enum';
import { DocumentStatus } from '../src/documents/document-status.enum';
import { StageApprover } from '../src/documents/stage-approver.entity';
import { User } from '../src/users/user.entity';
import { createTestApp, resetSchema, seedDocument, type TestContext } from './test-app';

/**
 * Guards the database itself rather than the API.
 *
 * The rest of the suite builds its schema straight from the entities, so a migration
 * could be missing or wrong and every other test would still pass. These run the real
 * migrations and check the constraints we rely on are actually enforced.
 */
describe('schema', () => {
  let ctx: TestContext;
  let em: EntityManager;

  beforeAll(async () => {
    ctx = await createTestApp();
    em = ctx.em;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('migrations', () => {
    it('build a schema that matches the entity definitions', async () => {
      // dropMigrationsTable matters: without it the migration log survives, the migrator
      // believes everything is already applied, and rebuilds nothing.
      await ctx.orm.getSchemaGenerator().dropSchema({ dropMigrationsTable: true });
      await ctx.orm.getMigrator().up();

      // If the migrations and the entities agree there is nothing left to change.
      // Any DDL here means an entity was edited without a matching migration — which
      // deploys cleanly and then fails against a real database.
      const drift = await ctx.orm.getSchemaGenerator().getUpdateSchemaSQL();
      const ddl = drift
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^(create|alter|drop)\b/i.test(line));

      expect(ddl).toEqual([]);
    });
  });

  describe('constraints', () => {
    beforeEach(async () => {
      await resetSchema(ctx.orm);
    });

    it('refuses the same approver twice on one stage', async () => {
      const { document, users } = await seedDocument(em);
      const stage = em.create(ApprovalStage, {
        document: em.getReference(Document, document.id),
        position: 9,
        name: 'Duplicate Check',
      });
      em.create(StageApprover, { stage, user: em.getReference(User, users[0].id) });
      em.create(StageApprover, { stage, user: em.getReference(User, users[0].id) });

      await expect(em.flush()).rejects.toThrow();
      em.clear();
    });

    it('refuses two stages at the same position on one document', async () => {
      const { document } = await seedDocument(em);
      const docRef = em.getReference(Document, document.id);

      em.create(ApprovalStage, { document: docRef, position: 5, name: 'First' });
      em.create(ApprovalStage, { document: docRef, position: 5, name: 'Second' });

      await expect(em.flush()).rejects.toThrow();
      em.clear();
    });

    it('allows the same position on different documents', async () => {
      const { users } = await seedDocument(em);

      for (const title of ['Doc A', 'Doc B']) {
        const doc = em.create(Document, {
          title,
          body: 'body',
          currentStage: DocumentStage.DRAFT_REVIEW,
          status: DocumentStatus.IN_PROGRESS,
          draftReviewApprover: em.getReference(User, users[0].id),
          legalReviewApprover: em.getReference(User, users[1].id),
          finalApprovalApprover: em.getReference(User, users[2].id),
        });
        em.create(ApprovalStage, { document: doc, position: 0, name: 'Review' });
      }

      await expect(em.flush()).resolves.not.toThrow();
    });

    it('deletes a document stages and their approvers with the document', async () => {
      const { document, users } = await seedDocument(em);
      const stage = em.create(ApprovalStage, {
        document: em.getReference(Document, document.id),
        position: 0,
        name: 'Review',
      });
      em.create(StageApprover, { stage, user: em.getReference(User, users[0].id) });
      await em.flush();
      em.clear();

      await em.nativeDelete(Document, { id: document.id });

      expect(await em.count(ApprovalStage, { document: document.id })).toBe(0);
      expect(await em.count(StageApprover, {})).toBe(0);
    });
  });
});
