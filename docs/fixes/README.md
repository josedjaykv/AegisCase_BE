# Fixes

Registro ordenado de correcciones de bugs en el backend de AegisCase. Cada documento
describe un fix: el error observado, la causa raíz, la solución, las pruebas y la
documentación relacionada. Mismo formato que `docs/features/`, pero para arreglos.

## Convención

- Un archivo por fix, con prefijo numérico de tres dígitos: `NNN-titulo-en-kebab-case.md`.
- La numeración es secuencial y no se reutiliza (la siguiente sería `002-...`).
- Al agregar un fix nuevo, añade su fila a la tabla de abajo.

## Índice

| # | Fix | Servicio | Estado | Fecha |
|---|-----|----------|--------|-------|
| [001](001-evidence-view-custody-atomicity.md) | `GET /evidence/:id` devolvía 500 con escritura parcial de la cadena de custodia | `evidence-service` | Resuelto | 2026-05-30 |
