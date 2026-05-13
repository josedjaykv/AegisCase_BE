import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '@aegiscase/dto';

export class QueryAuditDto extends PaginationDto {
  @IsOptional()
  @IsString()
  entity_type?: string;

  @IsOptional()
  @IsString()
  entity_id?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  action?: string;
}
