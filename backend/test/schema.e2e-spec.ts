import { EntityManager } from '@mikro-orm/postgresql';
import { ApprovalStage } from '../src/documents/approval-stage.entity';
import { Document } from '../src/documents/document.entity';
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
        const doc = em.create(Document, { title, body: 'body' });
        const stage = em.create(ApprovalStage, {
          document: doc,
          position: 0,
          name: 'Review',
        });
        em.create(StageApprover, { stage, user: em.getReference(User, users[0].id) });
        // Required: a document in progress must be waiting somewhere.
        doc.currentStage = stage;
      }

      await expect(em.flush()).resolves.not.toThrow();
    });

    it('refuses a document left in progress with no current stage', async () => {
      const { document } = await seedDocument(em);

      await expect(
        em.nativeUpdate(Document, { id: document.id }, { currentStage: null }),
      ).rejects.toThrow(/cannot both be true/);
      em.clear();
    });

    it('refuses to delete the stage a document is waiting at', async () => {
      // This is the case the trigger exists for: the foreign key would set
      // current_stage_id to null and leave the document in progress but stranded.
      const { document } = await seedDocument(em);
      const stageId = document.currentStage!.id;

      await expect(
        em.nativeDelete(ApprovalStage, { id: stageId }),
      ).rejects.toThrow(/cannot both be true/);
      em.clear();
    });

    it('allows deleting a stage the document is not waiting at', async () => {
      const { document } = await seedDocument(em);
      const later = (await em.find(ApprovalStage, { document: document.id })).find(
        (s) => s.position === 2,
      )!;

      await expect(em.nativeDelete(ApprovalStage, { id: later.id })).resolves.toBe(1);
      em.clear();
    });

    it('deletes a document stages and their approvers with the document', async () => {
      const { document } = await seedDocument(em);

      expect(await em.count(ApprovalStage, { document: document.id })).toBe(3);
      expect(await em.count(StageApprover, {})).toBe(3);

      // currentStage points at a stage that is about to be deleted, so this also proves
      // the pointer does not block the delete.
      await em.nativeDelete(Document, { id: document.id });

      expect(await em.count(ApprovalStage, { document: document.id })).toBe(0);
      expect(await em.count(StageApprover, {})).toBe(0);
    });
  });
});
