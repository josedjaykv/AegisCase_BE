import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { Roles } from '@aegiscase/auth';
import { UserRole } from '@aegiscase/enums';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(@Query() query: QueryAuditDto) {
    const [data, total] = await this.auditService.findAll(query);
    return { data, total, page: query.page ?? 1, limit: query.limit ?? 20 };
  }
}
