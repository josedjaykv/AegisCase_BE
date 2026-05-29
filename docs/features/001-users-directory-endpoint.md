# 001 — `GET /users/directory`: resolución de Keycloak subs a nombres (todos los roles)

| | |
|---|---|
| **Estado** | Implementado |
| **Servicio** | `user-service` (proxied vía `api-gateway`) |
| **Rama** | `userService-keycloak` |
| **Fecha** | 2026-05-29 |

---

## 1. Problema

El frontend necesita mostrar a las personas por **nombre** (miembros del equipo de un
caso, líder del caso, y más adelante responsables de tareas / custodios de evidencia) en
lugar de mostrar los UUID crudos de Keycloak (`sub`), sin importar **quién** esté viendo el
caso.

La única vía existente para resolver un `sub` a datos de usuario era
`GET /users/by-keycloak-ids`, que:

- es **ADMIN-only**, y
- devuelve la entidad `User` completa, **incluyendo PII** (`document`, `birthDate`,
  `jobTitle`).

Un detective o analista no puede (ni debe) recibir ese payload solo para pintar el nombre
de un compañero.

## 2. Decisión

Se crea una **ruta nueva e independiente** con una proyección mínima, en vez de ampliar la
ruta existente. Las dos rutas conviven:

| Ruta | Roles | Devuelve | Razón |
|---|---|---|---|
| `GET /users/by-keycloak-ids` (existente, **sin cambios**) | ADMIN | `User[]` completo (incl. `document`, `birthDate`, `jobTitle`) | Tooling interno/admin (auth-service) necesita el `id` de user-service |
| `GET /users/directory` (**nueva**) | cualquier rol autenticado | `{ keycloakUserId, firstNames, lastNames, role }[]` | Todos en el sistema necesitan identificar compañeros por nombre sin ver PII |

> **Por qué no ampliar la ruta existente:** una respuesta cuyo *shape* depende del rol del
> que llama rompe contratos, rompe el caching, y queda a un `if` mal puesto de filtrar PII.
> Los contratos se mantienen separados.

## 3. Contrato del endpoint

```
GET /users/directory?ids=<sub1>,<sub2>,...
Authorization: Bearer <token>

Roles: cualquier usuario autenticado (ADMIN, DETECTIVE, ANALYST).

Query params:
  ids   string, requerido. Lista de `sub` (UUID de Keycloak) separados por coma.
        Cada id se valida como UUID. Tope duro de 100 ids por llamada.

200 OK →
[
  {
    "keycloakUserId": "<sub>",
    "firstNames":     "<string>",
    "lastNames":      "<string>",
    "role":           "ADMIN" | "DETECTIVE" | "ANALYST"
  },
  ...
]
```

- La respuesta incluye **solo** las entradas que coinciden con una fila en
  `user_db.users`. Los `sub` desconocidos se omiten silenciosamente (**no 404**); el FE
  muestra el `sub` crudo como fallback.
- La respuesta incluye **solo** los cuatro campos anteriores. Sin `id`, sin `document`, sin
  `birthDate`, sin `jobTitle`, sin timestamps.

### Errores

| Código | Mensaje | Cuándo |
|---|---|---|
| `400` | `ids is required` | `ids` ausente o vacío |
| `400` | `ids must be comma-separated UUIDs` | algún id no es UUID |
| `400` | `Cannot resolve more than 100 ids per call` | más de 100 ids |
| `401` | (guard existente) | token ausente o inválido |

Sin eventos, sin auditoría, sin headers de caching. Solo lectura, sin efectos secundarios.

## 4. Implementación

### Archivos nuevos
- `apps/user-service/src/users/dto/directory-query.dto.ts` — DTO de la query (solo para
  Swagger). La validación estricta vive en el controlador para que los mensajes 400 sean
  exactamente los del contrato público.
