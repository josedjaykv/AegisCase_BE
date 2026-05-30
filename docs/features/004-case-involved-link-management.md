# 004 — Gestión del vínculo caso ↔ persona involucrada (roster, editar, desvincular)

| | |
|---|---|
| **Estado** | Implementado |
| **Servicio** | `involved-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-29 |

> **Nota de numeración:** no existe un documento `003-`. Esta feature se numeró `004` para
> alinearse con la rama `feature_004` y con el ticket de origen. La numeración no se reutiliza.

---

## 1. Problema

`involved-service` permitía **vincular** una persona a un caso
(`POST /involved-persons/:id/cases/:caseId`) y **listar los casos** de una persona
(`GET /involved-persons/:id/cases`), pero faltaban tres operaciones que el frontend necesita:

1. **Roster del caso** — el lookup inverso: dado un caso, ¿qué personas están involucradas y con
   qué tipo? Sin él, la FE tenía que recorrer todas las personas.
2. **Editar el vínculo** — cambiar `involvement_type` u `observations` sin quitar y re-crear.
3. **Desvincular** — quitar el vínculo. El `BACKEND_INVESTIGATION_REPORT.md` §17.18 decía que los
   vínculos "solo se podían quitar por intervención directa en BD". Esta feature **revierte** esa
   nota para los vínculos caso-persona (la mitad de equipo de esa nota sigue vigente).

La fila `case_involved_persons` está identificada por la PK compuesta `(case_id, involved_person_id)`.

## 2. Solución

Tres rutas nuevas en `involved-service`, junto al controlador/servicio de vínculos existentes.
Todas pasan por el wildcard `involved-persons*` del gateway sin cambios.

| Endpoint | Roles | Efecto |
|---|---|---|
| `GET /involved-persons/by-case/:caseId` | ADMIN, DETECTIVE, ANALYST | Roster (lectura) |
| `PATCH /involved-persons/:id/cases/:caseId` | ADMIN, DETECTIVE | Editar el vínculo |
| `DELETE /involved-persons/:id/cases/:caseId` | ADMIN, DETECTIVE | Desvincular (hard delete) |

### Decisión de path para el roster

El path preferido `GET /cases/:id/involved` **no es viable**: el gateway enruta `cases*` a
case-service por prefijo de URL. El roster se ofrece entonces bajo el prefijo `involved-persons`
como `GET /involved-persons/by-case/:caseId` — el contrato que la FE consume. La ruta se declara
**antes** de `:id` en el controlador para que no la sombree.

## 3. Contratos

### #1 `GET /involved-persons/by-case/:caseId` (roster, lectura)

```
Roles: ADMIN, DETECTIVE, ANALYST

200 OK → array (vacío [], no 404, cuando el caso no tiene vínculos):
[
  {
    "caseId": "...",
    "involvedPersonId": "...",
    "involvementType": "VICTIM | SUSPECT | WITNESS | OTHER",
    "observations": "..." | null,
    "person": { "id": "...", "firstNames": "...", "lastNames": "..." | null, "document": "..." | null }
  }
]
```

- **`person` embebido** (solo `id, firstNames, lastNames, document`) para evitar un N+1 en la FE.
  `involved_persons` y `case_involved_persons` viven en el mismo schema (`involved_db`) → un solo
  `find` con `relations: ['involvedPerson']`.
- **Sin verificación de `caseId`** (consistente con el resto del servicio — id desconocido → `[]`).
- Solo lectura, **sin eventos**.

### #2 `PATCH /involved-persons/:id/cases/:caseId` (editar el vínculo)

```
Roles: ADMIN, DETECTIVE   (los mismos que el POST de vínculo)

Body (UpdateCaseLinkDto — al menos un campo):
  | Campo           | Tipo                 | Requerido | Validador                |
  |-----------------|----------------------|:---------:|--------------------------|
  | involvementType | enum InvolvementType |    No     | @IsEnum(InvolvementType) |
  | observations    | string               |    No     | @IsString                |

200 OK → la fila actualizada:
  { "caseId": "...", "involvedPersonId": "...", "involvementType": "SUSPECT", "observations": "..." | null }
```

**Errores:** `400 "At least one field is required"` (body vacío); `400 "involvementType must be a
valid type"` (enum inválido); `403` (rol ≠ ADMIN/DETECTIVE); `404 "Person not found"` (persona
inexistente); `404 "Link not found"` (par `(caseId, involvedPersonId)` inexistente).

- Update parcial; solo `involvement_type` / `observations` son escribibles. La PK no se toca.
- **Idempotente:** enviar el valor actual devuelve `200` sin cambios (no `409`).
- Sin verificación de `caseId`. **Sin eventos.**

### #3 `DELETE /involved-persons/:id/cases/:caseId` (desvincular)

```
Roles: ADMIN, DETECTIVE

200 OK → { "success": true }
```

**Errores:** `403` (rol ≠ ADMIN/DETECTIVE); `404 "Link not found"` (par inexistente — no se hace
`200` silencioso).

