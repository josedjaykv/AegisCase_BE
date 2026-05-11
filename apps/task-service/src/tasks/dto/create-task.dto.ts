import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { TaskPriority } from '@aegiscase/enums';

export class CreateTaskDto {
  @IsUUID()
  caseId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TaskPriority)
  priority: TaskPriority;

  @IsUUID()
  assignedToUserId: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
