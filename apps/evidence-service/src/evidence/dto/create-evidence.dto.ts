import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
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

  @ApiProperty({ description: 'Evidence description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Initial custodian user (UUID); defaults to caller' })
  @IsOptional()
  @IsUUID()
  currentCustodianId?: string;
}
