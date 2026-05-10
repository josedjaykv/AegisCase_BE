/**
 * Permission matrix reference — Section 2 of CLAUDE.md
 *
 * Use @Roles(...) decorator to enforce these on individual endpoints.
 * The RolesGuard validates the role from the JWT claim against this decorator.
 *
 * Usage:
 *   @Roles(UserRole.ADMIN)                          // only ADMIN
 *   @Roles(UserRole.ADMIN, UserRole.DETECTIVE)      // ADMIN or DETECTIVE
 *   @Public()                                        // no auth needed
 */

import { UserRole } from '@aegiscase/enums';

export const PERMISSION_MATRIX = {
  // ── Cases ────────────────────────────────────────────────────────────────
  case: {
    create:       [UserRole.ADMIN, UserRole.DETECTIVE],
    read:         [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    update:       [UserRole.ADMIN, UserRole.DETECTIVE],
    delete:       [UserRole.ADMIN],
    archive:      [UserRole.ADMIN],
    reopen:       [UserRole.ADMIN],
    close:        [UserRole.ADMIN, UserRole.DETECTIVE],
    assignLeader: [UserRole.ADMIN, UserRole.DETECTIVE],
    assignTeam:   [UserRole.ADMIN, UserRole.DETECTIVE],
  },

  // ── Evidence ─────────────────────────────────────────────────────────────
  evidence: {
    create:          [UserRole.ADMIN, UserRole.DETECTIVE],
    read:            [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    updateStatus:    [UserRole.ADMIN, UserRole.DETECTIVE],
    delete:          [UserRole.ADMIN],
    archive:         [UserRole.ADMIN],
    transferCustody: [UserRole.ADMIN, UserRole.DETECTIVE],
  },

  // ── Tasks ────────────────────────────────────────────────────────────────
  task: {
    create:   [UserRole.ADMIN, UserRole.DETECTIVE],
    read:     [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    assign:   [UserRole.ADMIN, UserRole.DETECTIVE],
    update:   [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    complete: [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    cancel:   [UserRole.ADMIN, UserRole.DETECTIVE],
  },

  // ── Involved Persons ─────────────────────────────────────────────────────
  involvedPerson: {
    create:  [UserRole.ADMIN, UserRole.DETECTIVE],
    read:    [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    update:  [UserRole.ADMIN, UserRole.DETECTIVE],
    link:    [UserRole.ADMIN, UserRole.DETECTIVE],
  },

  // ── Users ────────────────────────────────────────────────────────────────
  user: {
    create:  [UserRole.ADMIN],
    read:    [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    update:  [UserRole.ADMIN],
    delete:  [UserRole.ADMIN],
  },

  // ── Audit ────────────────────────────────────────────────────────────────
  audit: {
    read:    [UserRole.ADMIN],
  },

  // ── Media ────────────────────────────────────────────────────────────────
  media: {
    upload:  [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    read:    [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
  },
} as const;
