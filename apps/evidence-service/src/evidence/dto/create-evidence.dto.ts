import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceType } from '@aegiscase/enums';

export class CreateEvidenceDto {
  @ApiProperty({ description: 'Case the evidence belongs to (UUID)' })
  @IsUUID()
  caseId: string;

  @ApiProperty({ enum: EvidenceType })
  @IsEnum(EvidenceType)
  evidenceType: EvidenceType;

  @ApiPropertyOptional({ description: 'Short title / heading (≤200 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiProperty({ description: 'Evidence description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Initial custodian user (UUID); defaults to caller' })
  @IsOptional()
  @IsUUID()
  currentCustodianId?: string;
}
