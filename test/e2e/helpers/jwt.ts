import * as jwt from 'jsonwebtoken';
import { UserRole } from '@aegiscase/enums';

export interface TestUser {
  sub: string;
  email: string;
  role: UserRole;
}

// Hand-picked v4 UUIDs (variant bits 8/9/a/b after the 3rd dash) so they pass @IsUUID() validators.
export const TEST_DETECTIVE: TestUser = {
  sub: '11111111-1111-4111-8111-111111111111',
  email: 'detective@e2e.local',
  role: UserRole.DETECTIVE,
};

export const TEST_ADMIN: TestUser = {
  sub: '22222222-2222-4222-8222-222222222222',
  email: 'admin@e2e.local',
  role: UserRole.ADMIN,
};

export const TEST_ANALYST: TestUser = {
  sub: '33333333-3333-4333-8333-333333333333',
  email: 'analyst@e2e.local',
  role: UserRole.ANALYST,
};

// Mirrors the HS256 fallback path in libs/auth/src/strategies/jwt.strategy.ts:
// when KEYCLOAK_URL is unset, the strategy validates against JWT_SECRET.
export function signTestToken(user: TestUser): string {
  return jwt.sign(
    {
      sub: user.sub,
      email: user.email,
      role: user.role,
      keycloak_user_id: user.sub,
    },
    process.env.JWT_SECRET ?? 'e2e-test-secret',
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}