- **Hard delete** de la fila `case_involved_persons`. Las filas de `involved_persons` y `cases`
  quedan intactas — solo se borra el vínculo. No hay columna de soft-delete en esta join, así que
  el delete físico es correcto. **Es el primer delete físico expuesto para esta tabla.**
- **Evento:** publica `involved.person.unlinked` (paridad de routing key con
  `involved.person.linked`), payload `{ case_id, involved_person_id }`. Auditado como
  `INVOLVED_PERSON_UNLINKED`.

## 4. Implementación

### Archivos nuevos
- `apps/involved-service/src/involved/dto/update-case-link.dto.ts` — `UpdateCaseLinkDto`
  (`involvementType`, `observations`, ambos `@IsOptional`). La regla "al menos un campo" se aplica
  en el **servicio** para que el mensaje sea exacto.
- `apps/involved-service/src/involved/involved.service.spec.ts` — unit spec de los tres métodos.
- `test/e2e/involved-case-link.e2e-spec.ts` — E2E contra Postgres real (testcontainers).

### Archivos modificados
- `apps/involved-service/src/involved/involved.service.ts` — métodos `findByCase(caseId)`,
  `updateLink(personId, caseId, dto)`, `removeLink(personId, caseId, actor)`.
- `apps/involved-service/src/involved/involved.controller.ts` — las tres rutas; `by-case/:caseId`
  declarada antes de `:id`.
- `apps/involved-service/src/events/event-publisher.service.ts` — `publishInvolvedPersonUnlinked`.
- `libs/events/src/event-patterns.ts` — `INVOLVED_PERSON_UNLINKED`.
- `libs/events/src/involved.events.ts` — `InvolvedPersonUnlinkedEvent`.
- `apps/audit-service/src/audit/audit.service.ts` — `ACTION_MAP` + `mapStates` para el nuevo evento.
- `libs/auth/src/permissions.reference.ts` — `involvedPerson.readByCase / updateLink / unlink`.

### Gateway
Sin cambios. `service-proxy.controller.ts` enruta `involved-persons*` a involved-service con
passthrough de `Authorization`; las tres rutas quedan cubiertas por el wildcard. Los roles los
valida el servicio destino.

## 5. Pruebas

### Unit (`apps/involved-service/src/involved/involved.service.spec.ts`)
- `findByCase`: forma exacta del `person` embebido; `[]` cuando no hay vínculos.
- `updateLink`: cambia type; cambia observations; parcial; idempotente; body vacío → `400`;
  persona ausente → `Person not found`; vínculo ausente → `Link not found`.
- `removeLink`: borra + publica `involved.person.unlinked` + `{ success: true }`; vínculo ausente
  → `Link not found` sin borrar ni publicar.

### E2E (`test/e2e/involved-case-link.e2e-spec.ts`, Postgres real vía testcontainers)
- #1 roster: filas para un caso; `[]` para ninguno; `person` con exactamente
  `{ id, firstNames, lastNames, document }`; `200` para los tres roles; `401` sin token.
- #2 PATCH: cambia type; cambia observations; body vacío → `400`; enum malo → `400`; persona
  ausente → `404`; vínculo ausente → `404`; `403` para ANALYST.
- #3 DELETE: quita el vínculo (el roster ya no lo muestra) y la persona sobrevive; vínculo ausente
  → `404`; `403` para ANALYST.
- Regresión: `POST` de vínculo sigue dando `409` en duplicado; `GET /:id/cases` sin cambios.

## 6. Smoke manual

```bash
DET=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"detective1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

# #1 roster
curl -s -H "Authorization: Bearer $DET" "http://localhost:3000/involved-persons/by-case/<caseId>" | jq

# #2 editar involvement type
curl -i -X PATCH "http://localhost:3000/involved-persons/<personId>/cases/<caseId>" \
  -H "Authorization: Bearer $DET" -H 'Content-Type: application/json' \
  -d '{"involvementType":"SUSPECT"}'

# #3 desvincular
curl -i -X DELETE "http://localhost:3000/involved-persons/<personId>/cases/<caseId>" \
  -H "Authorization: Bearer $DET"
```

## 7. Documentación relacionada actualizada

- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.5 (vínculo editable/borrable + lookup inverso), §4.4
  (matriz de permisos), §5.5 (las tres rutas), §3 catálogo de eventos + tabla de auditoría, §5
  nota de routing del gateway, §17.18 (se revierte la nota de "solo BD").
- `docs/API_REFERENCE.md` — tabla de Involved Persons.
- `docs/EVENTS.md` — `InvolvedPersonUnlinked`.
- `libs/auth/src/permissions.reference.ts`.

## 8. Fuera de alcance

- No se tocan `POST /involved-persons/:id/cases/:caseId` ni `GET /involved-persons/:id/cases`.
- No se agrega el filtro "ocultar ya vinculados" en `GET /cases` ni `GET /involved-persons` (FE).
- No se pagina el roster (array simple es suficiente para v1).
- No se hace soft-delete del vínculo (no existe esa columna) — el hard delete es correcto.
