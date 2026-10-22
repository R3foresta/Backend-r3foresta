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
| `npm run test:db:plan` | Revisión atómica del plan y concurrencia/ACL 062–063 |
| `npm run test:db:participacion` | Base B, restricciones/vigencias/revisión/bootstrap, conservación sintética y denegaciones SQL |
| `npm run test:db:acceso` | Gestión C: 22 grupos SQL, ocho carreras y 13 pruebas HTTP con RPC reales |
| `npm run test:db:acceso:estado` | 26 casos del cotejador sobre estado sintético guardado; sin conectar DB |
| `npm run test:db:registro -- --pg-bin /ruta/postgis/bin` | Registro INT03-A: PostgreSQL/PostGIS reales aislados, LIFO/snapshots/recibos, carreras y HTTP con objetos privados de prueba |
| `npm run test:db:compartida -- --pg-bin /ruta/postgis/bin` | D + regresión A/C:077–080, permisos SQL reales, preflight adversario, plan/cierre/físicas/reposición, HTTP/Storage y30s/5s medidos |
| `npm run test:db:impacto -- --pg-bin /ruta/postgis/bin` | INT05: SQL/PostGIS/HTTP/Storage aislados, alcance50, snapshots, seguimiento, fotos y unión histórica propia |
| `npm run test:db:correcciones -- --pg-bin /ruta/postgis/bin` | INT07 motor/observaciones: 082/084 sobre antecedentes D/INT05, RPC/HTTP, replay, privacidad y carreras con locks observados. Clúster privado desechable, sin `.env` ni servicios externos; evidencia propia, sin sobrescribir cortes anteriores. |
| `npm run preview:impacto -- --pg-bin /ruta/postgis/bin --check` | Preview INT05/INT04 sintético y limpieza, sin servicios externos |
| `node scripts/qa/pa-int02c-openapi.cjs --check` | OpenAPI y proyección Swagger coinciden con el generador |
| `python3 scripts/qa/pa-int07-catalogo-test.py --pg-bin /ruta/postgresql/bin` | Utilidad BE01 de catálogo, ACL heredadas/por columna/vacías, triggers y ausencia de efectos; clúster privado desechable sin TCP ni PostGIS. No prueba correcciones INT07. |
| `python3 scripts/qa/pa-int07-persistencia-test.py --pg-bin /ruta/postgresql/bin` | BE02 parcial082: instalación/repetición, drift, materialización fiel, conservación y ACL/RLS. Antecedente focal sin PostGIS; no ejecuta correcciones ni RPC075–081. |
| `python3 scripts/qa/pa-superficie-compat-test.py --pg-bin /ruta/postgresql/bin` | Cierre aditivo 083: permisos SQL reales, conservación de SELECT/servicio y rollback ante drift. Usar PG17 para cubrir MAINTAIN; clúster sintético desechable sin TCP/.env, sin aplicación remota. |
| `python3 scripts/qa/pa-superficie-083-diagnostico-test.py --pg-bin /ruta/postgresql/bin` | Diagnóstico de 083: bloqueos completos, dependencias y permisos de vistas, metadatos de ubicación y READ ONLY real. No aplica la migración ni modifica permisos del destino. |

B/C usan antecedentes mínimos post-067: no acreditan replay 001–067, PostGIS,
Storage ni garantías del registro participante/INT02-D. Los runners pueden regenerar
`docs/evidencia/` y ejemplos HTTP; revisar esos diffs antes de incluirlos en un commit.
Un manifest sintético no constituye autorización para personas reales.

El runner INT03-A exige PostGIS real y falla si falta; no sustituye el evaluador
por un mock. Instala/repite 074–076 sobre un antecedente representativo post-073,
sin acreditar replay completo. Su Storage de prueba verifica bytes y derivados;
las políticas del bucket Supabase remoto conservan su comprobación separada.
[Comandos, evidencia y límites](../docs/pa-int03a-entrega-local.md).

## Integración de frontend

[Guía de participación](../documentacion/modulos/participacion.md#integración-local-sin-servicios-externos):
`npm run preview:participacion` mantiene una API/DB sintética disponible; reiniciar
resetea datos. `npm run preview:participacion -- --check --evidence /tmp/pa-preview.json`
verifica 30 casos HTTP y detiene/limpia el entorno. No prueba WebAuthn real.

## Entornos externos: ejecución separada

`npm run test:integration` y `npm run test:e2e` (incluidos `test:e2e:p0` y `test:e2e:db`)
pueden depender de `.env`, Supabase y escribir/limpiar datos. Confirmar el destino
antes de usarlos. No son sustitutos de las suites aisladas.

Los probes REST/HTTP de desarrollo `scripts/qa/pa-int02{b,c}-*.cjs` exigen project-ref
coincidente y configuración privada; sus informes distinguen validación temprana,
lecturas sin filas y QA real. No ejecutan por sí solos la transición de personas.
Para cotejo SQL aportado usar los scripts `pa-int02{b,c}-estado-verificar.py` y sus
argumentos `--help`; un project-ref en un archivo no acredita su origen remoto.

[Informes/evidencia](../docs/README.md). La verificación previa a `e9777f8` aprobó
build y 58 suites/636 pruebas unitarias; esos resultados tienen fecha y alcance,
no garantizan futuros cambios ni el entorno desplegado.

INT04 usa el [previewD](../docs/pa-int02d-preview.md), `npm run preview:participacion-d`. `-- --check` se detiene/limpia; el launcherA se conserva como antecedente. D solo usa datos/archivos sintéticos y no acredita RLS/Storage/Supabase remotos ni replay completo.
