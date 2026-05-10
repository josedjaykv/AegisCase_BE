import {
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
import { InvolvedService } from './involved.service';
import { CreateInvolvedPersonDto } from './dto/create-involved-person.dto';
import { UpdateInvolvedPersonDto } from './dto/update-involved-person.dto';
import { LinkToCaseDto } from './dto/link-to-case.dto';
import { Roles } from '@aegiscase/auth';
import { UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';

@Controller('involved-persons')
export class InvolvedController {
  constructor(private readonly involvedService: InvolvedService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateInvolvedPersonDto) {
    return this.involvedService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  async findAll(@Query() pagination: PaginationDto) {
    const [data, total] = await this.involvedService.findAll(pagination);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  findOne(@Param('id') id: string) {
    return this.involvedService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  update(@Param('id') id: string, @Body() dto: UpdateInvolvedPersonDto) {
    return this.involvedService.update(id, dto);
  }

  @Post(':id/cases/:caseId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  linkToCase(
    @Param('id') id: string,
    @Param('caseId') caseId: string,
    @Body() dto: LinkToCaseDto,
  ) {
    return this.involvedService.linkToCase(id, caseId, dto);
  }

  @Get(':id/cases')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  getCaseLinks(@Param('id') id: string) {
    return this.involvedService.getCaseLinks(id);
  }
}
