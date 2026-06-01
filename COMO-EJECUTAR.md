# Cómo ejecutar AegisCase (sistema completo en Docker)

Guía para levantar **todo el sistema** (backend + frontend + infraestructura) con Docker.

---

## 1. Requisitos previos

- **Docker** y **Docker Compose** instalados (Docker Desktop en Windows/Mac ya los incluye).
- No hace falta instalar Node, PostgreSQL, etc.: todo corre en contenedores.

## 2. Estructura de carpetas (importante)

Los **dos repositorios** deben estar **al mismo nivel** (carpetas hermanas), porque el backend
construye el frontend desde `../AegisCase_FE`:

```
una-carpeta/
├── AegisCase_BE/     ← backend (acá está el docker-compose.yml)
└── AegisCase_FE/     ← frontend (rama con el Dockerfile, p. ej. phase_10)
```

> Cloná **ambos** repos en la misma carpeta contenedora. Verificá que la carpeta del FE se llame
> exactamente `AegisCase_FE`.

## 3. Levantar todo

Desde una terminal **dentro de `AegisCase_BE`**:

```bash
# 1) Construir las imágenes (secuencial: evita errores de red por npm)
COMPOSE_PARALLEL_LIMIT=1 docker compose build

# 2) Arrancar todo el sistema
docker compose up -d
```

- La **primera vez tarda varios minutos** (compila 9 servicios del backend + el frontend y arranca
  Keycloak ~1 min).
- No se necesita ningún archivo `.env`: el `docker-compose.yml` ya trae valores por defecto que
  funcionan para desarrollo local.

### Ver que todo esté arriba
```bash
docker compose ps
```
Todos los servicios deben figurar `Up` (Postgres, RabbitMQ y Keycloak como `healthy`).

## 4. Acceder al sistema

| Componente | URL |
|---|---|
| **Frontend (la app)** | http://localhost:4200 |
| API Gateway | http://localhost:3000 |
| Documentación API (Swagger) | http://localhost:3000/api/docs |
| Consola RabbitMQ | http://localhost:15672 (`aegiscase` / `aegiscase`) |
| Consola Keycloak | http://localhost:8080 (`admin` / `admin`) |

## 5. Usuarios de prueba (ya cargados)

| Rol | Email | Contraseña |
|---|---|---|
| Administrador | `admin@aegiscase.com` | `Admin1234!` |
| Detective | `detective@aegiscase.com` | `Detective1234!` |
| Analista | `analyst@aegiscase.com` | `Analyst1234!` |

Entrá a http://localhost:4200 e iniciá sesión con cualquiera de ellos.

## 6. Apagar el sistema

```bash
docker compose down          # detiene y elimina los contenedores
docker compose down -v       # además borra los datos (Postgres, etc.) para empezar de cero
```

---

## Notas

- **Carga de archivos (multimedia):** la subida de archivos usa AWS S3. Sin credenciales de AWS, esa
  función puntual no estará disponible, pero **el resto del sistema funciona** normalmente. (Las
  credenciales se configuran con `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.)
- **Solo para desarrollo/evaluación:** las contraseñas y secretos por defecto son de prueba; no usar
  esta configuración en producción.
- Si el build falla por **timeout de npm**, volvé a correr el paso 1 (la red estaba saturada; al
  reintentar usa la caché y termina rápido).
