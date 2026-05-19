import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvolvementType } from '@aegiscase/enums';

export class LinkToCaseDto {
  @ApiProperty({ enum: InvolvementType })
  @IsEnum(InvolvementType)
  involvementType: InvolvementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observations?: string;
}
