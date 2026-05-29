import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvidenceType, EvidenceStatus } from '@aegiscase/enums';

export class UpdateEvidenceDto {
  @ApiPropertyOptional({ enum: EvidenceType })
  @IsOptional()
  @IsEnum(EvidenceType)
  evidenceType?: EvidenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: EvidenceStatus })
  @IsOptional()
  @IsEnum(EvidenceStatus)
  evidenceStatus?: EvidenceStatus;
}
