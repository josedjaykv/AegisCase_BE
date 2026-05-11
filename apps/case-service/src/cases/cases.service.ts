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
import { CaseStatus, TeamRole, UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { JwtPayload } from '@aegiscase/common';

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(Case)
    private readonly caseRepo: Repository<Case>,
    @InjectRepository(CaseTeam)
    private readonly teamRepo: Repository<CaseTeam>,
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

    return this.findOne(saved.id);
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
    return this.caseRepo.save(c);
  }

  async archive(id: string, actor: JwtPayload): Promise<Case> {
    const c = await this.findOne(id);
    if (c.archived) throw new ConflictException('Case is already archived');
    c.archived = true;
    c.archivedAt = new Date();
    return this.caseRepo.save(c);
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
