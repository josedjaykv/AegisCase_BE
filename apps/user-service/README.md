# user-service

Operational profile for AegisCase users. Stores the local row keyed to a Keycloak `sub`
(login/identity itself lives in Keycloak). All routes are reached through the API gateway
under the `/users/*` prefix.

## Routes

| Method | Path                       | Auth             | Purpose                                                                            |
|--------|----------------------------|------------------|------------------------------------------------------------------------------------|
| POST   | `/users`                   | Bearer ADMIN     | Create the operational profile for a user already provisioned in Keycloak          |
| GET    | `/users`                   | Bearer ADMIN     | Paginated list of users (full `User` payload)                                      |
| GET    | `/users/directory`         | Bearer (any role)| Resolve Keycloak `sub`s to a **minimal projection** for FE display (see below)     |
| GET    | `/users/by-keycloak-ids`   | Bearer ADMIN     | Internal lookup — returns `{ id, keycloakUserId }[]` for auth-service              |
| GET    | `/users/:id`               | Bearer (any role)| Full `User` by internal id                                                         |
| PUT    | `/users/:id`               | Bearer ADMIN     | Update profile fields (not `keycloakUserId`)                                       |

### `GET /users/directory` vs `GET /users/by-keycloak-ids`

These two routes look similar but are kept deliberately separate.

- `GET /users/directory?ids=<sub1>,<sub2>,…` — readable by **every authenticated role**. Returns
  only `{ keycloakUserId, firstNames, lastNames, role }`. The FE uses this to render case team
  members, leaders, task assignees and evidence custodians by name. No `id`, no `document`, no
  `birthDate`, no `jobTitle`. Defense-in-depth: the DTO is `@Exclude()` with explicit `@Expose()`
  on the four allowed fields, and the TypeORM `select` keeps PII columns out of memory entirely.
  Hard cap of **100 ids per call**. Unknown subs are silently omitted (no 404).
- `GET /users/by-keycloak-ids?ids=<sub1>,<sub2>,…` — **ADMIN-only**, internal. Returns the
  user-service `id` alongside the `keycloakUserId` so auth-service can stitch its Keycloak search
  result to the local row. Do **not** widen this route; a non-admin caller would receive fields
  they have no business seeing just to render a teammate's name.

Reusing one route by varying its shape per caller-role is a footgun: response shape that depends
on the caller breaks contracts, breaks caching, and is one wrong `if` away from leaking PII.

## Environment

| Var          | Default                 | Notes                                      |
|--------------|-------------------------|--------------------------------------------|
| `PORT`       | `3002`                  | HTTP listener                              |
| `DB_*`       | shared Postgres         | `user_db` schema (see `DatabaseModule`)    |
| `KEYCLOAK_URL` / `JWT_SECRET` | —      | JWT verification (RS256 prod / HS256 dev)  |
