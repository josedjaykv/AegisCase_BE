import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@aegiscase/enums';

export class KeycloakUserDto {
  @ApiProperty({ description: 'Keycloak sub UUID — used as keycloakUserId when provisioning' })
  sub: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    enum: UserRole,
    nullable: true,
    description: 'Single AegisCase realm role, or null if the user has none assigned',
  })
  role: UserRole | null;

  @ApiProperty({ description: 'True iff a user_db.users row exists with keycloak_user_id = sub' })
  provisioned: boolean;

  @ApiProperty({ nullable: true, description: 'The user_db.users.id when provisioned, else null' })
  userServiceId: string | null;
}

export class KeycloakUsersPageDto {
  @ApiProperty({ type: [KeycloakUserDto] })
  data: KeycloakUserDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;
}
