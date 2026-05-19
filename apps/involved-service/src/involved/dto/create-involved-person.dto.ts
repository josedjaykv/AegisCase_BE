import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvolvedPersonDto {
  @ApiProperty({ description: 'First names (only mandatory field)' })
  @IsString()
  @IsNotEmpty()
  firstNames: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastNames?: string;

  @ApiPropertyOptional({ description: 'Identity document (unique when provided)' })
  @IsOptional()
  @IsString()
  document?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}
