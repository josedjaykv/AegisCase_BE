import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { UserRole } from '@aegiscase/enums';

type Mocked<T> = { [K in keyof T]: jest.Mock };

const mockRepo = <T>(): Mocked<Repository<T>> =>
  ({
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    find: jest.fn(),
  }) as any;

describe('UsersService — findDirectoryByKeycloakIds', () => {
  let service: UsersService;
  let repo: Mocked<Repository<User>>;

  const SUB_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const SUB_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const SUB_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  beforeEach(async () => {
    repo = mockRepo<User>();
    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repo }],
    }).compile();
    service = module.get(UsersService);
  });

  it('returns [] without hitting the repo for an empty input', async () => {
    const out = await service.findDirectoryByKeycloakIds([]);
    expect(out).toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });

  it('returns [] when none of the subs are known (no 404)', async () => {
    repo.find.mockResolvedValue([]);
    const out = await service.findDirectoryByKeycloakIds([SUB_A, SUB_B]);
    expect(out).toEqual([]);
  });

  it('returns only known entries for a mixed known/unknown input', async () => {
    repo.find.mockResolvedValue([
      {
        keycloakUserId: SUB_A,
        firstNames: 'Oliver',
        lastNames: 'Stone',
        role: UserRole.DETECTIVE,
      },
    ]);
    const out = await service.findDirectoryByKeycloakIds([SUB_A, SUB_C]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      keycloakUserId: SUB_A,
      firstNames: 'Oliver',
      lastNames: 'Stone',
      role: UserRole.DETECTIVE,
    });
  });

  it('queries TypeORM with In() and the minimal `select` projection', async () => {
    repo.find.mockResolvedValue([]);
    await service.findDirectoryByKeycloakIds([SUB_A]);
    expect(repo.find).toHaveBeenCalledWith({
      where: { keycloakUserId: In([SUB_A]) },
      select: { keycloakUserId: true, firstNames: true, lastNames: true, role: true },
    });
  });

  it('PII leak guard — returned entries have exactly the four allowed keys', async () => {
    // Simulate a future refactor where the repo accidentally returns extra fields.
    // excludeExtraneousValues on the DTO must still strip them.
    repo.find.mockResolvedValue([
      {
        id: 'internal-id',
        keycloakUserId: SUB_A,
        firstNames: 'Oliver',
        lastNames: 'Stone',
        document: 'CC-12345',
        birthDate: '1980-01-01',
        role: UserRole.DETECTIVE,
        jobTitle: 'Lead Detective',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any,
    ]);
    const [entry] = await service.findDirectoryByKeycloakIds([SUB_A]);
    expect(Object.keys(entry).sort()).toEqual(
      ['firstNames', 'keycloakUserId', 'lastNames', 'role'],
    );
  });
});
