import {
  Injectable,
  UnauthorizedException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { URLSearchParams } from 'url';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { TokenResponseDto } from './dto/token-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    const keycloakUrl = this.config.get('KEYCLOAK_URL', 'http://localhost:8080');
    const realm = this.config.get('KEYCLOAK_REALM', 'aegiscase');
    this.tokenUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;
    this.clientId = this.config.get('KEYCLOAK_CLIENT_ID', 'aegiscase-backend');
    this.clientSecret = this.config.get('KEYCLOAK_CLIENT_SECRET', 'aegiscase-backend-secret');
  }

  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      username: dto.email,
      password: dto.password,
      scope: 'openid',
    });

    try {
      const { data } = await firstValueFrom(
        this.http.post(this.tokenUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      return this.mapTokenResponse(data);
    } catch (error) {
      this.handleKeycloakError(error, 'login');
    }
  }

  async refresh(dto: RefreshTokenDto): Promise<TokenResponseDto> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: dto.refresh_token,
    });

    try {
      const { data } = await firstValueFrom(
        this.http.post(this.tokenUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      return this.mapTokenResponse(data);
    } catch (error) {
      this.handleKeycloakError(error, 'refresh');
    }
  }

  async logout(refreshToken: string): Promise<void> {
    const keycloakUrl = this.config.get('KEYCLOAK_URL', 'http://localhost:8080');
    const realm = this.config.get('KEYCLOAK_REALM', 'aegiscase');
    const logoutUrl = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/logout`;

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    });

    try {
      await firstValueFrom(
        this.http.post(logoutUrl, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
    } catch (error) {
      this.logger.warn('Logout request to Keycloak failed', error?.message);
    }
  }

  private mapTokenResponse(data: any): TokenResponseDto {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type,
      expires_in: data.expires_in,
      refresh_expires_in: data.refresh_expires_in,
    };
  }

  private handleKeycloakError(error: any, operation: string): never {
    const status = error?.response?.status;
    const errorData = error?.response?.data;

    this.logger.error(`Keycloak ${operation} failed [${status}]`, errorData);

    if (status === 400 || status === 401) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!status || status >= 500) {
      throw new ServiceUnavailableException('Authentication service unavailable');
    }

    throw new UnauthorizedException('Authentication failed');
  }
}
