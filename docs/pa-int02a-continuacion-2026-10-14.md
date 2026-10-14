# PA-T-INT02-A — cierre de privacidad e integración PWA

**Estado: COMPLETADO** — identidad/perfil, cierre de privacidad, adaptación PWA y comprobaciones de desarrollo. Pablo autorizó el cierre con commit y push directamente a `main` el 14 de octubre de 2026. La publicación Git no acredita despliegue ni habilita el piloto.

14 de octubre de 2026, America/La_Paz. Continúa la [entrega del 13](pa-int02a-entrega-local.md). Bases del QA integrado: backend `ae19480bac9ccb2015fe825cbbc8a720972074e9`, PWA `6520b6beb3096b83d27e461dd155fa5631195386`, documentación `25e4e6a413f8e120048615013fee3547fbc683d6`, con los cambios locales descritos aquí. La entrega inicial se integró posteriormente en `main` remoto; se sincronizó sin perder esta continuación.

La mejora posterior de UI/UX del frontend está publicada en `main`, commit `cf13036`, e incluye esta adaptación v1. Su [informe](../../pwa-r3foresta/docs/QA_PERFIL_PARTICIPACION_UX.md) registra 339 pruebas, lint/build aprobados y QA visual con HTTP sintético. La ceremonia y persistencia reales descritas aquí corresponden al recorrido anterior a esa mejora visual; esta última aún requiere su repetición integrada y prueba de foto real. [Revisión de ramas](revision-ramas-2026-10-14.md).

## Resultado de los cuatro pendientes

| Pendiente | Resultado y evidencia |
|---|---|
| Lectura pública de usuarios | 066 aplicada en desarrollo: revoca permisos de tabla y columna de `usuario` y `usuario_credencial` para PUBLIC/anon/authenticated. Se cerró también la escritura pública de credenciales descubierta durante este inventario. Supabase REST deniega SELECT sin leer filas (`limit=0`), HTTP 401 / PostgreSQL 42501. |
| Escritura pública de organizaciones | 066 revoca INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN y grants de columna; conserva SELECT público requerido por Impacto. Revoca todas las sobrecargas de las RPC inventariadas. Las operaciones privadas usan JWT, actor activo y cliente de servicio; las escrituras de organizaciones siguen siendo ADMIN. |
| Ajuste PWA | Perfil de participante usa GET/PATCH v1 y selector mínimo. Sin `rol` editable/enviado, documento ni wallet obligatorios; nombre hasta 100, apellido opcional hasta 30 y «Otra» hasta 150 caracteres NFC, sin truncado. Catálogo por ID decimal exacto, búsqueda/paginación, Otra y null. Rol informativo. Afiliación guardada no se reenvía si no se edita, conservando una selección que haya quedado inactiva. |
| Recorrido real y timeout | Passkey física completada por Pablo en Brave → backend local → Supabase de desarrollo. Cuenta 48 GENERAL: perfil, búsqueda, catálogo ID `"1"`, Otra, ausencia, recargas y restauración de la afiliación original; rol conservado. Negativos con su JWT real y plan/Impacto comprobados. 067 aplicada y PostgREST medido a 30,321 s con 57014. |

## Entorno y catálogo efectivamente consultados

Pablo confirmó explícitamente que `vyrjlehkhabydkhjxagx` es DESARROLLO y el proyecto donde aplicó 064/065. Coincide con SUPABASE_URL del backend y con la cuenta de servicio; la PWA local apunta a `http://localhost:3000`. La etiqueta de rama `main PRODUCTION` del dashboard se registró como contexto de la interfaz; la identificación de desarrollo procede de la confirmación de Pablo, no del nombre de una variable o de esa etiqueta.

Se ejecutaron consultas `BEGIN READ ONLY` / `ROLLBACK` en SQL Editor. [Preflight](evidencia/pa-privacidad-preflight-2026-10-14.json): PostgreSQL 17.6, 39 cuentas, ADMIN 5 / GENERAL 32 / VOLUNTARIO 2, RLS desactivada en usuario/organizacion y sin políticas, sin vistas dependientes de usuario. Funciones consumidoras SECURITY INVOKER; varias con EXECUTE público. `service_role` tiene BYPASSRLS, sin timeout específico; `authenticator` tenía statement_timeout y lock_timeout de 8 s. [Inventario adicional](evidencia/pa-vias-equivalentes-2026-10-14.json): credenciales con SELECT/INSERT/UPDATE/DELETE públicos; cero funciones SQL/PLpgSQL SECURITY DEFINER públicas y cero vistas de organización.

El JWT de la aplicación tiene `sub=usuario.auth_id`, texto distinto del PK BIGINT y de Supabase Auth. No se diseñó una política con `auth.uid()` sobre esa identidad. El cierre actual usa privilegios efectivos de DB y validación del actor en el backend/RPC, sin activar RLS ni conceder nuevas facultades por afiliación. Las RPC PA vuelven a comprobar actividad y pareja `{usuario_id,auth_id}`. 066 aborta íntegra ante grants heredados, una vista privada accesible o un definer consumidor público inesperado.

