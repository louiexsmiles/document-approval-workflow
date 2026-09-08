import request from 'supertest';
import { createTestApp, resetSchema, seedUsers, TestContext } from './test-app';

/**
 * Two people approving at once must not both advance the document. The service prevents
 * that by locking the document row for the length of the transaction.
 *
 * That is invisible from outside: one process cannot contend with itself, and a test using
 * Promise.all passes whether or not the lock is there, because Node runs both handlers on
 * one thread and the first commits before the second reads. So this asserts the SQL
 * instead. It is coupled to the implementation on purpose — the lock IS the implementation,
 * and without this nothing notices when it is removed.
 */
describe('write locking', () => {
  const sql: string[] = [];
  let ctx: TestContext;
  let documentId: string;
  let approverId: string;

  beforeAll(async () => {
    ctx = await createTestApp({ sql });
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetSchema(ctx.orm);
    const users = await seedUsers(ctx.em);
    approverId = users[0].id;

    const created = await request(ctx.app.getHttpServer())
      .post('/documents')
      .send({
        title: 'Locking fixture',
        body: 'Used to assert the approve path locks the row.',
        stages: [
          { name: 'First', approverIds: [approverId] },
          { name: 'Second', approverIds: [users[1].id] },
        ],
      })
      .expect(201);

    documentId = created.body.id;
    sql.length = 0;
  });

  const lockingReads = () =>
    sql.filter((line) => /from "documents".*for update/is.test(line));

  it('locks the document row when someone approves', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/documents/${documentId}/approve`)
      .send({ userId: approverId })
      .expect(201);

    expect(lockingReads()).toHaveLength(1);
  });

  it('locks the document row when someone rejects', async () => {
    await request(ctx.app.getHttpServer())
      .post(`/documents/${documentId}/reject`)
      .send({ userId: approverId, comment: 'Needs work.' })
      .expect(201);

    expect(lockingReads()).toHaveLength(1);
  });

  it('locks the document row when the workflow is edited', async () => {
    // Keeps both stages and renames the one nobody is waiting at. Dropping the current
    // stage would be refused before any locking happened, and prove nothing.
    const current = await request(ctx.app.getHttpServer())
      .get(`/documents/${documentId}`)
      .expect(200);
    sql.length = 0;

    const stages = [...current.body.stages]
      .sort((a, b) => a.position - b.position)
      .map((stage, index) => ({
        id: stage.id,
        name: index === 1 ? 'Renamed' : stage.name,
        approverIds: stage.approvers.map((a: { user: { id: string } }) => a.user.id),
        policy: stage.policy,
      }));

    await request(ctx.app.getHttpServer())
      .patch(`/documents/${documentId}/stages`)
      .send({ stages })
      .expect(200);

    expect(lockingReads()).toHaveLength(1);
  });

  it('does not lock anything when a document is only read', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/documents/${documentId}`)
      .expect(200);

    expect(lockingReads()).toHaveLength(0);
  });
});
