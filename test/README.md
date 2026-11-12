# Verificación del backend

Elegir la suite según el cambio; no ejecutar todos los e2e contra una base compartida.

## Entrada habitual

```sh
npm run build
npm run test:unit -- --runInBand
```

Unitarios en `src/**/*.spec.ts` y `test/unit/`, con dependencias externas sustituidas.
Supertest necesita sockets locales. Si el sistema restringe la caché:
`--cacheDirectory=/private/tmp/r3-jest`. `lint` y `format` modifican archivos.

## PostgreSQL aislado y contratos

Requieren `initdb`, `pg_ctl`, `createdb` y `psql` en PATH; acceso usa además locale
UTF-8 con case folding Unicode y HTTP local. Los runners B/C no cargan `.env`,
usan socket privado/DB sin TCP y destruyen exclusivamente su clúster al terminar.

| Comando | Qué comprueba |
|---|---|
| `python3 scripts/qa/vivero-conciliacion-storage-test.py --pg-bin /ruta/postgresql/bin --evidence /ruta/nueva/storage-098.json` | 098 en PostgreSQL/RLS sintético: políticas permisivas globales, denegación a anon/auth del bucket dedicado, movimientos entre buckets, CRUD del servicio y otros buckets, instalación repetida, ausencia del bucket y abortos ante drift de catálogo, roles, políticas o metadatos. Comprueba el informe de estado antes/después. Sin HTTP Storage, TCP, `.env` ni servicios externos. |
| `npm run test:db:recepcion -- --pg-bin /ruta/postgresql/bin --evidence /private/tmp/recepcion-unica.json` | Recepción única100 sobre antecedente092–099: instalación/repetición, retiro de dependencias antiguas, recepción/rechazo/corrección de la misma ficha, contexto de fotos por revisión, comandos/replay/recuperación, locks de retiro/rol/baja, fechas y ledger/INICIO sin doble débito. PostgreSQL privado desechable sin TCP/.env, HTTP/JWT local y Storage sintético. PostGIS exige runtime real al usar su opción. |
| `npm run test:db:plan` | Revisión atómica del plan y concurrencia/ACL 062–063 |
| `npm run test:db:recoleccion:soft-delete` | RN-REC-09A/089 sobre antecedente mínimo M1 + 014/015: permisos, fechas DATE, rollback, conservación de fotos/compensación, instalación repetida y siete carreras con locks observados. PostgreSQL privado desechable sin TCP/.env. |
| `npm run test:db:vivero:acceso -- --postgis --pg-bin /ruta/runtime-postgis/bin --evidence /ruta/nueva/t2.json` | T2/094–095 sobre T1 local: scopes, vigencias/revisión/auditoría/recuperación, M1/M2 independientes, RPC reales, retiro/rol/baja072, cancelación y desactivación masiva, JWT/HTTP/Storage sintético; con `--postgis` exige extensión real y prueba consumo M3 sin acceso M2 ni doble débito. Sin TCP/.env ni servicios reales. Evidencia propia; nunca sobrescribir la de T1. |
| `npm run test:db:recoleccion:acceso` | T1/092–093: vigencias, revisión M1 independiente, auditoría/recibos atómicos, ACL/preflight, captura/mantenimiento/fotos propios, rechazo antiguo, sin aprobación propia ni DESECHO por autoría; PostgreSQL privado y HTTP JWT/RPC reales, carreras con locks observados; sin TCP/.env/servicios externos. |
| `npm run test:db:recoleccion:rechazo` | 090 sobre antecedente mínimo M1 + 014/015/058: rechazo antiguo/futuro, aprobación con ventana original, altas/edición/reenvío, permisos/motivo/historial, rollback y dos rechazos concurrentes con lock observado. PostgreSQL privado desechable sin TCP/.env. |
| `npm run test:db:participacion` | Base B, restricciones/vigencias/revisión/bootstrap, conservación sintética y denegaciones SQL |
| `npm run test:db:acceso` | Gestión C: 22 grupos SQL, ocho carreras y 13 pruebas HTTP con RPC reales |
| `npm run test:db:acceso:estado` | 26 casos del cotejador sobre estado sintético guardado; sin conectar DB |
| `npm run test:db:registro -- --pg-bin /ruta/postgis/bin` | Registro INT03-A: PostgreSQL/PostGIS reales aislados, LIFO/snapshots/recibos, carreras y HTTP con objetos privados de prueba |
| `npm run test:db:compartida -- --pg-bin /ruta/postgis/bin` | D + regresión A/C:077–080, permisos SQL reales, preflight adversario, plan/cierre/físicas/reposición, HTTP/Storage y30s/5s medidos |
| `npm run test:db:impacto -- --pg-bin /ruta/postgis/bin` | INT05: SQL/PostGIS/HTTP/Storage aislados, alcance50, snapshots, seguimiento, fotos y unión histórica propia |
| `npm run test:db:correcciones -- --pg-bin /ruta/postgis/bin` | INT07 motor/observaciones: 082/084 sobre antecedentes D/INT05, RPC/HTTP, replay, privacidad y carreras con locks observados. Clúster privado desechable, sin `.env` ni servicios externos; evidencia propia, sin sobrescribir cortes anteriores. |
| `npm run test:db:participantes -- --pg-bin /ruta/postgis/bin` | INT07 participantes y lecturas: 085 sobre 082/084, altas/retiros/restauración, autorización efectiva propia, proyección pública, snapshots y carreras. Clúster privado desechable y evidencia separada; sin `.env` ni servicios externos. |
| `python3 scripts/qa/pa-contexto-registro-test.py --pg-bin /ruta/postgis/bin` | Contexto v1 con avance por especie (086): PostgreSQL/PostGIS aislados, confirmaciones, rechazo, reposición excluida, ledger de corrección sintético, stock cero y privacidad. |
| `npm run preview:impacto -- --pg-bin /ruta/postgis/bin --check` | Preview INT05/INT04 sintético y limpieza, sin servicios externos |
| `node scripts/qa/recepcion-semillas-openapi.cjs --check` | Swagger real de las seis rutas de recepción única coincide con DTO/recibos/cola/detalle y artefacto consumible; no abre sockets ni servicios externos. |
| `node scripts/qa/vivero-acceso-openapi.cjs --check` | Swagger real de gestión/operación M2, orígenes y rutas M1 afectadas, sin conciliación ni aprobación documental; sin sockets ni servicios externos. |
| `node scripts/qa/recoleccion-acceso-openapi.cjs --check` | Swagger real de las cinco rutas de acceso M1 coincide con el artefacto consumible, sin abrir sockets ni cargar servicios externos. |
| `node scripts/qa/pa-int02c-openapi.cjs --check` | OpenAPI y proyección Swagger coinciden con el generador |
| `python3 scripts/qa/pa-int07-catalogo-test.py --pg-bin /ruta/postgresql/bin` | Utilidad BE01 de catálogo, ACL heredadas/por columna/vacías, triggers y ausencia de efectos; clúster privado desechable sin TCP ni PostGIS. No prueba correcciones INT07. |
| `python3 scripts/qa/pa-int07-persistencia-test.py --pg-bin /ruta/postgresql/bin` | BE02 parcial082: instalación/repetición, drift, materialización fiel, conservación y ACL/RLS. Antecedente focal sin PostGIS; no ejecuta correcciones ni RPC075–081. |
| `python3 scripts/qa/pa-superficie-compat-test.py --pg-bin /ruta/postgresql/bin` | Cierre aditivo 083: permisos SQL reales, conservación de SELECT/servicio y rollback ante drift. Usar PG17 para cubrir MAINTAIN; clúster sintético desechable sin TCP/.env, sin aplicación remota. |
| `python3 scripts/qa/pa-superficie-083-diagnostico-test.py --pg-bin /ruta/postgresql/bin` | Diagnóstico de 083: bloqueos completos, dependencias y permisos de vistas, metadatos de ubicación y READ ONLY real. No aplica la migración ni modifica permisos del destino. |

