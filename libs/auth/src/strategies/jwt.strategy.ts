import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { passportJwtSecret } from 'jwks-rsa';
import { UserRole } from '@aegiscase/enums';

const DOMAIN_ROLES = Object.values(UserRole) as string[];

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super(JwtStrategy.buildOptions(config));
  }

  private static buildOptions(config: ConfigService) {
    const keycloakUrl = config.get<string>('KEYCLOAK_URL');
    const realm = config.get('KEYCLOAK_REALM', 'aegiscase');

    if (keycloakUrl) {
      return {
        secretOrKeyProvider: passportJwtSecret({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 10,
          jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
        }),
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        issuer: `${keycloakUrl}/realms/${realm}`,
        algorithms: ['RS256'],
      };
    }

    // Fallback for local development without Keycloak
    return {
      secretOrKey: config.get<string>('JWT_SECRET', 'changeme'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      algorithms: ['HS256'],
    };
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

    // Keycloak puts realm roles in payload.realm_access.roles
    // Dev tokens use a flat payload.role field
    const role: UserRole =
      payload.role ??
      (payload.realm_access?.roles as string[])?.find((r) => DOMAIN_ROLES.includes(r));

    if (!role) throw new UnauthorizedException('No valid role found in token');

    return {
      sub: payload.sub,
      email: payload.email ?? payload.preferred_username,
      role: role as UserRole,
      keycloak_user_id: payload.sub,
    };
  }
}
