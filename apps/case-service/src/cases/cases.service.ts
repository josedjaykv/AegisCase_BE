import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Case } from './case.entity';
import { CaseTeam } from './case-team.entity';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { CaseStatus, TeamRole, UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { JwtPayload } from '@aegiscase/common';
import { EventPublisherService } from '../events/event-publisher.service';

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(Case)
    private readonly caseRepo: Repository<Case>,
    @InjectRepository(CaseTeam)
    private readonly teamRepo: Repository<CaseTeam>,
    private readonly events: EventPublisherService,
  ) {}

  async create(dto: CreateCaseDto, actor: JwtPayload): Promise<Case> {
    const caseCode = this.generateCaseCode();
    const newCase = this.caseRepo.create({
      ...dto,
      caseCode,
      createdByUserId: actor.sub,
      status: CaseStatus.OPEN,
    });
    const saved = await this.caseRepo.save(newCase);

    await this.teamRepo.save(
      this.teamRepo.create({ caseId: saved.id, userId: actor.sub, teamRole: TeamRole.CREATOR }),
    );

    if (dto.leaderUserId !== actor.sub) {
      await this.teamRepo.save(
        this.teamRepo.create({ caseId: saved.id, userId: dto.leaderUserId, teamRole: TeamRole.LEAD }),
      );
    }

    const created = await this.findOne(saved.id);
    this.events.publishCaseCreated(actor.sub, created.id, {
      case_code: created.caseCode,
      title: created.title,
      priority: created.priority,
      leader_user_id: created.leaderUserId,
    });
    return created;
  }

  async findAll(pagination: PaginationDto): Promise<[Case[], number]> {
    const { page = 1, limit = 20 } = pagination;
    return this.caseRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string): Promise<Case> {
    const c = await this.caseRepo.findOne({ where: { id }, relations: ['team'] });
    if (!c) throw new NotFoundException(`Case ${id} not found`);
    return c;
  }

  async update(id: string, dto: UpdateCaseDto, actor: JwtPayload): Promise<Case> {
    const c = await this.findOne(id);
    this.assertNotClosed(c);
    Object.assign(c, dto);
    return this.caseRepo.save(c);
  }

  async changeStatus(id: string, dto: ChangeStatusDto, actor: JwtPayload): Promise<Case> {
    const c = await this.findOne(id);

    if (c.status === CaseStatus.CLOSED) {
      if (actor.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only admins can reopen a closed case');
      }
    }

    c.status = dto.status;
    const updated = await this.caseRepo.save(c);

    if (dto.status === CaseStatus.CLOSED) {
      this.events.publishCaseClosed(actor.sub, updated.id, {
        case_code: updated.caseCode,
        closed_by_user_id: actor.sub,
      });
    }

    return updated;
  }

  async archive(id: string, actor: JwtPayload): Promise<Case> {
    const c = await this.findOne(id);
    if (c.archived) throw new ConflictException('Case is already archived');
    c.archived = true;
    c.archivedAt = new Date();
    const archived = await this.caseRepo.save(c);

    this.events.publishCaseArchived(actor.sub, archived.id, {
      case_code: archived.caseCode,
      archived_by_user_id: actor.sub,
    });

    return archived;
  }

  async addTeamMember(id: string, dto: AddTeamMemberDto): Promise<CaseTeam> {
    await this.findOne(id);
    const existing = await this.teamRepo.findOne({
      where: { caseId: id, userId: dto.userId },
    });
    if (existing) throw new ConflictException('User is already a team member');

    const member = this.teamRepo.create({ caseId: id, userId: dto.userId, teamRole: dto.teamRole });
    return this.teamRepo.save(member);
  }

  /**
   * Changes the role of an existing team member. Only ever swaps between LEAD
   * and MEMBER: the CREATOR row is immutable provenance, and CREATOR cannot be
   * assigned via this route. No event is published (team edits are event-free).
   */
  async updateTeamMemberRole(
    id: string,
    userId: string,
    dto: UpdateTeamMemberDto,
  ): Promise<CaseTeam> {
    const c = await this.findOne(id);
    this.assertNotClosed(c);

    const member = await this.teamRepo.findOne({ where: { caseId: id, userId } });
    if (!member) throw new NotFoundException('Team member not found');

    if (member.teamRole === TeamRole.CREATOR) {
      throw new BadRequestException("The case creator's role cannot be changed");
    }
    if (dto.teamRole === TeamRole.CREATOR) {
      throw new BadRequestException('Cannot assign the CREATOR role');
    }

    // No-op when the role is unchanged — idempotent, return the row as-is.
    if (member.teamRole === dto.teamRole) return member;

    member.teamRole = dto.teamRole;
    return this.teamRepo.save(member);
  }

  async getTeam(id: string): Promise<CaseTeam[]> {
    await this.findOne(id);
    return this.teamRepo.find({ where: { caseId: id } });
  }

  private assertNotClosed(c: Case): void {
    if (c.status === CaseStatus.CLOSED) {
      throw new BadRequestException('A closed case cannot be modified');
    }
  }

  private generateCaseCode(): string {
    const year = new Date().getFullYear();
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `CASE-${year}-${suffix}`;
  }
}
