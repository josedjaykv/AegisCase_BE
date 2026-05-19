import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority } from '@aegiscase/enums';

export class CreateTaskDto {
  @ApiProperty({ description: 'Case the task belongs to (UUID)' })
  @IsUUID()
  caseId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TaskPriority })
  @IsEnum(TaskPriority)
  priority: TaskPriority;

  @ApiProperty({ description: 'Assignee user (UUID, must be DETECTIVE or ANALYST)' })
  @IsUUID()
  assignedToUserId: string;

  @ApiPropertyOptional({ description: 'Due date (ISO-8601)' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
