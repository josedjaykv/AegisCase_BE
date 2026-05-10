import { IsString, IsEnum, IsOptional } from 'class-validator';
import { EvidenceType, EvidenceStatus } from '@aegiscase/enums';

export class UpdateEvidenceDto {
  @IsOptional()
  @IsEnum(EvidenceType)
  evidenceType?: EvidenceType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EvidenceStatus)
  evidenceStatus?: EvidenceStatus;
}
