import { IsEnum, IsOptional, IsString } from 'class-validator';
import { InvolvementType } from '@aegiscase/enums';

export class LinkToCaseDto {
  @IsEnum(InvolvementType)
  involvementType: InvolvementType;

  @IsOptional()
  @IsString()
  observations?: string;
}
