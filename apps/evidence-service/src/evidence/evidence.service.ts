import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Evidence } from './evidence.entity';
import { ChainOfCustody } from './chain-of-custody.entity';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { TransferCustodyDto } from './dto/transfer-custody.dto';
import { EvidenceStatus } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { JwtPayload } from '@aegiscase/common';
import { EventPublisherService } from '../events/event-publisher.service';

@Injectable()
export class EvidenceService {
  /** Fixed chain-of-custody reason for a self-assigned custody acquisition. */
  static readonly CUSTODY_ACCESS_REASON = 'Accessed evidence file';

  constructor(
    @InjectRepository(Evidence)
    private readonly evidenceRepo: Repository<Evidence>,
    @InjectRepository(ChainOfCustody)
    private readonly custodyRepo: Repository<ChainOfCustody>,
    private readonly dataSource: DataSource,
    private readonly events: EventPublisherService,
  ) {}

  async create(dto: CreateEvidenceDto, actor: JwtPayload): Promise<Evidence> {
    const evidence = this.evidenceRepo.create({
      ...dto,
      title: dto.title ?? null,
      createdByUserId: actor.sub,
      evidenceStatus: EvidenceStatus.REGISTERED,
      currentCustodianId: dto.currentCustodianId ?? actor.sub,
    });
    const saved = await this.evidenceRepo.save(evidence);

    await this.custodyRepo.save(
      this.custodyRepo.create({
        evidenceId: saved.id,
        previousCustodianId: null,
        newCustodianId: dto.currentCustodianId ?? actor.sub,
        transferredByUserId: actor.sub,
        transferReason: 'Initial registration',
      }),
    );

    const created = await this.findOne(saved.id, actor, false);
    this.events.publishEvidenceAdded(actor.sub, created.id, {
      case_id: created.caseId,
      evidence_type: created.evidenceType,
      custodian_user_id: created.currentCustodianId ?? actor.sub,
      title: created.title ?? undefined,
    });
    return created;
  }

  async findAll(pagination: PaginationDto, caseId?: string): Promise<[Evidence[], number]> {
    const { page = 1, limit = 20 } = pagination;
    const where = caseId ? { caseId } : {};
    return this.evidenceRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string, actor: JwtPayload, trackView = true): Promise<Evidence> {
    if (!trackView) {
      const evidence = await this.evidenceRepo.findOne({
        where: { id },
        relations: ['custodyChain'],
      });
      if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
      return evidence;
    }

    // "View = take custody". The COC insert and the custodian update MUST be
    // atomic — a "Viewed by user" row without the matching custodian update is
    // a corrupt chain of custody. Both writes run in one transaction so any
    // failure rolls back the whole side effect (see fix 001).
    return this.dataSource.transaction(async (manager) => {
      const evidence = await manager.findOne(Evidence, { where: { id } });
      if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

      // Idempotent self-view: don't spam the chain when the viewer already holds
      // custody (e.g. a UI refresh). A view by a *different* user still records.
      if (evidence.currentCustodianId !== actor.sub) {
        await manager.insert(ChainOfCustody, {
          evidenceId: id,
          previousCustodianId: evidence.currentCustodianId,
          newCustodianId: actor.sub,
          transferredByUserId: actor.sub,
          transferReason: 'Viewed by user',
        });
        await manager.update(Evidence, { id }, { currentCustodianId: actor.sub });
      }

      // Reload with the relation so the response carries an up-to-date
      // custodyChain. Loading via `relations` (not cascade save) avoids the
      // circular evidence <-> custodyChain back-reference that broke
      // serialization in the previous implementation.
      const fresh = await manager.findOne(Evidence, {
        where: { id },
        relations: ['custodyChain'],
      });
      return fresh as Evidence;
    });
  }

  async update(id: string, dto: UpdateEvidenceDto, actor: JwtPayload): Promise<Evidence> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

    // Custody gate (Feature 010): only the current custodian may edit — same policy
    // as downloading evidence files (Feature 007). Applies to ALL roles, incl. ADMIN;
    // a non-custodian must `PATCH /evidence/:id/take-custody` first (which is audited).
    if (evidence.currentCustodianId !== actor.sub) {
      throw new ForbiddenException('You must hold custody of this evidence to edit it');
    }

    Object.assign(evidence, dto);
    const saved = await this.evidenceRepo.save(evidence);

    // Emit only the fields the caller actually sent, so Audit records "who edited what".
    const changes: Record<string, unknown> = {};
    if (dto.title !== undefined) changes.title = saved.title;
    if (dto.description !== undefined) changes.description = saved.description;
    if (dto.evidenceType !== undefined) changes.evidence_type = saved.evidenceType;
    if (dto.evidenceStatus !== undefined) changes.evidence_status = saved.evidenceStatus;

