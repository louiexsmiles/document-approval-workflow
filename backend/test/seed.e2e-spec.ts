import { EntityManager } from '@mikro-orm/postgresql';
import { ApprovalStage } from '../src/documents/approval-stage.entity';
import { Document } from '../src/documents/document.entity';
import { DocumentStatus } from '../src/documents/document-status.enum';
import { SeedService } from '../src/seed/seed.service';
import { User } from '../src/users/user.entity';
import { createTestApp, resetSchema, type TestContext } from './test-app';

/**
 * The seed is what someone sees the first time they run docker compose up. If it throws,
 * the app boots empty and nothing else in this suite would notice — every other test
 * builds its own fixtures.
 */
describe('seed data', () => {
  let ctx: TestContext;
  let em: EntityManager;

  beforeAll(async () => {
    ctx = await createTestApp();
    em = ctx.em;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetSchema(ctx.orm);
    em.clear();
    await new SeedService(ctx.orm, em).onModuleInit();
    em.clear();
  });

  async function documentNamed(title: string) {
    const document = await em.findOneOrFail(
      Document,
      { title },
      { populate: ['stages', 'stages.approvers', 'stages.approvers.user', 'currentStage'] },
    );
    const stages = document.stages.getItems().sort((a, b) => a.position - b.position);
    return { document, stages };
  }

  it('creates the users and documents the readme promises', async () => {
    expect(await em.count(User)).toBe(5);
    expect(await em.count(Document)).toBe(4);
  });

  it('gives the documents genuinely different workflows', async () => {
    const shapes = (
      await em.find(Document, {}, { populate: ['stages'] })
    ).map((d) => d.stages.count());

    // The point of the seed: not every document looks the same any more.
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });

  it('seeds a stage that needs every approver, not just one', async () => {
    const { stages } = await documentNamed('Data Retention Guidelines');
    const joint = stages.find((s) => s.policy === 'ALL');

    expect(joint).toBeDefined();
    expect(joint!.approvers.count()).toBeGreaterThan(1);
  });

  it('seeds a five stage contract with a stage that can refuse outright', async () => {
    const { stages } = await documentNamed('Q4 Vendor Contract — Southwest Builders');

    expect(stages).toHaveLength(5);
    expect(stages[4].rejectBehavior).toBe('TERMINAL');
  });

  it('seeds one document already finished, with no current stage', async () => {
    const { document } = await documentNamed('Incident Response Playbook');

    expect(document.status).toBe('APPROVED');
    expect(document.currentStage).toBeNull();
  });

  it('leaves every in-progress document waiting at its first stage', async () => {
    const documents = await em.find(
      Document,
      { status: DocumentStatus.IN_PROGRESS },
      { populate: ['stages', 'currentStage'] },
    );

    expect(documents.length).toBeGreaterThan(0);
    for (const document of documents) {
      expect(document.currentStage).not.toBeNull();
      expect(document.currentStage!.position).toBe(0);
    }
  });

  it('assigns at least one approver to every stage', async () => {
    const stages = await em.find(ApprovalStage, {}, { populate: ['approvers'] });

    expect(stages.length).toBeGreaterThan(0);
    for (const stage of stages) {
      expect(stage.approvers.count()).toBeGreaterThan(0);
    }
  });

  it('does not seed twice when it runs again', async () => {
    await new SeedService(ctx.orm, em).onModuleInit();
    em.clear();

    expect(await em.count(User)).toBe(5);
    expect(await em.count(Document)).toBe(4);
  });
});
