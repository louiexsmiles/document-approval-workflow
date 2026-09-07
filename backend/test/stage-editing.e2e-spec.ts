import request from 'supertest';
import type { Server } from 'http';
import { StageApprovalPolicy } from '../src/documents/stage-approval-policy.enum';
import { StageRejectBehavior } from '../src/documents/stage-reject-behavior.enum';
import {
  createTestApp,
  resetSchema,
  seedUsers,
  type DocumentResponse,
  type TestContext,
} from './test-app';

/**
 * Editing a document's workflow after it exists.
 *
 * The rule being tested: a stage holding approvals in the current round is frozen. A
 * rejection starts a new round, which unfreezes it — otherwise a stage that was rejected
 * because it was misconfigured could never be corrected.
 */
describe('editing stages', () => {
  let ctx: TestContext;
  let server: Server;
  let alice: string;
  let bob: string;
  let cara: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetSchema(ctx.orm);
    [alice, bob, cara] = (await seedUsers(ctx.em)).map((u) => u.id);
  });

  type StageInput = {
    id?: string;
    name: string;
    approverIds: string[];
    policy?: StageApprovalPolicy;
    rejectBehavior?: StageRejectBehavior;
    rejectTargetPosition?: number;
  };

  async function createDocument(stages: StageInput[]) {
    const response = await request(server)
      .post('/documents')
      .send({ title: 'Editable', body: 'Body.', stages })
      .expect(201);
    return response.body as DocumentResponse;
  }

  async function get(id: string) {
    const response = await request(server).get(`/documents/${id}`).expect(200);
    return response.body as DocumentResponse;
  }

  function patch(id: string, stages: StageInput[]) {
    return request(server).patch(`/documents/${id}/stages`).send({ stages });
  }

  const approve = (id: string, userId: string) =>
    request(server).post(`/documents/${id}/approve`).send({ userId });

  const reject = (id: string, userId: string) =>
    request(server)
      .post(`/documents/${id}/reject`)
      .send({ userId, comment: 'Wrong approver on this stage.' });

  /** Names in position order. */
  async function names(id: string): Promise<string[]> {
    const doc = await get(id);
    return doc.stages.sort((a, b) => a.position - b.position).map((s) => s.name);
  }

  const threeStages = (): StageInput[] => [
    { name: 'One', approverIds: [alice] },
    { name: 'Two', approverIds: [bob] },
    { name: 'Three', approverIds: [cara] },
  ];

  describe('what a caller can change', () => {
    it('reorders stages', async () => {
      const doc = await createDocument(threeStages());
      const [one, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { id: three.id, name: 'Three', approverIds: [cara] },
        { id: two.id, name: 'Two', approverIds: [bob] },
      ]).expect(200);

      expect(await names(doc.id)).toEqual(['One', 'Three', 'Two']);
    });

    it('renames a stage nobody has approved', async () => {
      const doc = await createDocument(threeStages());
      const [one, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { id: two.id, name: 'Compliance', approverIds: [bob] },
        { id: three.id, name: 'Three', approverIds: [cara] },
      ]).expect(200);

      expect(await names(doc.id)).toEqual(['One', 'Compliance', 'Three']);
    });

    it('adds a stage in the middle', async () => {
      const doc = await createDocument(threeStages());
      const [one, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { name: 'Inserted', approverIds: [cara] },
        { id: two.id, name: 'Two', approverIds: [bob] },
        { id: three.id, name: 'Three', approverIds: [cara] },
      ]).expect(200);

      expect(await names(doc.id)).toEqual(['One', 'Inserted', 'Two', 'Three']);
    });

    it('removes a stage nobody has approved', async () => {
      const doc = await createDocument(threeStages());
      const [one, , three] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { id: three.id, name: 'Three', approverIds: [cara] },
      ]).expect(200);

      expect(await names(doc.id)).toEqual(['One', 'Three']);
    });

    it('changes who approves and how many are needed', async () => {
      const doc = await createDocument(threeStages());
      const [one, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        {
          id: two.id,
          name: 'Two',
          approverIds: [bob, cara],
          policy: StageApprovalPolicy.ALL,
        },
        { id: three.id, name: 'Three', approverIds: [cara] },
      ]).expect(200);

      const updated = (await get(doc.id)).stages.find((s) => s.position === 1)!;
      expect(updated.policy).toBe('ALL');
      expect(updated.approvers).toHaveLength(2);
    });
  });

  describe('what the lock refuses', () => {
    it('refuses to change a stage approved in this round', async () => {
      const doc = await createDocument(threeStages());
      const [one, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await approve(doc.id, alice).expect(201);

      await patch(doc.id, [
        { id: one.id, name: 'Renamed', approverIds: [alice] },
        { id: two.id, name: 'Two', approverIds: [bob] },
        { id: three.id, name: 'Three', approverIds: [cara] },
      ]).expect(409);
    });

    it('refuses to remove a stage approved in this round', async () => {
      const doc = await createDocument(threeStages());
      const [, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await approve(doc.id, alice).expect(201);

      await patch(doc.id, [
        { id: two.id, name: 'Two', approverIds: [bob] },
        { id: three.id, name: 'Three', approverIds: [cara] },
      ]).expect(409);
    });

    it('refuses to remove the stage the document is waiting at', async () => {
      const doc = await createDocument(threeStages());
      const [one, two] = doc.stages.sort((a, b) => a.position - b.position);

      // Nobody has approved, so stage One is not locked — but it is where the document is.
      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { id: two.id, name: 'Two', approverIds: [bob] },
      ]).expect(200);

      await patch(doc.id, [{ id: two.id, name: 'Two', approverIds: [bob] }]).expect(409);
    });

    it('leaves an unrelated stage editable while another is locked', async () => {
      const doc = await createDocument(threeStages());
      const [one, two, three] = doc.stages.sort((a, b) => a.position - b.position);

      await approve(doc.id, alice).expect(201);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { id: two.id, name: 'Two', approverIds: [bob] },
        { id: three.id, name: 'Renamed Last', approverIds: [cara] },
      ]).expect(200);

      expect(await names(doc.id)).toEqual(['One', 'Two', 'Renamed Last']);
    });
  });

  describe('a rejection unfreezes what it sent back', () => {
    it('lets a stage be corrected once its approvals belong to a past round', async () => {
      // The case the amended rule exists for: the stage was misconfigured, someone
      // rejected because of it, and it has to be fixable.
      const doc = await createDocument([
        { name: 'Author', approverIds: [alice] },
        {
          name: 'Legal',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);
      const [author, legal] = doc.stages.sort((a, b) => a.position - b.position);

      await approve(doc.id, alice).expect(201);

      // Frozen while its approval counts.
      await patch(doc.id, [
        { id: author.id, name: 'Author Review', approverIds: [alice] },
        { id: legal.id, name: 'Legal', approverIds: [bob] },
      ]).expect(409);

      await reject(doc.id, bob).expect(201);

      // A new round began, so the approval no longer counts and the stage is editable.
      await patch(doc.id, [
        { id: author.id, name: 'Author Review', approverIds: [alice, cara] },
        { id: legal.id, name: 'Legal', approverIds: [bob] },
      ]).expect(200);

      expect(await names(doc.id)).toEqual(['Author Review', 'Legal']);
    });

    it('keeps the history accurate after the correction', async () => {
      const doc = await createDocument([
        { name: 'Author', approverIds: [alice] },
        {
          name: 'Legal',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);
      const [author, legal] = doc.stages.sort((a, b) => a.position - b.position);

      await approve(doc.id, alice).expect(201);
      await reject(doc.id, bob).expect(201);
      await patch(doc.id, [
        { id: author.id, name: 'Author Review', approverIds: [alice] },
        { id: legal.id, name: 'Legal', approverIds: [bob] },
      ]).expect(200);

      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);

      // Alice approved something called "Author". Renaming it later does not change that.
      expect(history.body[0].stageSnapshot.name).toBe('Author');
      expect(history.body[0].stage.name).toBe('Author Review');
    });
  });

  describe('validation', () => {
    it('refuses a stage id belonging to another document', async () => {
      const mine = await createDocument(threeStages());
      const theirs = await createDocument(threeStages());

      await patch(mine.id, [
        { id: theirs.stages[0].id, name: 'Stolen', approverIds: [alice] },
      ]).expect(400);
    });

    it('refuses the same stage listed twice', async () => {
      const doc = await createDocument(threeStages());
      const [one] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: [alice] },
        { id: one.id, name: 'One again', approverIds: [alice] },
      ]).expect(400);
    });

    it('refuses an empty stage list', async () => {
      const doc = await createDocument(threeStages());
      await patch(doc.id, []).expect(400);
    });

    it('refuses editing a finished document', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);
      const [only] = doc.stages;
      await approve(doc.id, alice).expect(201);

      await patch(doc.id, [{ id: only.id, name: 'Too late', approverIds: [alice] }]).expect(400);
    });

    it('refuses an approver who does not exist', async () => {
      const doc = await createDocument(threeStages());
      const [one] = doc.stages.sort((a, b) => a.position - b.position);

      await patch(doc.id, [
        { id: one.id, name: 'One', approverIds: ['00000000-0000-4000-8000-000000000000'] },
      ]).expect(400);
    });
  });
});
