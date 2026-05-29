import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AllExceptionsFilter } from '@aegiscase/common';
import {
  signTestToken,
  TEST_ADMIN,
  TEST_ANALYST,
  TEST_DETECTIVE,
} from './helpers/jwt';

/**
 * E2E for GET /auth/keycloak-users.
 *
 * auth-service has no DB/RabbitMQ, so no testcontainers are needed: we boot its AppModule
 * in-process and override the two external collaborators (Keycloak admin API + user-service
 * link lookup) with mocks. KEYCLOAK_URL is blanked so JwtStrategy uses its HS256 dev path,
 * matching the locally-signed test tokens.
 */
describe('E2E — GET /auth/keycloak-users', () => {
  let app: INestApplication;
  let adminToken: string;
  let detectiveToken: string;
  let analystToken: string;

  const adminMock = {
    searchUsers: jest.fn(),
    countUsers: jest.fn(),
    getUserRealmRoleNames: jest.fn(),
  };
  const directoryMock = {
    resolveProvisioned: jest.fn(),
  };

  beforeAll(async () => {
    // dotenv (ConfigModule) skips keys already on process.env; '' is falsy → HS256 fallback.
    process.env.KEYCLOAK_URL = '';
    process.env.JWT_SECRET = 'e2e-test-secret';

    const { AppModule } = require('../../apps/auth-service/src/app.module');
    const {
      KeycloakAdminService,
    } = require('../../apps/auth-service/src/keycloak/keycloak-admin.service');
    const {
      UserDirectoryClient,
    } = require('../../apps/auth-service/src/keycloak/user-directory.client');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KeycloakAdminService)
      .useValue(adminMock)
      .overrideProvider(UserDirectoryClient)
      .useValue(directoryMock)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    directoryMock.resolveProvisioned.mockResolvedValue(new Map<string, string>());
  });

  const oliver = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    firstName: 'Oliver',
    lastName: 'Stone',
    email: 'oliver@aegiscase.com',
    realmRoles: ['DETECTIVE', 'offline_access'],
  };

  it('rejects DETECTIVE with 403', async () => {
    await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .expect(403);
    expect(adminMock.searchUsers).not.toHaveBeenCalled();
  });

  it('rejects ANALYST with 403', async () => {
    await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli')
      .set('Authorization', `Bearer ${analystToken}`)
      .expect(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(app.getHttpServer()).get('/auth/keycloak-users?search=oli').expect(401);
  });

  it('returns 400 when search is shorter than 2 characters', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=a')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    // AllExceptionsFilter nests HttpException.getResponse() under `message`.
    expect(res.body.message.message).toBe('search must be at least 2 characters');
  });

  it('returns the mapped Keycloak user on the happy path', async () => {
    adminMock.searchUsers.mockResolvedValue([oliver]);
    adminMock.countUsers.mockResolvedValue(1);

    const res = await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli&page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminMock.searchUsers).toHaveBeenCalledWith('oli', 0, 10);
    expect(res.body).toMatchObject({ total: 1, page: 1, limit: 10 });
    expect(res.body.data[0]).toEqual({
      sub: oliver.id,
      firstName: 'Oliver',
      lastName: 'Stone',
      email: 'oliver@aegiscase.com',
      role: 'DETECTIVE',
      provisioned: false,
      userServiceId: null,
    });
  });

  it('marks a user provisioned when user-service has a matching row', async () => {
    adminMock.searchUsers.mockResolvedValue([oliver]);
    adminMock.countUsers.mockResolvedValue(1);
    directoryMock.resolveProvisioned.mockResolvedValue(
      new Map([[oliver.id, 'user-service-id-123']]),
    );

    const res = await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data[0]).toMatchObject({
      provisioned: true,
      userServiceId: 'user-service-id-123',
    });
  });

  it('returns role null when the user has no AegisCase realm role', async () => {
    adminMock.searchUsers.mockResolvedValue([
      { ...oliver, realmRoles: ['offline_access', 'uma_authorization'] },
    ]);
    adminMock.countUsers.mockResolvedValue(1);

    const res = await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data[0].role).toBeNull();
  });

  it('computes the Keycloak offset from page/limit', async () => {
    adminMock.searchUsers.mockResolvedValue([]);
    adminMock.countUsers.mockResolvedValue(0);

    await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli&page=3&limit=20')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(adminMock.searchUsers).toHaveBeenCalledWith('oli', 40, 20);
  });

  it('maps a Keycloak admin-API failure to 503', async () => {
    adminMock.searchUsers.mockRejectedValue(
      new ServiceUnavailableException('Authentication service unavailable'),
    );
    adminMock.countUsers.mockRejectedValue(
      new ServiceUnavailableException('Authentication service unavailable'),
    );

    const res = await request(app.getHttpServer())
      .get('/auth/keycloak-users?search=oli')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(503);

    expect(res.body.message.message).toBe('Authentication service unavailable');
  });

  // Backwards-compat: an existing /auth route still works alongside the new module.
  it('keeps GET /auth/me working for an authenticated caller', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ sub: TEST_ADMIN.sub, role: 'ADMIN' });
  });

  it('keeps GET /auth/me rejecting an unauthenticated caller with 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
