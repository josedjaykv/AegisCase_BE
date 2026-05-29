import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { CasePriority, CaseStatus, TeamRole } from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import {
  signTestToken,
  TEST_ADMIN,
  TEST_ANALYST,
  TEST_DETECTIVE,
} from './helpers/jwt';
import { bootstrapApp } from './helpers/bootstrap';

/**
 * E2E for PATCH /cases/:id/team/:userId — changing an existing team member's role.
 *
 * Boots case-service against a real Postgres (testcontainers). RabbitMQ is up so the
 * EventPublisher used by POST /cases has a broker to publish to, but this route itself
 * publishes nothing. JWTs are HS256-signed locally (KEYCLOAK_URL blank → dev fallback).
 */
describe('E2E — PATCH /cases/:id/team/:userId', () => {
  let infra: E2EInfra;
  let caseApp: INestApplication;

  let adminToken: string;
  let detectiveToken: string;
  let analystToken: string;

  // A second, non-creator member to promote/demote.
  const MEMBER_SUB = '44444444-4444-4444-8444-444444444444';

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    const { AppModule: CaseAppModule } = require('../../apps/case-service/src/app.module');
    caseApp = await bootstrapApp(CaseAppModule);

    adminToken = signTestToken(TEST_ADMIN);
    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);
  }, 180_000);

  afterAll(async () => {
    await caseApp?.close();
    await infra?.stop();
  });

  /** Creates a case (creator = detective) and adds MEMBER_SUB as a MEMBER. Returns the case id. */
  async function seedCaseWithMember(): Promise<string> {
    const created = await request(caseApp.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({
        title: 'Team role spec',
        priority: CasePriority.MEDIUM,
        leaderUserId: TEST_DETECTIVE.sub,
      })
      .expect(201);
    const caseId = created.body.id;

    await request(caseApp.getHttpServer())
      .post(`/cases/${caseId}/team`)
      .set('Authorization', `Bearer ${detectiveToken}`)
      .send({ userId: MEMBER_SUB, teamRole: TeamRole.MEMBER })
      .expect(201);

    return caseId;
  }

  describe('happy path', () => {
    it('promotes a MEMBER to LEAD (DETECTIVE)', async () => {
      const caseId = await seedCaseWithMember();

      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(200);

      expect(res.body).toMatchObject({
        caseId,
        userId: MEMBER_SUB,
        teamRole: TeamRole.LEAD,
      });
      expect(res.body.linkedAt).toBeDefined();
    });

    it('demotes a LEAD back to MEMBER (ADMIN)', async () => {
      const caseId = await seedCaseWithMember();
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(200);

      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ teamRole: TeamRole.MEMBER })
        .expect(200);

      expect(res.body.teamRole).toBe(TeamRole.MEMBER);
    });

    it('is idempotent — same role returns 200 unchanged', async () => {
      const caseId = await seedCaseWithMember();
      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.MEMBER })
        .expect(200);
      expect(res.body.teamRole).toBe(TeamRole.MEMBER);
    });
  });

  describe('auth', () => {
    it('403 for ANALYST', async () => {
      const caseId = await seedCaseWithMember();
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(403);
    });

    it('401 without a token', async () => {
      const caseId = await seedCaseWithMember();
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(401);
    });
  });

  describe('validation and business rules', () => {
    const messageOf = (res: request.Response): string => {
      const m = res.body?.message;
      if (typeof m === 'string') return m;
      if (Array.isArray(m)) return m.join(',');
      return m?.message ?? '';
    };

    it('400 for a missing teamRole', async () => {
      const caseId = await seedCaseWithMember();
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({})
        .expect(400);
    });

    it('400 for an invalid teamRole', async () => {
      const caseId = await seedCaseWithMember();
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: 'BOSS' })
        .expect(400);
    });

    it("400 when changing the CREATOR's role", async () => {
      const caseId = await seedCaseWithMember();
      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${TEST_DETECTIVE.sub}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.MEMBER })
        .expect(400);
      expect(messageOf(res)).toContain("The case creator's role cannot be changed");
    });

    it('400 when assigning the CREATOR role', async () => {
      const caseId = await seedCaseWithMember();
      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.CREATOR })
        .expect(400);
      expect(messageOf(res)).toContain('Cannot assign the CREATOR role');
    });

    it('400 when the case is closed', async () => {
      const caseId = await seedCaseWithMember();
      // Close the case first (detective may close).
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/status`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ status: CaseStatus.CLOSED })
        .expect(200);

      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(400);
      expect(messageOf(res)).toContain('A closed case cannot be modified');
    });

    it('404 when the case does not exist', async () => {
      await request(caseApp.getHttpServer())
        .patch(`/cases/99999999-9999-4999-8999-999999999999/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(404);
    });

    it('404 when the (caseId, userId) pair does not exist', async () => {
      const caseId = await seedCaseWithMember();
      const res = await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/55555555-5555-4555-8555-555555555555`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(404);
      expect(messageOf(res)).toContain('Team member not found');
    });
  });

  describe('regression — add/list contracts unchanged', () => {
    it('POST 409 on a duplicate member; GET reflects the role change', async () => {
      const caseId = await seedCaseWithMember();

      // POST still 409s on the existing pair.
      await request(caseApp.getHttpServer())
        .post(`/cases/${caseId}/team`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ userId: MEMBER_SUB, teamRole: TeamRole.MEMBER })
        .expect(409);

      // Promote, then confirm GET reflects it.
      await request(caseApp.getHttpServer())
        .patch(`/cases/${caseId}/team/${MEMBER_SUB}`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({ teamRole: TeamRole.LEAD })
        .expect(200);

      const team = await request(caseApp.getHttpServer())
        .get(`/cases/${caseId}/team`)
        .set('Authorization', `Bearer ${analystToken}`)
        .expect(200);

      const member = (team.body as any[]).find((m) => m.userId === MEMBER_SUB);
      expect(member.teamRole).toBe(TeamRole.LEAD);
    });
  });
});
