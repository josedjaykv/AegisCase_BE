import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';
import { CasePriority } from '@aegiscase/enums';

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CasePriority)
  priority: CasePriority;

  @IsUUID()
  leaderUserId: string;
}
