import { IsEnum } from 'class-validator';
import { CaseStatus } from '@aegiscase/enums';

export class ChangeStatusDto {
  @IsEnum(CaseStatus)
  status: CaseStatus;
}
