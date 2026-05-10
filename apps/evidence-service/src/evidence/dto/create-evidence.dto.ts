import {
  IsString,
  IsEnum,
  IsOptional,
  IsUUID,
  IsNotEmpty,
} from 'class-validator';
import { EvidenceType } from '@aegiscase/enums';

export class CreateEvidenceDto {
  @IsUUID()
  caseId: string;

  @IsEnum(EvidenceType)
  evidenceType: EvidenceType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsUUID()
  currentCustodianId?: string;
}
