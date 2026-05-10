import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evidence } from './evidence.entity';
import { ChainOfCustody } from './chain-of-custody.entity';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { TransferCustodyDto } from './dto/transfer-custody.dto';
import { EvidenceStatus } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { JwtPayload } from '@aegiscase/common';

@Injectable()
export class EvidenceService {
  constructor(
    @InjectRepository(Evidence)
    private readonly evidenceRepo: Repository<Evidence>,
    @InjectRepository(ChainOfCustody)
    private readonly custodyRepo: Repository<ChainOfCustody>,
  ) {}

  async create(dto: CreateEvidenceDto, actor: JwtPayload): Promise<Evidence> {
    const evidence = this.evidenceRepo.create({
      ...dto,
      createdByUserId: actor.sub,
      evidenceStatus: EvidenceStatus.REGISTERED,
      currentCustodianId: dto.currentCustodianId ?? null,
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

    return this.findOne(saved.id, actor, false);
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
    const evidence = await this.evidenceRepo.findOne({
      where: { id },
      relations: ['custodyChain'],
    });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

    if (trackView) {
      await this.custodyRepo.save(
        this.custodyRepo.create({
          evidenceId: id,
          previousCustodianId: evidence.currentCustodianId,
          newCustodianId: actor.sub,
          transferredByUserId: actor.sub,
          transferReason: 'Viewed by user',
        }),
      );
      evidence.currentCustodianId = actor.sub;
      await this.evidenceRepo.save(evidence);
    }

    return evidence;
  }

  async update(id: string, dto: UpdateEvidenceDto, actor: JwtPayload): Promise<Evidence> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    Object.assign(evidence, dto);
    return this.evidenceRepo.save(evidence);
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

    evidence.currentCustodianId = dto.newCustodianId;
    evidence.evidenceStatus = EvidenceStatus.TRANSFERRED;
    return this.evidenceRepo.save(evidence);
  }

  async getCustodyChain(id: string): Promise<ChainOfCustody[]> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    return this.custodyRepo.find({
      where: { evidenceId: id },
      order: { createdAt: 'ASC' },
    });
  }

  async archive(id: string): Promise<Evidence> {
    const evidence = await this.evidenceRepo.findOne({ where: { id } });
    if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);
    if (evidence.archived) throw new ConflictException('Evidence is already archived');
    evidence.archived = true;
    evidence.archivedAt = new Date();
    evidence.evidenceStatus = EvidenceStatus.ARCHIVED;
    return this.evidenceRepo.save(evidence);
  }
}
