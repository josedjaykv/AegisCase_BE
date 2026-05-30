import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvolvedService } from './involved.service';
import { CreateInvolvedPersonDto } from './dto/create-involved-person.dto';
import { UpdateInvolvedPersonDto } from './dto/update-involved-person.dto';
import { LinkToCaseDto } from './dto/link-to-case.dto';
import { UpdateCaseLinkDto } from './dto/update-case-link.dto';
import { Roles } from '@aegiscase/auth';
import { CurrentUser, JwtPayload } from '@aegiscase/common';
import { UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';

@ApiTags('Involved Persons')
@ApiBearerAuth()
@Controller('involved-persons')
export class InvolvedController {
  constructor(private readonly involvedService: InvolvedService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register involved person (ADMIN, DETECTIVE)' })
  create(@Body() dto: CreateInvolvedPersonDto) {
    return this.involvedService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'List involved persons' })
  async findAll(@Query() pagination: PaginationDto) {
    const [data, total] = await this.involvedService.findAll(pagination);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  @Get('by-case/:caseId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({
    summary: 'Roster of involved persons for a case (ADMIN, DETECTIVE, ANALYST)',
  })
  findByCase(@Param('caseId') caseId: string) {
    return this.involvedService.findByCase(caseId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get involved person by ID' })
  findOne(@Param('id') id: string) {
    return this.involvedService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Update involved person (ADMIN, DETECTIVE)' })
  update(@Param('id') id: string, @Body() dto: UpdateInvolvedPersonDto) {
    return this.involvedService.update(id, dto);
  }

  @Post(':id/cases/:caseId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Link involved person to a case' })
  linkToCase(
    @Param('id') id: string,
    @Param('caseId') caseId: string,
    @Body() dto: LinkToCaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.involvedService.linkToCase(id, caseId, dto, user);
  }

  @Get(':id/cases')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'List cases an involved person is linked to' })
  getCaseLinks(@Param('id') id: string) {
    return this.involvedService.getCaseLinks(id);
  }

  @Patch(':id/cases/:caseId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Edit a case ↔ involved-person link (ADMIN, DETECTIVE)' })
  updateLink(
    @Param('id') id: string,
    @Param('caseId') caseId: string,
    @Body() dto: UpdateCaseLinkDto,
  ) {
    return this.involvedService.updateLink(id, caseId, dto);
  }

  @Delete(':id/cases/:caseId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Unlink an involved person from a case (ADMIN, DETECTIVE)' })
  removeLink(
    @Param('id') id: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.involvedService.removeLink(id, caseId, user);
  }
}
