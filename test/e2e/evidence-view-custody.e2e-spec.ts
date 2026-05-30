import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EvidenceType } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_ADMIN, TEST_DETECTIVE } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for the "view = take custody" endpoint (Fix 001):
 *   GET /evidence/:id   — returns the entity (+ custodyChain) AND records a
 *                         chain-of-custody view, atomically.
 *
 * Boots evidence-service against a real Postgres (testcontainers) so the
 * insert + custodian-update run in a real DB transaction. The previous
 * implementation 500'd (cascade re-save of a loaded relation → circular
 * serialization) while leaving a "Viewed by user" row behind without the
 * matching custodian update. This spec is the regression guard.
 */
describe('E2E — evidence view / chain of custody (Fix 001)', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let adminToken: string;
  let detectiveToken: string;

  const ADMIN_SUB = TEST_ADMIN.sub;
  const DETECTIVE_SUB = TEST_DETECTIVE.sub;
  const CASE_ID = '99999999-9999-4999-8999-999999999999';
  const MISSING_EVIDENCE = '00000000-0000-4000-8000-000000000000';

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

  /** Registers a piece of evidence with the detective as initial custodian. */
  async function seedEvidence(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({
        caseId: CASE_ID,
        evidenceType: EvidenceType.PHYSICAL,
        description: 'bagged knife',
      })
      .expect(201);
    return res.body.id;
  }

  it('returns 200 with the entity and a populated custodyChain (regression for the 500)', async () => {
    const id = await seedEvidence();

    const res = await request(app.getHttpServer())
      .get(`/evidence/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.id).toBe(id);
    expect(Array.isArray(res.body.custodyChain)).toBe(true);
    // Initial registration row + the admin's "Viewed by user" row.
    expect(res.body.custodyChain.length).toBeGreaterThanOrEqual(2);
    // The view took custody.
    expect(res.body.currentCustodianId).toBe(ADMIN_SUB);
  });

  it('persists the custodian update atomically: a second view by a new custodian records previousCustodianId = the prior custodian', async () => {
    const id = await seedEvidence(); // custodian = detective

    // View #1 by admin → admin becomes custodian.
    await request(app.getHttpServer())
      .get(`/evidence/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // View #2 by detective → detective becomes custodian; the new row's
    // previousCustodianId MUST be the admin (proves view #1's UPDATE persisted —
    // the exact symptom of the old bug was this staying at the original custodian).
    await request(app.getHttpServer())
      .get(`/evidence/${id}`)
      .set('Authorization', `Bearer ${detectiveToken}`)
      .expect(200);

    const chain = await request(app.getHttpServer())
      .get(`/evidence/${id}/chain-of-custody`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const viewRows = chain.body.filter(
      (r: any) => r.transferReason === 'Viewed by user',
    );
    expect(viewRows).toHaveLength(2);
    expect(viewRows[0].previousCustodianId).toBe(DETECTIVE_SUB);
    expect(viewRows[0].newCustodianId).toBe(ADMIN_SUB);
    expect(viewRows[1].previousCustodianId).toBe(ADMIN_SUB);
    expect(viewRows[1].newCustodianId).toBe(DETECTIVE_SUB);
  });

  it('is idempotent for repeated self-views: refreshing as the current custodian adds no new row', async () => {
    const id = await seedEvidence(); // custodian = detective

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get(`/evidence/${id}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
    }

    const chain = await request(app.getHttpServer())
      .get(`/evidence/${id}/chain-of-custody`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // The detective already held custody from registration, so no "Viewed by
    // user" rows are appended by their own refreshes.
    const selfViews = chain.body.filter(
      (r: any) => r.transferReason === 'Viewed by user',
    );
    expect(selfViews).toHaveLength(0);
  });

  it('GET /evidence/:id/chain-of-custody stays side-effect-free (no view rows added)', async () => {
    const id = await seedEvidence();

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .get(`/evidence/${id}/chain-of-custody`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    }

    const chain = await request(app.getHttpServer())
      .get(`/evidence/${id}/chain-of-custody`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(chain.body).toHaveLength(1); // only the initial registration row
    expect(chain.body[0].transferReason).toBe('Initial registration');
  });

  it('returns 404 for an unknown id', async () => {
    await request(app.getHttpServer())
      .get(`/evidence/${MISSING_EVIDENCE}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });
});
