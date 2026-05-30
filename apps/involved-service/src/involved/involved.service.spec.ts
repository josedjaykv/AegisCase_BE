import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InvolvedService } from './involved.service';
import { InvolvedPerson } from './involved-person.entity';
import { CaseInvolvedPerson } from './case-involved-person.entity';
import { EventPublisherService } from '../events/event-publisher.service';
import { InvolvementType, UserRole } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const mockRepo = <T>(): Mocked<Repository<T>> =>
  ({
    create: jest.fn((dto) => dto),
    save: jest.fn(async (e) => e),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(async () => undefined),
  }) as any;

const mockEvents = (): Mocked<EventPublisherService> =>
  ({
    publishInvolvedPersonLinked: jest.fn(),
    publishInvolvedPersonUnlinked: jest.fn(),
  }) as any;

const actor = (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'user-1',
  email: 'u@x.com',
  role: UserRole.DETECTIVE,
  keycloak_user_id: 'kc-1',
  ...overrides,
});

describe('InvolvedService — case-link management (Feature 004)', () => {
  let service: InvolvedService;
  let personRepo: Mocked<Repository<InvolvedPerson>>;
  let linkRepo: Mocked<Repository<CaseInvolvedPerson>>;
  let events: Mocked<EventPublisherService>;

  beforeEach(async () => {
    personRepo = mockRepo<InvolvedPerson>();
    linkRepo = mockRepo<CaseInvolvedPerson>();
    events = mockEvents();

    const module = await Test.createTestingModule({
      providers: [
        InvolvedService,
        { provide: getRepositoryToken(InvolvedPerson), useValue: personRepo },
        { provide: getRepositoryToken(CaseInvolvedPerson), useValue: linkRepo },
        { provide: EventPublisherService, useValue: events },
      ],
    }).compile();

    service = module.get(InvolvedService);
  });

  describe('findByCase', () => {
    it('returns rows with an embedded person projection of exactly { id, firstNames, lastNames, document }', async () => {
      linkRepo.find.mockResolvedValueOnce([
        {
          caseId: 'case-1',
          involvedPersonId: 'p-1',
          involvementType: InvolvementType.SUSPECT,
          observations: 'seen nearby',
          involvedPerson: {
            id: 'p-1',
            firstNames: 'Ada',
            lastNames: 'Lovelace',
            document: 'D-1',
            observations: 'private notes',
          },
        } as any,
      ]);

      const result = await service.findByCase('case-1');

      expect(linkRepo.find).toHaveBeenCalledWith({
        where: { caseId: 'case-1' },
        relations: ['involvedPerson'],
      });
      expect(result).toEqual([
        {
          caseId: 'case-1',
          involvedPersonId: 'p-1',
          involvementType: InvolvementType.SUSPECT,
          observations: 'seen nearby',
          person: { id: 'p-1', firstNames: 'Ada', lastNames: 'Lovelace', document: 'D-1' },
        },
      ]);
      // person must not leak other columns
      expect(Object.keys(result[0].person).sort()).toEqual(
        ['document', 'firstNames', 'id', 'lastNames'].sort(),
      );
    });

    it('returns [] (not 404) when the case has no links', async () => {
      linkRepo.find.mockResolvedValueOnce([]);
      await expect(service.findByCase('unknown')).resolves.toEqual([]);
    });
  });

  describe('updateLink', () => {
    const existingLink = () =>
      ({
        caseId: 'case-1',
        involvedPersonId: 'p-1',
        involvementType: InvolvementType.WITNESS,
        observations: null,
      }) as any;

    it('changes involvementType', async () => {
      personRepo.findOne.mockResolvedValueOnce({ id: 'p-1' } as any);
      linkRepo.findOne.mockResolvedValueOnce(existingLink());
      linkRepo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.updateLink('p-1', 'case-1', {
        involvementType: InvolvementType.SUSPECT,
      });

      expect(result.involvementType).toBe(InvolvementType.SUSPECT);
      expect(result.observations).toBeNull();
    });

    it('changes observations only (partial, one field)', async () => {
      personRepo.findOne.mockResolvedValueOnce({ id: 'p-1' } as any);
      linkRepo.findOne.mockResolvedValueOnce(existingLink());
      linkRepo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.updateLink('p-1', 'case-1', {
        observations: 'updated note',
      });

      expect(result.observations).toBe('updated note');
      expect(result.involvementType).toBe(InvolvementType.WITNESS);
    });

    it('is idempotent: sending the current value returns 200 unchanged', async () => {
      personRepo.findOne.mockResolvedValueOnce({ id: 'p-1' } as any);
      const link = existingLink();
      linkRepo.findOne.mockResolvedValueOnce(link);
      linkRepo.save.mockImplementationOnce(async (e: any) => e);

      const result: any = await service.updateLink('p-1', 'case-1', {
        involvementType: InvolvementType.WITNESS,
      });

      expect(result.involvementType).toBe(InvolvementType.WITNESS);
    });

    it('rejects an empty body with 400 "At least one field is required"', async () => {
      await expect(service.updateLink('p-1', 'case-1', {})).rejects.toThrow(
        'At least one field is required',
      );
      await expect(service.updateLink('p-1', 'case-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(personRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws 404 "Person not found" when the person is missing', async () => {
      personRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.updateLink('missing', 'case-1', { involvementType: InvolvementType.SUSPECT }),
      ).rejects.toThrow('Person not found');
      expect(linkRepo.findOne).not.toHaveBeenCalled();
    });

    it('throws 404 "Link not found" when the (caseId, personId) pair is missing', async () => {
      personRepo.findOne.mockResolvedValueOnce({ id: 'p-1' } as any);
      linkRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.updateLink('p-1', 'case-1', { involvementType: InvolvementType.SUSPECT }),
      ).rejects.toThrow('Link not found');
    });
  });

  describe('removeLink', () => {
    it('hard-deletes the link, publishes involved.person.unlinked, and returns { success: true }', async () => {
      const link = { caseId: 'case-1', involvedPersonId: 'p-1' } as any;
      linkRepo.findOne.mockResolvedValueOnce(link);

      const result = await service.removeLink('p-1', 'case-1', actor());

      expect(linkRepo.remove).toHaveBeenCalledWith(link);
      expect(events.publishInvolvedPersonUnlinked).toHaveBeenCalledWith('user-1', 'p-1', {
        case_id: 'case-1',
        involved_person_id: 'p-1',
      });
      expect(result).toEqual({ success: true });
    });

    it('throws 404 "Link not found" for a non-existent link and does not delete or publish', async () => {
      linkRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.removeLink('p-1', 'case-1', actor())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.removeLink('p-1', 'case-1', actor())).rejects.toThrow('Link not found');
      expect(linkRepo.remove).not.toHaveBeenCalled();
      expect(events.publishInvolvedPersonUnlinked).not.toHaveBeenCalled();
    });
  });
});
