# 007 — Custodia para descargar archivos de evidencia ("ver = log, descargar = custodia")

| | |
|---|---|
| **Estado** | Implementado (Cambios 1 y 2; Cambio 3 incluido en forma low-noise) |
| **Servicios** | `evidence-service`, `media-service`, `audit-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-30 |

---

## 1. Problema y decisión

Hoy los archivos (media) de una evidencia se ven y descargan libremente por cualquiera con
`evidence.read`, **sin rastro y sin importar la custodia** — el archivo es *el contenido real*
de la evidencia y estaba menos protegido que el registro (`GET /evidence/:id` ya transfiere
custodia y la registra en la cadena).

**Política elegida — Opción C ("ver = log, descargar = custodia"):**
- **Ver/previsualizar** media de evidencia → permitido con `evidence.read`, pero **se registra**
  como acceso (auditoría).
- **Descargar** media de evidencia → **solo el custodio actual**. Quien no lo sea debe **tomar la
  custodia** primero (acto deliberado que queda en la cadena).

> No es DRM: "ver" ya entrega los bytes. El objetivo es **trazabilidad y ceremonia de
> responsabilidad**, no impedir copiar. El valor está en el registro.

## 2. Solución (3 cambios)

### Cambio 1 — `PATCH /evidence/:id/take-custody` (evidence-service)
Endpoint dedicado de **auto-asignación** de custodia. A diferencia de `transfer-custody`
(ADMIN/DETECTIVE, requiere `newCustodianId`), aquí lo pueden llamar **los tres roles** y el caller
se asigna la custodia a sí mismo.

- **Efecto (atómico, en una transacción):** inserta fila en la cadena
  (`previousCustodianId` = anterior, `newCustodianId` = `transferredByUserId` = caller,
  `transferReason` = **`"Accessed evidence file"`** fija) y fija `currentCustodianId = caller`.
- **Idempotente:** si el caller ya es custodio → no inserta fila, no publica evento, devuelve la
  evidencia tal cual.
- **No cambia `evidenceStatus`** (consistente con el "view" custody change; mantiene el cambio
  acotado a custodia + cadena + auditoría).
- Publica `evidence.custody.accessed` **post-commit** (un fallo del broker no revierte la custodia).
- También se añadió `GET /evidence/:id/custodian` — lookup **sin efectos secundarios** de
  `{ evidenceId, currentCustodianId }`, para que media-service consulte la custodia sin invocar
  `GET /evidence/:id` (que transferiría custodia).

### Cambio 2 — Enforcement de descarga (media-service)
`GET /media/:id/download-url` ahora acepta `disposition` (`inline` | `attachment`, default
`attachment`) y `context` opcional.

- Si la media es de una **EVIDENCE** y `disposition=attachment` → media-service consulta el
  custodio vía `EvidenceCustodyClient` (`GET {EVIDENCE_SERVICE_URL}/evidence/:id/custodian`,
  reenviando el bearer del caller). Si `caller.sub !== currentCustodianId` → **`403 Forbidden`**
  *"You must hold custody of this evidence to download its files"*.
- Si es el custodio → emite la URL presignada `attachment` (con `Content-Disposition` y el
  `originalFilename`, codificado RFC 5987 para acentos).
- **Fail-safe:** un `disposition` desconocido/blank se trata como `attachment` (camino gated).
- **Fail-closed:** si el lookup de custodia falla, `503` (no se entrega URL).
- Otras entidades (CASE/TASK/INVOLVED_PERSON/USER) → sin cambios.

### Cambio 3 — Log de acceso al ver (media-service, low-noise)
Cuando se emite `GET /media/:id/download-url?disposition=inline&context=viewer` para media de
EVIDENCE, se publica `evidence.media.viewed` (audit `EVIDENCE_MEDIA_VIEWED`,
`{ evidence_id, media_id, userId }`). **Solo** se registra con `context=viewer` explícito; las
miniaturas de galería (sin `context`) **no** generan ruido. (El FE auto-presigna `inline` por cada
miniatura; por eso el gateo por flag explícito.)

## 3. Contratos

```
PATCH /evidence/:id/take-custody
Roles: ADMIN, DETECTIVE, ANALYST
Body: {} | { reason?: string }   (la razón de cadena la fija el backend)
200 → Evidence (currentCustodianId = caller, con custodyChain). 404 si no existe.

GET /evidence/:id/custodian
Roles: ADMIN, DETECTIVE, ANALYST
200 → { evidenceId, currentCustodianId | null }   (sin efectos). 404 si no existe.

