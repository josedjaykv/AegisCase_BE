# 006 — Descripción y nombre personalizado en la subida de media

| | |
|---|---|
| **Estado** | Implementado |
| **Servicio** | `media-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-30 |

---

## 1. Problema

Al subir un archivo a una entidad (CASE / EVIDENCE / TASK / INVOLVED_PERSON), el FE
ahora abre un diálogo donde la persona puede (1) **renombrar** el archivo a algo
legible (p. ej. de `100393.jpg` a `Cámara frontal edificio.jpg`) y (2) escribir una
**descripción** libre.

El contrato previo de `POST /media` (multipart) solo aceptaba `file`, `entity_type`,
`entity_id`. **No existía** campo de descripción, y había que confirmar que el nombre
visible (`originalFilename`) se guardaba tal cual lo manda el FE.

## 2. Solución

Dos cambios, uno real y uno de verificación:

- **Descripción (nuevo).** Columna `description` (`text`, nullable) en
  `media_db.media`; campo de formulario multipart opcional `description` en
  `POST /media`; se persiste y se devuelve en todas las lecturas de media.
- **Nombre personalizado (verificado, sin cambios de código).** El servicio ya
  guardaba `originalFilename = file.originalname` —el `filename` de la parte
  multipart— **tal cual**. El renombrado del FE funciona automáticamente; no hizo
  falta añadir un campo `original_filename` explícito.

## 3. Contrato

```
POST /media   (multipart/form-data)
Roles: ADMIN, DETECTIVE, ANALYST  (sin cambios)

  file          = <binario>   ; filename = "<nombre elegido>" → originalFilename (verbatim)
  entity_type   = CASE | TASK | EVIDENCE | INVOLVED_PERSON | USER
  entity_id     = <uuid>
  description   = <texto>      ; OPCIONAL, ≤1000 chars (solo si no está vacío)

201 → entidad Media, incluyendo "description" (null si no se envió).
```

Lecturas que ahora incluyen `description`:
- `POST /media` (201)
- `GET /media/:id`
- `GET /media/entity/:entityType/:entityId` (array crudo)

**Validación:** `description` → `@IsOptional() @IsString() @MaxLength(1000)`. El
`ValidationPipe` corre con `whitelist: true` (sin `forbidNonWhitelisted`), así que
campos no listados se **descartan** en lugar de rechazarse; al estar `description`
en el DTO, queda whitelisted y los uploads con descripción **no** dan `400`.

**Retrocompatibilidad:** subir sin `description` funciona igual que antes →
`description = NULL`.

## 4. Implementación

### Archivos modificados
- `apps/media-service/src/media/media.entity.ts` — columna `description text NULL`.
- `apps/media-service/src/media/dto/upload-media.dto.ts` — campo `description?`
  (`@IsOptional() @IsString() @MaxLength(1000)`).
- `apps/media-service/src/media/media.service.ts` — persiste `description:
  dto.description ?? null`; incluye `description` en el payload de `media.uploaded`.
- `libs/events/src/media.events.ts` — `description?` opcional en el payload de
  `MediaUploadedEvent`.
- `apps/audit-service/src/audit/audit.service.ts` — `description` en el `newState`
  de `media.uploaded`.

### Archivos nuevos
- `apps/media-service/src/media/media.service.spec.ts` — unit del upload.
- `docker/postgres/migrations/001-media-add-description.sql` — `ALTER TABLE ... ADD
  COLUMN IF NOT EXISTS description text NULL` (idempotente).

### Migración / esquema
El proyecto usa TypeORM `synchronize: true` cuando `NODE_ENV !== 'production'`
(`libs/database/src/database.module.ts`), así que en dev/test la columna se crea
sola. Para producción (`synchronize: false`) se incluye la migración SQL idempotente
de arriba; ejecútala antes de desplegar el media-service actualizado.

### `s3Key` y extensión (sin cambios)
El `s3Key` se sigue generando como `<folder>/<entity_id>/<uuid>.<ext>`. El `<ext>`
se deriva del **MIME real (magic bytes)** vía la librería `file-type`, no del nombre
editable — el renombrado solo afecta el nombre visible (`originalFilename`), nunca la
clave de S3.

## 5. Pruebas

### Unit (`media.service.spec.ts`)
- Persiste `description` cuando viene.
- `description = null` cuando se omite (retrocompatible).
- Guarda el `filename` multipart verbatim como `originalFilename` (renombrado).
- Incluye `description` en el payload de `media.uploaded`.

> Nota: la librería `file-type` es ESM-only y se importa dinámicamente; el spec la
> mockea (`fileTypeFromBuffer → undefined`) y usa un archivo `text/plain` para que la
> validación pase sin red ni S3.

## 6. Smoke manual

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"detective1@aegiscase.com","password":"<pw>"}' | jq -r .access_token)

curl -s -X POST http://localhost:3000/media \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/path/to/100393.jpg;filename=Cámara frontal edificio.jpg' \
  -F 'entity_type=EVIDENCE' \
  -F 'entity_id=<uuid>' \
  -F 'description=Video que muestra un fragmento de la cámara frontal del edificio' | jq '{originalFilename, description}'

# Sin descripción → sigue funcionando, description = null
curl -s -X POST http://localhost:3000/media \
  -H "Authorization: Bearer $TOKEN" \
  -F 'file=@/path/to/doc.pdf' -F 'entity_type=CASE' -F 'entity_id=<uuid>' | jq '.description'
```

## 7. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.9 (columna `description` + nota de
  `originalFilename` verbatim) y §5.8 (campo de formulario `description`, ejemplo).
- `docs/API_REFERENCE.md` — campos de `POST /media`.

## 8. Fuera de alcance
- No se añade un campo `original_filename` explícito: el filename de la parte
  multipart ya basta (el backend lo guarda tal cual).
- No se cambia la generación del `s3Key` ni la validación por magic bytes.
- No se hace `description` requerida ni editable post-subida (no hay `PATCH /media`).
