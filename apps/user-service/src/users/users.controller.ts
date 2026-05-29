import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ByKeycloakIdsDto } from './dto/by-keycloak-ids.dto';
import { DirectoryQueryDto } from './dto/directory-query.dto';
import { UserDirectoryEntryDto } from './dto/user-directory-entry.dto';
import { Roles } from '@aegiscase/auth';
import { UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';

const DIRECTORY_MAX_IDS = 100;

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create user (ADMIN)' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List users (ADMIN)' })
  async findAll(@Query() pagination: PaginationDto) {
    const [data, total] = await this.usersService.findAll(pagination);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  // Declared before `:id` so the literal path is not captured as an `:id` param.
  // No @Roles → readable by every authenticated caller. The minimal projection
  // (see UserDirectoryEntryDto) is the reason this route can be open while
  // `by-keycloak-ids` below stays ADMIN-only.
  @Get('directory')
  @ApiOperation({
    summary:
      'Resolve Keycloak subs to a minimal display projection (any authenticated role)',
  })
  async directory(@Query() dto: DirectoryQueryDto): Promise<UserDirectoryEntryDto[]> {
    const raw = dto.ids;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new BadRequestException('ids is required');
    }
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length === 0) {
      throw new BadRequestException('ids is required');
    }
    if (ids.length > DIRECTORY_MAX_IDS) {
      throw new BadRequestException(
        `Cannot resolve more than ${DIRECTORY_MAX_IDS} ids per call`,
      );
    }
    if (!ids.every((id) => isUUID(id, 'all'))) {
      throw new BadRequestException('ids must be comma-separated UUIDs');
    }
    return this.usersService.findDirectoryByKeycloakIds(ids);
  }

  @Get('by-keycloak-ids')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Resolve user-service IDs for a batch of Keycloak subs (ADMIN, internal)',
  })
  findByKeycloakIds(@Query() dto: ByKeycloakIdsDto) {
    const ids = dto.ids
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.usersService.findByKeycloakIds(ids);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user (ADMIN)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }
}
