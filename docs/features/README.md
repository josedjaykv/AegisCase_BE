# Features

Registro ordenado de funcionalidades implementadas en el backend de AegisCase. Cada
documento describe una feature: el problema, la decisión de diseño, el contrato, la
implementación, las pruebas y la documentación relacionada.

## Convención

- Un archivo por feature, con prefijo numérico de tres dígitos: `NNN-titulo-en-kebab-case.md`.
- La numeración es secuencial y no se reutiliza (la siguiente feature sería `002-...`).
- Al agregar una feature nueva, añade su fila a la tabla de abajo.

## Índice

| # | Feature | Servicio | Estado | Fecha |
|---|---------|----------|--------|-------|
| [001](001-users-directory-endpoint.md) | `GET /users/directory` — resolución de Keycloak subs a nombres (todos los roles) | `user-service` | Implementado | 2026-05-29 |
| [002](002-update-case-team-member-role.md) | `PATCH /cases/:id/team/:userId` — cambiar el rol de un miembro del equipo | `case-service` | Implementado | 2026-05-29 |
| [004](004-case-involved-link-management.md) | Gestión del vínculo caso ↔ persona: roster, editar y desvincular | `involved-service` | Implementado | 2026-05-29 |
| [005](005-task-list-case-filter.md) | Filtro `caseId` en `GET /tasks` — tablero de tareas por caso | `task-service` | Implementado | 2026-05-30 |
| [006](006-media-description-and-rename.md) | Descripción y nombre personalizado en la subida de media | `media-service` | Implementado | 2026-05-30 |
| [007](007-evidence-file-custody-gating.md) | Custodia para descargar archivos de evidencia (ver = log, descargar = custodia) | `evidence-service`, `media-service`, `audit-service` | Implementado | 2026-05-30 |
| [009](009-evidence-title.md) | Campo `title` en evidencia | `evidence-service` | Implementado | 2026-05-30 |
| [010](010-evidence-edit-requires-custody.md) | Editar evidencia exige custodia (+ evento `evidence.updated`) | `evidence-service`, `audit-service` | Implementado | 2026-05-31 |
