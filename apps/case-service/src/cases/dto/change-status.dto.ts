import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CaseStatus } from '@aegiscase/enums';

export class ChangeStatusDto {
  @ApiProperty({ enum: CaseStatus, description: 'New case status' })
  @IsEnum(CaseStatus)
  status: CaseStatus;
}
