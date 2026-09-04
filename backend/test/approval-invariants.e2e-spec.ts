import request from 'supertest';
import type { Server } from 'http';
import {
  createTestApp,
  resetSchema,
  seedDocument,
  type DocumentResponse,
  type TestContext,
  type UserResponse,
} from './test-app';
import { currentApproverId, isTerminal, someNonApprover } from './current-approver';

/**
 * Properties that must hold of any approval workflow — not of the three-stage one the
 * starter happens to implement.
 *
 * Written against the API, not the service, so they describe the contract rather than
 * the implementation. The rewrite should leave this suite untouched.
 *
 * Not asserted on purpose: stage count, names, order, or where a rejection lands. Those
 * are exactly what we're making configurable.
 */
describe('approval workflow invariants', () => {
  let ctx: TestContext;
  let server: Server;
  let users: UserResponse[];
  let documentId: string;

  const MAX_STAGES = 25; // loop guard, best to avoid anyting hanging application.

  beforeAll(async () => {
    ctx = await createTestApp();
    server = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetSchema(ctx.orm);
    const fixture = await seedDocument(ctx.em);
    documentId = fixture.document.id;
    users = fixture.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }));
  });

  async function getDocument(id = documentId): Promise<DocumentResponse> {
    const response = await request(server).get(`/documents/${id}`).expect(200);
    return response.body as DocumentResponse;
  }

  function approveAs(userId: string, id = documentId) {
    return request(server).post(`/documents/${id}/approve`).send({ userId });
  }

  function rejectAs(userId: string, id = documentId) {
    return request(server).post(`/documents/${id}/reject`).send({ userId });
  }

  /** Approve repeatedly, always as whoever is currently authorised, until terminal. */
  async function walkToCompletion(): Promise<DocumentResponse> {
    let document = await getDocument();
    let steps = 0;

    while (!isTerminal(document) && steps < MAX_STAGES) {
      await approveAs(currentApproverId(document)!).expect(201);
      document = await getDocument();
      steps += 1;
    }

    expect(steps).toBeLessThan(MAX_STAGES);
    return document;
  }

  describe('only the approver assigned to the current stage may act', () => {
    it('refuses an approval from anyone other than the current approver', async () => {
      const document = await getDocument();
      const outsider = someNonApprover(document, users);

      await approveAs(outsider.id).expect(403);
    });

    it('refuses a rejection from anyone other than the current approver', async () => {
      const document = await getDocument();
      const outsider = someNonApprover(document, users);

      await rejectAs(outsider.id).expect(403);
    });

    it('accepts an approval from the current approver', async () => {
      const document = await getDocument();

      await approveAs(currentApproverId(document)!).expect(201);
    });

    it('keeps authority stage-scoped, not document-scoped', async () => {
      // A naive "any assigned approver may act" implementation would pass most tests
      // in this file, but not this one.
      const before = await getDocument();
      const firstApprover = currentApproverId(before)!;

      await approveAs(firstApprover).expect(201);

      const after = await getDocument();
      if (!isTerminal(after) && currentApproverId(after) !== firstApprover) {
        await approveAs(firstApprover).expect(403);
      }
    });
  });

  describe('approving every stage completes the document', () => {
    it('reaches a terminal approved state, however many stages exist', async () => {
      const document = await walkToCompletion();

      expect(document.status).toBe('APPROVED');
      expect(currentApproverId(document)).toBeNull();
    });
  });

  describe('a completed document is terminal', () => {
    it('refuses further approvals', async () => {
      const document = await walkToCompletion();
      const anyUser = users[0];

      await approveAs(anyUser.id, document.id).expect(400);
    });

    it('refuses further rejections', async () => {
      const document = await walkToCompletion();
      const anyUser = users[0];

      await rejectAs(anyUser.id, document.id).expect(400);
    });
  });

  describe('rejecting returns the document to an actionable state', () => {
    it('leaves the document in progress with someone able to act', async () => {
      // Move at least one stage in so the rejection has somewhere to send it back to.
      const initial = await getDocument();
      await approveAs(currentApproverId(initial)!).expect(201);

      const advanced = await getDocument();
      if (isTerminal(advanced)) {
        return; // single-stage workflow — nothing to reject from
      }

      await rejectAs(currentApproverId(advanced)!).expect(201);

      const rejected = await getDocument();
      expect(rejected.status).not.toBe('APPROVED');
      expect(currentApproverId(rejected)).not.toBeNull();
    });

    it('leaves the document completable again after rejection', async () => {
      const initial = await getDocument();
      await approveAs(currentApproverId(initial)!).expect(201);

      const advanced = await getDocument();
      if (!isTerminal(advanced)) {
        await rejectAs(currentApproverId(advanced)!).expect(201);
      }

      const document = await walkToCompletion();
      expect(document.status).toBe('APPROVED');
    });
  });

  describe('exactly one party may act at any point in the workflow', () => {
    it('names one authorised approver and refuses everyone else, at every stage', async () => {
      let document = await getDocument();
      let steps = 0;

      while (!isTerminal(document) && steps < MAX_STAGES) {
        const authorised = currentApproverId(document);
        expect(authorised).not.toBeNull();

        // Every other known user must be refused. These calls do not mutate state.
        for (const user of users.filter((candidate) => candidate.id !== authorised)) {
          await approveAs(user.id).expect(403);
        }

        await approveAs(authorised!).expect(201);
        document = await getDocument();
        steps += 1;
      }

      expect(document.status).toBe('APPROVED');
    });
  });
});
