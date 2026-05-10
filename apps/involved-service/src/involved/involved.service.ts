import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvolvedPerson } from './involved-person.entity';
import { CaseInvolvedPerson } from './case-involved-person.entity';
import { CreateInvolvedPersonDto } from './dto/create-involved-person.dto';
import { UpdateInvolvedPersonDto } from './dto/update-involved-person.dto';
import { LinkToCaseDto } from './dto/link-to-case.dto';
import { PaginationDto } from '@aegiscase/dto';

@Injectable()
export class InvolvedService {
  constructor(
    @InjectRepository(InvolvedPerson)
    private readonly personRepo: Repository<InvolvedPerson>,
    @InjectRepository(CaseInvolvedPerson)
    private readonly linkRepo: Repository<CaseInvolvedPerson>,
  ) {}

  async create(dto: CreateInvolvedPersonDto): Promise<InvolvedPerson> {
    if (dto.document) {
      const existing = await this.personRepo.findOne({ where: { document: dto.document } });
      if (existing) throw new ConflictException('Document already registered');
    }
    const person = this.personRepo.create(dto);
    return this.personRepo.save(person);
  }

  async findAll(pagination: PaginationDto): Promise<[InvolvedPerson[], number]> {
    const { page = 1, limit = 20 } = pagination;
    return this.personRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string): Promise<InvolvedPerson> {
    const person = await this.personRepo.findOne({ where: { id }, relations: ['caseLinks'] });
    if (!person) throw new NotFoundException(`Involved person ${id} not found`);
    return person;
  }

  async update(id: string, dto: UpdateInvolvedPersonDto): Promise<InvolvedPerson> {
    const person = await this.findOne(id);

    if (dto.document && dto.document !== person.document) {
      const existing = await this.personRepo.findOne({ where: { document: dto.document } });
      if (existing) throw new ConflictException('Document already registered');
    }

    Object.assign(person, dto);
    return this.personRepo.save(person);
  }

  async linkToCase(id: string, caseId: string, dto: LinkToCaseDto): Promise<CaseInvolvedPerson> {
    await this.findOne(id);

    const existing = await this.linkRepo.findOne({ where: { involvedPersonId: id, caseId } });
    if (existing) throw new ConflictException('Person is already linked to this case');

    const link = this.linkRepo.create({
      involvedPersonId: id,
      caseId,
      involvementType: dto.involvementType,
      observations: dto.observations ?? null,
    });
    return this.linkRepo.save(link);
  }

  async getCaseLinks(id: string): Promise<CaseInvolvedPerson[]> {
    await this.findOne(id);
    return this.linkRepo.find({ where: { involvedPersonId: id } });
  }
}
