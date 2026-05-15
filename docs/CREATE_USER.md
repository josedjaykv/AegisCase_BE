# Crear un nuevo usuario en AegisCase

El sistema tiene dos capas: **Keycloak** maneja el login/autenticación, y **user-service** guarda el perfil operacional. Ambos pasos son obligatorios.

---

## Paso 1 — Crear el usuario en Keycloak

Ve a la consola de administración: **http://localhost:8080**

- Usuario: `admin` / Contraseña: `admin`

1. Selecciona el realm **aegiscase** (menú superior izquierdo)
2. Ve a **Users** → **Create new user**
3. Llena:
   - **Username**: `usuario@aegiscase.com`
   - **Email**: `usuario@aegiscase.com`
   - **Email verified**: ON
4. Clic en **Create**
5. Ve a la pestaña **Credentials** → **Set password** → pon la contraseña → desactiva "Temporary" → **Save**
6. Ve a la pestaña **Role mapping** → **Assign role** → selecciona el rol (`ADMIN`, `DETECTIVE`, o `ANALYST`) → **Assign**

---

## Paso 2 — Obtener el token del nuevo usuario

```bash
NEW_TOKEN=$(curl -sf -X POST http://localhost:8080/realms/aegiscase/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=aegiscase-backend&client_secret=aegiscase-backend-secret&username=usuario@aegiscase.com&password=TuPassword123!" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token OK: ${NEW_TOKEN:0:20}..."
```

---

## Paso 3 — Obtener el Keycloak ID (`sub`)

> **Importante:** No uses el endpoint `/userinfo` de Keycloak — el cliente `aegiscase-backend` no tiene el scope `openid` configurado y devuelve 403. Decodifica el JWT directamente:

```bash
KC_ID=$(echo $NEW_TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['sub'])")
echo "Keycloak ID: $KC_ID"
```

Si ya tienes el token copiado y no quieres usar la variable `$NEW_TOKEN`, pégalo directamente:

```bash
KC_ID=$(echo "eyJ..." | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['sub'])")
echo "Keycloak ID: $KC_ID"
```

---

## Paso 4 — Crear el perfil en el user-service

Usa el token de un admin existente (`$ADMIN_TOKEN`) para hacer la llamada:

```bash
curl -s -X POST http://localhost:3000/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"keycloakUserId\": \"$KC_ID\",
    \"firstNames\": \"Nombre\",
    \"lastNames\": \"Apellido\",
    \"document\": \"DOC-XXX\",
    \"role\": \"ADMIN\"
  }" | python3 -m json.tool
```

Cambia `role` según corresponda: `ADMIN`, `DETECTIVE`, o `ANALYST`.

---

## Roles disponibles

| Rol | Descripción |
|-----|-------------|
| `ADMIN` | Acceso completo al sistema |
| `DETECTIVE` | Gestión operacional de investigaciones |
| `ANALYST` | Soporte a investigaciones, solo lectura/actualización |

---

## Notas

- El `document` debe ser único en el sistema
- El `keycloakUserId` debe coincidir exactamente con el `sub` del JWT de Keycloak
- El rol en Keycloak (Paso 1) y el rol en user-service (Paso 4) deben ser el mismo
- Si el `NEW_TOKEN` expira (5 minutos por defecto), repite el Paso 2 antes de continuar
