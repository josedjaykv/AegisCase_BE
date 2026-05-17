import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { MediaEntityType } from '@aegiscase/enums';

export class UploadMediaDto {
  @IsEnum(MediaEntityType, {
    message: `entity_type must be one of: ${Object.values(MediaEntityType).join(', ')}`,
  })
  entity_type: MediaEntityType;

  @IsString()
  @IsNotEmpty()
  entity_id: string;
}
