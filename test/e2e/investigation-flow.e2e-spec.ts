import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  CasePriority,
  EvidenceType,
  TaskPriority,
  TaskStatus,
} from '@aegiscase/enums';
import { applyInfraEnv, E2EInfra, startInfra } from './helpers/containers';
import {
  signTestToken,
  TEST_ANALYST,
  TEST_DETECTIVE,
} from './helpers/jwt';
import { bootstrapApp, pollUntil } from './helpers/bootstrap';

/**
 * Extended E2E covering the operational investigation flow across 4 services + audit.
 *
 *   case-service  → CASE_CREATED audit
 *   evidence-service → EVIDENCE_ADDED, EVIDENCE_CUSTODY_TRANSFERRED audit + chain-of-custody invariant
 *   task-service  → TASK_ASSIGNED, TASK_COMPLETED audit
 *   permission check → analyst forbidden from creating a case
 */

interface AuditRecord {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  newState: Record<string, any>;
  previousState: Record<string, any> | null;
}

async function findAuditAction(
  auditApp: INestApplication,
  token: string,
  entityType: string,
  entityId: string,
  action: string,
): Promise<AuditRecord> {
  return pollUntil<AuditRecord>(async () => {
    const res = await request(auditApp.getHttpServer())
      .get(`/audit/entity/${entityType}/${entityId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body.data as AuditRecord[]).find((r) => r.action === action) ?? null;
  }, `${entityType}/${entityId} ${action}`);
}

describe('E2E — Investigation flow (case + evidence + task + audit)', () => {
  let infra: E2EInfra;
  let caseApp: INestApplication;
  let evidenceApp: INestApplication;
  let taskApp: INestApplication;
  let auditApp: INestApplication;

  let detectiveToken: string;
  let analystToken: string;

  beforeAll(async () => {
    infra = await startInfra();
    applyInfraEnv(infra);

    // Lazy require so AppModules load AFTER applyInfraEnv populated process.env.
    const { AppModule: AuditAppModule } = require('../../apps/audit-service/src/app.module');
    const { AppModule: CaseAppModule } = require('../../apps/case-service/src/app.module');
    const { AppModule: EvidenceAppModule } = require('../../apps/evidence-service/src/app.module');
    const { AppModule: TaskAppModule } = require('../../apps/task-service/src/app.module');

    // audit-service first so its consumer is bound to the exchange before anyone publishes.
    auditApp = await bootstrapApp(AuditAppModule);
    caseApp = await bootstrapApp(CaseAppModule);
    evidenceApp = await bootstrapApp(EvidenceAppModule);
    taskApp = await bootstrapApp(TaskAppModule);

    detectiveToken = signTestToken(TEST_DETECTIVE);
    analystToken = signTestToken(TEST_ANALYST);
  }, 240_000);

  afterAll(async () => {
    await Promise.allSettled([
      caseApp?.close(),
      evidenceApp?.close(),
      taskApp?.close(),
      auditApp?.close(),
    ]);
    await infra?.stop();
  });

  describe('Evidence sub-flow', () => {
    let caseId: string;

    beforeAll(async () => {
      const res = await request(caseApp.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({
          title: 'Investigation with evidence',
          priority: CasePriority.MEDIUM,
          leaderUserId: TEST_DETECTIVE.sub,
        })
        .expect(201);
      caseId = res.body.id;
    });

    it('records EVIDENCE_ADDED when evidence is registered', async () => {
      const res = await request(evidenceApp.getHttpServer())
        .post('/evidence')
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({
          caseId,
          evidenceType: EvidenceType.PHYSICAL,
          description: 'Recovered weapon',
        })
        .expect(201);
      const evidenceId = res.body.id;
      expect(evidenceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.evidenceStatus).toBe('REGISTERED');

      const rec = await findAuditAction(
        auditApp,
        detectiveToken,
        'Evidence',
        evidenceId,
        'EVIDENCE_ADDED',
      );
      expect(rec.userId).toBe(TEST_DETECTIVE.sub);
      expect(rec.newState).toMatchObject({
        case_id: caseId,
        evidence_type: EvidenceType.PHYSICAL,
        status: 'REGISTERED',
      });
    });

    it('records EVIDENCE_CUSTODY_TRANSFERRED and appends a chain-of-custody row', async () => {
      // Register a fresh piece of evidence so we don't depend on the previous test's id.
      const created = await request(evidenceApp.getHttpServer())
        .post('/evidence')
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({
          caseId,
          evidenceType: EvidenceType.DIGITAL,
          description: 'Hard drive image',
        })
        .expect(201);
      const evidenceId = created.body.id;

      await request(evidenceApp.getHttpServer())
        .patch(`/evidence/${evidenceId}/transfer-custody`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({
          newCustodianId: TEST_ANALYST.sub,
          transferReason: 'Forensic analysis',
        })
        .expect(200);

      const rec = await findAuditAction(
        auditApp,
        detectiveToken,
        'Evidence',
        evidenceId,
        'EVIDENCE_CUSTODY_TRANSFERRED',
      );
      expect(rec.newState).toMatchObject({
        current_custodian_id: TEST_ANALYST.sub,
        transfer_reason: 'Forensic analysis',
      });

      // Chain of custody should have at least the initial row + this transfer.
      const chainRes = await request(evidenceApp.getHttpServer())
        .get(`/evidence/${evidenceId}/chain-of-custody`)
        .set('Authorization', `Bearer ${detectiveToken}`)
        .expect(200);
      const chain = chainRes.body as any[];
      expect(chain.length).toBeGreaterThanOrEqual(2);
      // Last row must reflect the transfer we just performed.
      const last = chain[chain.length - 1];
      expect(last.newCustodianId).toBe(TEST_ANALYST.sub);
    });
  });

  describe('Task sub-flow', () => {
    let caseId: string;
    let taskId: string;

    beforeAll(async () => {
      const res = await request(caseApp.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({
          title: 'Investigation with tasks',
          priority: CasePriority.HIGH,
          leaderUserId: TEST_DETECTIVE.sub,
        })
        .expect(201);
      caseId = res.body.id;
    });

    it('records TASK_ASSIGNED when a task is created and assigned', async () => {
      const res = await request(taskApp.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${detectiveToken}`)
        .send({
          caseId,
          title: 'Review surveillance footage',
          priority: TaskPriority.MEDIUM,
          assignedToUserId: TEST_ANALYST.sub,
        })
        .expect(201);

      taskId = res.body.id;
      expect(res.body.status).toBe(TaskStatus.PENDING);
      expect(res.body.assignedToUserId).toBe(TEST_ANALYST.sub);

      const rec = await findAuditAction(
        auditApp,
        detectiveToken,
        'Task',
        taskId,
        'TASK_ASSIGNED',
      );
      expect(rec.userId).toBe(TEST_DETECTIVE.sub);
      expect(rec.newState).toMatchObject({
        case_id: caseId,
        assigned_to_user_id: TEST_ANALYST.sub,
        status: 'PENDING',
      });
    });

    it('records TASK_COMPLETED when the analyst marks the task done', async () => {
      // Analyst is the assignee, so they can change status.
      await request(taskApp.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ status: TaskStatus.COMPLETED })
        .expect(200);

      const rec = await findAuditAction(
        auditApp,
        detectiveToken,
        'Task',
        taskId,
        'TASK_COMPLETED',
      );
      expect(rec.userId).toBe(TEST_ANALYST.sub);
      expect(rec.newState).toMatchObject({
        status: 'COMPLETED',
        completed_by_user_id: TEST_ANALYST.sub,
      });
    });

    it('rejects reopening a COMPLETED task', async () => {
      await request(taskApp.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ status: TaskStatus.PENDING })
        .expect(400);
    });
  });

  describe('Permission checks', () => {
    it('forbids ANALYST from creating a case (403)', async () => {
      await request(caseApp.getHttpServer())
        .post('/cases')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          title: 'should not be allowed',
          priority: CasePriority.LOW,
          leaderUserId: TEST_ANALYST.sub,
        })
        .expect(403);
    });

    it('forbids ANALYST from registering evidence (403)', async () => {
      await request(evidenceApp.getHttpServer())
        .post('/evidence')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({
          caseId: TEST_DETECTIVE.sub, // unused — guard fires before the body is reached
          evidenceType: EvidenceType.PHYSICAL,
          description: 'nope',
        })
        .expect(403);
    });
  });
});
