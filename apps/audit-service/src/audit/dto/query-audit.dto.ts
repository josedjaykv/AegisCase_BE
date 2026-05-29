import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryAuditDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by entity type (e.g. Case, Evidence, Task)' })
  @IsOptional()
  @IsString()
  entity_type?: string;

  @ApiPropertyOptional({ description: 'Filter by entity ID' })
  @IsOptional()
  @IsString()
  entity_id?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID (actor)' })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Filter by action (e.g. CaseCreated, TaskCompleted)' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'From date — YYYY-MM-DD or ISO 8601', example: '2026-01-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/, {
    message: 'from_date must be a valid date (YYYY-MM-DD or ISO 8601)',
  })
  from_date?: string;

  @ApiPropertyOptional({ description: 'To date — YYYY-MM-DD or ISO 8601', example: '2026-12-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/, {
    message: 'to_date must be a valid date (YYYY-MM-DD or ISO 8601)',
  })
  to_date?: string;
}
