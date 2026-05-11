import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
