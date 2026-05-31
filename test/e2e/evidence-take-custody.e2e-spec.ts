import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EvidenceType } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_ADMIN, TEST_DETECTIVE, TEST_ANALYST } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for self-assigned custody (Feature 007, Cambio 1):
 *   PATCH /evidence/:id/take-custody   — all roles; caller becomes custodian.
 *   GET   /evidence/:id/custodian      — side-effect-free custodian lookup.
 *
 * Boots evidence-service against a real Postgres (testcontainers) so the
 * insert + custodian-update run in a real DB transaction.
 */
describe('E2E — evidence take-custody / custodian (Feature 007)', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let detectiveToken: string;
  let analystToken: string;

  const DETECTIVE_SUB = TEST_DETECTIVE.sub;
  const ANALYST_SUB = TEST_ANALYST.sub;
  const CASE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    const { AppModule } = require('../../apps/evidence-service/src/app.module');
    app = await bootstrapApp(AppModule);

    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  // Registered by the detective → initial custodian = detective.
  async function seedEvidence(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ caseId: CASE_ID, evidenceType: EvidenceType.PHYSICAL, description: 'sealed bag' })
      .expect(201);
    return res.body.id;
  }

  const chainOf = (id: string, token: string) =>
    request(app.getHttpServer())
      .get(`/evidence/${id}/chain-of-custody`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

  it('lets an ANALYST take custody of themselves and writes a fixed-reason chain row', async () => {
    const id = await seedEvidence();

    const res = await request(app.getHttpServer())
      .patch(`/evidence/${id}/take-custody`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({})
      .expect(200);

    expect(res.body.currentCustodianId).toBe(ANALYST_SUB);

    const chain = await chainOf(id, analystToken);
    const last = chain.body[chain.body.length - 1];
    expect(last.transferReason).toBe('Accessed evidence file');
    expect(last.previousCustodianId).toBe(DETECTIVE_SUB);
    expect(last.newCustodianId).toBe(ANALYST_SUB);
  });

  it('is idempotent: taking custody again as the current custodian adds no new row', async () => {
    const id = await seedEvidence();

    await request(app.getHttpServer())
      .patch(`/evidence/${id}/take-custody`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({})
      .expect(200);
    const after1 = (await chainOf(id, analystToken)).body.length;

    await request(app.getHttpServer())
      .patch(`/evidence/${id}/take-custody`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({})
      .expect(200);
    const after2 = (await chainOf(id, analystToken)).body.length;

    expect(after2).toBe(after1);
  });

  it('GET /evidence/:id/custodian returns the custodian without side effects', async () => {
    const id = await seedEvidence();
    const before = (await chainOf(id, detectiveToken)).body.length;

    const res = await request(app.getHttpServer())
      .get(`/evidence/${id}/custodian`)
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);

    expect(res.body).toEqual({ evidenceId: id, currentCustodianId: DETECTIVE_SUB });

    const after = (await chainOf(id, detectiveToken)).body.length;
    expect(after).toBe(before); // no custody row written by the lookup
  });

  it('returns 404 for take-custody on an unknown id', async () => {
    await request(app.getHttpServer())
      .patch('/evidence/00000000-0000-4000-8000-000000000000/take-custody')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({})
      .expect(404);
  });
});
