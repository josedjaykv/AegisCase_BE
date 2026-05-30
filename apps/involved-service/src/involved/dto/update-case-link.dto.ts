import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvolvementType } from '@aegiscase/enums';

export class UpdateCaseLinkDto {
  @ApiPropertyOptional({ enum: InvolvementType })
  @IsOptional()
  @IsEnum(InvolvementType, { message: 'involvementType must be a valid type' })
  involvementType?: InvolvementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}