GET /media/:id/download-url?disposition=inline|attachment&context=viewer
Roles: ADMIN, DETECTIVE, ANALYST  (+ gate de custodia para descargar archivos de EVIDENCE)
200 → { url, expiresIn: 3600 }
403 → si EVIDENCE + attachment + no-custodio
503 → si no se puede verificar la custodia
```

## 4. Implementación

### Eventos (`libs/events`)
- `event-patterns.ts`: `EVIDENCE_CUSTODY_ACCESSED = 'evidence.custody.accessed'`,
  `EVIDENCE_MEDIA_VIEWED = 'evidence.media.viewed'`.
- `evidence.events.ts`: `EvidenceCustodyAccessedEvent`, `EvidenceMediaViewedEvent`.

### evidence-service
- `dto/take-custody.dto.ts` — `TakeCustodyDto { reason? }`.
- `evidence.service.ts` — `takeCustody` (transaccional + idempotente, razón fija
  `EvidenceService.CUSTODY_ACCESS_REASON = "Accessed evidence file"`, publica post-commit) y
  `getCustodian` (side-effect-free).
- `events/event-publisher.service.ts` — `publishEvidenceCustodyAccessed`.
- `evidence.controller.ts` — `PATCH :id/take-custody`, `GET :id/custodian` (los tres roles).

### media-service
- `evidence-custody.client.ts` — `EvidenceCustodyClient` (HttpService → `/evidence/:id/custodian`,
  reenvía Authorization; fail-closed).
- `media.module.ts` — importa `HttpModule`, registra el cliente.
- `s3.service.ts` — `getPresignedUrl(key, expiresIn, { disposition, filename })` con
  `ResponseContentDisposition` (RFC 5987).
- `media.service.ts` — `getDownloadUrl(id, { disposition, context, actor, authHeader })` con el
  gate de custodia y el log de view.
- `events/event-publisher.service.ts` — `publishEvidenceMediaViewed`.
- `media.controller.ts` — `download-url` con `@Query('disposition')`, `@Query('context')`,
  `@CurrentUser()`, `@Headers('authorization')`.

### audit-service
- `ACTION_MAP` + `mapStates` para `evidence.custody.accessed` y `evidence.media.viewed`.

### Gateway
Sin cambios. `@All('evidence*')` / `@All('media*')` proxyean método + query string + Authorization;
las rutas nuevas y los query params (`disposition`, `context`) pasan por el wildcard.

## 5. Pruebas

### Unit
- `evidence.service.spec.ts`: take-custody escribe fila con razón fija + update + evento;
  idempotente (ya custodio → sin fila/evento); 404; `getCustodian` sin efectos.
- `media.service.spec.ts`: download de EVIDENCE no-custodio → 403; custodio → URL con
  `disposition=attachment` + filename; disposition desconocido → gated (403); inline no chequea
  custodia; `context=viewer` publica `evidence.media.viewed`; inline sin viewer no publica
  (guard de miniaturas); media no-EVIDENCE no se gatea.

### E2E (`test/e2e/evidence-take-custody.e2e-spec.ts`, Postgres real)
- ANALYST toma custodia → 200 + fila `"Accessed evidence file"` (`previous=detective`,
  `new=analyst`); idempotencia (sin fila nueva); `GET :id/custodian` no escribe; 404.

> El gateo de media (Cambio 2) cruza HTTP a evidence-service; se cubre con unit (cliente mockeado).
> El primitivo de custodia (Cambio 1) se valida E2E contra Postgres real. Subir a S3 real no se
> ejercita en E2E (requiere AWS).

## 6. Smoke manual

```bash
ANALYST=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"analyst1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

# No custodio → 403 al intentar descargar
curl -i -H "Authorization: Bearer $ANALYST" \
  "http://localhost:3000/media/<mediaId>/download-url?disposition=attachment"

# Tomar custodia (queda en la cadena con "Accessed evidence file")
curl -i -X PATCH -H "Authorization: Bearer $ANALYST" \
  "http://localhost:3000/evidence/<evidenceId>/take-custody"

# Ahora sí: 200 con URL presignada attachment
curl -s -H "Authorization: Bearer $ANALYST" \
  "http://localhost:3000/media/<mediaId>/download-url?disposition=attachment" | jq
```

## 7. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.6 (takeCustody/getCustodian), §5.6 (endpoints),
  §5.8 (gate de descarga + disposition/context), catálogo de eventos, action map de auditoría,
  matrices de permisos (§4 y §11).
- `docs/API_REFERENCE.md` — tablas Evidence y Media.
- `docs/EVENTS.md` — `EvidenceCustodyAccessed`, `EvidenceMediaViewed`.
- `libs/auth/src/permissions.reference.ts` — `evidence.takeCustody/readCustodian`,
  `media.downloadEvidenceFile`.

## 8. Fuera de alcance / decisiones
- No se modifica `evidenceStatus` en take-custody (cambio acotado a custodia/cadena/auditoría).
- Se eligió un endpoint dedicado en vez de permitir `transfer-custody` con `newCustodianId=self`
  (más claro y auditable).
- Cambio 3 se entrega en forma low-noise (flag `context=viewer`); puede afinarse a de-dup por
  ventana si se prefiere.
