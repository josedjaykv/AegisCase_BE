import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refresh_token: string;

  @ApiProperty({ description: 'Token type (Bearer)' })
  token_type: string;

  @ApiProperty({ description: 'Access token lifetime in seconds' })
  expires_in: number;

  @ApiProperty({ description: 'Refresh token lifetime in seconds' })
  refresh_expires_in: number;
}
