# PA-T-INT02-C — entrega backend/DB y alcance verificado

**Corte:** 15 de octubre de 2026, America/La_Paz. **Estado:** BE01–BE06 implementados y verificados en entorno local identificado, disponible para integrar INT06. La comprobación de Supabase sigue parcial: REST aprobado y cuerpos SQL remotos pendientes de cotejo. Pablo confirmó 072/073 aplicadas sin errores. La igualdad de los cuerpos SQL remotos y el despliegue externo del backend consumidor requieren su propia evidencia. El entorno sintético para frontend se entrega y verifica en esta continuación. Este cierre no completa INT02, PA-S03 ni el piloto PA-F01.

**Revisión:** HEAD `57e5b7155270e0d83936175ef51d31575876ec11` más cambios de INT02-B/C en el árbol de trabajo. No hay commit/push/despliegue acreditados para estos cambios. Se preservó el trabajo previo de B. [Ficha y tareas](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int02-c.md), [contrato aceptado](../../r3foresta-docs/specs/plantacion/participacion-aliada/contrato-identidad-permisos-backend-propuesta.md) y [base B](pa-int02b-entrega-local.md).

## Entrega consumible

[OpenAPI v1](pa-int02c-openapi.json) describe **14 rutas** con DTO estrictos, BIGINT/revisiones como cadenas, lecturas privadas y recibos completos. [Ejemplos](pa-int02c-ejemplos.json) provienen de HTTP real de Nest/Supertest contra PostgreSQL sintético aislado; son identidades de fixture, sin credenciales. Contienen CONFIRMADO, RECHAZADO, SIN_CAMBIOS, revisión obsoleta, conflicto de clave y recuperación inconclusa.

| Grupo | Rutas nuevas |
|---|---|
| Lecturas de participación | `GET /api/v1/participacion/capacidades`; `GET /api/v1/subcampanias/:id/miembros-participacion`; `POST /api/v1/participacion/personas/buscar`; `POST /api/v1/participacion/accesos/revisar`. |
| Acceso C04–C09 | `POST /api/v1/participacion/accesos/{otorgar-plantador,retirar-plantador,designar-administrador,administrador-a-plantador,retirar-administrador,reemplazar-administrador}`. |
| Autoridad separada del perfil | `GET /api/v1/usuarios/:usuario_id/autoridad`; `POST /api/v1/usuarios/:usuario_id/roles`; `POST /api/v1/usuarios/:usuario_id/inactivaciones`. |
| Recuperación propia | `GET /api/v1/participacion/comandos/:comando_id?operacion=...`. |

La cuenta/autoridad se revalidan en DB con identidad del guard JWT. El administrador contextual gestiona plantadores de todos los ámbitos seleccionados; las acciones de administrador y de rol/baja requieren ADMIN global. La presencia global en miembros es derivada y deduplicada; un ADMIN global sin fila contextual no cuenta para continuidad. Una cuenta global con un permiso contextual administrativo real y activo sí cuenta según §5.1. Las proyecciones no devuelven correo/contactos/credenciales/stock, ni crean personas o invitaciones. Búsqueda por nombre NFC y correo exacto conserva colisiones sin imponer un índice único nuevo.

Cada selección de 1..100 ámbitos usa una transacción y todos los locks de cuentas/ámbitos antes de aplicar efectos. Las revisiones se comprueban también en SIN_CAMBIOS. C09 verifica ambas personas/revisiones y designa el entrante antes de modificar el saliente. Cambios reales crean auditoría; SIN_CAMBIOS solo crea recibo. Los ámbitos cerrados/cancelados conservan retiros y reemplazo protegido; no se reabren ni admiten altas ordinarias.

Mismo actor/operación/UUID/contenido recupera el terminal antes de exigir autoridad nueva; otro contenido da `COMANDO_REUTILIZADO` sin sobrescribirlo. Un rechazo de negocio revierte el dominio y conserva un RECHAZADO durable. Timeout, deadlock o error SQL inesperado no fabrican rechazo. GET terminal devuelve 200 histórico; PREPARADO devuelve 202/SIN_RESULTADO con `Retry-After: 2`; ausencia propia devuelve 404/COMANDO_NO_CONFIRMADO inconcluso. Mantener la misma clave ante incertidumbre. La recuperación admite cuenta activa tras retiro/cambio de rol y no permite consultar comandos ajenos por ser ADMIN.

## Migraciones y motor común

