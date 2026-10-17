# PA-T-INT02-D — Cierre técnico local

**Corte de pruebas:** 16 de octubre de 2026. **Base de verificación:** `a045d9d7f5664007f0fbf9fcc8cf53bea226e7e4` más el árbol D previo al commit. **Estado:** BE01–BE08 verificadas para el alcance técnico local; contrato y entorno entregados para comenzar INT04.

**Entrega Git — 17 de octubre:** commit local `75a57eb05e57b3048908cccc04aa14fc24ae8629`, en `main`. El commit registra la entrega posterior a las pruebas y no cambia su procedencia. Push, aplicación/cotejo SQL remotos y despliegue de D pendientes. Esta actualización documental no repite suites ni modifica código/SQL.

La [ficha D](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int02-d.md) y el [estado canónico](../../r3foresta-docs/ESTADO.md) conservan la cobertura por entrega. El [manifest](evidencia/pa-int02d-handoff.json) identifica fuentes y evidencias finales. Los resultados recibidos de 784/785 unitarios y 32 grupos/22 carreras quedan sustituidos por la verificación final indicada abajo; la recepción original se conserva en el archivo documental.

## Resultado de la revisión

La activación ante `40001`, igual que `55P03`, `57014` y `40P01`, responde 503 `RESULTADO_NO_DETERMINADO` con `resultado_concluyente:false`. La prueba comprueba la respuesta completa, una única RPC y ausencia de escrituras separadas; no fabrica éxito ni recibo terminal. El helper de servicio ya cumplía este contrato y no requirió cambios.

La auditoría encontró una inversión de locks que el fixture anterior omitía: la FK real de `evento_lote_vivero.campania_id` adquiere `KEY SHARE` al insertar. Entrega/devolución/cancelación individual retenían la subcampaña antes de adquirir ese lock, mientras desactivación masiva retenía campaña y esperaba sus hijas. Se reprodujo `40P01` en PostgreSQL aislado. **077 ahora toma campaña antes de subcampaña y revalida su vínculo**, conservando autoridad, estados y saldos. Se corrigió el SQL preparado aún no aplicado remotamente; 068–076 no cambiaron.

El fixture incorpora las tres FKs operativas de 051. Seis carreras nuevas enfrentan entrega/devolución/cancelación con desactivación masiva en ambos órdenes. En el orden física primero se usa una barrera antes del INSERT/FK, además de observar espera real: retener solo el COMMIT no detectaba la inversión. Verifican un solo retorno de stock, cero consumo indebido, saldos correctos, campaña/subcampaña retiradas y un solo historial de cancelación.

La [matriz final BE01–BE02](pa-int02d-compatibilidad.md) contrasta rutas, objetos, audiencias, autoridad, RPC y cliente servidor, incluidos aliases retirados y las trece entradas adicionales autorizadas. Las ACL se comprueban en PostgreSQL para firmas/sobrecargas y helpers; un 401 HTTP no acredita esa denegación SQL.

## Alcance BE01–BE08

| ID | Resultado local y evidencia |
|---|---|
| BE01–BE02 | Matriz de rutas/consumidores y política por objeto; JWT/actividad, permisos contextuales, RPC/ACL privadas y preflight del inventario reducido 080. Catálogo destino separado. |
| BE03 | Orden compartido y transacciones de físicas, plan y lifecycle; incluye campaña → hijas con FKs reales y regresión de B/C/registro. |
| BE04 | Inicial legada 409; reposición interna con origen del mismo ámbito, propósito REPOSICION y autoridad propia, sin efectos ante origen ajeno. |
| BE05 | Evidencia propia también para ADMIN, original privado y derivado/foto pública sanitizados; rutas generales no abren cargas privadas. Objetos sintéticos reales. |
| BE06 | Pausa de escritura inicial por omisión; conserva GET/cargas y replay terminal propio. Ausencia/PREPARADO da 503 inconcluso y conserva la misma clave. Corte/drenaje reales pendientes. |
| BE07 | Build, 787 unitarios, 33 grupos SQL, 28 carreras, 25 HTTP, preview y regresiones aisladas aprobados. |
| BE08 | Contratos, DTO/Swagger/OpenAPI, ejemplos, matriz, launcher, informe y estado canónico entregados para INT04. |

## Verificación reproducible

Entorno: Node 24.19.0, npm 12.0.2, PostgreSQL 14.24 (Postgres.app), PostGIS 3.2.10. Las suites usan dependencias externas sustituidas o clústeres/Storage sintéticos propios, sin cargar `.env` ni conectar servicios remotos. Memoria compartida PostgreSQL y sockets HTTP locales requieren permisos de ejecución del host.

```sh
TMPDIR=/private/tmp npm run build
TMPDIR=/private/tmp npm run test:unit -- --runInBand
node scripts/qa/pa-int02c-openapi.cjs --check
TMPDIR=/private/tmp npm run test:db:compartida -- --pg-bin /ruta/runtime-postgis/bin
TMPDIR=/private/tmp npm run preview:participacion-d -- --pg-bin /ruta/runtime-postgis/bin --check
```

