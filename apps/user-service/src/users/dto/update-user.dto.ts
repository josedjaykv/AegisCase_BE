import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { UserRole } from '@aegiscase/enums';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstNames?: string;

  @IsOptional()
  @IsString()
  lastNames?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}