| Archivo | Salida | SHA-256 del archivo verificado |
|---|---|---|
| [072](../migrations/072_pa_int02c_comandos_acceso.sql) | Motor común sin fotos, C04–C09, roles/baja, auditoría global y recuperación propia. | `747b74f9a1d4c0eab006544119c4a5d505c757939a4eeedaec77e95f25233ee7` |
| [073](../migrations/073_pa_int02c_lecturas.sql) | Política por acción/ámbito y lecturas privadas de capacidades, miembros, búsqueda/revisión. | `7bfcc6d60e5baaf603a514475e5403137d28a478dba715eed22a63797c34b157` |

INT03-A no estaba implementada al iniciar C. Para ejecutar esta entrega se construyó aquí la parte común de comandos **sin fotos**, sobre `participacion_comando` de B. El backend calcula una única serialización PA-COMANDO/1; DB compara su contenido normalizado, calcula SHA-256 de esos bytes y publica el terminal junto con efectos/historial. Se probó el vector compartido con IDs mayores que la precisión de JavaScript y orden numérico 2/10.

La versión final de 072 corrige únicamente el descubrimiento ACL de helpers a un prefijo literal: reinstalar 072 después de 073 conserva las funciones de lectura. Sus cuerpos RPC no cambiaron; el orden 072 → 073 que Pablo aplicó conserva la superficie comprobada por REST y no requiere reaplicación por esa corrección.

Esto anticipa parte del motor que deberá reutilizar/integrar INT03-A. **No implementa el registro participante**, preparación/cargas de fotos, LIFO, stock ni snapshots de plantación. La recuperación puede leer una preparación sintética del catálogo común sin habilitar su ejecución. No se acreditan las carreras con registro, plan, stock, logística o cierre de INT02-D. El orden de entrega acordado sigue registrado como antecedente; esta anticipación local no permite marcar INT03-A terminada ni habilitar el recorrido participante.

Las RPC son SECURITY INVOKER, privadas para `service_role`; todas las sobrecargas sensibles se cierran a PUBLIC/anon/authenticated. El historial global es inmutable, RLS está habilitada y no tiene políticas públicas. La continuidad queda probada entre RPC que siguen la disciplina de cuentas → ámbitos. **`service_role` conserva escritura SQL de autoridad**, necesaria para INVOKER; SQL/importaciones/servicios privilegiados que la eludan quedan fuera de esa garantía. La prueba hace UPDATE de fixture y ROLLBACK para registrar este límite sin conservar efectos. §8.3 reserva el aislamiento del servicio mediante un rol dedicado para un cambio de infraestructura separado; no se introdujeron un definer ni un guard basado en GUC para aparentar ese aislamiento.

## Evidencia local reproducible

```sh
npm run build
npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/pa-int02c-unit
python3 scripts/qa/pa-int02c-db-test.py
node scripts/qa/pa-int02c-openapi.cjs
git diff --check
```

[Resultado DB/HTTP](evidencia/pa-int02c-local.json): **22 grupos PostgreSQL y 8 carreras reales aprobados**, PostgreSQL **14.17 (Homebrew)**, `lc_ctype=C.UTF-8`, `lc_collate=C.UTF-8`. El clúster propio usa socket privado con TCP deshabilitado, no carga `.env` y queda detenido/eliminado al terminar. Antecedente mínimo sintético post-067; no reconstruye todas las migraciones 001–067 ni usa PostGIS/Storage. Los 22 grupos incluyen las ampliaciones finales de vector compartido, timeout y reinstalación 072 después de 073; la primera ejecución tenía 19.

Las ocho carreras observaron espera `Lock`: dos retiros contextuales, baja/designación en ambos órdenes, baja/retiro del otro, dos cambios de autoridad con una revisión, dos degradaciones de últimos ADMIN globales, misma clave/contenido y misma clave con contenido distinto. El segundo comando revalida tras esperar; las bajas no dejan invisible una designación concurrente. Se probó fallo después de un efecto parcial con rollback íntegro y recibo durable; un error desconocido deja la clave inconclusa y permite converger con la misma identidad.

El lock timeout real se midió en **≈5 s**: no creó RECHAZADO, GET siguió inconcluso y la misma clave convergió. `statement_timeout=30s` se configura **antes** de la llamada en la sesión del ensayo. `set_config` dentro de una función no limita la invocación ya iniciada. El control privado REST de desarrollo observó `statement_timeout=30s`, `lock_timeout=5s` y espera 0; esa observación no acredita despliegue del backend consumidor.

