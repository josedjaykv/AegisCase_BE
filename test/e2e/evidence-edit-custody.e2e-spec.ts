import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EvidenceType } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_ADMIN, TEST_DETECTIVE } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for the edit-requires-custody gate (Feature 010):
 *   PUT /evidence/:id  → 403 unless the caller is the current custodian.
 *   PATCH /evidence/:id/take-custody (Feature 007) unblocks the edit.
 *
 * Boots evidence-service against a real Postgres (testcontainers).
 */
describe('E2E — evidence edit requires custody (Feature 010)', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let adminToken: string;
  let detectiveToken: string;

  const ADMIN_SUB = TEST_ADMIN.sub;
  const CASE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);
    const { AppModule } = require('../../apps/evidence-service/src/app.module');
    app = await bootstrapApp(AppModule);
    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
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
      .send({ caseId: CASE_ID, evidenceType: EvidenceType.PHYSICAL, title: 'orig', description: 'd' })
      .expect(201);
    return res.body.id;
  }

  it('blocks an edit from a non-custodian — even an ADMIN (403)', async () => {
    const id = await seedEvidence(); // custodian = detective

    const res = await request(app.getHttpServer())
      .put(`/evidence/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'hacked' })
      .expect(403);

    expect(JSON.stringify(res.body)).toContain('custody');

    // Unchanged in storage (read side-effect-free via chain endpoint is not needed; GET would
    // transfer custody, so we verify by having the custodian read it back is out of scope —
    // the 403 above is the contract).
  });

  it('lets the current custodian (detective) edit (200)', async () => {
    const id = await seedEvidence();

    const res = await request(app.getHttpServer())
      .put(`/evidence/${id}`)
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ title: 'updated by custodian' })
      .expect(200);

    expect(res.body.title).toBe('updated by custodian');
  });

  it('after taking custody, the formerly-blocked ADMIN can edit', async () => {
    const id = await seedEvidence(); // custodian = detective

    // 1) ADMIN is blocked
    await request(app.getHttpServer())
      .put(`/evidence/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'attempt-1' })
      .expect(403);

    // 2) ADMIN takes custody (audited via chain) → becomes custodian
    const taken = await request(app.getHttpServer())
      .patch(`/evidence/${id}/take-custody`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    expect(taken.body.currentCustodianId).toBe(ADMIN_SUB);

    // 3) ADMIN can now edit
    const edited = await request(app.getHttpServer())
      .put(`/evidence/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'attempt-2 ok' })
      .expect(200);
    expect(edited.body.title).toBe('attempt-2 ok');

    // The take-custody left an "Accessed evidence file" row in the chain (audit trail).
    const chain = await request(app.getHttpServer())
      .get(`/evidence/${id}/chain-of-custody`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(chain.body.some((r: any) => r.transferReason === 'Accessed evidence file')).toBe(true);
  });

  it('returns 404 for an unknown id', async () => {
    await request(app.getHttpServer())
      .put('/evidence/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ title: 'x' })
      .expect(404);
  });
});