Runtime usado: `/private/tmp/pa-postgis-runtime.CQOFCC/14/bin`; si ya fue limpiado, preparar otro con `scripts/qa/pa-int03a-postgis-preparar.sh` y usar su directorio `bin`. El runner instala/repite 074–080 sobre antecedentes parciales y destruye únicamente su clúster/Storage.

| Comprobación | Resultado y evidencia |
|---|---|
| Build / unitarios / OpenAPI | Aprobados: **64 suites / 787 pruebas**, 25 rutas / 52 schemas; [checks compactos](evidencia/pa-int02d-checks.json). Focal activación/lifecycle/cierre/equipo: 4 suites / 33 pruebas. |
| SQL/PostGIS | **33 grupos: 11 D + 22 registro**; [SQL/HTTP D](evidencia/pa-int02d-local.json), estado CORRECTO. |
| Concurrencia | **28 carreras: 18 D + 10 registro**, con barreras y locks observados, saldos/recibos/historial y rollback comprobados. |
| HTTP / Storage | **25 pruebas: 9 D + 16 registro**, guards/services/RPC y objetos privados de prueba. Incluye pausa/recuperación, reposición y foto histórica sanitizada. |
| Preflight | Siete escenarios adversarios: exposición adicional, vistas/definers y privilegios heredados; rechazo/rollback sin ampliar inventario ni grants de servicio. |
| Timeouts | Locks ~5 s y sentencia ~30 s medidos con configuración previa a la sentencia y rollback desde conexión limpia. `SET` interno no demuestra el timer de transporte PostgREST. |
| Preview D | [Cinco grupos aprobados](evidencia/pa-int02d-preview-local.json): JWT/plan, legado 409, reposición/foto, pausa/recuperación y HEIC; clúster/objetos eliminados. |
| B/C | [Basales conservados](evidencia/pa-int02d-regresiones-basales.json), ambos exit 0 sobre sus bases históricas. No se repitieron en esta recepción ni acreditan todo B/C bajo D; la regresión C con D está en el runner compartido. |

Las trece entradas de catálogos/diagnósticos se prueban por HTTP con servicios externos simulados en los unitarios; no se ejecutan acciones reales de Pinata/blockchain. Los fixtures post-076 no acreditan replay completo 001–073 ni catálogo/Storage Supabase del destino. Los hashes de las evidencias SQL/preview coinciden con las fuentes verificadas.

**Reverificación de preview — 17 de octubre:** el consumidor INT04 volvió a ejecutar el check D con Node 24.5.0, PostgreSQL 14.24 y PostGIS 3.2.10: cinco grupos aprobados y clúster/objetos eliminados. La evidencia de preview y su huella del manifest se actualizaron; no cambió el código verificado.

## Migraciones y recepción frontend

Aplicación local ordenada: **077** físicas/plan/reposición y cierre inicial legado; **078** activación/cierre/equipo/edición/borrado/polígono atómicos; **079** evidencias privadas de reposición y foto pública sanitizada; **080** cierre exacto de diez tablas, SELECT de una vista y DML de cuatro catálogos. 080 no agrega RLS ni grants de servicio y aborta ante exposición fuera del inventario autorizado. [Preflight de solo lectura](../scripts/sql/pa-int02d-superficie-preflight.sql).

INT04 recibe [compatibilidad y DTO](pa-int02d-compatibilidad.md), [preview D](pa-int02d-preview.md), [ejemplos D](pa-int02d-registro-ejemplos.json) y [OpenAPI](pa-int02c-openapi.json). La [ficha INT04](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int04.md) puede ejecutarse tras este cierre local, conforme al orden autorizado D → INT04. Este cierre backend no implementa su PWA.

Inicial usa comando/cargas v1. Reposición conserva su herramienta interna, exige ámbito/propósito en upload/descarte y origen del mismo ámbito. `DetalleSubcampanaScreen` debe retirar el probe legado de contexto cuyo resultado descarta; conservar detalle y GET/PUT de plan según audiencia. El contexto participante devuelve especies y saldo mínimo, sin reconstruir lotes/asignaciones desde IDs del fixture.

## Pendientes del entorno destino

Pablo confirmó 074–076 ejecutadas sin errores en desarrollo Supabase `vyrjlehkhabydkhjxagx`; no se repiten por falta de cotejo posterior. **077–080 solo están acreditadas localmente.** Faltan cotejo/aplicación remotos de SQL/ACL/columnas/membresías/vistas/definers, PostgREST, Storage y URLs/CDN históricas, conciliación de fechas/permisos/personas, corte/drenaje y habilitación reales, WebAuthn, revisión humana de UX, QA integrado, push/despliegue y piloto. `service_role` conserva su poder privilegiado; la garantía es cooperativa entre RPC que respetan los locks.

La inicial normal sigue pausada por omisión mediante `PARTICIPACION_INICIAL_ESCRITURA_HABILITADA`; el preview habilita expresamente su fixture. Este cierre no completa INT02, PA-S00/01/03, tareas padre de QA ni PA-F01.