HTTP usa controladores/guard/services reales y transporta las RPC mediante `psql` al socket aislado; no sustituye DB por mocks. La suite HTTP aprobó **13 pruebas en una suite**, con `exit_code=0`. El árbol completo aprobó **58 suites / 636 pruebas unitarias** y `npm run build`; OpenAPI se generó con **14 rutas / 36 schemas**. ESLint del módulo de participación pasó; lint global conserva deuda anterior ajena a esta entrega. Son resultados del árbol B/C actual, separados del cierre previo de B. El fixture verifica además perfil sin mutación de autoridad y conserva equipo/hechos/historia legados al reinstalar C. No se ejecutan pruebas que escriban en Supabase como parte del runner aislado.

## Aplicación informada y comprobación de desarrollo

Pablo confirmó **072 y 073 aplicadas sin errores** en desarrollo `vyrjlehkhabydkhjxagx`. Esa confirmación se distingue de [la comprobación REST](evidencia/pa-int02c-rest-desarrollo.json), realizada el 14 de octubre a las **19:04 America/La_Paz**: **35 probes aprobados, 19 denegaciones anon** HTTP 401/PostgreSQL 42501. El cliente público y el privado se validaron mediante controles sin filas. Las tablas privadas y firmas nuevas están presentes; el servicio recibió los rechazos tempranos esperados con entradas inválidas/sintéticas, sin ejecutar un comando válido ni leer personas.

```sh
node scripts/qa/pa-int02c-rest-verificar.cjs --project-ref vyrjlehkhabydkhjxagx
```

REST verifica superficie consumible, grants anon y validación temprana. El probe `control service_role sin filas` conserva `configuracion_privada` con los timeouts 30s/5s y espera 0 observados. **No certifica igualdad de cuerpos SQL remotos**, authenticated, sobrecargas completas, RLS/políticas/índices/locale ni continuidad sobre el catálogo real. El JSON conserva huellas locales esperadas y `coincidencia_cuerpo_sql_remoto_verificada:false`. El [estado SQL](../scripts/sql/pa-int02c-estado.sql), READ ONLY/REPEATABLE READ, se ejecuta ahora dentro del runner local. El [cotejador automático](../scripts/qa/pa-int02c-estado-verificar.py) aprobó la [fotografía SQL local](evidencia/pa-int02c-estado-local.json): cinco relaciones, 15 combinaciones ACL, 18 huellas de funciones, 52 restricciones, 21 FKs RESTRICT, 25 índices y ocho triggers. [Salida del cotejo](evidencia/pa-int02c-cotejo-local.json), con 26 pruebas Python para detectar cambios de cuerpos, firmas, ACL y evidencia incompatible. Un ref aportado no acredita el origen remoto del archivo. No se ejecutó ese SQL en remoto. Debe comparar cuerpos/firma/ACL con la versión local final antes de declarar el entorno verificado. No es necesario reaplicar 072/073 por la sola ausencia de esa evidencia. La correspondencia real y el manifest revisado de B siguen pendientes; no se ejecutaron transiciones de personas reales aquí.

## Instrucciones para frontend y siguientes comprobaciones

En `Backend-r3foresta`, instalar dependencias y arrancar el backend con su configuración privada:

```sh
npm ci
npm run start:dev
```

Configurar en el servidor `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` y, cuando corresponda, `PORT`/`CORS_ORIGINS`, usando los valores autorizados del entorno. No copiar claves administrativas ni secretos JWT a la PWA, a estos documentos o al bundle. El token de aplicación procede del login WebAuthn vigente; headers de rol o `actor_id` del navegador no autorizan. El entorno remoto que la PWA usará debe identificar backend/versión/URL y cuentas de prueba autorizadas; arrancar código local o aplicar SQL no acredita despliegue. La aplicación completa arrancó localmente con la configuración de desarrollo y pasó [18 comprobaciones](evidencia/pa-int02c-http-desarrollo.json): salud, Swagger con las 14 rutas, CORS, rechazo de visitantes y JWT sintético sin cuenta consultado por el guard en Supabase. No ejecutó comandos válidos ni leyó personas; el proceso temporal quedó detenido.

Para reproducir contratos sintéticos, ejecutar el runner anterior. La [suite HTTP](../test/db/pa-int02c-http.spec.ts) crea **600 ADMIN, 601 segundo ADMIN, 602 gestora contextual, 603 plantador, 604 voluntario sin permiso y 605 cuenta inactiva**. Ámbitos 600 ACTIVA propia, 601 ACTIVA ajena y 602 COMPLETADA. Los permisos, roles y revisiones cambian durante la suite; no asumir que su estado final sea una semilla inicial reutilizable. El runner destruye esas cuentas con su clúster y no entrega credenciales ni un servidor persistente para frontend.

