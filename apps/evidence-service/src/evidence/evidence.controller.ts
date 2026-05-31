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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EvidenceService } from './evidence.service';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { UpdateEvidenceDto } from './dto/update-evidence.dto';
import { TransferCustodyDto } from './dto/transfer-custody.dto';
import { TakeCustodyDto } from './dto/take-custody.dto';
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

@ApiTags('Evidence')
@ApiBearerAuth()
@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register evidence (ADMIN, DETECTIVE)' })
  create(@Body() dto: CreateEvidenceDto, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'List evidence (optionally filtered by caseId)' })
  async findAll(@Query() query: EvidenceFilterDto) {
    const { caseId, ...pagination } = query;
    const [data, total] = await this.evidenceService.findAll(pagination, caseId);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get evidence by ID (records a chain-of-custody view)' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.findOne(id, user);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Update evidence (ADMIN, DETECTIVE)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEvidenceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.update(id, dto, user);
  }

  @Patch(':id/transfer-custody')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Transfer custody to another user' })
  transferCustody(
    @Param('id') id: string,
    @Body() dto: TransferCustodyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.transferCustody(id, dto, user);
  }

  @Patch(':id/take-custody')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({
    summary: 'Self-assign custody (all roles) — required before downloading evidence files',
  })
  takeCustody(
    @Param('id') id: string,
    @Body() _dto: TakeCustodyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.evidenceService.takeCustody(id, user);
  }

  @Get(':id/custodian')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get the current custodian (side-effect-free; for download gating)' })
  getCustodian(@Param('id') id: string) {
    return this.evidenceService.getCustodian(id);
  }

  @Get(':id/chain-of-custody')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get full chain-of-custody history' })
  getCustodyChain(@Param('id') id: string) {
    return this.evidenceService.getCustodyChain(id);
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Archive evidence (ADMIN only)' })
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.evidenceService.archive(id, user);
  }
}
