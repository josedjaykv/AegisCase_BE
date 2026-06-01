# 011 — Summary de evidencia de solo lectura (reload / deep-link)

| | |
|---|---|
| **Estado** | Implementado (backend) |
| **Servicio** | `evidence-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-31 |

> Contraparte backend del FE `docs/features/feature-011-...` y del prompt
> `docs/phases/phase-5/backend-prompt-evidence-readonly-summary.md`.

---

## 1. Problema (causa raíz)

`GET /evidence/:id` **muta** (registra al visor como custodio + agrega una fila a la cadena de
custodia), así que el FE nunca lo llama automáticamente. La página de detalle deriva su summary de
**solo lectura** de una query de **lista cacheada**. En un reload / deep-link no hay lista cacheada
ni registro "viewed" → `viewed ?? cached` es `undefined` → mensaje placeholder *"A read-only summary
isn't cached for this item…"*. **No existía** un GET single de solo lectura para el fallback.

## 2. Solución

Nuevo endpoint **`GET /evidence/:id/summary`** — devuelve la evidencia (mismos campos que una fila
de la lista), **sin efectos secundarios**: no registra view, no toca la cadena de custodia, no emite
eventos. Legible por los tres roles; `404` si no existe.

El FE lo usa solo cuando no hay nada en cache (`enabled: !viewed && !cached`) y degrada con
elegancia (`retry: false`): antes de este backend, un `404` dejaba el mensaje original sin
regresión.

## 3. Contrato

```
GET /evidence/:id/summary        (Roles: ADMIN, DETECTIVE, ANALYST)
200 → Evidence (mismos campos que una fila de `GET /evidence`; SIN `custodyChain`)
404 → si la evidencia no existe
401 → sin token

Garantía: NO cambia `currentCustodianId` ni agrega filas a la cadena de custodia.
```

## 4. Implementación

### Archivos modificados
- `apps/evidence-service/src/evidence/evidence.service.ts` — `getSummary(id)`: `findOne({ where:
  { id } })` (sin relaciones), `404` si falta. Sin writes, sin eventos.
- `apps/evidence-service/src/evidence/evidence.controller.ts` — `GET :id/summary` (los tres roles),
  declarado junto a `:id/custodian` (sub-segmento estático; no lo sombrea `@Get(':id')`).
- `libs/auth/src/permissions.reference.ts` — `evidence.readSummary`.

### Sin cambios
- `GET /evidence/:id` (mutante) intacto — el guardrail se preserva; el summary es un endpoint
  **separado** y side-effect-free.
- Gateway: `@All('evidence*')` ya enruta la ruta nueva; sin cambios.

### Diferencia con endpoints cercanos
- `GET /evidence/:id` → muta (view = custodia) y embebe `custodyChain`.
- `GET /evidence/:id/summary` → **no muta**, **sin** `custodyChain` (forma de fila de lista).
- `GET /evidence/:id/chain-of-custody` → solo el historial (no la entidad).

## 5. Pruebas

### Unit (`evidence.service.spec.ts`)
- `getSummary` hace `findOne({ where: { id } })` (sin relaciones), no llama `save`/`insert` ni
  publica eventos; `404` cuando falta.

### E2E (`test/e2e/evidence-summary.e2e-spec.ts`, Postgres real)
- Devuelve los campos de lista (incl. `title`), sin `custodyChain`.
- **Sin efecto secundario:** 3 lecturas de un no-custodio no agregan filas a la cadena y el
  `currentCustodianId` no cambia (el GET mutante sí lo habría cambiado).
- Legible por los tres roles; `404` desconocido; `401` sin token.

## 6. Smoke manual

```bash
ANALYST=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"analyst1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

# 200 sin registrar "Viewed by user" en la cadena
curl -s -H "Authorization: Bearer $ANALYST" \
  "http://localhost:3000/evidence/<id>/summary" | jq '{id, title, currentCustodianId}'
curl -s -H "Authorization: Bearer $ANALYST" \
  "http://localhost:3000/evidence/<id>/chain-of-custody" | jq 'length'   # no aumenta
```

## 7. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.6 (`getSummary`), §5.6 (`GET /evidence/:id/summary`),
  matrices de permisos (§4 y §11), notas de "read-only" (§7 flujo, §17).
- `docs/API_REFERENCE.md` — tabla Evidence + regla read-only.
- `libs/auth/src/permissions.reference.ts` — `evidence.readSummary`.

## 8. Fuera de alcance
- No se cambia `GET /evidence/:id` (sigue mutando; el guardrail se mantiene).
- El summary no embebe `custodyChain` (usar `GET /evidence/:id/chain-of-custody` para el historial).
- No se pagina ni se filtra (es un single-GET por id).
