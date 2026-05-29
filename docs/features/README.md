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