    this.events.publishEvidenceUpdated(actor.sub, saved.id, {
      case_id: saved.caseId,
      updated_by_user_id: actor.sub,
      changes,
    });

    return saved;
  }

  async transferCustody(id: string, dto: TransferCustodyDto, actor: JwtPayload): Promise<Evidence> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

    await this.custodyRepo.save(
      this.custodyRepo.create({
        evidenceId: id,
        previousCustodianId: evidence.currentCustodianId,
        newCustodianId: dto.newCustodianId,
        transferredByUserId: actor.sub,
        transferReason: dto.transferReason ?? null,
      }),
    );

    const previousCustodianId = evidence.currentCustodianId;
    evidence.currentCustodianId = dto.newCustodianId;
    evidence.evidenceStatus = EvidenceStatus.TRANSFERRED;
    const transferred = await this.evidenceRepo.save(evidence);

    this.events.publishEvidenceTransferred(actor.sub, transferred.id, {
      case_id: transferred.caseId,
      previous_custodian_id: previousCustodianId,
      new_custodian_id: dto.newCustodianId,
      transfer_reason: dto.transferReason,
    });

    return transferred;
  }

  /**
   * Self-assign custody to the caller. Unlike `transferCustody` (ADMIN/DETECTIVE,
   * assigns to a named user), any role may take custody of *themselves* — the
   * deliberate act required before downloading evidence files (Feature 007).
   * Atomic + idempotent: if the caller already holds custody, no new chain row.
   */
  async takeCustody(id: string, actor: JwtPayload): Promise<Evidence> {
    const result = await this.dataSource.transaction(async (manager) => {
      const evidence = await manager.findOne(Evidence, { where: { id } });
      if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

      const previousCustodianId = evidence.currentCustodianId;
      const changed = previousCustodianId !== actor.sub;

      if (changed) {
        await manager.insert(ChainOfCustody, {
          evidenceId: id,
          previousCustodianId,
          newCustodianId: actor.sub,
          transferredByUserId: actor.sub,
          transferReason: EvidenceService.CUSTODY_ACCESS_REASON,
        });
        await manager.update(Evidence, { id }, { currentCustodianId: actor.sub });
      }

      const fresh = (await manager.findOne(Evidence, {
        where: { id },
        relations: ['custodyChain'],
      })) as Evidence;
      return { fresh, changed, previousCustodianId };
    });

    // Publish after commit — a broker hiccup must not roll back the custody change.
    if (result.changed) {
      this.events.publishEvidenceCustodyAccessed(actor.sub, result.fresh.id, {
        case_id: result.fresh.caseId,
        previous_custodian_id: result.previousCustodianId,
        new_custodian_id: actor.sub,
        reason: EvidenceService.CUSTODY_ACCESS_REASON,
      });
    }

    return result.fresh;
  }

  /**
   * Read-only single-evidence summary (Feature 011). Same shape as a `findAll`
   * list row (no `custodyChain` relation) and — critically — **no side effect**:
   * it does NOT record a view or touch the chain of custody. Used by the FE on a
   * reload / deep-link of `/evidence/:id` where there is no warm list cache, so the
   * mutating `GET /evidence/:id` is never auto-called.
   */
  async getSummary(id: string): Promise<Evidence> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    return evidence;
  }

  /**
   * Side-effect-free lookup of the current custodian. Used by media-service to
   * enforce "only the custodian may download an evidence file" — it must NOT use
   * `GET /evidence/:id` (that transfers custody).
   */
  async getCustodian(id: string): Promise<{ evidenceId: string; currentCustodianId: string | null }> {
    const evidence = await this.evidenceRepo.findOne({
      where: { id },
      select: ['id', 'currentCustodianId'],
    });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    return { evidenceId: evidence.id, currentCustodianId: evidence.currentCustodianId };
  }

  async getCustodyChain(id: string): Promise<ChainOfCustody[]> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    return this.custodyRepo.find({
      where: { evidenceId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async archive(id: string, actor: JwtPayload): Promise<Evidence> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    if (evidence.archived) throw new ConflictException('Evidence is already archived');
    evidence.archived = true;
    evidence.archivedAt = new Date();
    evidence.evidenceStatus = EvidenceStatus.ARCHIVED;
    const archived = await this.evidenceRepo.save(evidence);

    this.events.publishEvidenceArchived(actor.sub, archived.id, {
      case_id: archived.caseId,
      archived_by_user_id: actor.sub,
    });

    return archived;
  }
}
