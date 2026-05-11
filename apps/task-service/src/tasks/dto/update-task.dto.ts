import { IsString, IsEnum, IsOptional, IsUUID, IsDateString } from 'class-validator';
import { TaskPriority } from '@aegiscase/enums';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
