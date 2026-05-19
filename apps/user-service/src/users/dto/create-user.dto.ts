import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNotEmpty,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@aegiscase/enums';

export class CreateUserDto {
  @ApiProperty({ description: 'Keycloak subject (sub) for this user' })
  @IsString()
  @IsNotEmpty()
  keycloakUserId: string;

  @ApiProperty({ description: 'First names', example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  firstNames: string;

  @ApiProperty({ description: 'Last names', example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastNames: string;

  @ApiProperty({ description: 'National identity document (unique)', example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  document: string;

  @ApiPropertyOptional({ description: 'Birth date (ISO-8601)', example: '1990-01-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ enum: UserRole, description: 'Functional role' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({ description: 'Operational job title', example: 'Senior Detective' })
  @IsOptional()
  @IsString()
  jobTitle?: string;
}
