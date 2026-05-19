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
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';
import { Roles } from '@aegiscase/auth';
import { CurrentUser, JwtPayload } from '@aegiscase/common';
import { UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';

@ApiTags('Cases')
@ApiBearerAuth()
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create case (ADMIN, DETECTIVE)' })
  create(@Body() dto: CreateCaseDto, @CurrentUser() user: JwtPayload) {
    return this.casesService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'List cases' })
  async findAll(@Query() pagination: PaginationDto) {
    const [data, total] = await this.casesService.findAll(pagination);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get case by ID' })
  findOne(@Param('id') id: string) {
    return this.casesService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Update case (ADMIN, DETECTIVE)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCaseDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.casesService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @ApiOperation({ summary: 'Change case status (ADMIN, DETECTIVE)' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.casesService.changeStatus(id, dto, user);
  }

  @Patch(':id/archive')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Archive case (ADMIN only)' })
  archive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.casesService.archive(id, user);
  }

  @Post(':id/team')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add team member to case' })
  addTeamMember(@Param('id') id: string, @Body() dto: AddTeamMemberDto) {
    return this.casesService.addTeamMember(id, dto);
  }

  @Get(':id/team')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get case team members' })
  getTeam(@Param('id') id: string) {
    return this.casesService.getTeam(id);
  }
}