- `apps/user-service/src/users/dto/user-directory-entry.dto.ts` — DTO de respuesta. Clase
  con `@Exclude()` y `@Expose()` explícito en los cuatro campos permitidos.

### Archivos modificados
- `apps/user-service/src/users/users.service.ts` — método
  `findDirectoryByKeycloakIds()` con proyección TypeORM
  `select: { keycloakUserId, firstNames, lastNames, role }` (la PII nunca se carga en
  memoria) **y** `plainToInstance(UserDirectoryEntryDto, rows, { excludeExtraneousValues: true })`.
- `apps/user-service/src/users/users.controller.ts` — ruta `GET /users/directory`,
  **sin `@Roles`** (solo el `JwtAuthGuard` global), declarada **antes** de `:id` para que el
  literal `directory` no sea capturado como parámetro de ruta (misma restricción que ya
  tenía `by-keycloak-ids`).

### Gateway
Sin cambios. `service-proxy.controller.ts` ya enruta `users*` a user-service con
passthrough de `Authorization` y sin `@Roles` en el borde.

### Defensa en profundidad (anti fuga de PII)
Tres capas independientes garantizan que solo salgan los cuatro campos:
1. `select` de TypeORM — la PII ni siquiera se lee de la base de datos.
2. `@Exclude()` en el DTO de respuesta — cualquier columna nueva que se agregue a `User` en
   el futuro queda excluida por defecto.
3. `excludeExtraneousValues: true` al transformar — descarta cualquier campo no `@Expose`'d
   aunque el repositorio devolviera una fila completa por accidente.

## 5. Pruebas

### Unit (`apps/user-service/src/users/users.service.spec.ts`)
- input vacío → `[]` sin tocar el repo;
- subs desconocidos → `[]` (no 404);
- mezcla conocido/desconocido → solo las conocidas;
- forma de la query (`In(...)` + `select` mínimo);
- **leak guard:** `Object.keys(entry).sort()` === `['firstNames','keycloakUserId','lastNames','role']`.

### E2E (`test/e2e/user-directory.e2e-spec.ts`)
- 200 con `toEqual` (deep-equal) para tokens ADMIN, DETECTIVE y ANALYST;
- subs desconocidos omitidos;
- 401 sin token;
- 400 para `ids` ausente / vacío / no-UUID / > 100, cada uno con su mensaje;
- **regresión:** `GET /users/by-keycloak-ids` sigue siendo ADMIN-only (403 para
  DETECTIVE/ANALYST) y sigue devolviendo el payload completo con `id`.

## 6. Smoke manual

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@aegiscase.com","password":"Admin1234!"}' | jq -r .access_token)

SUBS='<sub1>,<sub2>'

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/users/directory?ids=$SUBS" | jq

# Guard de claves — deben ser exactamente las 4 permitidas
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/users/directory?ids=$SUBS" \
  | jq '.[0] | keys | sort'
# Esperado: ["firstNames","keycloakUserId","lastNames","role"]
```

## 7. Documentación relacionada actualizada

- `docs/BACKEND_INVESTIGATION_REPORT.md` §5.3 — sub-sección nueva + cross-reference en
  `by-keycloak-ids`.
- `docs/API_REFERENCE.md` — tabla de Users con ambas rutas.
- `apps/user-service/README.md` — tabla de rutas y la razón de mantenerlas separadas.
- `libs/auth/src/permissions.reference.ts` — `user.readDirectory` (todos los roles) y
  `user.readByKeycloakIds` (ADMIN).

## 8. Fuera de alcance

- No se amplía `GET /users/by-keycloak-ids` (contrato intacto).
- No se agregan rutas `directory` análogas en otros servicios (cases, tasks, evidence) —
  ticket aparte.
- No se incrustan nombres en los payloads de case/task/evidence.
- No se cambia el estilo del parámetro (`?ids=a,b,c`).
- No se agrega helper de un solo id (`GET /users/directory/:sub`).
