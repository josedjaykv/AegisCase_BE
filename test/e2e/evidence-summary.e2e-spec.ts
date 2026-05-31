import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EvidenceType } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_ADMIN, TEST_DETECTIVE, TEST_ANALYST } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for the read-only single-evidence summary (Feature 011):
 *   GET /evidence/:id/summary — same shape as a list row, NO custody side effect.
 *
 * The whole point of the endpoint is that, unlike the mutating `GET /evidence/:id`,
 * it never records a "Viewed by user" chain row nor changes the custodian. Boots
 * evidence-service against a real Postgres (testcontainers).
 */
describe('E2E — evidence read-only summary (Feature 011)', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let adminToken: string;
  let detectiveToken: string;
  let analystToken: string;

  const DETECTIVE_SUB = TEST_DETECTIVE.sub;
  const CASE_ID = '12121212-1212-4121-8121-121212121212';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);
    const { AppModule } = require('../../apps/evidence-service/src/app.module');
    app = await bootstrapApp(AppModule);
    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  // Registered by the detective → custodian = detective.
  async function seedEvidence(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ caseId: CASE_ID, evidenceType: EvidenceType.PHYSICAL, title: 'bag', description: 'd' })
      .expect(201);
    return res.body.id;
  }

  const chainLen = (id: string) =>
    request(app.getHttpServer())
      .get(`/evidence/${id}/chain-of-custody`)
      .set('Authorization', `Bearer ${detectiveToken}`)
      .expect(200)
      .then((r) => r.body.length);

  it('returns the evidence summary with the list fields (incl. title)', async () => {
    const id = await seedEvidence();

    const res = await request(app.getHttpServer())
      .get(`/evidence/${id}/summary`)
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(200);

    expect(res.body.id).toBe(id);
    expect(res.body.caseId).toBe(CASE_ID);
    expect(res.body.title).toBe('bag');
    expect(res.body.currentCustodianId).toBe(DETECTIVE_SUB);
    // Same shape as a list row — no custodyChain relation embedded.
    expect(res.body.custodyChain).toBeUndefined();
  });

  it('has NO custody side effect: custodian unchanged and no chain row added', async () => {
    const id = await seedEvidence(); // custodian = detective
    const before = await chainLen(id);

    // An ANALYST (not the custodian) reads the summary three times.
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get(`/evidence/${id}/summary`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);
    }

    const after = await chainLen(id);
    expect(after).toBe(before); // no "Viewed by user" rows

    // Custodian is still the detective (the mutating GET would have changed it).
    const summary = await request(app.getHttpServer())
      .get(`/evidence/${id}/summary`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(summary.body.currentCustodianId).toBe(DETECTIVE_SUB);
  });

  it('is readable by all three roles', async () => {
    const id = await seedEvidence();
    for (const token of [adminToken, detectiveToken, analystToken]) {
      await request(app.getHttpServer())
        .get(`/evidence/${id}/summary`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });

  it('returns 404 for an unknown id', async () => {
    await request(app.getHttpServer())
      .get('/evidence/00000000-0000-4000-8000-000000000000/summary')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(404);
  });

  it('401 without a token', async () => {
    const id = await seedEvidence();
    await request(app.getHttpServer()).get(`/evidence/${id}/summary`).expect(401);
  });
});
