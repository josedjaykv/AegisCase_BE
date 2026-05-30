import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvolvedPerson } from './involved-person.entity';
import { CaseInvolvedPerson } from './case-involved-person.entity';
import { CreateInvolvedPersonDto } from './dto/create-involved-person.dto';
import { UpdateInvolvedPersonDto } from './dto/update-involved-person.dto';
import { LinkToCaseDto } from './dto/link-to-case.dto';
import { UpdateCaseLinkDto } from './dto/update-case-link.dto';
import { PaginationDto } from '@aegiscase/dto';
import { InvolvementType } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';
import { EventPublisherService } from '../events/event-publisher.service';

@Injectable()
export class InvolvedService {
  constructor(
    @InjectRepository(InvolvedPerson)
    private readonly personRepo: Repository<InvolvedPerson>,
    @InjectRepository(CaseInvolvedPerson)
    private readonly linkRepo: Repository<CaseInvolvedPerson>,
    private readonly events: EventPublisherService,
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

  async linkToCase(
    id: string,
    caseId: string,
    dto: LinkToCaseDto,
    actor: JwtPayload,
  ): Promise<CaseInvolvedPerson> {
    await this.findOne(id);

    const existing = await this.linkRepo.findOne({ where: { involvedPersonId: id, caseId } });
    if (existing) throw new ConflictException('Person is already linked to this case');

    const link = this.linkRepo.create({
      involvedPersonId: id,
      caseId,
      involvementType: dto.involvementType,
      observations: dto.observations ?? null,
    });
    const saved = await this.linkRepo.save(link);

    this.events.publishInvolvedPersonLinked(actor.sub, id, {
      case_id: caseId,
      involved_person_id: id,
      involvement_type: dto.involvementType,
    });

    return saved;
  }

  async getCaseLinks(id: string): Promise<CaseInvolvedPerson[]> {
    await this.findOne(id);
    return this.linkRepo.find({ where: { involvedPersonId: id } });
  }

  /**
   * Roster of involved persons for a case. Returns `[]` (not 404) when the
   * case has no links — consistent with the rest of involved-service, which
   * never verifies that a `caseId` exists. Embeds a minimal `person`
   * projection so the FE avoids an N+1 to resolve names.
   */
  async findByCase(caseId: string): Promise<
    Array<{
      caseId: string;
      involvedPersonId: string;
      involvementType: InvolvementType;
      observations: string | null;
      person: {
        id: string;
        firstNames: string;
        lastNames: string | null;
        document: string | null;
      };
    }>
  > {
    const links = await this.linkRepo.find({
      where: { caseId },
      relations: ['involvedPerson'],
    });

    return links.map((link) => ({
      caseId: link.caseId,
      involvedPersonId: link.involvedPersonId,
      involvementType: link.involvementType,
      observations: link.observations,
      person: {
        id: link.involvedPerson.id,
        firstNames: link.involvedPerson.firstNames,
        lastNames: link.involvedPerson.lastNames,
        document: link.involvedPerson.document,
      },
    }));
  }

  /**
   * Partial update of a join row. Only `involvement_type` / `observations`
   * are writable; the composite PK is never touched. Idempotent: sending the
   * current value returns 200 unchanged. No `caseId` existence check.
   */
  async updateLink(
    personId: string,
    caseId: string,
    dto: UpdateCaseLinkDto,
  ): Promise<CaseInvolvedPerson> {
    if (dto.involvementType === undefined && dto.observations === undefined) {
      throw new BadRequestException('At least one field is required');
    }

    const person = await this.personRepo.findOne({ where: { id: personId } });
    if (!person) throw new NotFoundException('Person not found');

    const link = await this.linkRepo.findOne({
      where: { involvedPersonId: personId, caseId },
    });
    if (!link) throw new NotFoundException('Link not found');

    if (dto.involvementType !== undefined) link.involvementType = dto.involvementType;
    if (dto.observations !== undefined) link.observations = dto.observations;

    return this.linkRepo.save(link);
  }

  /**
   * Hard delete of the `case_involved_persons` row. The `involved_persons`
   * and `cases` rows are untouched — only the link is removed. There is no
   * soft-delete column on this join, so a physical delete is correct.
   */
  async removeLink(
    personId: string,
    caseId: string,
    actor: JwtPayload,
  ): Promise<{ success: true }> {
    const link = await this.linkRepo.findOne({
      where: { involvedPersonId: personId, caseId },
    });
    if (!link) throw new NotFoundException('Link not found');

    await this.linkRepo.remove(link);

    this.events.publishInvolvedPersonUnlinked(actor.sub, personId, {
      case_id: caseId,
      involved_person_id: personId,
    });

    return { success: true };
  }
}
