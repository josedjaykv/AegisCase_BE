import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaEntityType } from '@aegiscase/enums';

export class UploadMediaDto {
  @ApiProperty({ enum: MediaEntityType, description: 'Entity type the media is attached to' })
  @IsEnum(MediaEntityType, {
    message: `entity_type must be one of: ${Object.values(MediaEntityType).join(', ')}`,
  })
  entity_type: MediaEntityType;

  @ApiProperty({ description: 'Entity ID (UUID for most, string for USER)' })
  @IsString()
  @IsNotEmpty()
  entity_id: string;

  @ApiPropertyOptional({
    description: 'Optional free-text description of the media (≤ 1000 chars)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
