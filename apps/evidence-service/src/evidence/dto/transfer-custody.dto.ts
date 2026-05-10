import { IsUUID, IsOptional, IsString } from 'class-validator';

export class TransferCustodyDto {
  @IsUUID()
  newCustodianId: string;

  @IsOptional()
  @IsString()
  transferReason?: string;
}
