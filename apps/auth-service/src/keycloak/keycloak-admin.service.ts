import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { URLSearchParams } from 'url';

export interface KeycloakUserRepresentation {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  /** Sometimes populated when briefRepresentation=false, often absent — verify before relying. */
  realmRoles?: string[];
}

/**
 * Low-level client for the Keycloak admin REST API, authenticated with the service-account
 * of the same confidential client used for login/refresh (client_credentials grant).
 * The caller's bearer token is never used against the admin API.
 */
@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);

  private readonly tokenUrl: string;
  private readonly adminBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    const keycloakUrl = this.config.get('KEYCLOAK_URL', 'http://localhost:8080');
    const realm = this.config.get('KEYCLOAK_REALM', 'aegiscase');
    this.tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
    this.adminBaseUrl = `${keycloakUrl}/admin/realms/${realm}`;
    this.clientId = this.config.get('KEYCLOAK_CLIENT_ID', 'aegiscase-backend');
    this.clientSecret = this.config.get(
      'KEYCLOAK_CLIENT_SECRET',
      'aegiscase-backend-secret',
    );
  }

  /** One page of users. Keycloak `search` matches username, first/last name and email. */
  async searchUsers(
    search: string,
    first: number,
    max: number,
  ): Promise<KeycloakUserRepresentation[]> {
    const token = await this.getServiceAccountToken();
    try {
      const { data } = await firstValueFrom(
        this.http.get<KeycloakUserRepresentation[]>(`${this.adminBaseUrl}/users`, {
          params: { search, first, max, briefRepresentation: false },
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return data ?? [];
    } catch (error) {
      this.handleError(error, 'searchUsers');
    }
  }

  /** Total count for the same `search`, so the FE can render "Showing X–Y of T". */
  async countUsers(search: string): Promise<number> {
    const token = await this.getServiceAccountToken();
    try {
      const { data } = await firstValueFrom(
        this.http.get(`${this.adminBaseUrl}/users/count`, {
          params: { search },
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      const count = typeof data === 'number' ? data : Number(data);
      return Number.isFinite(count) ? count : 0;
    } catch (error) {
      this.handleError(error, 'countUsers');
    }
  }

  /** Realm role names assigned to a single user. */
  async getUserRealmRoleNames(userId: string): Promise<string[]> {
    const token = await this.getServiceAccountToken();
    try {
      const { data } = await firstValueFrom(
        this.http.get<Array<{ name: string }>>(
          `${this.adminBaseUrl}/users/${userId}/role-mappings/realm`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      return (data ?? []).map((r) => r.name).filter(Boolean);
    } catch (error) {
      this.handleError(error, 'getUserRealmRoleNames');
    }
  }

  private async getServiceAccountToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiresAt) return this.cachedToken;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    try {
      const { data } = await firstValueFrom(
        this.http.post(this.tokenUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      this.cachedToken = data.access_token;
      // Refresh 30s before real expiry; floor at 5s for very short-lived tokens.
      this.tokenExpiresAt = now + Math.max((data.expires_in ?? 60) - 30, 5) * 1000;
      return this.cachedToken;
    } catch (error) {
      this.handleError(error, 'getServiceAccountToken');
    }
  }

  private handleError(error: any, operation: string): never {
    const status = error?.response?.status;
    this.logger.error(
      `Keycloak admin ${operation} failed [${status ?? 'no-response'}]`,
      error?.response?.data ?? error?.message,
    );
    throw new ServiceUnavailableException('Authentication service unavailable');
  }
}
