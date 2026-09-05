import request from 'supertest';
import type { Server } from 'http';
import { LockMode } from '@mikro-orm/core';
import { Document } from '../src/documents/document.entity';
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
 * Covers the behaviour the invariant suite deliberately does not: the specific reject
 * targets, the ALL policy, round resetting, and two people acting at once.
 *
 * Documents are created through the API so validation and the create path are exercised
 * rather than reached past.
 */
describe('workflow behaviour', () => {
  let ctx: TestContext;
  let server: Server;
  let alice: string;
  let bob: string;
  let cara: string;
  let dan: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetSchema(ctx.orm);
    [alice, bob, cara, dan] = (await seedUsers(ctx.em)).map((u) => u.id);
  });

  type StageSpec = {
    name: string;
    approverIds: string[];
    policy?: StageApprovalPolicy;
    rejectBehavior?: StageRejectBehavior;
    rejectTargetPosition?: number;
  };

  async function createDocument(stages: StageSpec[], expectStatus = 201) {
    const response = await request(server)
      .post('/documents')
      .send({ title: 'Test Document', body: 'Body text.', stages })
      .expect(expectStatus);
    return response.body as DocumentResponse;
  }

  async function get(id: string): Promise<DocumentResponse> {
    const response = await request(server).get(`/documents/${id}`).expect(200);
    return response.body as DocumentResponse;
  }

  function approve(id: string, userId: string) {
    return request(server).post(`/documents/${id}/approve`).send({ userId });
  }

  function reject(id: string, userId: string) {
    return request(server)
      .post(`/documents/${id}/reject`)
      .send({ userId, comment: 'Needs work.' });
  }

  /** The name of the stage a document is waiting at, or null once it has finished. */
  async function stageName(id: string): Promise<string | null> {
    const doc = await get(id);
    if (!doc.currentStage) return null;
    return doc.stages.find((s) => s.id === doc.currentStage!.id)?.name ?? null;
  }

  const threeStages = (rejectBehavior?: StageRejectBehavior): StageSpec[] => [
    { name: 'One', approverIds: [alice] },
    { name: 'Two', approverIds: [bob] },
    { name: 'Three', approverIds: [cara], rejectBehavior },
  ];

  describe('reject behaviour', () => {
    it('TO_FIRST_STAGE sends the document back to the beginning', async () => {
      const doc = await createDocument(threeStages(StageRejectBehavior.TO_FIRST_STAGE));

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('Three');

      await reject(doc.id, cara).expect(201);
      expect(await stageName(doc.id)).toBe('One');
    });

    it('TO_PREVIOUS_STAGE sends the document back exactly one stage', async () => {
      const doc = await createDocument(threeStages(StageRejectBehavior.TO_PREVIOUS_STAGE));

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      await reject(doc.id, cara).expect(201);

      expect(await stageName(doc.id)).toBe('Two');
    });

    it('TO_PREVIOUS_STAGE at the first stage leaves the document where it is', async () => {
      const doc = await createDocument([
        {
          name: 'One',
          approverIds: [alice],
          rejectBehavior: StageRejectBehavior.TO_PREVIOUS_STAGE,
        },
        { name: 'Two', approverIds: [bob] },
      ]);

      await reject(doc.id, alice).expect(201);

      const after = await get(doc.id);
      expect(await stageName(doc.id)).toBe('One');
      expect(after.status).toBe('IN_PROGRESS');
      expect(after.approvalRound).toBe(1);
    });

    it('TO_SPECIFIC_STAGE sends the document to the configured position', async () => {
      const doc = await createDocument([
        { name: 'Zero', approverIds: [alice] },
        { name: 'One', approverIds: [bob] },
        { name: 'Two', approverIds: [cara] },
        {
          name: 'Three',
          approverIds: [dan],
          rejectBehavior: StageRejectBehavior.TO_SPECIFIC_STAGE,
          rejectTargetPosition: 1,
        },
      ]);

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      await approve(doc.id, cara).expect(201);
      expect(await stageName(doc.id)).toBe('Three');

      await reject(doc.id, dan).expect(201);
      expect(await stageName(doc.id)).toBe('One');
    });

    it('TERMINAL refuses the document outright', async () => {
      const doc = await createDocument(threeStages(StageRejectBehavior.TERMINAL));

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      await reject(doc.id, cara).expect(201);

      const after = await get(doc.id);
      expect(after.status).toBe('REJECTED');
      expect(after.currentStage).toBeNull();

      // A refused document is finished. Nobody can restart it.
      await approve(doc.id, alice).expect(400);
      await reject(doc.id, cara).expect(400);
    });
  });

  describe('ALL policy', () => {
    const jointStage = (): StageSpec[] => [
      {
        name: 'Joint Review',
        approverIds: [alice, bob],
        policy: StageApprovalPolicy.ALL,
      },
      { name: 'Final', approverIds: [cara] },
    ];

    it('does not advance until every approver has approved', async () => {
      const doc = await createDocument(jointStage());

      await approve(doc.id, alice).expect(201);
      expect(await stageName(doc.id)).toBe('Joint Review');

      await approve(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('Final');
    });

    it('does not let one person satisfy a stage by approving twice', async () => {
      const doc = await createDocument(jointStage());

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, alice).expect(201);

      expect(await stageName(doc.id)).toBe('Joint Review');
    });

    it('discards approvals from before a rejection', async () => {
      const doc = await createDocument([
        { name: 'First', approverIds: [cara] },
        {
          name: 'Joint Review',
          approverIds: [alice, bob],
          policy: StageApprovalPolicy.ALL,
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);

      await approve(doc.id, cara).expect(201);
      await approve(doc.id, alice).expect(201); // 1 of 2 in round 0
      await reject(doc.id, bob).expect(201); // round 1 begins
      await approve(doc.id, cara).expect(201); // back at Joint Review

      // Alice approved in round 0. That no longer counts, so bob alone must not finish it.
      await approve(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('Joint Review');

      await approve(doc.id, alice).expect(201);
      expect(await stageName(doc.id)).toBeNull();
    });
  });

  describe('two people acting at once', () => {
    it('records both approvals and advances once when they arrive together', async () => {
      const doc = await createDocument([
        {
          name: 'Joint Review',
          approverIds: [alice, bob],
          policy: StageApprovalPolicy.ALL,
        },
        { name: 'Final', approverIds: [cara] },
      ]);

      // Note this passes with or without the row lock: Node handles both requests on one
      // thread and the first transaction commits before the second reads, so the race
      // never actually occurs here. Kept as a regression test that two approvals arriving
      // together are both recorded. The lock itself is tested below.
      const [first, second] = await Promise.all([
        approve(doc.id, alice),
        approve(doc.id, bob),
      ]);

      expect([first.status, second.status]).toEqual([201, 201]);
      expect(await stageName(doc.id)).toBe('Final');

      const history = await request(server)
        .get(`/documents/${doc.id}/history`)
        .expect(200);
      expect(history.body).toHaveLength(2);
    });

    it('holds a write lock that makes a second transaction wait', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);
      const HOLD_MS = 300;

      // The second transaction starts only once the first has the lock, signalled rather
      // than guessed at with a sleep — under load the holder can take longer to acquire
      // than any fixed delay, and the test would pass for the wrong reason.
      let released: () => void;
      const holderHasLock = new Promise<void>((resolve) => {
        released = resolve;
      });

      let waitedFor = 0;

      const holder = ctx.orm.em.fork().transactional(async (em) => {
        await em.findOne(Document, { id: doc.id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        released();
        await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
      });

      const waiter = (async () => {
        await holderHasLock;
        const startedAt = Date.now();
        await ctx.orm.em.fork().transactional(async (em) => {
          await em.findOne(Document, { id: doc.id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
          waitedFor = Date.now() - startedAt;
        });
      })();

      await Promise.all([holder, waiter]);

      // It blocked until the holder committed rather than reading straight through.
      // Slightly under HOLD_MS is fine; anything near zero means no lock was taken.
      expect(waitedFor).toBeGreaterThan(HOLD_MS * 0.8);
    });
  });

  describe('approver overlap', () => {
    it('makes the same person approve each stage they are assigned to', async () => {
      // Authority is scoped to a stage, not to a document. Alice being on stage 0 does
      // not carry over to stage 1, even though she is also assigned there.
      const doc = await createDocument([
        { name: 'One', approverIds: [alice] },
        { name: 'Two', approverIds: [alice] },
        { name: 'Three', approverIds: [bob] },
      ]);

      await approve(doc.id, alice).expect(201);
      expect(await stageName(doc.id)).toBe('Two');

      await approve(doc.id, alice).expect(201);
      expect(await stageName(doc.id)).toBe('Three');

      await approve(doc.id, alice).expect(403);
    });

    it('counts a person listed twice on one stage only once', async () => {
      const doc = await createDocument([
        {
          name: 'Joint',
          approverIds: [alice, alice, bob],
          policy: StageApprovalPolicy.ALL,
        },
        { name: 'Final', approverIds: [cara] },
      ]);

      const created = await get(doc.id);
      expect(created.stages[0].approvers).toHaveLength(2);

      await approve(doc.id, alice).expect(201);
      expect(await stageName(doc.id)).toBe('Joint');

      await approve(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('Final');
    });
  });

  describe('mixed approvals and rejections', () => {
    it('lets a rejection end a stage that other people had already approved', async () => {
      const doc = await createDocument([
        { name: 'First', approverIds: [dan] },
        {
          name: 'Joint',
          approverIds: [alice, bob, cara],
          policy: StageApprovalPolicy.ALL,
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);

      await approve(doc.id, dan).expect(201);
      await approve(doc.id, alice).expect(201);

      // Bob rejects while Cara has not responded. The document goes back at once rather
      // than waiting for her.
      await reject(doc.id, bob).expect(201);

      expect(await stageName(doc.id)).toBe('First');
      expect((await get(doc.id)).approvalRound).toBe(1);
    });

    it('survives three full rounds of rejection and re-approval', async () => {
      const doc = await createDocument([
        { name: 'Author', approverIds: [alice] },
        {
          name: 'Review',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
        { name: 'Sign-off', approverIds: [cara] },
      ]);

      for (let round = 0; round < 3; round += 1) {
        expect((await get(doc.id)).approvalRound).toBe(round);
        await approve(doc.id, alice).expect(201);
        await reject(doc.id, bob).expect(201);
        expect(await stageName(doc.id)).toBe('Author');
      }

      expect((await get(doc.id)).approvalRound).toBe(3);

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      await approve(doc.id, cara).expect(201);

      const finished = await get(doc.id);
      expect(finished.status).toBe('APPROVED');
      expect(finished.currentStage).toBeNull();

      // Every action from every round is still on record.
      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);
      expect(history.body).toHaveLength(9);
    });

    it('rejects twice when the same person is assigned to consecutive stages', async () => {
      // Documents current behaviour rather than guarding against it. The second call is
      // not a duplicate: the document has already moved, so it acts on a different stage
      // in a different round, and both rejections are recorded with their reasons.
      const doc = await createDocument([
        { name: 'One', approverIds: [alice] },
        {
          name: 'Two',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_PREVIOUS_STAGE,
        },
        {
          name: 'Three',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_PREVIOUS_STAGE,
        },
      ]);

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('Three');

      await reject(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('Two');

      await reject(doc.id, bob).expect(201);
      expect(await stageName(doc.id)).toBe('One');
      expect((await get(doc.id)).approvalRound).toBe(2);
    });
  });

  describe('smallest possible workflow', () => {
    it('completes a one stage document with a single approval', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);

      await approve(doc.id, alice).expect(201);

      const finished = await get(doc.id);
      expect(finished.status).toBe('APPROVED');
      expect(finished.currentStage).toBeNull();
    });

    it('needs every approver even when there is only one stage', async () => {
      const doc = await createDocument([
        {
          name: 'Only',
          approverIds: [alice, bob],
          policy: StageApprovalPolicy.ALL,
        },
      ]);

      await approve(doc.id, alice).expect(201);
      expect((await get(doc.id)).status).toBe('IN_PROGRESS');

      await approve(doc.id, bob).expect(201);
      expect((await get(doc.id)).status).toBe('APPROVED');
    });
  });

  describe('history', () => {
    it('records the reason a document was rejected', async () => {
      const doc = await createDocument([
        { name: 'One', approverIds: [alice] },
        {
          name: 'Two',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);

      await approve(doc.id, alice).expect(201);
      await reject(doc.id, bob).expect(201);

      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);
      const rejection = history.body.find((e: { action: string }) => e.action === 'REJECT');

      expect(rejection.comment).toBe('Needs work.');
      expect(rejection.stage.name).toBe('Two');
      expect(rejection.actor.id).toBe(bob);
      expect(rejection.round).toBe(0);
    });

    it('is empty for a document nobody has acted on', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);

      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);
      expect(history.body).toEqual([]);
    });
  });

  describe('error contract', () => {
    it('refuses an unknown user without revealing whether they exist', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);
      const strangerId = '00000000-0000-4000-8000-000000000000';

      // 403 rather than 404: a different status would tell an unauthenticated caller
      // which user ids are real.
      await approve(doc.id, strangerId).expect(403);
    });

    it('refuses a malformed document id', async () => {
      await request(server)
        .post('/documents/not-a-uuid/approve')
        .send({ userId: alice })
        .expect(400);
    });

    it('returns 404 for a document that does not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000001';

      await request(server).get(`/documents/${missing}`).expect(404);
      await request(server).get(`/documents/${missing}/history`).expect(404);
    });

    it('refuses a rejection with an empty reason', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);

      await request(server)
        .post(`/documents/${doc.id}/reject`)
        .send({ userId: alice, comment: '   ' })
        .expect(400);
    });

    it('refuses unknown fields in the request body', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);

      await request(server)
        .post(`/documents/${doc.id}/approve`)
        .send({ userId: alice, sneakyField: true })
        .expect(400);
    });
  });

  describe('the document list', () => {
    it('returns each document with just its current stage', async () => {
      const waiting = await createDocument([
        { name: 'Review', approverIds: [alice] },
        { name: 'Sign-off', approverIds: [bob] },
      ]);
      const finished = await createDocument([{ name: 'Only', approverIds: [cara] }]);
      await approve(finished.id, cara).expect(201);

      const response = await request(server).get('/documents').expect(200);
      const byId = Object.fromEntries(
        (response.body as { id: string }[]).map((d) => [d.id, d]),
      );

      expect(byId[waiting.id]).toEqual({
        id: waiting.id,
        title: 'Test Document',
        status: 'IN_PROGRESS',
        currentStage: { id: expect.any(String), name: 'Review' },
      });

      // A finished document has no current stage, and must still appear in the list.
      expect(byId[finished.id]).toEqual({
        id: finished.id,
        title: 'Test Document',
        status: 'APPROVED',
        currentStage: null,
      });
    });

    it('lists newest first', async () => {
      const first = await createDocument([{ name: 'A', approverIds: [alice] }]);
      const second = await createDocument([{ name: 'B', approverIds: [alice] }]);

      const response = await request(server).get('/documents').expect(200);
      const ids = (response.body as { id: string }[]).map((d) => d.id);

      expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    });
  });

  describe('defaults', () => {
    it('treats a stage with no policy or reject behaviour as the original system did', async () => {
      // One approval is enough, and a rejection goes back to the start — exactly how the
      // three fixed stages behaved before any of this was configurable.
      const doc = await createDocument([
        { name: 'One', approverIds: [alice, bob] },
        { name: 'Two', approverIds: [cara] },
      ]);

      expect(doc.stages[0].policy).toBe('ANY');
      expect(doc.stages[0]).toMatchObject({ rejectBehavior: 'TO_FIRST_STAGE' });

      await approve(doc.id, alice).expect(201);
      expect(await stageName(doc.id)).toBe('Two');

      await reject(doc.id, cara).expect(201);
      expect(await stageName(doc.id)).toBe('One');
    });
  });

  describe('comments on approval', () => {
    it('records an optional comment when someone approves', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);

      await request(server)
        .post(`/documents/${doc.id}/approve`)
        .send({ userId: alice, comment: 'Checked the figures, all good.' })
        .expect(201);

      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);
      expect(history.body[0].comment).toBe('Checked the figures, all good.');
    });

    it('leaves the comment null when none is given', async () => {
      const doc = await createDocument([{ name: 'Only', approverIds: [alice] }]);
      await approve(doc.id, alice).expect(201);

      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);
      expect(history.body[0].comment).toBeNull();
    });
  });

  describe('history in detail', () => {
    it('reads oldest first and groups cleanly by round', async () => {
      const doc = await createDocument([
        { name: 'One', approverIds: [alice] },
        {
          name: 'Two',
          approverIds: [bob],
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);

      await approve(doc.id, alice).expect(201);
      await reject(doc.id, bob).expect(201);
      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);

      const history = await request(server).get(`/documents/${doc.id}/history`).expect(200);
      const summary = (
        history.body as { round: number; action: string; stage: { name: string } }[]
      ).map((e) => `${e.round}:${e.action}:${e.stage.name}`);

      expect(summary).toEqual([
        '0:APPROVE:One',
        '0:REJECT:Two',
        '1:APPROVE:One',
        '1:APPROVE:Two',
      ]);
    });
  });

  describe('less common shapes', () => {
    it('handles a twenty stage workflow', async () => {
      const stages = Array.from({ length: 20 }, (_, i) => ({
        name: `Stage ${i}`,
        approverIds: [alice],
      }));
      const doc = await createDocument(stages);

      expect(doc.stages).toHaveLength(20);

      for (let i = 0; i < 20; i += 1) {
        expect(await stageName(doc.id)).toBe(`Stage ${i}`);
        await approve(doc.id, alice).expect(201);
      }

      expect((await get(doc.id)).status).toBe('APPROVED');
    });

    it('accepts an explicit reject target of position zero', async () => {
      const doc = await createDocument([
        { name: 'Start', approverIds: [alice] },
        { name: 'Middle', approverIds: [bob] },
        {
          name: 'End',
          approverIds: [cara],
          rejectBehavior: StageRejectBehavior.TO_SPECIFIC_STAGE,
          rejectTargetPosition: 0,
        },
      ]);

      await approve(doc.id, alice).expect(201);
      await approve(doc.id, bob).expect(201);
      await reject(doc.id, cara).expect(201);

      expect(await stageName(doc.id)).toBe('Start');
    });

    it('lets the first stage refuse a document outright', async () => {
      const doc = await createDocument([
        {
          name: 'Gatekeeper',
          approverIds: [alice],
          rejectBehavior: StageRejectBehavior.TERMINAL,
        },
        { name: 'Never Reached', approverIds: [bob] },
      ]);

      await reject(doc.id, alice).expect(201);

      const after = await get(doc.id);
      expect(after.status).toBe('REJECTED');
      expect(after.currentStage).toBeNull();
    });

    it('settles on one outcome when an approval and a rejection arrive together', async () => {
      const doc = await createDocument([
        { name: 'One', approverIds: [alice, bob], policy: StageApprovalPolicy.ALL },
        {
          name: 'Two',
          approverIds: [cara],
          rejectBehavior: StageRejectBehavior.TO_FIRST_STAGE,
        },
      ]);

      const [approved, rejected] = await Promise.all([
        approve(doc.id, alice),
        reject(doc.id, bob),
      ]);

      expect([approved.status, rejected.status]).toEqual([201, 201]);

      // Whichever order they landed in, the rejection ended the round and the document is
      // back at the start of a new one.
      const after = await get(doc.id);
      expect(after.status).toBe('IN_PROGRESS');
      expect(after.approvalRound).toBe(1);
      expect(await stageName(doc.id)).toBe('One');
    });
  });

  describe('validation', () => {
    it('refuses a document with no stages', async () => {
      await createDocument([], 400);
    });

    it('refuses a stage with no approvers', async () => {
      await createDocument([{ name: 'Nobody', approverIds: [] }], 400);
    });

    it('refuses a title that is only whitespace', async () => {
      await request(server)
        .post('/documents')
        .send({
          title: '   ',
          body: 'Body text.',
          stages: [{ name: 'One', approverIds: [alice] }],
        })
        .expect(400);
    });

    it('refuses a stage name that is only whitespace', async () => {
      await createDocument([{ name: '  ', approverIds: [alice] }], 400);
    });

    it('trims surrounding whitespace rather than storing it', async () => {
      const doc = await createDocument([{ name: '  Review  ', approverIds: [alice] }]);

      expect(doc.stages[0].name).toBe('Review');
    });

    it('refuses a reject target that points forward', async () => {
      await createDocument(
        [
          {
            name: 'One',
            approverIds: [alice],
            rejectBehavior: StageRejectBehavior.TO_SPECIFIC_STAGE,
            rejectTargetPosition: 1,
          },
          { name: 'Two', approverIds: [bob] },
        ],
        400,
      );
    });

    it('refuses a reject target that does not exist', async () => {
      await createDocument(
        [
          { name: 'One', approverIds: [alice] },
          {
            name: 'Two',
            approverIds: [bob],
            rejectBehavior: StageRejectBehavior.TO_SPECIFIC_STAGE,
            rejectTargetPosition: 9,
          },
        ],
        400,
      );
    });
  });
});
