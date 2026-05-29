import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInvolvedPersonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstNames?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastNames?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  document?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}
