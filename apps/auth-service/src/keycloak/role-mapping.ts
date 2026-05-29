import { UserRole } from '@aegiscase/enums';

/**
 * AegisCase realm roles in precedence order (most privileged first).
 * A Keycloak user may carry unrelated realm roles (offline_access, uma_authorization, …);
 * only these three map to an operational role.
 */
export const APP_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.DETECTIVE,
  UserRole.ANALYST,
];

/**
 * Picks the single AegisCase role for a Keycloak user from its realm role names.
 * Returns the highest-precedence match (ADMIN > DETECTIVE > ANALYST), or null if none match.
 */
export function pickAppRole(realmRoles: readonly string[] | null | undefined): UserRole | null {
  if (!realmRoles?.length) return null;
  const present = new Set(realmRoles);
  for (const role of APP_ROLES) {
    if (present.has(role)) return role;
  }
  return null;
}

/** Counts how many AegisCase roles the user has — used to warn on ambiguous assignments. */
export function countAppRoles(realmRoles: readonly string[] | null | undefined): number {
  if (!realmRoles?.length) return 0;
  const present = new Set(realmRoles);
  return APP_ROLES.filter((r) => present.has(r)).length;
}
