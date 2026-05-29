import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface UserServiceLink {
  id: string;
  keycloakUserId: string;
}

/**
 * Reads provisioning status from user-service over HTTP (it owns `user_db.users`).
 * One batched call per page of Keycloak subs — never per item.
 */
@Injectable()
export class UserDirectoryClient {
  private readonly logger = new Logger(UserDirectoryClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl = this.config.get('USER_SERVICE_URL', 'http://localhost:3002');
  }

  /**
   * Maps each provisioned Keycloak sub → its user-service `users.id`.
   * Best-effort enrichment: if user-service is unreachable we log and return an empty map,
   * so the combobox still lists Keycloak users (a stale `provisioned:false` is caught by the
   * 409 the create endpoint raises on a duplicate keycloak_user_id).
   * The caller's ADMIN bearer token is forwarded — the user-service route is ADMIN-only.
   */
  async resolveProvisioned(
    keycloakSubs: string[],
    authHeader?: string,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (keycloakSubs.length === 0) return map;

    try {
      const { data } = await firstValueFrom(
        this.http.get<UserServiceLink[]>(`${this.baseUrl}/users/by-keycloak-ids`, {
          params: { ids: keycloakSubs.join(',') },
          headers: authHeader ? { Authorization: authHeader } : {},
        }),
      );
      for (const row of data ?? []) {
        map.set(row.keycloakUserId, row.id);
      }
    } catch (error: any) {
      this.logger.warn(
        `user-service provisioning lookup failed; treating page as unprovisioned: ${error?.message}`,
      );
    }
    return map;
  }
}
