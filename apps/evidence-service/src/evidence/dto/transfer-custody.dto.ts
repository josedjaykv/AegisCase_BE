import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TransferCustodyDto {
  @ApiProperty({ description: 'New custodian user (UUID)' })
  @IsUUID()
  newCustodianId: string;

  @ApiPropertyOptional({ description: 'Reason for transfer' })
  @IsOptional()
  @IsString()
  transferReason?: string;
}
