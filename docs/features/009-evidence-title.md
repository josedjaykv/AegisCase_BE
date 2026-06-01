# 009 — Campo `title` en evidencia

| | |
|---|---|
| **Estado** | Implementado |
| **Servicio** | `evidence-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-30 |

> **Nota de numeración:** no existe documento `008-`. Esta feature se numeró `009` para alinearse
> con el ticket de origen; la numeración no se reutiliza.

---

## 1. Problema

Una evidencia tenía `description` (cuerpo largo) pero **no** un **título** corto. El FE añadió un
campo **Title** al formulario de registro/edición para distinguir un encabezado del cuerpo. Ejemplo:

- **Título:** `Testimonio de Juanito`
- **Descripción:** *(todo el testimonio, varios párrafos)*

El FE muestra `title` como encabezado en lista, cards y detalle, con **fallback a `description`**
cuando una evidencia antigua no tiene título.

## 2. Solución

Columna `title` (`varchar(200)`, **nullable**) en `evidence_db.evidence`; campo `title` opcional en
`CreateEvidenceDto` y `UpdateEvidenceDto`; se persiste y se devuelve en todas las lecturas. Nullable
para no romper evidencias existentes.

## 3. Contrato

```
POST /evidence            (Roles: ADMIN, DETECTIVE)
{
  "caseId": "<uuid>",
  "evidenceType": "TESTIMONIAL",
  "title": "Testimonio de Juanito",     // OPCIONAL en backend, ≤200; el FE lo trata como requerido
  "description": "<texto largo>",
  "currentCustodianId": "<uuid opcional>"
}
201 → Evidence (incluye "title", null si se omite)

PUT /evidence/:id         (Roles: ADMIN, DETECTIVE)
{ "evidenceType": "...", "title": "...", "description": "..." }   // todos opcionales
200 → Evidence actualizada
```

- `title`: `@IsOptional() @IsString() @MaxLength(200)`. Se eligió **opcional** en backend (por
  compatibilidad con otros clientes); el FE lo exige en su formulario.
- **Validación:** un `title` > 200 chars → `400`. Al estar whitelisted en el DTO, el
  `ValidationPipe` (`whitelist: true`) no lo descarta.
- **Retrocompatibilidad:** omitir `title` → `null`; evidencias antiguas siguen funcionando.
- Devuelto en `POST /evidence`, `PUT /evidence/:id`, `GET /evidence`, `GET /evidence/:id`,
  `GET /evidence?caseId=…`.

## 4. Implementación

### Archivos modificados
- `apps/evidence-service/src/evidence/evidence.entity.ts` — columna `title varchar(200) NULL`.
- `apps/evidence-service/src/evidence/dto/create-evidence.dto.ts` — `title?` (`@MaxLength(200)`).
- `apps/evidence-service/src/evidence/dto/update-evidence.dto.ts` — `title?` (`@MaxLength(200)`).
- `apps/evidence-service/src/evidence/evidence.service.ts` — `create` normaliza
  `title: dto.title ?? null` y lo incluye en el payload de `evidence.added`. (`update` ya persiste
  vía `Object.assign`.)
- `libs/events/src/evidence.events.ts` — `title?` en el payload de `EvidenceAddedEvent`.
- `apps/audit-service/src/audit/audit.service.ts` — `title` en el `newState` de `evidence.added`.

### Archivos nuevos
- `docker/postgres/migrations/002-evidence-add-title.sql` — `ALTER TABLE ... ADD COLUMN IF NOT
  EXISTS title varchar(200) NULL` (idempotente).
- `test/e2e/evidence-title.e2e-spec.ts` — E2E contra Postgres real.

### Migración / esquema
TypeORM `synchronize: true` (`NODE_ENV !== 'production'`) crea la columna sola en dev/test. Para
producción (`synchronize: false`), ejecutar la migración SQL idempotente antes de desplegar.

## 5. Pruebas

### Unit (`evidence.service.spec.ts`)
- `create` persiste `title` y lo incluye en `evidence.added`.
- `title = null` cuando se omite (retrocompatible).

### E2E (`test/e2e/evidence-title.e2e-spec.ts`, Postgres real)
- `POST` persiste y devuelve `title`; `GET /:id` lo trae.
- `PUT` actualiza `title`.
- Omitir `title` → `null`.
- `GET /evidence?caseId=` devuelve `title` en las filas.
- `title` > 200 chars → `400`.

## 6. Smoke manual

```bash
DET=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"detective1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

curl -s -X POST http://localhost:3000/evidence -H "Authorization: Bearer $DET" \
  -H 'Content-Type: application/json' \
  -d '{"caseId":"<uuid>","evidenceType":"TESTIMONIAL","title":"Testimonio de Juanito","description":"..."}' \
  | jq '{id, title}'
```

## 7. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.6 (columna `title`), §5.6 (`POST`/`PUT` bodies +
  respuesta), catálogo de eventos (`evidence.added` payload con `title?`).
- `docs/API_REFERENCE.md` — nota de `title` en Evidence.

## 8. Fuera de alcance
- No se hace `title` requerido en backend (queda opcional/whitelisted).
- No se añade fallback a `description` en el backend (es comportamiento del FE).
- No se añaden filtros/búsqueda por `title`.
