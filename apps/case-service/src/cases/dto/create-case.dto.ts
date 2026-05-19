import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CasePriority } from '@aegiscase/enums';

export class CreateCaseDto {
  @ApiProperty({ description: 'Case title', example: 'Robbery at Central Bank' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Case description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CasePriority })
  @IsEnum(CasePriority)
  priority: CasePriority;

  @ApiProperty({ description: 'Leader user (UUID)' })
  @IsUUID()
  leaderUserId: string;
}
