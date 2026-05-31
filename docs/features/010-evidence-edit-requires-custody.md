# 010 — Editar evidencia exige custodia

| | |
|---|---|
| **Estado** | Implementado |
| **Servicios** | `evidence-service`, `audit-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-31 |

> Contraparte backend de `docs/features/feature-010-evidence-edit-requires-custody.md` (FE).

---

## 1. Contexto y decisión

Por seguridad y confidencialidad de la evidencia, **solo el custodio actual puede editarla** — la
misma política que ya aplica a la **descarga** de archivos de evidencia (Opción C / Feature 007):
quien no es custodio debe **tomar la custodia** primero (acto deliberado que queda en la cadena de
custodia y, por tanto, en el audit).

El FE ya implementó el lado cliente (confirmación → `take-custody` → formulario de edición), pero el
gating del FE **no es seguridad**: el backend debe hacerlo cumplir.

## 2. Cambio — enforcement de la edición

`PUT /evidence/:id`:

- Si `caller.sub !== currentCustodianId` → **`403 Forbidden`** *"You must hold custody of this
  evidence to edit it"*.
- Aplica a **todos los roles que pueden editar (ADMIN, DETECTIVE)** — ni siquiera un ADMIN edita sin
  ser custodio; debe tomar la custodia primero (consistente con la descarga).
- Si es el custodio → procede normal.
- Alcance: **solo `PUT /evidence/:id`**. `take-custody`, `transfer-custody` y `archive` no se gatean
  con esta regla.

Flujo del usuario: no-custodio → `PATCH /evidence/:id/take-custody` (se vuelve custodio + fila en la
cadena, ya auditado) → `PUT /evidence/:id` (ahora `200`).

## 3. Auditoría

- **Toma de custodia (ya existente):** `take-custody` escribe la fila `"Accessed evidence file"` en
  la cadena y emite `evidence.custody.accessed` → Audit lo registra como `EVIDENCE_CUSTODY_ACCESSED`
  (quién y cuándo tomó la custodia para editar).
- **Edición (nuevo, recomendado e implementado):** `PUT /evidence/:id` ahora emite
  **`evidence.updated`**, registrado en Audit como **`EVIDENCE_UPDATED`**. El `newState` incluye
  **solo los campos editados** (`title`, `description`, `evidence_type`, `evidence_status`) + `case_id`
  y `updated_by_user_id` — el "quién editó qué", además del "quién tomó la custodia".

## 4. Contrato

```
PUT /evidence/:id          (Roles: ADMIN, DETECTIVE — además, custodio actual)
Body (UpdateEvidenceDto, todos opcionales): evidenceType?, title?, description?, evidenceStatus?

200 → Evidence actualizada
403 → si el caller no es el custodio actual ("You must hold custody of this evidence to edit it")
404 → si la evidencia no existe   (se comprueba antes del gate de custodia)
```

Evento publicado al editar:
```
evidence.updated  →  audit EVIDENCE_UPDATED
payload: { case_id, updated_by_user_id, changes: { title?, description?, evidence_type?, evidence_status? } }
```

## 5. Implementación

### Archivos modificados
- `apps/evidence-service/src/evidence/evidence.service.ts` — `update` ahora: (1) `404` si no
  existe, (2) **`403` si no es custodio**, (3) aplica el patch, (4) publica `evidence.updated` con
  los campos efectivamente enviados.
- `apps/evidence-service/src/events/event-publisher.service.ts` — `publishEvidenceUpdated`.
- `libs/events/src/event-patterns.ts` — `EVIDENCE_UPDATED = 'evidence.updated'`.
- `libs/events/src/evidence.events.ts` — `EvidenceUpdatedEvent`.
- `apps/audit-service/src/audit/audit.service.ts` — `ACTION_MAP['evidence.updated'] =
  'EVIDENCE_UPDATED'` + `mapStates` (newState con los cambios).

### Sin cambios
- `take-custody` (Feature 007) ya permite la auto-asignación a los tres roles — es el desbloqueo.
- Gateway: `@All('evidence*')` proxyea método + body + Authorization; sin cambios.
- El orden importa: **NotFound antes que Forbidden** (un id inexistente da `404`, no `403`).

## 6. Pruebas

### Unit (`evidence.service.spec.ts`)
- No-custodio (incl. ADMIN) → `403`, sin `save` ni evento.
- Custodio edita → `200` + `evidence.updated` con **solo** los campos cambiados.
- `404` cuando no existe.

### E2E (`test/e2e/evidence-edit-custody.e2e-spec.ts`, Postgres real)
- ADMIN no-custodio → `403` (mensaje contiene "custody").
- El custodio (detective) edita → `200`.
- **Flujo completo:** ADMIN bloqueado → `take-custody` → ya puede editar; la cadena contiene la fila
  `"Accessed evidence file"` (rastro de auditoría).
- `404` para id desconocido.

## 7. Smoke manual

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@aegiscase.com","password":"Admin1234!"}' | jq -r .access_token)

# 403 si el ADMIN no es custodio
curl -i -X PUT "http://localhost:3000/evidence/<id>" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"title":"nuevo"}'

# Tomar custodia (queda en la cadena/audit) y reintentar → 200
curl -s -X PATCH "http://localhost:3000/evidence/<id>/take-custody" -H "Authorization: Bearer $ADMIN" >/dev/null
curl -i -X PUT "http://localhost:3000/evidence/<id>" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' -d '{"title":"nuevo"}'
```

## 8. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.6 (regla `update`), §5.6 (`PUT /evidence/:id` gate +
  evento), catálogo de eventos (`evidence.updated`), action map de auditoría, matrices de permisos
  (§4 y §11), nota de §17 (ahora `evidence.updated` sí se publica).
- `docs/API_REFERENCE.md` — tabla Evidence + reglas.
- `docs/EVENTS.md` — `EvidenceUpdated`.

## 9. Fuera de alcance
- No se gatean `transfer-custody`, `take-custody` ni `archive` con esta regla (solo `PUT`).
- No se captura `previousState` en `evidence.updated` (solo los campos nuevos); puede añadirse luego.
