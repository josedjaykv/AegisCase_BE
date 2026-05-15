import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { TransferCustodyDto } from './dto/transfer-custody.dto';
import { Roles } from '@aegiscase/auth';
import { CurrentUser, JwtPayload } from '@aegiscase/common';
import { UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { IsOptional, IsUUID } from 'class-validator';

class EvidenceFilterDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  caseId?: string;
}

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateEvidenceDto, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  async findAll(@Query() query: EvidenceFilterDto) {
    const { caseId, ...pagination } = query;
    const [data, total] = await this.evidenceService.findAll(pagination, caseId);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.findOne(id, user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEvidenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.update(id, dto, user);
  }

  @Patch(':id/transfer-custody')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  transferCustody(
    @Param('id') id: string,
    @Body() dto: TransferCustodyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.transferCustody(id, dto, user);
  }

  @Get(':id/chain-of-custody')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  getCustodyChain(@Param('id') id: string) {
    return this.evidenceService.getCustodyChain(id);
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.archive(id, user);
  }
}
