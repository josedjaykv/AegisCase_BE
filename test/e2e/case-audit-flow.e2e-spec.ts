import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as request from 'supertest';
import { AllExceptionsFilter } from '@aegiscase/common';
import { CasePriority } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_DETECTIVE } from './helpers/jwt';

/**
 * Anchor E2E: exercises the full critical async path:
 *   HTTP (case-service) -> Postgres write -> RabbitMQ publish -> audit-service consumer -> Postgres write -> HTTP (audit-service).
 *
 * Both NestApplications run in-process. Infra (Postgres + RabbitMQ) is spun up via testcontainers.
 * JWTs are signed locally with HS256 — KEYCLOAK_URL is left unset so JwtStrategy uses its dev fallback.
 */

const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 15_000;

async function pollUntil<T>(fn: () => Promise<T | null>, label: string): Promise<T> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${label} after ${POLL_TIMEOUT_MS}ms`);
}

async function bootstrap(modulePath: string): Promise<INestApplication> {
  // Lazy require so env is set before AppModule loads ConfigService
  const { AppModule } = await import(modulePath);
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

describe('E2E — Case → Event → Audit', () => {
  let infra: E2EInfra;
  let caseApp: INestApplication;
  let auditApp: INestApplication;
  let detectiveToken: string;

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    // Order matters: start audit-service first so the consumer is bound before we publish.
    auditApp = await bootstrap('../../apps/audit-service/src/app.module');
    caseApp = await bootstrap('../../apps/case-service/src/app.module');

    detectiveToken = signTestToken(TEST_DETECTIVE);
  }, 180_000);

  afterAll(async () => {
    await Promise.allSettled([caseApp?.close(), auditApp?.close()]);
    await infra?.stop();
  });

  it('persists a CASE_CREATED audit record after a case is created', async () => {
    const createRes = await request(caseApp.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({
        title: 'E2E investigation',
        description: 'spec-created',
        priority: CasePriority.HIGH,
        leaderUserId: TEST_DETECTIVE.sub,
      })
      .expect(201);

    const caseId: string = createRes.body.id;
    expect(caseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(createRes.body.status).toBe('OPEN');
    expect(createRes.body.caseCode).toMatch(/^CASE-\d{4}-\d{4}$/);

    // Poll the audit endpoint until the consumer has persisted the CASE_CREATED record.
    const auditRecord = await pollUntil(async () => {
      const res = await request(auditApp.getHttpServer())
        .get(`/audit/entity/Case/${caseId}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
      const rec = (res.body.data as any[]).find((r) => r.action === 'CASE_CREATED');
      return rec ?? null;
    }, 'CASE_CREATED audit record');

    expect(auditRecord.userId).toBe(TEST_DETECTIVE.sub);
    expect(auditRecord.entityType).toBe('Case');
    expect(auditRecord.entityId).toBe(caseId);
    expect(auditRecord.newState).toMatchObject({
      title: 'E2E investigation',
      priority: CasePriority.HIGH,
      status: 'OPEN',
    });
  });

  it('persists a CASE_CLOSED audit record after closing the case', async () => {
    // Re-create a case so this test is independent.
    const create = await request(caseApp.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({
        title: 'To be closed',
        priority: CasePriority.LOW,
        leaderUserId: TEST_DETECTIVE.sub,
      })
      .expect(201);
    const caseId = create.body.id;

    await request(caseApp.getHttpServer())
      .patch(`/cases/${caseId}/status`)
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ status: 'CLOSED' })
      .expect(200);

    const closedRecord = await pollUntil(async () => {
      const res = await request(auditApp.getHttpServer())
        .get(`/audit/entity/Case/${caseId}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
      return (res.body.data as any[]).find((r) => r.action === 'CASE_CLOSED') ?? null;
    }, 'CASE_CLOSED audit record');

    expect(closedRecord.newState).toMatchObject({ status: 'CLOSED' });
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(caseApp.getHttpServer())
      .post('/cases')
      .send({ title: 'x', priority: CasePriority.LOW, leaderUserId: TEST_DETECTIVE.sub })
      .expect(401);
  });
});