## Inventario de consumidores y adaptaciones

| Consumidor | Datos / adaptación |
|---|---|
| PWA `profile.service`, `users.api`, `organizaciones.api`, servicios de plantación | HTTP al backend; no cliente Supabase, consultas directas a tablas ni claves de servicio en el frontend. La ceremonia WebAuthn permanece igual. `register-form` proyecta explícitamente campos legados y excluye rol, incluso si recibe un objeto manipulado. El formulario usa v1. |
| Auth / Users | Ya usaban service_role para usuarios, join credencial→usuario, counter y perfil propio. El alias `/users/profile` incorpora afiliación v1 y muestra el nombre vigente del catálogo; los datos históricos siguen siendo solo propios. |
| Auth de campañas, plantaciones, recolección, vivero y organizaciones | Lectura de usuario cambia a cliente administrativo. No hay fallback a anon. |
| Consultas/actividad/equipo/contexto/activación de subcampañas y actividad de campañas | Joins de usuario/coordinador/actor/responsable cambian a cliente administrativo. |
| Consultas, timeline y asignaciones de vivero; consultas/snapshots de recolección; evidencias de trazabilidad | Lectura/join de nombre, apellido y otros campos internos mediante servicio privado. |
| RPC de inicio/embolsado/merma/despacho/adaptabilidad/descarte/asignación/devolución, desecho y plantación | Consumían usuario como invoker; pasan al cliente administrativo para conservar las operaciones autorizadas tras 066. Cancelación/plan ya usaban ese cliente. |
| Organizaciones | Cliente administrativo para CRUD y cambios de logo/filas. Guard JWT antes del servicio; servicio conserva `assertAdmin`. Selector v1 independiente para cualquier cuenta activa, incluido VOLUNTARIO, devuelve solo ID/nombre. |
| Impacto | `ImpactController` sigue sin guard y `ImpactService` conserva cliente público y proyecciones explícitas. No hace joins de usuario; los nombres históricos públicos siguen siendo snapshots. Conserva SELECT de organizaciones y caché pública. |
| DB | Inventario de grants de tabla/columna, privilegios efectivos, RLS, vistas, RPC y roles. Scripts de preflight/estado final de solo lectura. 064/065 se conservaron como historia. |

Los controllers privados de organizaciones, campañas, subcampañas, recolecciones, lotes de vivero, plantaciones y evidencias tienen `InternalActorGuard`. Verifica firma/expiración HS256, identidad coincidente y cuenta activa antes de aceptar ADMIN/GENERAL/VALIDADOR. Sustituye los headers legados de identidad/rol por lo comprobado, por lo que `x-user-role` no eleva permisos. GET del plan conserva todas las cuentas activas; PUT mantiene ADMIN en su servicio. Perfil/selector v1 conservan todas las cuentas activas. La afiliación no participa en autorización. Se documentó Bearer en Swagger de organizaciones.

`ActorModule` exporta también las dependencias del guard para su resolución en los módulos consumidores. El arranque local detectó este requisito y se añadió una prueba que inicializa los siete módulos reales sin .env ni red.

## SQL aplicado en desarrollo

- [066](../migrations/066_pa_int02a_privacidad_usuario_organizacion.sql): SQL Editor devolvió `PRIVACIDAD_USUARIO_ORGANIZACION_CONFIRMADA` después de COMMIT. Incluye MAINTAIN en PostgreSQL 17 y comprobación de privilegios efectivos antes de confirmar. No cambia filas ni roles de cuenta. Cierra también las sobrecargas de las RPC listadas; no revoca globalmente todas las funciones del schema.
- [067](../migrations/067_pa_int02a_postgrest_timeout.sql): configura service_role statement_timeout=30s y lock_timeout=5s y notifica recarga de configuración/schema PostgREST. Añade una RPC privada mínima de diagnóstico, sin acceso a filas y con espera máxima de 31 s. No tiene endpoint público en backend. SQL Editor devolvió `TIMEOUT_CONFIGURADO_PENDIENTE_MEDICION_POSTGREST`; después se realizó la medida REST.
- [Comprobación REST](evidencia/pa-rest-desarrollo-2026-10-14.json): cinco denegaciones anon reales con código 42501; configuración efectiva obtenida por service_role con 30s/5s; `pg_sleep(31)` cancelado por PostgreSQL tras **30.321 ms**, HTTP 500 / código **57014**. Este resultado acredita el límite antes de la llamada, no una configuración tardía dentro de la función.

