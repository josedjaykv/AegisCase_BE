import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CasePriority } from '@aegiscase/enums';

export class UpdateCaseDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(CasePriority)
  priority?: CasePriority;

  @IsOptional()
  @IsUUID()
  leaderUserId?: string;
}
