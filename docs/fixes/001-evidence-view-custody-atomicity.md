# 001 — `GET /evidence/:id` devolvía 500 dejando una escritura parcial en la cadena de custodia

| | |
|---|---|
| **Estado** | Resuelto |
| **Servicio** | `evidence-service` (proxied vía `api-gateway`) |
| **Rama** | `feature_004` |
| **Fecha** | 2026-05-30 |

---

## 1. El error

`GET /evidence/:id` —el endpoint "ver = tomar custodia"— respondía **`500 Internal
server error`**, pero su efecto secundario **se persistía a medias**: la fila
`"Viewed by user"` de la cadena de custodia **sí** quedaba insertada (aparecía en
`GET /evidence/:id/chain-of-custody` tras recargar), mientras que el caller recibía
un 500 y nunca obtenía la entidad.

```
GET /evidence/2b0592d8-129c-4045-a541-0db5ac87577d
Authorization: Bearer <admin token>
→ 500 { "statusCode": 500, "message": "Internal server error" }
```

### Evidencia de escritura no atómica

Tras ver la misma evidencia tres veces, su cadena de custodia tenía tres filas
`"Viewed by user"`, **todas con el mismo `previousCustodianId`**:

```json
{ "previousCustodianId": "1ab23399-…", "newCustodianId": "a000…-0001", "transferReason": "Viewed by user" }
{ "previousCustodianId": "1ab23399-…", "newCustodianId": "a000…-0001", "transferReason": "Viewed by user" }
{ "previousCustodianId": "1ab23399-…", "newCustodianId": "a000…-0001", "transferReason": "Viewed by user" }
```

Si el efecto secundario fuera correcto, tras la **primera** vista el
`currentCustodianId` pasaría a ser el visor, y el `previousCustodianId` de la
**segunda** vista debería ser ese visor — no `1ab23399`. Que todas las filas
sigan leyendo `previousCustodianId = 1ab23399` demuestra que el **`UPDATE
evidence.current_custodian_id` NO se persistía**, mientras que el **`INSERT` en
`chain_of_custody` SÍ** se confirmaba. Operación no atómica.

## 2. Causa raíz

El método original (`apps/evidence-service/src/evidence/evidence.service.ts`,
`findOne` con `trackView = true`) hacía **dos `save()` separados** —es decir, dos
transacciones independientes— y caía en una trampa de TypeORM:

```ts
const evidence = await this.evidenceRepo.findOne({
  where: { id },
  relations: ['custodyChain'],   // ← relación poblada
});
// (A) primera transacción: INSERT del row "Viewed by user" → COMMIT
await this.custodyRepo.save(this.custodyRepo.create({ … }));
evidence.currentCustodianId = actor.sub;
// (B) segunda transacción: re-guarda la entidad CON custodyChain cargado…
await this.evidenceRepo.save(evidence);
```

Dos problemas combinados:

1. **No atómico.** El INSERT del row de custodia (A) y el UPDATE del custodio (B)
   eran transacciones distintas. Si (B) fallaba, (A) ya estaba confirmado → quedaba
   un `"Viewed by user"` huérfano sin el cambio de custodio. Para custodia de
   evidencia legal, una escritura parcial es peor que un fallo limpio.

2. **El `save(evidence)` (B) reventaba por la relación `custodyChain` + `cascade: true`.**
   `Evidence.custodyChain` es un `@OneToMany(..., { cascade: true })`. Al guardar la
   entidad con la relación ya cargada, TypeORM **re-persiste en cascada** los hijos y
   fija la back-reference `child.evidence = evidence`, creando una estructura
   **circular** `evidence ↔ custodyChain`. Esa cascada (a) revertía el UPDATE de
   `current_custodian_id` y (b) producía un objeto con ciclo que **rompía la
   serialización JSON** de la respuesta → `500`.

## 3. Solución

`findOne` se reescribió para que el efecto "ver = tomar custodia" sea **una sola
transacción**, evitando por completo el `save()` en cascada:

```ts
return this.dataSource.transaction(async (manager) => {
  const evidence = await manager.findOne(Evidence, { where: { id } });
  if (!evidence) throw new NotFoundException(`Evidence ${id} not found`);

  if (evidence.currentCustodianId !== actor.sub) {        // self-view idempotente
    await manager.insert(ChainOfCustody, { evidenceId: id,
      previousCustodianId: evidence.currentCustodianId,
      newCustodianId: actor.sub, transferredByUserId: actor.sub,
      transferReason: 'Viewed by user' });
    await manager.update(Evidence, { id }, { currentCustodianId: actor.sub });
  }

  // recarga vía relación (no cascade-save) → sin ciclo en la serialización
  const fresh = await manager.findOne(Evidence, {
    where: { id }, relations: ['custodyChain'] });
  return fresh as Evidence;
});
```

