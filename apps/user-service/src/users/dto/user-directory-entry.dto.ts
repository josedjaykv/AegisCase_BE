import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@aegiscase/enums';

/**
 * Minimal projection returned by GET /users/directory — readable by every
 * authenticated role. Listing the four fields explicitly (with @Exclude at
 * the class level) is defense in depth: any new column added to the User
 * entity later is excluded by default and cannot accidentally leak here.
 */
@Exclude()
export class UserDirectoryEntryDto {
  @Expose()
  @ApiProperty({ description: 'Keycloak sub of the user' })
  keycloakUserId: string;

  @Expose()
  @ApiProperty()
  firstNames: string;

  @Expose()
  @ApiProperty()
  lastNames: string;

  @Expose()
  @ApiProperty({ enum: UserRole })
  role: UserRole;
}