Los runners T1/T2 conservan sus antecedentes SQL históricos de acceso y comprueban
que las rutas documentales retiradas respondan 404 en el backend actual. T2 añade,
únicamente para HTTP, el lector `m2_acceso_leer` de 100 y la proyección de IDs
`m2_inicio_lote_exacto` de 097 sobre la operación 095. Esto alinea el contrato de
capacidades e IDs; no instala recepción/conciliación ni acredita 100 completa.
La recepción única se verifica con su runner propio.

B/C usan antecedentes mínimos post-067: no acreditan replay 001–067, PostGIS,
Storage ni garantías del registro participante/INT02-D. Los runners pueden regenerar
`docs/evidencia/` y ejemplos HTTP; revisar esos diffs antes de incluirlos en un commit.
Un manifest sintético no constituye autorización para personas reales.

El runner INT03-A exige PostGIS real y falla si falta; no sustituye el evaluador
por un mock. Instala/repite 074–076 sobre un antecedente representativo post-073,
sin acreditar replay completo. Su Storage de prueba verifica bytes y derivados;
las políticas del bucket Supabase remoto conservan su comprobación separada.
[Comandos, evidencia y límites](../docs/pa-int03a-entrega-local.md).

## Reinicio operativo de datos de prueba

El [script de reinicio](../scripts/qa/reset-operativo-pruebas.py) no carga `.env`:
usa la conexión `PG*` de psql. Sin opciones de ejecución solo devuelve un plan
con destino, tablas/conteos, dependencias, objetos Storage y huella. Revisar ese
plan antes del corte; guardarlo fuera del repositorio.

