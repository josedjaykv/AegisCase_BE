import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ByKeycloakIdsDto {
  @ApiProperty({
    description: 'Comma-separated Keycloak sub UUIDs to resolve to user-service profiles',
    example: '550e8400-e29b-41d4-a716-446655440000,9c1f...',
  })
  @IsString()
  @IsNotEmpty()
  ids: string;
}
