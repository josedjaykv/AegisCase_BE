import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { KeycloakAdminService } from './keycloak-admin.service';
import { UserDirectoryClient } from './user-directory.client';
import { KeycloakUsersQueryDto } from './dto/keycloak-users-query.dto';
import { KeycloakUserDto, KeycloakUsersPageDto } from './dto/keycloak-user.dto';
import { countAppRoles, pickAppRole } from './role-mapping';

@Injectable()
export class KeycloakUsersService {
  private readonly logger = new Logger(KeycloakUsersService.name);

  constructor(
    private readonly admin: KeycloakAdminService,
    private readonly directory: UserDirectoryClient,
  ) {}

  async search(
    query: KeycloakUsersQueryDto,
    authHeader?: string,
  ): Promise<KeycloakUsersPageDto> {
    const search = query.search?.trim() ?? '';
    if (search.length < 2) {
      throw new BadRequestException('search must be at least 2 characters');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const first = (page - 1) * limit; // Keycloak admin API uses offset/limit, not page.

    const [users, total] = await Promise.all([
      this.admin.searchUsers(search, first, limit),
      this.admin.countUsers(search),
    ]);

    // Realm roles: prefer the inline `realmRoles` field when Keycloak returns it,
    // otherwise fall back to the per-user role-mappings endpoint. Run in parallel
    // across the page (bounded by `limit` ≤ 50).
    const roleNamesPerUser = await Promise.all(
      users.map((u) =>
        Array.isArray(u.realmRoles) && u.realmRoles.length
          ? Promise.resolve(u.realmRoles)
          : this.admin.getUserRealmRoleNames(u.id),
      ),
    );

    // Single batched lookup against user-service for the whole page.
    const provisionedMap = await this.directory.resolveProvisioned(
      users.map((u) => u.id),
      authHeader,
    );

    const data: KeycloakUserDto[] = users.map((u, i) => {
      const roleNames = roleNamesPerUser[i];
      if (countAppRoles(roleNames) > 1) {
        this.logger.warn(
          `Keycloak user ${u.id} has multiple AegisCase realm roles [${roleNames.join(
            ', ',
          )}]; using highest precedence`,
        );
      }

      const userServiceId = provisionedMap.get(u.id) ?? null;
      return {
        sub: u.id,
        firstName: u.firstName ?? '',
        lastName: u.lastName ?? '',
        email: u.email ?? '',
        role: pickAppRole(roleNames),
        provisioned: userServiceId !== null,
        userServiceId,
      };
    });

    return { data, total, page, limit };
  }
}
