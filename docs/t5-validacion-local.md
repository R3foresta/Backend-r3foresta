# T5 · verificación y entrega local

**Corte anterior del13 de noviembre.** La revisión independiente detectó límites
de esta prueba (DTO de reposición y CHECK010 omitido). La
[corrección y verificación vigente del14](t5-revision-2026-11-14.md) amplía el
antecedente y prueba HTTP→SQL con IDs vecinos; este informe y sus evidencias
se conservan como resultados históricos, sin atribuirles esas garantías.

13 de noviembre de2026. Base `0074200a77f5ce6780f64ce0f594d07ad18e6a82`
más árbol local, sin commit de entrega. Darwin25.5.0 arm64, Node24.19.0,
PostgreSQL14.24 (Postgres.app), PostGIS3.2.10 y GEOS3.10.7.

[Contrato y pasos de aplicación](t5-incorporacion-plantas.md) ·
[Procedencia propia M3](t5-m3-procedencia.md) ·
[Actualización canónica propuesta](t5-actualizacion-canonica.md).

[Resumen verificable de entrada y evidencias](evidencia/t5-validacion-2026-11-13.json).

## Resultado

| Comprobación | Resultado y evidencia nueva |
|---|---|
| `npm run build` | Aprobado |
| `npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/r3-jest --watchman=false` |93 suites,1349 pruebas aprobadas |
| T5 con100,101–103/105 e inicial074/075 íntegro |86 grupos SQL,11 carreras y6 pruebas HTTP aprobadas; [evidencia final](evidencia/t5-incorporacion-local-2026-11-13-final.json) |
| Storage104 |38 grupos SQL/RLS aprobados; [evidencia](evidencia/t5-incorporacion-storage-local-2026-11-13.json) |
| Recepción única100 |85 grupos SQL,13 carreras,7 HTTP; [regresión](evidencia/t5-regresion-recepcion-2026-11-13-postgis.json) |
| Acceso M2/095 y proyección105 |41 grupos SQL,22 carreras,13 HTTP; [regresión](evidencia/t5-regresion-vivero-acceso-2026-11-13-postgis-105-v2.json) |
| Registro074–076 |22 casos SQL,10 carreras,17 HTTP; [regresión independiente](evidencia/t5-regresion-registro-2026-11-13-postgis-v3.json) |
| Operaciones compartidas077–080 |33 casos SQL,28 carreras,25 HTTP; [regresión histórica independiente](evidencia/t5-regresion-compartida-2026-11-13-postgis-v4.json) |
| OpenAPI real | Recepción6 rutas, M2/T537 rutas, participación42 rutas/90 schemas; los tres `--check` aprobados |
| `git diff --check` | Aprobado; migraciones001–100 intactas |

La primera ejecución de unitarios dentro del sandbox no pudo abrir sockets
HTTP locales. La ejecución final autorizada fuera de ese límite aprobó todas
las suites; no se cambió producción para sortearlo. `--watchman=false` evita
escrituras de Watchman fuera del workspace. No se ejecutaron lint/format globales,
integration/e2e remotos, resets, SQL remoto ni operaciones Storage remotas.

## Alcance comprobado

La prueba integrada instala100 sobre antecedente T2/077 representativo, crea
recepción e INICIO/EMBOLSADO M1 reales antes de101/102 y comprueba preservación
de IDs, códigos, eventos, saldos y ledger. Repite las migraciones y rechaza
drift sin repararlo. No acredita una reconstrucción productiva001–100.

Comprueba compra/donación, conteo inicial210 con antecedente300, origen
desconocido, reintentos y conflicto de intención, éxito recuperable después de
movimientos y sin autoridad actual, UUID ajeno, rollback completo, exclusión de
segunda base viva y extensión incoherente, incluso rutas SQL privilegiadas.
Prueba contexto de fotos por cuenta/vivero/solicitud, foto ya vinculada,
retirada de acceso/rol/baja concurrentes, fechas locales, nulos, snapshots y
IDs mayores que MAX_SAFE_INTEGER en las cinco operaciones compartidas.

El consumo usa PostGIS real: reposición077 e inicial075/LIFO con plantador sin
acceso M2, lotes propios/comprados/donados separados y lectura103 desde los
detalles finales persistidos. La cadena100incorporadas−10merma−60entregadas,
45plantadas y15devueltas termina en45vivero/0campo/45plantadas/10merma, sin
segundo débito M1/M2. Incluye carreras de consumo/devolución y de inicial.

Los recibos de incorporación conservan el día físico y el éxito inicial;
`registrado_en` se serializa en UTC estable entre sesiones. HTTP usa JWT y
servicios reales del módulo con transporte DB/Storage sintético. La prueba de
respuesta perdida después de persistir fotos comprueba503, conservación de
objetos y recuperación de pendientes, no una nueva alta automática.

## Límites del antecedente y del entorno

El helper de audiencia085 es el real con su hash; el overlay082 es mínimo
representativo y no se instala085 completo. La regresión T2 mantiene095 y
proyecciones HTTP100/097 más105: no acredita100 completa. La regresión D
conserva077–080 y no representa100/T5; la prueba integrada propia cubre ese
cruce por separado. Los harness A/D se alinearon con la lectura086 y catálogo
de planta actuales, sin cargar `.env`; sus evidencias históricas originales
se conservaron. Los archivos nuevos identifican estos límites.

Storage104 prueba RLS/ACL sobre esquema sintético, con políticas permisivas
adversarias, repetición, bucket ausente y preservación de otros objetos. No
crea el bucket real ni acredita Storage HTTP remoto, CDN, bytes o políticas
aplicadas en Supabase. Las fotos T5 no se publican por el bucket legado.

Cada clúster usa socket privado, sin TCP ni servicios externos, y se detiene
y elimina al terminar. El runtime PostGIS se preparó desde el artefacto oficial
con SHA256 fijado por el preparador existente; sus versiones constan en JSON.

## Reproducción

Usar Node24.19.0 y un directorio `PG_BIN` con PostgreSQL/PostGIS compatibles.
Las rutas de evidencia explícitas deben ser nuevas.

```sh
npm run build
npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/r3-jest --watchman=false
npm run test:db:vivero:incorporacion -- --postgis --pg-bin "$PG_BIN" --evidence /private/tmp/t5-nuevo.json
npm run test:db:vivero:incorporacion:storage -- --pg-bin "$PG_BIN" --evidence /private/tmp/t5-storage-nuevo.json
npm run test:db:recepcion -- --pg-bin "$PG_BIN" --evidence /private/tmp/t4-nuevo.json
npm run test:db:vivero:acceso -- --postgis --pg-bin "$PG_BIN" --evidence /private/tmp/t2-nuevo.json
npm run test:db:registro -- --pg-bin "$PG_BIN" --evidence /private/tmp/registro-nuevo.json
npm run test:db:compartida -- --pg-bin "$PG_BIN" --evidence /private/tmp/compartida-nuevo.json
node scripts/qa/recepcion-semillas-openapi.cjs --check
node scripts/qa/vivero-acceso-openapi.cjs --check
node scripts/qa/pa-int02c-openapi.cjs --check
```

Pendientes funcionales: aptitud, merma en campo, recepción directa, cambio de
cancelación, correcciones y selección física del lote; ver contrato. El
repositorio hermano conserva su actualización canónica pendiente por límite
de escritura. Código, pruebas, SQL aplicado, commit, push y despliegue siguen
siendo hechos diferentes.
