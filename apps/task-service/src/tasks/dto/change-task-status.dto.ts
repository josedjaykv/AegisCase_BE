import { IsEnum } from 'class-validator';
import { TaskStatus } from '@aegiscase/enums';

export class ChangeTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}
