import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Documents the GET /users/directory query for Swagger.
 *
 * Validation of the comma-separated UUID list lives in the controller so that
 * the 400 error messages exactly match the documented public contract — the
 * FE depends on those strings and they are covered by E2E.
 */
export class DirectoryQueryDto {
  @ApiProperty({
    description: 'Comma-separated Keycloak sub UUIDs to resolve to minimal directory entries',
    example: '550e8400-e29b-41d4-a716-446655440000,9c1f0a2c-1234-4abc-9def-abcdef012345',
    required: true,
  })
  // @IsOptional + @IsString lets `whitelist: true` keep the field while leaving
  // the "ids is required" / shape validation to the controller, which produces
  // the exact 400 messages the FE depends on.
  @IsOptional()
  @IsString()
  ids?: string;
}
