# 005 — Filtro `caseId` en `GET /tasks` (tablero de tareas por caso)

| | |
|---|---|
| **Estado** | Implementado |
| **Servicio** | `task-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-30 |

---

## 1. Problema

`GET /tasks` aceptaba solo `page`, `limit` y `assignedToUserId`. El tablero Kanban
por caso (`/cases/:id/tasks`) necesita **todas las tareas de un caso, en cualquier
estado**. Sin un filtro por `caseId`, la FE traía una página grande de la lista
global y filtraba en cliente — lo que **silenciosamente pierde** tareas del caso que
caen fuera de la página traída a medida que crece el volumen global. Un filtro
`caseId` del lado servidor hace el tablero correcto y barato.

## 2. Solución

Se agrega un parámetro de query opcional `caseId` a `GET /tasks`, que combina con el
filtro existente `assignedToUserId` mediante **AND**. El resto del endpoint no cambia
(barrido de OVERDUE, paginación, forma de respuesta, roles).

| Endpoint | Roles | Efecto |
|---|---|---|
| `GET /tasks?caseId=<uuid>` | ADMIN, DETECTIVE, ANALYST | Lista filtrada por caso (lectura) |

## 3. Contrato

```
GET /tasks?caseId=<uuid>&page=&limit=&assignedToUserId=
Roles: ADMIN, DETECTIVE, ANALYST  (sin cambios)

- caseId: opcional, @IsUUID() cuando viene presente.
- Combina con assignedToUserId mediante AND.
- Sigue corriendo el barrido OVERDUE (markOverdueTasks) antes de devolver — sin cambios.
- Forma de respuesta sin cambios: { data, total, page, limit }.

200 OK → { "data": Task[], "total": N, "page": 1, "limit": 20 }
```

- **`caseId` desconocido/válido** → `data: []`, `total: 0`. **No** se hace `404`
  (consistente con el resto del sistema; el servicio no verifica el caso contra
  case-service).
- **`caseId` no-UUID** → `400 Bad Request` (lo rechaza `@IsUUID()` del DTO).
- **`caseId` omitido** → comportamiento previo intacto (lista global).

## 4. Implementación

### Archivos modificados
- `apps/task-service/src/tasks/tasks.controller.ts` — `TaskFilterDto` gana
  `caseId?` (`@IsOptional() @IsUUID()`); `findAll` desestructura `caseId` y lo pasa
  al servicio.
- `apps/task-service/src/tasks/tasks.service.ts` — `findAll(pagination,
  assignedToUserId?, caseId?)` construye el `where` combinando ambos filtros:
  `{ ...(assignedToUserId ? { assignedToUserId } : {}), ...(caseId ? { caseId } : {}) }`.
- `apps/task-service/src/tasks/tasks.service.spec.ts` — unit del nuevo filtrado.

### Archivos nuevos
- `test/e2e/task-case-filter.e2e-spec.ts` — E2E contra Postgres real (testcontainers).

### Índice / sin cambios
- No se requiere índice nuevo: `tasks.case_id` ya está indexado en la entidad
  (`@Index()` sobre `caseId`).
- **Gateway:** sin cambios. `tasks*` se enruta por prefijo a task-service con
  passthrough de `Authorization`; el query string viaja tal cual.

## 5. Pruebas

### Unit (`tasks.service.spec.ts`)
- `findAll` filtra por `caseId` (`where: { caseId }`).
- Combina `caseId` + `assignedToUserId` (`where` con ambos — AND).
- Sin filtros → `where: {}` (regresión).
- El barrido OVERDUE sigue corriendo antes de consultar.

### E2E (`test/e2e/task-case-filter.e2e-spec.ts`, Postgres real)
- `?caseId=A` devuelve solo las tareas del caso A.
- `?caseId=A&assignedToUserId=X` devuelve la intersección.
- `caseId` válido inexistente → `[]` (no `404`).
- `caseId` omitido → lista global (regresión).
- `caseId` no-UUID → `400`.

## 6. Smoke manual

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"detective1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/tasks?caseId=<caseId>&limit=100" | jq '.data | length'
```

## 7. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §5.7 — `caseId?` en los query params de
  `GET /tasks` (filtros AND, no-404, forma de respuesta).
- `docs/API_REFERENCE.md` — tabla de Tasks + nota de filtros.

## 8. Fuera de alcance
- No se cambia el barrido OVERDUE, la forma de respuesta ni ninguna otra ruta de tareas.
- No se agregan filtros por estado/prioridad/fecha (la FE los hace en cliente por ahora).