```sh
python3 scripts/qa/reset-operativo-pruebas.py --pg-bin /ruta/postgresql/bin > /private/tmp/reset-plan.json
python3 scripts/qa/reset-operativo-pruebas.py --pg-bin /ruta/postgresql/bin --execute HUELLA_REVISADA
```

`--execute` exige la huella del mismo destino/inventario y la revalida bajo locks.
Las FK externas al inventario abortan; no se usa CASCADE ni se reinician secuencias.
Borra datos operativos M1/M2/M3 y dependencias de campañas, participación/cargas,
permisos por subcampaña, comandos e historial de autoridad relacionados. Conserva
cuentas, roles actuales, accesos M1/M2 y catálogos. Revisar el detalle del plan para
conocer las consecuencias completas antes de ejecutarlo.

El SQL no elimina objetos Storage: devuelve `objetos_storage` y URLs legadas
para una limpieza externa por la API oficial, con destino revisado. El script no
se ejecuta como parte de100. Su regresión aislada es
`python3 scripts/qa/reset-operativo-pruebas-test.py --pg-bin /ruta/postgresql/bin`;
no acredita una limpieza remota ni un reinicio ya realizado.

## Integración de frontend

[Guía de participación](../documentacion/modulos/participacion.md#integración-local-sin-servicios-externos):
`npm run preview:participacion` mantiene una API/DB sintética disponible; reiniciar
resetea datos. `npm run preview:participacion -- --check --evidence /tmp/pa-preview.json`
verifica 37 casos HTTP, incluida la lectura de equipo para PLANTADOR tras la migración 087, y detiene/limpia el entorno. No prueba WebAuthn real.

## Entornos externos: ejecución separada

`npm run test:integration` y `npm run test:e2e` (incluidos `test:e2e:p0` y `test:e2e:db`)
pueden depender de `.env`, Supabase y escribir/limpiar datos. Confirmar el destino
antes de usarlos. No son sustitutos de las suites aisladas.

Las cuatro suites `test/e2e/db/` conservan fixtures históricos anteriores a 100:
fabrican registros validados y limpian datos directamente. No están adaptadas a
la recepción única ni acreditan el esquema actual. Su preflight de solo lectura
bloquea ejecución y limpieza si las columnas históricas ya no están disponibles;
no ejecutar esas suites contra el destino migrado. Para 100 usar
`npm run test:db:recepcion` sobre PostgreSQL aislado. Adaptar esos e2e requiere
preparar recepciones reales y una estrategia de fixtures/limpieza aislados.

Los probes REST/HTTP de desarrollo `scripts/qa/pa-int02{b,c}-*.cjs` exigen project-ref
coincidente y configuración privada; sus informes distinguen validación temprana,
lecturas sin filas y QA real. No ejecutan por sí solos la transición de personas.
Para cotejo SQL aportado usar los scripts `pa-int02{b,c}-estado-verificar.py` y sus
argumentos `--help`; un project-ref en un archivo no acredita su origen remoto.

[Informes/evidencia](../docs/README.md). La verificación previa a `e9777f8` aprobó
build y 58 suites/636 pruebas unitarias; esos resultados tienen fecha y alcance,
no garantizan futuros cambios ni el entorno desplegado.

INT04 usa el [previewD](../docs/pa-int02d-preview.md), `npm run preview:participacion-d`. `-- --check` se detiene/limpia; el launcherA se conserva como antecedente. D solo usa datos/archivos sintéticos y no acredita RLS/Storage/Supabase remotos ni replay completo.
