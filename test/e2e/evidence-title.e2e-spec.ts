import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { EvidenceType } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_DETECTIVE } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for the evidence `title` field (Feature 009).
 * Boots evidence-service against a real Postgres (testcontainers).
 */
describe('E2E — evidence title (Feature 009)', () => {
  let infra: E2EInfra;
  let app: INestApplication;
  let token: string;

  const CASE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);
    const { AppModule } = require('../../apps/evidence-service/src/app.module');
    app = await bootstrapApp(AppModule);
    token = signTestToken(TEST_DETECTIVE);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  const auth = () => `Bearer ${token}`;

  it('POST /evidence persists title and returns it', async () => {
    const res = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', auth())
      .send({
        caseId: CASE_ID,
        evidenceType: EvidenceType.TESTIMONIAL,
        title: 'Testimonio de Juanito',
        description: 'Texto largo del testimonio, varios párrafos...',
      })
      .expect(201);

    expect(res.body.title).toBe('Testimonio de Juanito');

    // GET by id returns it too
    const got = await request(app.getHttpServer())
      .get(`/evidence/${res.body.id}`)
      .set('Authorization', auth())
      .expect(200);
    expect(got.body.title).toBe('Testimonio de Juanito');
  });

  it('PUT /evidence/:id updates the title', async () => {
    const created = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', auth())
      .send({ caseId: CASE_ID, evidenceType: EvidenceType.PHYSICAL, title: 'old', description: 'd' })
      .expect(201);

    const updated = await request(app.getHttpServer())
      .put(`/evidence/${created.body.id}`)
      .set('Authorization', auth())
      .send({ title: 'new title' })
      .expect(200);

    expect(updated.body.title).toBe('new title');
  });

  it('title is optional — omitting it stores null and still works (backward-compatible)', async () => {
    const res = await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', auth())
      .send({ caseId: CASE_ID, evidenceType: EvidenceType.DIGITAL, description: 'no title here' })
      .expect(201);

    expect(res.body.title).toBeNull();
  });

  it('GET /evidence?caseId= returns title in the list rows', async () => {
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', auth())
      .send({ caseId: CASE_ID, evidenceType: EvidenceType.DOCUMENTARY, title: 'Listed', description: 'd' })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/evidence?caseId=${CASE_ID}&limit=100`)
      .set('Authorization', auth())
      .expect(200);

    expect(list.body.data.some((e: any) => e.title === 'Listed')).toBe(true);
  });

  it('rejects a title longer than 200 chars with 400', async () => {
    await request(app.getHttpServer())
      .post('/evidence')
      .set('Authorization', auth())
      .send({
        caseId: CASE_ID,
        evidenceType: EvidenceType.OTHER,
        title: 'x'.repeat(201),
        description: 'd',
      })
      .expect(400);
  });
});
