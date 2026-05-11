import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import { UserRole } from '@aegiscase/enums';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  keycloakUserId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  firstNames: string;

  @IsString()
  @IsNotEmpty()
  lastNames: string;

  @IsString()
  @IsNotEmpty()
  document: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}
