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
- `npm run test:db:plan`: ADR-PLA-05 contra un cluster PostgreSQL temporal aislado (sin `.env` ni Supabase compartido). Requiere `initdb`, `pg_ctl`, `createdb` y `psql` locales.
- `npm run test:db:participacion`: PA-T-INT02-B, instalación/repetición 068–071, restricciones, vigencias/revisiones/auditoría, bootstrap y denegaciones SQL reales. Crea un clúster propio temporal con socket privado y TCP deshabilitado, sin `.env` ni Supabase. Requiere los mismos binarios PostgreSQL locales y permiso para memoria compartida. Destruye exclusivamente su clúster al terminar; si no puede detenerlo conserva sus archivos.
- `npm run test:db:acceso`: PA-T-INT02-C, lecturas privadas, C04–C09, autoridad, recuperación y carreras SQL reales; luego HTTP de Nest sobre ese mismo clúster aislado. Requiere PostgreSQL, un locale UTF-8 con case folding Unicode y sockets HTTP locales. No carga `.env` ni escribe en Supabase. `--sql-only` mediante el script Python omite únicamente HTTP.
- `npm run docs:participacion`: genera el OpenAPI de 14 rutas y su proyección para Swagger; `node scripts/qa/pa-int02c-openapi.cjs --check` verifica que coincidan con el generador.
- `npm run test:db:acceso:estado`: 26 pruebas del cotejador de estado SQL, a partir de la fotografía local producida por el runner de acceso. No conecta a PostgreSQL ni a Supabase.
- `npm run preview:participacion`: entorno persistente para frontend con ocho perfiles sintéticos, API en `127.0.0.1:3302` y tokens renovables en `/__fixture`; no carga `.env` ni conecta Supabase. `-- --check --evidence /tmp/pa-int02c-preview.json` prueba 30 casos HTTP y limpia el entorno al terminar. Reiniciar resetea los datos.

`src/subcampanias/tests/subcampanias-plan.http.spec.ts` ejecuta el controlador, JWT y servicios reales sobre una API temporal en `127.0.0.1`, con Supabase sustituido. Necesita permiso local para abrir un socket, pero no usa `.env` ni un servicio externo. La suite DB aislada verifica también devoluciones concurrentes, permisos de lectura 063 y el SQL de diagnóstico manual. Las pruebas P0 contra Supabase real requieren `JWT_SECRET` y `SUPABASE_SERVICE_ROLE_KEY` y siguen siendo una ejecución aparte que escribe datos de prueba; no ejecutar sin un entorno autorizado.

Regla practica: si un test necesita `.env`, Supabase real o datos semilla, no va en unit.

El [ensayo INT02-B](../scripts/qa/pa-int02b-db-test.py) instala un antecedente sintético reducido post-067; **no acredita replay 001–067**, PostGIS/Storage, catálogo remoto, transición de personas reales ni la protección concurrente del último administrador (C/D). El [manifest sintético versionado](db/fixtures/pa-int02b-manifest-sintetico.json) es exclusivamente un fixture: sus decisiones no representan aprobación humana real. El [informe de entrega](../docs/pa-int02b-entrega-local.md) distingue esas evidencias.

El [ensayo INT02-C](../scripts/qa/pa-int02c-db-test.py) incorpora el mismo antecedente sintético y la identidad de 064. [Su informe](../docs/pa-int02c-entrega-local.md) distingue continuidad cooperativa por RPC, privilegios de `service_role`, REST de desarrollo y las garantías de INT03-A/D aún pendientes. La suite produce [ejemplos HTTP ejecutados](../docs/pa-int02c-ejemplos.json), sin tokens ni credenciales, y destruye únicamente su clúster propio.

El mismo runner captura el [estado SQL sintético](../docs/evidencia/pa-int02c-estado-local.json) y ejecuta el cotejador de cuerpos/firmas/ACL/RLS/índices/triggers. Para cotejar una salida SQL aportada de desarrollo: `python3 scripts/qa/pa-int02c-estado-verificar.py --evidence /ruta/estado.json --entorno DESARROLLO --project-ref vyrjlehkhabydkhjxagx`; un archivo o ref aportados no prueban por sí solos su origen remoto.

El smoke `node scripts/qa/pa-int02c-http-desarrollo-verificar.cjs --project-ref vyrjlehkhabydkhjxagx` requiere un build previo y configuración privada de desarrollo. Arranca la aplicación completa temporalmente en loopback y verifica salud, Swagger, CORS y rechazo de una sesión sintética sin cuenta: 18 comprobaciones sin comandos válidos ni datos de personas. La evidencia es independiente del entorno sintético y del QA de login/frontend.
