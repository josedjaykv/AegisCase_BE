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
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ChangeTaskStatusDto } from './dto/change-task-status.dto';
import { Roles } from '@aegiscase/auth';
import { CurrentUser, JwtPayload } from '@aegiscase/common';
import { UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { IsOptional, IsUUID } from 'class-validator';

class TaskFilterDto extends PaginationDto {
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;
}

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create task (ADMIN, DETECTIVE)' })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.create(dto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'List tasks (optionally filtered by caseId and/or assignedToUserId)' })
  async findAll(@Query() query: TaskFilterDto) {
    const { assignedToUserId, caseId, ...pagination } = query;
    const [data, total] = await this.tasksService.findAll(pagination, assignedToUserId, caseId);
    return { data, total, page: pagination.page ?? 1, limit: pagination.limit ?? 20 };
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get task by ID' })
  findOne(@Param('id') id: string) {
    return this.tasksService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Update task (assignee, ADMIN or DETECTIVE)' })
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Change task status' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeTaskStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.changeStatus(id, dto, user);
  }
}