INT06 debe conservar el UUID por confirmación, usar las revisiones de toda la selección, validar el recibo completo y recuperar con operación/UUID ante respuesta perdida. Un 202/404 inconcluso no habilita una clave nueva. Recargar capacidades después del terminal; no reutilizar el resultado histórico como autoridad actual. Mantener estas rutas/recibos fuera de caché pública/service worker. Las proyecciones públicas de Impacto conservan su audiencia propia.

## Entorno persistente para INT06 — continuación del 15 de octubre

El [launcher local](../scripts/qa/pa-int02c-preview.py) crea PostgreSQL aislado sin TCP y arranca los controladores, guard, servicios y RPC reales en `127.0.0.1:3302`. No carga `.env` ni conecta a Supabase. Tiene semilla independiente: reiniciar elimina los cambios y renueva el secreto de tokens. La [verificación del entorno](evidencia/pa-int02c-preview-local.json) aprobó **30 comprobaciones HTTP**, desde `http://localhost:5173`, con replay, revisión obsoleta, selección completa, continuidad y recuperación 202/CORS. El ensayo detuvo/eliminó su clúster. Después se inició una instancia limpia persistente en el mismo puerto, disponible al terminar esta sesión.

```sh
npm run preview:participacion
# Reset: Ctrl+C y volver a ejecutar el mismo comando.
# Ensayo que se detiene y limpia por sí mismo:
npm run preview:participacion -- --check --evidence /tmp/pa-int02c-preview.json
```

Usar `VITE_API_URL=http://127.0.0.1:3302` para el cliente de integración, sin añadir `/api`. Consultar `http://127.0.0.1:3302/__fixture` para URL, HEAD/árbol de trabajo, hashes de migraciones, ámbitos y tokens sintéticos frescos de dos horas; usar el Bearer del perfil elegido. No se publica ningún token en documentos o evidencia. OpenAPI local: `/__fixture/openapi.json`; API: `/api/v1`. Se permiten los orígenes locales 5173/3000; `--origin http://localhost:PUERTO` añade un origen local explícito. Los endpoints `__fixture` pertenecen sólo a este launcher, fuera de AppModule y del backend desplegable.

| Perfil | ID | Estado inicial |
|---|---|---|
| admin / admin2 | 600 / 601 | ADMIN globales activos. |
| gestora | 602 | Administradora contextual de Norte y ámbitos de prueba; Sur es ajena. |
| plantador | 603 | PLANTADOR de Norte. |
| voluntario | 604 | Activo sin permiso contextual. |
| inactivo | 605 | Cuenta inactiva, rutas privadas denegadas. |
| gestor-ajeno | 606 | Administrador contextual de Sur. |
| logistica | 607 | GENERAL y COORDINADOR de Norte, sin permiso contextual. |

Ámbitos: 600 Norte ACTIVA, 601 Sur ACTIVA, 602 COMPLETADA, 603 BORRADOR, 604 CANCELADA y 605 PAUSADA. Son estados iniciales; reconsultar capacidades/revisiones después de comandos. El entorno no incluye login WebAuthn, perfil/Impacto ni registro/fotos/stock: sirve para integrar las 14 rutas de C. El backend completo conserva su bootstrap y se comprobó aparte con Supabase. Se añadió `Retry-After` a los headers expuestos por CORS y `HOST=127.0.0.1` opcional para arranque local; las utilidades QA TypeScript quedan fuera del build desplegable, que conserva `dist/main.js`.

Para cotejar una futura salida SQL de Supabase guardada como JSON, sin ejecutar nada en la base:

```sh
python3 scripts/qa/pa-int02c-estado-verificar.py --evidence /ruta/estado-supabase.json --entorno DESARROLLO --project-ref vyrjlehkhabydkhjxagx
npm run test:db:acceso:estado
```

BE06 queda cumplido para **integración local de INT06**. Continúan pendientes el cotejo SQL/catálogo remoto y el despliegue externo, la transición real de B, el registro/cargas y la integración del motor con INT03-A, las rutas/carreras compartidas de D y la interfaz/QA de INT06. No cambió SQL de dominio en esta continuación y no se requiere volver a aplicar 072/073 por el ajuste de CORS o las herramientas locales. Ninguna de estas comprobaciones habilita el registro participante ni completa PA-F01.
