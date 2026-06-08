# Tests

Estructura recomendada para no mezclar niveles de prueba:

- `src/**/*.spec.ts`: unit tests cerca del modulo que prueban.
- `test/unit/`: unit tests compartidos o cross-module, si no pertenecen claramente a un modulo.
- `test/integration/`: pruebas que usan servicios reales externos, por ejemplo Supabase.
- `test/e2e/smoke/`: smoke tests HTTP minimos.
- `test/e2e/p0/`: flujos P0 HTTP de negocio.
- `test/e2e/db/`: flujos e invariantes de base de datos/RPC.
- `test/helpers/`: helpers reutilizables por suites de `test/`.

Comandos:

- `npm test`: unit tests definidos en la configuracion principal de Jest.
- `npm run test:unit`: unit tests de `src/` y `test/unit/`.
- `npm run test:integration`: integracion contra servicios reales.
- `npm run test:e2e`: todos los e2e.
- `npm run test:e2e:p0`: solo flujos P0 HTTP.
- `npm run test:e2e:db`: solo flujos DB/RPC.

Regla practica: si un test necesita `.env`, Supabase real o datos semilla, no va en unit.
