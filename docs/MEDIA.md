# AegisCase — Media Service

Gestión de archivos multimedia con almacenamiento en AWS S3. Los archivos NUNCA se guardan en PostgreSQL — solo la URL y los metadatos.

---

## Flujo de upload

```
Cliente → POST /media (multipart)
        → Gateway (proxy raw stream)
        → media-service
            1. Valida archivo (tamaño, MIME type)
            2. Genera S3 key: {folder}/{entityId}/{uuid}.{ext}
            3. Sube a S3 (AES256 server-side encryption)
            4. Guarda registro en media_db
            5. Publica MediaUploaded en RabbitMQ
            6. Retorna { id, url, ... }
```

Si S3 falla → 503, no se guarda nada en BD.
Si BD falla después de subir → rollback: elimina el archivo de S3.

---

## Variables de entorno requeridas

| Variable | Descripción | Default |
|----------|-------------|---------|
| `AWS_REGION` | Región de AWS | `us-east-1` |
| `AWS_S3_BUCKET` | Nombre del bucket | `aegiscase-media` |
| `AWS_ACCESS_KEY_ID` | Clave de acceso IAM | — |
| `AWS_SECRET_ACCESS_KEY` | Clave secreta IAM | — |
| `MAX_FILE_SIZE` | Tamaño máximo en bytes | `52428800` (50MB) |
| `ALLOWED_MIME_TYPES` | MIME types permitidos (coma) | ver `.env.example` |
| `MEDIA_SERVICE_URL` | URL del servicio (para gateway) | `http://localhost:3007` |

---

## Estructura de S3

```
{bucket}/
├── cases/{case_id}/{uuid}.pdf
├── evidence/{evidence_id}/{uuid}.jpg
├── tasks/{task_id}/{uuid}.mp4
├── involved-persons/{person_id}/{uuid}.png
└── users/{user_id}/{uuid}.jpg
```

Los archivos se guardan con UUID como nombre — nunca con el nombre original del usuario (previene path traversal y conflictos).

---

## API

Todos los endpoints requieren autenticación.

### `POST /media`

Sube un archivo y lo asocia a una entidad.

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `file` | File | El archivo a subir |
| `entity_type` | string | `CASE`, `EVIDENCE`, `TASK`, `INVOLVED_PERSON`, `USER` |
| `entity_id` | string | UUID de la entidad asociada |

**Roles:** ADMIN, DETECTIVE, ANALYST

**Response 201:**
```json
{
  "id": "uuid",
  "url": "https://aegiscase-media.s3.us-east-1.amazonaws.com/cases/...",
  "entityType": "CASE",
  "entityId": "uuid",
  "uploadedByUserId": "uuid",
  "originalFilename": "informe.pdf",
  "fileSize": 245760,
  "mimeType": "application/pdf",
  "s3Key": "cases/{entityId}/{uuid}.pdf",
  "createdAt": "2024-05-17T10:30:00.000Z"
}
```

---

### `GET /media/entity/:entityType/:entityId`

Lista todos los archivos de una entidad.

**Roles:** ADMIN, DETECTIVE, ANALYST

```bash
GET /media/entity/CASE/uuid-del-caso
```

---

### `GET /media/:id`

Obtiene los metadatos de un archivo.

**Roles:** ADMIN, DETECTIVE, ANALYST

---

### `GET /media/:id/download-url`

Genera una URL pre-firmada de S3 válida por 1 hora para descargar el archivo de forma segura.

**Roles:** ADMIN, DETECTIVE, ANALYST

**Response:**
```json
{
  "url": "https://aegiscase-media.s3.amazonaws.com/...?X-Amz-Signature=...",
  "expiresIn": 3600
}
```

> Los archivos son **privados** en S3. Siempre usa esta URL para acceder a ellos, nunca la URL directa del campo `url`.

---

### `DELETE /media/:id`

Soft delete — marca el registro como eliminado pero el archivo permanece en S3 (historial).

**Roles:** ADMIN

---

## MIME types permitidos por defecto

| Tipo | Extensión |
|------|-----------|
| `application/pdf` | .pdf |
| `image/png` | .png |
| `image/jpeg` | .jpg |
| `image/gif` | .gif |
| `image/webp` | .webp |
| `video/mp4` | .mp4 |
| `audio/mpeg` | .mp3 |
| `application/msword` | .doc |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | .docx |
| `text/plain` | .txt |

Configurable via `ALLOWED_MIME_TYPES` en `.env`.

---

## Seguridad

- Archivos **privados** en S3 (sin ACL pública)
- Encriptación server-side: `AES256` en cada upload
- Nombres UUID — nunca el nombre original del usuario
- Pre-signed URLs con expiración de 1 hora
- Validación de MIME type en el servidor (no confía en el cliente)

---

## Configuración AWS (lo que debes hacer manualmente)

Ver sección al final: **"Setup manual en AWS"**.

---

## Evento publicado

Cada upload exitoso publica `MediaUploaded` en RabbitMQ:

```json
{
  "event_type": "media.uploaded",
  "entity_type": "Media",
  "entity_id": "uuid-del-registro-media",
  "payload": {
    "url": "https://...",
    "entity_type": "CASE",
    "entity_id": "uuid-del-caso"
  }
}
```

Consumido por audit-service → genera registro `MEDIA_UPLOADED` en auditoría.

---

## Setup manual en AWS

### 1. Crear el bucket S3

1. Ve a **S3** en la consola de AWS
2. **Create bucket**
3. Nombre: `aegiscase-media` (o el que quieras — actualiza `.env`)
4. Región: `us-east-1`
5. **Block all public access**: ✅ activado
6. **Default encryption**: SSE-S3 activado
7. Crea el bucket

### 2. Crear usuario IAM

1. Ve a **IAM** → **Users** → **Create user**
2. Nombre: `aegiscase-media-service`
3. En **Permissions**: selecciona **Attach policies directly**
4. Crea una política inline con este JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::aegiscase-media/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::aegiscase-media"
    }
  ]
}
```

5. Crea el usuario

### 3. Generar Access Keys

1. En el usuario creado → **Security credentials**
2. **Create access key** → Application running outside AWS
3. Copia `Access key ID` y `Secret access key`
4. Agrégalos al `.env`:

```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=aegiscase-media
```

### 4. Verificar

Reinicia el media-service y prueba un upload. Si S3 responde correctamente verás en los logs:
```
[S3Service] Uploaded to S3: cases/{uuid}/{uuid}.pdf
```

---

## Troubleshooting

### Error "File storage service is unavailable"
- Verifica que `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` estén en `.env`
- Verifica que el bucket exista en la región correcta
- Verifica que el usuario IAM tenga los permisos correctos

### Error "MIME type not allowed"
- Revisa `ALLOWED_MIME_TYPES` en `.env`
- Asegúrate de que el cliente envíe el `Content-Type` correcto en la parte del archivo

### La URL de descarga no funciona
- La URL pre-firmada expira en 1 hora — genera una nueva con `GET /media/:id/download-url`
- Las URLs pre-firmadas no deben ser cacheadas
