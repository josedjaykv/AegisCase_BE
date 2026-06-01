import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TakeCustodyDto {
  @ApiPropertyOptional({
    description:
      'Optional free-text note. The chain-of-custody reason is fixed by the backend; this is only an extra note.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
