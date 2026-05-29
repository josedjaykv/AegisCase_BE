import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { UserRole } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import {
  signTestToken,
  TEST_ADMIN,
  TEST_ANALYST,
  TEST_DETECTIVE,
} from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for GET /users/directory.
 *
 * Boots user-service against a real Postgres (testcontainers) and:
 *  - seeds three users (admin, detective, analyst) via the existing
 *    POST /users route (ADMIN-only) so we have real rows to resolve;
 *  - asserts the four-field minimal projection is identical for all
 *    three caller roles;
 *  - guards the 400 contract (param missing/empty/non-UUID/>100);
 *  - regression-checks that GET /users/by-keycloak-ids stays ADMIN-only
 *    and still returns the full PII payload (unchanged contract).
 */
describe('E2E — GET /users/directory', () => {
  let infra: E2EInfra;
  let app: INestApplication;

  let adminToken: string;
  let detectiveToken: string;
  let analystToken: string;

  const subAdmin = TEST_ADMIN.sub;
  const subDetective = TEST_DETECTIVE.sub;
  const subAnalyst = TEST_ANALYST.sub;
  const subUnknown = '99999999-9999-4999-8999-999999999999';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    const { AppModule } = require('../../apps/user-service/src/app.module');
    app = await bootstrapApp(AppModule);

    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);

    const seed = async (
      keycloakUserId: string,
      firstNames: string,
      lastNames: string,
      document: string,
      role: UserRole,
    ) => {
      await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ keycloakUserId, firstNames, lastNames, document, role, jobTitle: 'Op' })
        .expect(201);
    };
    await seed(subAdmin, 'Ada', 'Admin', 'DOC-ADM', UserRole.ADMIN);
    await seed(subDetective, 'Dora', 'Detective', 'DOC-DET', UserRole.DETECTIVE);
    await seed(subAnalyst, 'Ana', 'Analyst', 'DOC-ANA', UserRole.ANALYST);
  }, 240_000);

  afterAll(async () => {
    await app?.close();
    await infra?.stop();
  });

  describe('happy path — every authenticated role gets the same minimal shape', () => {
    const expected = [
      {
        keycloakUserId: subDetective,
        firstNames: 'Dora',
        lastNames: 'Detective',
        role: UserRole.DETECTIVE,
      },
      {
        keycloakUserId: subAnalyst,
        firstNames: 'Ana',
        lastNames: 'Analyst',
        role: UserRole.ANALYST,
      },
    ];

    const sortBySub = (rows: any[]) =>
      [...rows].sort((a, b) => a.keycloakUserId.localeCompare(b.keycloakUserId));

    it.each([
      ['ADMIN', () => adminToken],
      ['DETECTIVE', () => detectiveToken],
      ['ANALYST', () => analystToken],
    ])('200 for %s with the four-field projection (deep-equal)', async (_role, token) => {
      const res = await request(app.getHttpServer())
        .get(`/users/directory?ids=${subDetective},${subAnalyst}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(200);

      expect(sortBySub(res.body)).toEqual(sortBySub(expected));
      // PII leak guard — exactly the four keys, every entry.
      for (const entry of res.body) {
        expect(Object.keys(entry).sort()).toEqual(
          ['firstNames', 'keycloakUserId', 'lastNames', 'role'],
        );
      }
    });

    it('silently omits unknown subs (no 404)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/directory?ids=${subAnalyst},${subUnknown}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].keycloakUserId).toBe(subAnalyst);
    });
  });

  describe('auth', () => {
    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/users/directory?ids=${subAdmin}`)
        .expect(401);
    });
  });

  describe('400 contract — exact messages the FE relies on', () => {
    const expectMessage = (res: request.Response, msg: string) => {
      // AllExceptionsFilter nests HttpException.getResponse() under `message`.
      const body = res.body;
      const m = body?.message;
      const inner = typeof m === 'string' ? m : m?.message;
      expect(inner).toBe(msg);
    };

    it('400 when ids is missing', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/directory')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expectMessage(res, 'ids is required');
    });

    it('400 when ids is empty', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/directory?ids=')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expectMessage(res, 'ids is required');
    });

    it('400 when any id is not a UUID', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/directory?ids=${subAdmin},not-a-uuid`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expectMessage(res, 'ids must be comma-separated UUIDs');
    });

    it('400 when more than 100 ids', async () => {
      // 101 syntactically valid UUIDs.
      const ids = Array.from({ length: 101 }, (_, i) => {
        const h = i.toString(16).padStart(2, '0');
        return `${h}${h}${h}${h}${h}${h}${h}${h}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      }).join(',');
      const res = await request(app.getHttpServer())
        .get(`/users/directory?ids=${ids}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expectMessage(res, 'Cannot resolve more than 100 ids per call');
    });
  });

  describe('regression — GET /users/by-keycloak-ids contract unchanged', () => {
    it('200 ADMIN — payload still includes the internal user-service id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/by-keycloak-ids?ids=${subDetective}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ keycloakUserId: subDetective });
      // `id` is what distinguishes this ADMIN/internal route from the new
      // directory projection; if it disappears, the auth-service link lookup
      // and any other ADMIN tooling break.
      expect(res.body[0]).toHaveProperty('id');
    });

    it.each([
      ['DETECTIVE', () => detectiveToken],
      ['ANALYST', () => analystToken],
    ])('403 for %s', async (_role, token) => {
      await request(app.getHttpServer())
        .get(`/users/by-keycloak-ids?ids=${subDetective}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(403);
    });
  });
});
