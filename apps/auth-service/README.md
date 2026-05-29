# auth-service

Authentication and authorization for AegisCase. Wraps Keycloak for login/refresh/logout and
exposes token introspection (`/auth/me`, `/auth/validate`). All routes are reached through the
API gateway under the `/auth/*` prefix.

## Routes

| Method | Path                   | Auth         | Purpose                                                        |
|--------|------------------------|--------------|----------------------------------------------------------------|
| POST   | `/auth/login`          | public       | Exchange email/password for Keycloak tokens                    |
| POST   | `/auth/refresh`        | public       | Refresh access token                                           |
| POST   | `/auth/logout`         | public       | Invalidate refresh token                                       |
| GET    | `/auth/me`             | Bearer       | Current JWT payload                                            |
| POST   | `/auth/validate`       | Bearer       | Validate a token                                               |
| GET    | `/auth/keycloak-users` | Bearer ADMIN | Search Keycloak users + their AegisCase provisioning status    |

## Environment

| Var                       | Default                     | Used by                                  |
|---------------------------|-----------------------------|------------------------------------------|
| `KEYCLOAK_URL`            | `http://localhost:8080`     | login/refresh + admin API base           |
| `KEYCLOAK_REALM`          | `aegiscase`                 | realm in all Keycloak URLs               |
| `KEYCLOAK_CLIENT_ID`      | `aegiscase-backend`         | login (password grant) **and** admin API |
| `KEYCLOAK_CLIENT_SECRET`  | `aegiscase-backend-secret`  | login **and** admin API                  |
| `USER_SERVICE_URL`        | `http://localhost:3002`     | provisioning-status lookup               |

### `GET /auth/keycloak-users` — admin service-account requirement

This route calls the **Keycloak admin REST API**, authenticating with the **service account** of
the same confidential client used for login (`client_credentials` grant against
`KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET`). It never uses the caller's bearer token against
the admin API.

For it to work, that client's service account must have the realm-management read roles
**`view-users`** (and `query-users`) on the `aegiscase` realm. If those env vars are unset or the
service account lacks the roles, the route returns `503 "Authentication service unavailable"`.

Provisioning status (`provisioned` / `userServiceId`) is resolved with a single batched call to
user-service `GET /users/by-keycloak-ids`, forwarding the caller's ADMIN token. A user-service
outage degrades the page to `provisioned:false` (logged) rather than failing the search.
