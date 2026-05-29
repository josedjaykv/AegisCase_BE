import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserDirectoryEntryDto } from './dto/user-directory-entry.dto';
import { PaginationDto } from '@aegiscase/dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    await this.assertUniqueFields(dto.keycloakUserId, dto.document);
    const user = this.repo.create(dto);
    return this.repo.save(user);
  }

  async findAll(pagination: PaginationDto): Promise<[User[], number]> {
    const { page = 1, limit = 20 } = pagination;
    return this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /**
   * Resolves which of the given Keycloak subs already have an operational profile.
   * Batched single query — used by auth-service to enrich its Keycloak user search.
   */
  async findByKeycloakIds(
    keycloakIds: string[],
  ): Promise<{ id: string; keycloakUserId: string }[]> {
    if (keycloakIds.length === 0) return [];
    const rows = await this.repo.find({
      where: { keycloakUserId: In(keycloakIds) },
      select: { id: true, keycloakUserId: true },
    });
    return rows.map((r) => ({ id: r.id, keycloakUserId: r.keycloakUserId }));
  }

  /**
   * Minimal projection used by GET /users/directory — any authenticated role
   * may call this to resolve Keycloak `sub`s into display names. The TypeORM
   * `select` keeps PII columns (document, birthDate, jobTitle) out of memory
   * entirely, not just out of the response.
   *
   * Unknown subs are silently omitted; the caller renders the raw sub as a
   * fallback. No 404.
   */
  async findDirectoryByKeycloakIds(
    keycloakIds: string[],
  ): Promise<UserDirectoryEntryDto[]> {
    if (keycloakIds.length === 0) return [];
    const rows = await this.repo.find({
      where: { keycloakUserId: In(keycloakIds) },
      select: { keycloakUserId: true, firstNames: true, lastNames: true, role: true },
    });
    // excludeExtraneousValues drops any field not @Expose'd on the DTO — even
    // if the repo accidentally returned a full row, PII could not slip out.
    return plainToInstance(UserDirectoryEntryDto, rows, {
      excludeExtraneousValues: true,
    });
  }

  async findOne(id: string): Promise<User> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.document && dto.document !== user.document) {
      const existing = await this.repo.findOne({ where: { document: dto.document } });
      if (existing) throw new ConflictException('Document already in use');
    }

    Object.assign(user, dto);
    return this.repo.save(user);
  }

  private async assertUniqueFields(keycloakUserId: string, document: string): Promise<void> {
    const [byKeycloak, byDoc] = await Promise.all([
      this.repo.findOne({ where: { keycloakUserId } }),
      this.repo.findOne({ where: { document } }),
    ]);
    if (byKeycloak) throw new ConflictException('Keycloak user ID already registered');
    if (byDoc) throw new ConflictException('Document already registered');
  }
}
