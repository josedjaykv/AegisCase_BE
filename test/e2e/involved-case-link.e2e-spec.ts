import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { InvolvementType } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import { signTestToken, TEST_ADMIN, TEST_ANALYST, TEST_DETECTIVE } from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for the case ↔ involved-person link management routes (Feature 004):
 *   GET    /involved-persons/by-case/:caseId   — roster (all roles)
 *   PATCH  /involved-persons/:id/cases/:caseId — edit link (ADMIN, DETECTIVE)
 *   DELETE /involved-persons/:id/cases/:caseId — unlink   (ADMIN, DETECTIVE)
 *
 * Boots involved-service against a real Postgres (testcontainers). RabbitMQ is up so the
 * EventPublisher used by POST link / DELETE unlink has a broker. JWTs are HS256-signed
 * locally (KEYCLOAK_URL blank → dev fallback). caseId is never verified by the service,
 * so we use a synthetic UUID for it.
 */
describe('E2E — involved-person case-link management', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let adminToken: string;
  let detectiveToken: string;
  let analystToken: string;

  const CASE_ID = '66666666-6666-4666-8666-666666666666';
  const OTHER_CASE_ID = '77777777-7777-4777-8777-777777777777';
  const MISSING_PERSON = '88888888-8888-4888-8888-888888888888';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    const { AppModule } = require('../../apps/involved-service/src/app.module');
    app = await bootstrapApp(AppModule);

    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  const messageOf = (res: request.Response): string => {
    const m = res.body?.message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join(',');
    return m?.message ?? '';
  };

  /** Creates a person and links them to CASE_ID. Returns the person id. */
  async function seedLinkedPerson(
    caseId = CASE_ID,
    involvementType = InvolvementType.WITNESS,
  ): Promise<string> {
    const person = await request(app.getHttpServer())
      .post('/involved-persons')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({
        firstNames: 'Grace',
        lastNames: 'Hopper',
        document: `DOC-${Date.now()}-${Math.random()}`,
      })
      .expect(201);
    const personId = person.body.id;

    await request(app.getHttpServer())
      .post(`/involved-persons/${personId}/cases/${caseId}`)
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ involvementType })
      .expect(201);

    return personId;
  }

  describe('#1 GET /involved-persons/by-case/:caseId — roster', () => {
    it('returns rows with an embedded person of exactly { id, firstNames, lastNames, document }', async () => {
      const personId = await seedLinkedPerson(OTHER_CASE_ID, InvolvementType.SUSPECT);

      const res = await request(app.getHttpServer())
        .get(`/involved-persons/by-case/${OTHER_CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const row = (res.body as any[]).find((r) => r.involvedPersonId === personId);
      expect(row).toMatchObject({
        caseId: OTHER_CASE_ID,
        involvedPersonId: personId,
        involvementType: InvolvementType.SUSPECT,
      });
      expect(Object.keys(row.person).sort()).toEqual(
        ['document', 'firstNames', 'id', 'lastNames'].sort(),
      );
    });

    it('returns [] (not 404) for a case with no links', async () => {
      const res = await request(app.getHttpServer())
        .get('/involved-persons/by-case/99999999-9999-4999-8999-999999999999')
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('200 for all three roles', async () => {
      await request(app.getHttpServer())
        .get(`/involved-persons/by-case/${CASE_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/involved-persons/by-case/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/involved-persons/by-case/${CASE_ID}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);
    });

    it('401 without a token', async () => {
      await request(app.getHttpServer()).get(`/involved-persons/by-case/${CASE_ID}`).expect(401);
    });
  });

  describe('#2 PATCH /involved-persons/:id/cases/:caseId — edit link', () => {
    it('changes involvementType', async () => {
      const personId = await seedLinkedPerson();
      const res = await request(app.getHttpServer())
        .patch(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ involvementType: InvolvementType.SUSPECT })
        .expect(200);
      expect(res.body).toMatchObject({
        caseId: CASE_ID,
        involvedPersonId: personId,
        involvementType: InvolvementType.SUSPECT,
      });
    });

    it('changes observations (partial, one field)', async () => {
      const personId = await seedLinkedPerson();
      const res = await request(app.getHttpServer())
        .patch(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ observations: 'updated note' })
        .expect(200);
      expect(res.body.observations).toBe('updated note');
    });

    it('400 on an empty body — "At least one field is required"', async () => {
      const personId = await seedLinkedPerson();
      const res = await request(app.getHttpServer())
        .patch(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({})
        .expect(400);
      expect(messageOf(res)).toContain('At least one field is required');
    });

    it('400 on a bad enum', async () => {
      const personId = await seedLinkedPerson();
      await request(app.getHttpServer())
        .patch(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ involvementType: 'NEMESIS' })
        .expect(400);
    });

    it('404 "Person not found" when the person id is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/involved-persons/${MISSING_PERSON}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ involvementType: InvolvementType.SUSPECT })
        .expect(404);
      expect(messageOf(res)).toContain('Person not found');
    });

    it('404 "Link not found" when the (caseId, personId) pair is missing', async () => {
      // Create a person but do NOT link them.
      const person = await request(app.getHttpServer())
        .post('/involved-persons')
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ firstNames: 'Unlinked' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/involved-persons/${person.body.id}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ involvementType: InvolvementType.SUSPECT })
        .expect(404);
      expect(messageOf(res)).toContain('Link not found');
    });

    it('403 for ANALYST', async () => {
      const personId = await seedLinkedPerson();
      await request(app.getHttpServer())
        .patch(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ involvementType: InvolvementType.SUSPECT })
        .expect(403);
    });
  });

  describe('#3 DELETE /involved-persons/:id/cases/:caseId — unlink', () => {
    it('removes the link (subsequent roster no longer shows it); person row survives', async () => {
      const personId = await seedLinkedPerson();

      const del = await request(app.getHttpServer())
        .delete(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
      expect(del.body).toEqual({ success: true });

      // Roster no longer lists this person for the case.
      const roster = await request(app.getHttpServer())
        .get(`/involved-persons/by-case/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
      expect((roster.body as any[]).some((r) => r.involvedPersonId === personId)).toBe(false);

      // The person row itself still exists.
      await request(app.getHttpServer())
        .get(`/involved-persons/${personId}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
    });

    it('404 "Link not found" for a non-existent link', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/involved-persons/${MISSING_PERSON}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(404);
      expect(messageOf(res)).toContain('Link not found');
    });

    it('403 for ANALYST', async () => {
      const personId = await seedLinkedPerson();
      await request(app.getHttpServer())
        .delete(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(403);
    });
  });

  describe('regression — existing link contracts unchanged', () => {
    it('POST link still 409s on a duplicate; GET /:id/cases still returns the bare join rows', async () => {
      const personId = await seedLinkedPerson();

      // Duplicate link → 409.
      await request(app.getHttpServer())
        .post(`/involved-persons/${personId}/cases/${CASE_ID}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ involvementType: InvolvementType.WITNESS })
        .expect(409);

      // Reverse-from-person lookup unchanged.
      const cases = await request(app.getHttpServer())
        .get(`/involved-persons/${personId}/cases`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);
      const link = (cases.body as any[]).find((c) => c.caseId === CASE_ID);
      expect(link).toMatchObject({ caseId: CASE_ID, involvedPersonId: personId });
    });
  });
});
