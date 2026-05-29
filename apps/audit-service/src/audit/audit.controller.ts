import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { Roles } from '@aegiscase/auth';
import { UserRole } from '@aegiscase/enums';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
@Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Query audit records with filters and pagination' })
  async findAll(@Query() query: QueryAuditDto) {
    const [data, total] = await this.auditService.findAll(query);
    return { data, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  // Must be registered before /:id to avoid "entity" being treated as an id
  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Get full audit history for an entity' })
  async findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    const data = await this.auditService.findByEntity(entityType, entityId);
    return { data, total: data.length };
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get audit actions performed by a specific user' })
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: QueryAuditDto,
  ) {
    const [data, total] = await this.auditService.findByUser(userId, query);
    return { data, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit record by ID' })
  findOne(@Param('id') id: string) {
    return this.auditService.findOne(id);
  }
}