Cambios clave:

- **Atomicidad.** `INSERT` + `UPDATE` en una única `dataSource.transaction`. Si algo
  lanza (incluida la recarga), TypeORM revierte **ambas** escrituras — nunca un row
  de custodia sin su cambio de custodio.
- **Se elimina el `save()` en cascada.** Se usan `manager.insert` / `manager.update`
  con objetos planos; la entidad de respuesta se **recarga** con `relations:
  ['custodyChain']` (igual que un GET de lectura), que no genera la back-reference
  circular → no más 500 de serialización.
- **Self-view idempotente (decisión de producto).** Si el caller ya es el custodio
  actual (p. ej. un refresh de la UI), la petición es una lectura pura: no se agrega
  fila ni se cambia el custodio. Una vista de **otro** usuario sí registra y toma
  custodia. Esto evita que la cadena se llene de auto-vistas duplicadas.
- **Eventos:** este endpoint no publica eventos de dominio, así que no hubo nada que
  mover fuera de la transacción. Si en el futuro se agrega un `evidence.viewed`,
  debe publicarse **después** del commit (patrón outbox / post-commit), nunca dentro
  de la transacción.

### Fuera de alcance / sin cambios de contrato

- `GET /evidence/:id/chain-of-custody` **no se tocó** (es de solo lectura y funciona).
- El contrato de la FE no cambia: `GET /evidence/:id` sigue devolviendo `200` + la
  entidad `Evidence` con `custodyChain`. Solo que ahora **de verdad** lo devuelve.

## 4. Implementación

### Archivos modificados
- `apps/evidence-service/src/evidence/evidence.service.ts` — `findOne` reescrito
  (transacción + insert/update + recarga + self-view idempotente); se inyecta
  `DataSource`.
- `apps/evidence-service/src/evidence/evidence.service.spec.ts` — provider de
  `DataSource` mockeado (manager fake) y reescritura del bloque `findOne`.

### Archivos nuevos
- `test/e2e/evidence-view-custody.e2e-spec.ts` — E2E contra Postgres real
  (testcontainers).

## 5. Pruebas

### Unit (`evidence.service.spec.ts`)
- View: `insert` (con `previousCustodianId` correcto) + `update` corren por el
  **mismo** `manager` transaccional; devuelve la entidad recargada con `custodyChain`.
- Self-view idempotente: si el actor ya es custodio → ni `insert` ni `update`.
- Atomicidad: si la recarga lanza, la excepción se propaga fuera de
  `dataSource.transaction` (la tx real revierte ambas escrituras).
- `trackView = false`: no abre transacción ni inserta (camino que usa `create`).
- `404` cuando no existe.

### E2E (`test/e2e/evidence-view-custody.e2e-spec.ts`, Postgres real)
- `GET /evidence/:id` → `200` con la entidad **y** `custodyChain` poblado
  (regresión del 500).
- Tras una vista de A y luego de B, el row de B tiene `previousCustodianId === A`
  (prueba que el UPDATE de A persistió — síntoma exacto del bug).
- Tres auto-vistas del custodio actual → **0** filas `"Viewed by user"` añadidas
  (idempotencia).
- `GET /evidence/:id/chain-of-custody` sigue sin efectos secundarios.
- `404` para id desconocido.

## 6. Smoke manual

```bash
ADMIN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@aegiscase.com","password":"Admin1234!"}' | jq -r .access_token)

# Ahora 200 con la entidad + custodyChain, no 500
curl -i -H "Authorization: Bearer $ADMIN" http://localhost:3000/evidence/<id>

# Ver dos veces; el último row debe encadenar previousCustodianId correctamente
curl -s -H "Authorization: Bearer $ADMIN" http://localhost:3000/evidence/<id> >/dev/null
curl -s -H "Authorization: Bearer $ADMIN" "http://localhost:3000/evidence/<id>/chain-of-custody" | jq '.[-1]'
```

## 7. Documentación relacionada actualizada
- `docs/BACKEND_INVESTIGATION_REPORT.md` §3.6 (semántica de `findOne`: atómica +
  self-view idempotente) y §5.6 (`GET /evidence/:id`: atomicidad y self-view).
- `docs/fixes/README.md` — índice de fixes (este es el `001`).
