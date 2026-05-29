import { UserRole } from '@aegiscase/enums';
import { countAppRoles, pickAppRole } from './role-mapping';

describe('role-mapping', () => {
  describe('pickAppRole', () => {
    it('returns null for null/undefined/empty input', () => {
      expect(pickAppRole(null)).toBeNull();
      expect(pickAppRole(undefined)).toBeNull();
      expect(pickAppRole([])).toBeNull();
    });

    it('returns the single matching AegisCase role', () => {
      expect(pickAppRole(['DETECTIVE'])).toBe(UserRole.DETECTIVE);
      expect(pickAppRole(['ANALYST', 'offline_access'])).toBe(UserRole.ANALYST);
    });

    it('returns the highest-precedence role when several match (ADMIN > DETECTIVE > ANALYST)', () => {
      expect(pickAppRole(['ANALYST', 'DETECTIVE', 'ADMIN'])).toBe(UserRole.ADMIN);
      expect(pickAppRole(['ANALYST', 'DETECTIVE'])).toBe(UserRole.DETECTIVE);
    });

    it('returns null when no AegisCase role is present', () => {
      expect(pickAppRole(['offline_access', 'uma_authorization', 'default-roles-aegiscase'])).toBeNull();
    });
  });

  describe('countAppRoles', () => {
    it('counts only AegisCase roles', () => {
      expect(countAppRoles(['offline_access'])).toBe(0);
      expect(countAppRoles(['ADMIN', 'offline_access'])).toBe(1);
      expect(countAppRoles(['ADMIN', 'DETECTIVE', 'ANALYST', 'uma_authorization'])).toBe(3);
    });

    it('handles null/empty', () => {
      expect(countAppRoles(null)).toBe(0);
      expect(countAppRoles([])).toBe(0);
    });
  });
});
