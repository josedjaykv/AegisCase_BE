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
    team: {
      add:        [UserRole.ADMIN, UserRole.DETECTIVE],
      // PATCH /cases/:id/team/:userId — change an existing member's role
      // (only LEAD ↔ MEMBER; CREATOR is immutable and cannot be assigned).
      updateRole: [UserRole.ADMIN, UserRole.DETECTIVE],
      read:       [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    },
  },

  // ── Evidence ─────────────────────────────────────────────────────────────
  evidence: {
    create:          [UserRole.ADMIN, UserRole.DETECTIVE],
    read:            [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    updateStatus:    [UserRole.ADMIN, UserRole.DETECTIVE],
    delete:          [UserRole.ADMIN],
    archive:         [UserRole.ADMIN],
    transferCustody: [UserRole.ADMIN, UserRole.DETECTIVE],
    takeCustody:     [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST], // self-assign (Feature 007)
    readCustodian:   [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST], // side-effect-free lookup
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
    // GET /involved-persons/by-case/:caseId — case roster, read for all roles.
    readByCase:  [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    // PATCH/DELETE /involved-persons/:id/cases/:caseId — edit/unlink the join row.
    updateLink:  [UserRole.ADMIN, UserRole.DETECTIVE],
    unlink:      [UserRole.ADMIN, UserRole.DETECTIVE],
  },

  // ── Users ────────────────────────────────────────────────────────────────
  user: {
    create:  [UserRole.ADMIN],
    read:    [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    update:  [UserRole.ADMIN],
    delete:  [UserRole.ADMIN],
    // GET /users/directory — minimal projection (keycloakUserId, firstNames,
    // lastNames, role) used by the FE to display teammates by name.
    // Readable by every authenticated role; PII stays behind admin endpoints.
    readDirectory:    [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    // GET /users/by-keycloak-ids — ADMIN-only, returns the internal user-service
    // id alongside the sub; consumed by auth-service. Do NOT widen.
    readByKeycloakIds: [UserRole.ADMIN],
  },

  // ── Audit ────────────────────────────────────────────────────────────────
  audit: {
    read:    [UserRole.ADMIN],
  },

  // ── Media ────────────────────────────────────────────────────────────────
  media: {
    upload:  [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    read:    [UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST],
    // Downloading (disposition=attachment) media of an EVIDENCE is additionally
    // gated to the evidence's current custodian, regardless of role (Feature 007).
    downloadEvidenceFile: 'EVIDENCE custodian only',
  },
} as const;