Fuentes para el mecanismo de timeout: [Supabase Timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) y [PostgREST transactions](https://docs.postgrest.org/en/stable/references/transactions.html). La configuración de rol y la recarga corresponden a la documentación oficial; la evidencia anterior procede de la llamada real a este proyecto.

Reproducir los probes acotados con `node scripts/qa/pa-int02a-rest-verificar.cjs --project-ref vyrjlehkhabydkhjxagx --medir-timeout`. El script exige coincidencia exacta con .env, comprueba que el cliente público sea anon, no imprime claves y usa limit=0/filtro imposible para no leer ni alterar filas privadas. No ejecuta fixtures ni migraciones remotas.

[Estado final remoto](evidencia/pa-privacidad-estado-final-2026-10-14.json): **39 cuentas y roles 5/32/2 conservados**. Nueve combinaciones rol/tabla cotejadas: anon/authenticated sin SELECT de usuario/credenciales ni ningún privilegio de escritura/mantenimiento en las tres tablas; SELECT de organización conservado; service_role mantiene todos sus permisos. Cuenta QA 48 activa, GENERAL, revisión de autoridad 0 y afiliación original restaurada. Configuración service_role 30s/5s confirmada de nuevo.

## Verificación y límites

| Nivel | Resultado |
|---|---|
| Backend | `npm run build` aprobado. **54 suites / 594 tests** unitarios/HTTP aprobados. Incluyen arranque de módulos, siete audiencias privadas, sesión/actividad/headers, perfiles, autoridad manipulada y plan/Impacto. Estas pruebas sustituyen la frontera DB. |
| PWA | `npm run build`, `npm run lint` aprobados; **21 archivos / 295 tests** aprobados. Nuevos tests cubren IDs exactos, payload sin autoridad, null/Otra/catálogo, cambio de sesión, errores reales de contrato y formulario sin documento/wallet. |
| PostgreSQL sintético aislado | Clúster propio `/tmp/pa-privacidad-pg-20261014`, puerto 6544, base fresca `pa_privacidad_sintetica_02`, PostgreSQL local 14.17. **18 denegaciones SQL reales**, conservación de filas, perfil/selector VOLUNTARIO, BIGINT, rollback ante vista pública e idempotencia de 066/067. La regresión completa previa de perfil después de 066/067 también pasó. Ningún fixture se cargó sobre Supabase. MAINTAIN no existe en 14; su cierre se comprobó en desarrollo 17.6. |
| QA navegador → backend → Supabase | [Resumen](evidencia/pa-qa-real-2026-10-14.json) y [traza sin tokens/datos personales](evidencia/pa-navegador-backend-db-2026-10-14.jsonl). Passkey real, cuenta 48 GENERAL; RPC de perfil y selector 200; los tres estados de afiliación persisten tras recarga; afiliación original restaurada. Ningún ascenso de rol ni creación de catálogo. |
| Negativos con JWT real | Identidad ajena 401; rol en v1/alias 422; creación de organización por GENERAL 403. GET plan de subcampaña 103: 200 y `private, no-store`; PUT GENERAL con formato válido: 403, sin RPC de escritura. Primer intento de PUT de un plan vacío recibió 400 por metas ausentes; no se confundió con una denegación de autorización. |
| Sin sesión / público | [HTTP real](evidencia/pa-http-sin-sesion-2026-10-14.json): perfil, selector, organizaciones y plan 401 aun con headers elevados. Impacto: listado 200 con seis organizaciones y caché pública; dashboard de organización 55 200. Ambos abrieron también en una ventana privada de Brave sin sesión. |
| Lint backend | Identidad/perfil, nuevos guards/módulos/tests, HTTP del plan y Swagger de organizaciones aprobados. La comprobación de los archivos legados alcanzados mostró **616 errores / 38 avisos**, mayormente deuda de `any` ya existente; el lint global del backend sigue fuera de aprobación. La comparación por regla de los tests modificados frente a HEAD no encontró errores/avisos adicionales. No se ejecutó el script global con `--fix` ni se amplió a una limpieza ajena. `git diff --check` aprobado en los tres repos. |

El QA real utilizó una cuenta GENERAL existente, no una nueva cuenta VOLUNTARIO: VOLUNTARIO, cuatro roles, IDs >2^53, rollback y concurrencia se verificaron en HTTP simulado/fixtures PostgreSQL. La intervención humana confirmó la ceremonia real; no se usó un JWT fabricado para ese QA. No se ensayó mutación ADMIN del plan con datos reales ni se hizo un registro participante de plantación/stock. Los controles restantes de INT02-B/C/D y el piloto conservan su alcance posterior.

## Orden de integración y trabajo posterior

Desarrollo ya tiene 064/065 confirmadas previamente y 066/067 aplicadas y verificadas en esta continuación. La prueba API/PWA fue con **backend/PWA locales**, no demuestra que Render/Vercel tengan este código publicado.

Para otro entorno: identificar proyecto y consumidores; aplicar 064/065 si corresponde; preparar backend con service_role y guards y PWA v1; coordinar el corte del backend consumidor antes de revocar SELECT público; aplicar 066/067; ejecutar estado final/probes REST y QA de dispositivo/plan/Impacto; entonces coordinar publicación. Un backend anterior que todavía lee usuario con anon necesita esta adaptación. No restaurar grants públicos como rollback de compatibilidad; usar el backend adaptado o coordinar la recuperación manteniendo privacidad.

Producción, publicación y habilitación del piloto requieren coordinación posterior. Este trabajo no incorpora gestión de roles/baja, permisos contextuales, motor de comandos, snapshots de registros ni toda la política por objeto/locks de INT02-D. No habilita el piloto.
