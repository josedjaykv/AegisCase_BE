# 002 — `PATCH /cases/:id/team/:userId`: cambiar el rol de un miembro del equipo

| | |
|---|---|
| **Estado** | Implementado |
| **Servicio** | `case-service` (proxied vía `api-gateway`) |
| **Rama** | `userService-keycloak` |
| **Fecha** | 2026-05-29 |

---

## 1. Problema

`case-service` permitía **agregar** un miembro al equipo (`POST /cases/:id/team`) y
**listar** el equipo (`GET /cases/:id/team`), pero no había forma de **cambiar el rol** de un
miembro existente. El frontend necesita que un ADMIN/DETECTIVE pueda promover un `MEMBER` a
`LEAD` (o degradar un `LEAD` a `MEMBER`) sin quitar y re-agregar a la persona.

Re-agregar tampoco era opción:

- La fila `case_team` está identificada por la PK compuesta `(case_id, user_id)` — no existía
  ningún camino de actualización.
- `POST /cases/:id/team` responde `409` cuando el par `(caseId, userId)` ya existe.
- No existe ruta de "remover miembro", así que borrar-y-re-agregar tampoco se podía.

## 2. Solución

Una ruta nueva, `PATCH /cases/:id/team/:userId`, que escribe **solo** la columna `team_role`
de una fila existente. La PK `(caseId, userId)` no se toca.

## 3. Contrato del endpoint

```
PATCH /cases/:id/team/:userId
Authorization: Bearer <token>

Roles: ADMIN, DETECTIVE  (los mismos que POST /cases/:id/team).

Path params:
  id      UUID — id del caso
  userId  UUID — sub de Keycloak del miembro (case_team.user_id)

Body (UpdateTeamMemberDto):
  | Campo    | Tipo          | Requerido | Validador                       |
  |----------|---------------|:---------:|---------------------------------|
  | teamRole | enum TeamRole |    Sí     | @IsNotEmpty @IsEnum(TeamRole)   |

200 OK → la fila CaseTeam actualizada:
  { "caseId": "...", "userId": "...", "teamRole": "LEAD", "linkedAt": "..." }
```

### Errores

| Código | Mensaje | Cuándo |
|---|---|---|
| `400` | `teamRole is required` / `teamRole must be a valid role` | validación del body |
| `400` | `The case creator's role cannot be changed` | la fila objetivo es `CREATOR` |
| `400` | `Cannot assign the CREATOR role` | se intenta asignar `CREATOR` |
| `400` | `A closed case cannot be modified` | el caso está `CLOSED` |
| `403` | — | rol distinto de ADMIN/DETECTIVE |
| `404` | `Case ... not found` | el caso no existe |
| `404` | `Team member not found` | el par `(caseId, userId)` no existe |

## 4. Reglas de negocio

1. **`CREATOR` es procedencia inmutable.** El miembro cuyo rol actual es `CREATOR` no puede
   cambiarse, y ningún miembro puede recibir `CREATOR` por esta ruta. En la práctica solo
   intercambia entre `LEAD` y `MEMBER`.
2. **Consistencia con caso cerrado.** Igual que `PUT /cases/:id`, un caso `CLOSED` rechaza
   con `400 "A closed case cannot be modified"`, para que la composición del equipo no derive
   en un caso cerrado.
3. **No-op idempotente.** Si `teamRole` ya es igual al actual, responde `200` con la fila sin
   cambios (no `409`, no escritura).
4. **Sin nuevas restricciones de unicidad.** La PK `(caseId, userId)` no cambia; solo se
   escribe `team_role`.

## 5. Implementación

### Archivos nuevos
- `apps/case-service/src/cases/dto/update-team-member.dto.ts` — `teamRole: TeamRole`
  (`@IsNotEmpty @IsEnum`). Las dos reglas de `CREATOR` se aplican en el **servicio**, no en el
  DTO, para que los mensajes sean exactos.

### Archivos modificados
- `apps/case-service/src/cases/cases.service.ts` — método `updateTeamMemberRole(id, userId, dto)`:
  carga el caso (`findOne`), reusa el guard `assertNotClosed`, carga la fila por
  `(caseId, userId)`, aplica las reglas de `CREATOR`, hace el no-op si el rol coincide, y
  guarda. **No publica ningún evento.**
- `apps/case-service/src/cases/cases.controller.ts` — ruta `PATCH :id/team/:userId` con
  `@Roles(ADMIN, DETECTIVE)`.

### Gateway
Sin cambios. `service-proxy.controller.ts` enruta `cases*` a case-service con passthrough de
`Authorization` y sin enforcement de roles en el borde (los roles los valida el servicio
destino). La ruta nueva queda cubierta por el wildcard.

### Eventos
Ninguno. Las ediciones de equipo (add/role-change) no publican nada hoy — solo existen
`case.created` / `case.closed` / `case.archived`. No se introdujo `case.team.updated`.

## 6. Pruebas

### Unit (`apps/case-service/src/cases/cases.service.spec.ts`)
- MEMBER → LEAD y LEAD → MEMBER devuelven la fila actualizada;
- no-op (mismo rol) → `200` sin llamar a `save`;
- rechazo de cambiar `CREATOR` y de asignar `CREATOR` (mensajes exactos);
- caso cerrado → `A closed case cannot be modified`;
- caso ausente → `NotFound`; par ausente → `Team member not found`.

### E2E (`test/e2e/case-team-role.e2e-spec.ts`, Postgres real vía testcontainers)
- `200` para ADMIN y DETECTIVE; `403` para ANALYST; `401` sin token;
- `400` para `teamRole` ausente/ inválido;
- los `400` de `CREATOR` y caso cerrado;
- `404` para caso y para par inexistentes;
- regresión: `POST /cases/:id/team` sigue dando `409` en duplicado y `GET /cases/:id/team`
  refleja el cambio de rol.

## 7. Smoke manual

```bash
DET_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"detective1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

# Promover un MEMBER a LEAD
curl -i -X PATCH http://localhost:3000/cases/<caseId>/team/<userSub> \
  -H "Authorization: Bearer $DET_TOKEN" -H 'Content-Type: application/json' \
  -d '{"teamRole":"LEAD"}'
# Esperado: 200, teamRole: "LEAD"

# Intentar cambiar al creador → 400
curl -i -X PATCH http://localhost:3000/cases/<caseId>/team/<creatorSub> \
  -H "Authorization: Bearer $DET_TOKEN" -H 'Content-Type: application/json' \
  -d '{"teamRole":"MEMBER"}'
# Esperado: 400 "The case creator's role cannot be changed"
```

## 8. Documentación relacionada actualizada

- `docs/BACKEND_INVESTIGATION_REPORT.md` §5.4 (sub-sección nueva), §3.3 (Case_Team), y las dos
  matrices de permisos (§2 resumen y §4 ruta × rol).
- `docs/API_REFERENCE.md` — tabla de Cases + nota de reglas de negocio.
- `libs/auth/src/permissions.reference.ts` — `case.team.updateRole` (ADMIN + DETECTIVE).

## 9. Fuera de alcance

- No se agrega ruta de "remover miembro" / `DELETE` — ticket aparte.
- No se permite asignar ni cambiar `CREATOR`.
- No se cambian los contratos de `POST /cases/:id/team` ni `GET /cases/:id/team`.
- No se agregan endpoints de equipo a otros servicios.
