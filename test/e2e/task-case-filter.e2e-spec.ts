import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TaskPriority } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_ADMIN, TEST_DETECTIVE, TEST_ANALYST } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for the case-scoped task filter (Feature 005):
 *   GET /tasks?caseId=<uuid>   — all tasks for one case, across every status.
 *
 * Boots task-service against a real Postgres (testcontainers). RabbitMQ is up so the
 * EventPublisher used by POST /tasks has a broker. JWTs are HS256-signed locally
 * (KEYCLOAK_URL blank → dev fallback). caseId is never verified by the service.
 */
describe('E2E — task list caseId filter (Feature 005)', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let adminToken: string;
  let detectiveToken: string;

  const CASE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const CASE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const MISSING_CASE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const ASSIGNEE_X = TEST_DETECTIVE.sub;
  const ASSIGNEE_Y = TEST_ANALYST.sub;

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    const { AppModule } = require('../../apps/task-service/src/app.module');
    app = await bootstrapApp(AppModule);

    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  async function createTask(caseId: string, assignedToUserId: string, title: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({
        caseId,
        title,
        priority: TaskPriority.MEDIUM,
        assignedToUserId,
      })
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    // 2 tasks for CASE_A (different assignees), 1 for CASE_B.
    await createTask(CASE_A, ASSIGNEE_X, 'A-x');
    await createTask(CASE_A, ASSIGNEE_Y, 'A-y');
    await createTask(CASE_B, ASSIGNEE_X, 'B-x');
  }, 60_000);

  const list = (query: string) =>
    request(app.getHttpServer())
      .get(`/tasks${query}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

  it('returns only tasks for the given caseId', async () => {
    const res = await list(`?caseId=${CASE_A}&limit=100`);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((t: any) => t.caseId === CASE_A)).toBe(true);
    expect(res.body.total).toBe(2);
  });

  it('intersects caseId with assignedToUserId (AND)', async () => {
    const res = await list(`?caseId=${CASE_A}&assignedToUserId=${ASSIGNEE_X}&limit=100`);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].caseId).toBe(CASE_A);
    expect(res.body.data[0].assignedToUserId).toBe(ASSIGNEE_X);
  });

  it('returns an empty list (not 404) for a syntactically-valid unknown caseId', async () => {
    const res = await list(`?caseId=${MISSING_CASE}&limit=100`);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('omitting caseId is unchanged — returns the global list (regression)', async () => {
    const res = await list(`?limit=100`);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects a non-UUID caseId with 400', async () => {
    await request(app.getHttpServer())
      .get('/tasks?caseId=not-a-uuid')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
