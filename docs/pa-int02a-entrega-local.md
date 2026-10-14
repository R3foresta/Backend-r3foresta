# PA-T-INT02-A — entrega local para revisión

> **Continuación del 14 de octubre:** privacidad, PWA y QA real actualizados en [el informe de integración](pa-int02a-continuacion-2026-10-14.md). 066/067 se aplicaron y verificaron en desarrollo; el texto del 13 que sigue conserva la evidencia histórica y sus pendientes de ese momento. Producción/piloto no habilitados.

Fecha: 2026-10-13. Base revisada: backend `ae19480bac9ccb2015fe825cbbc8a720972074e9`; PWA `6520b6beb3096b83d27e461dd155fa5631195386`. Ambos árboles estaban limpios antes de editar. Esta nota distingue código/pruebas locales y resultados SQL aportados por Pablo en desarrollo: conciliación, 064 y 065 confirmadas por esos resultados. El agente no se conectó al remoto. Publicación y habilitación del piloto siguen pendientes.

## Comportamiento implementado

- Alta WebAuthn conserva la ceremonia y el JWT `sub=auth_id`; inserta `VOLUNTARIO` explícitamente con nombre inicial desde username NFC/trim. DTO de alta rechaza autoridad y desconocidos con 422. La relación con la credencial usa PK exacto leído como texto. El default DB de la migración añade la misma defensa. No se cambian roles de cuentas existentes.
- Guard JWT común para las rutas de `users` y el plan: Bearer, HS256, secret obligatorio, firma/expiración y `sub`/`exp` válidos; `x-auth-id` solo si coincide. El guard de perfil consulta actor y actividad por función privada de DB. `x-user-role` y body no autorizan. Perfil/selector requieren cuenta activa y devuelven `Cache-Control: private, no-store`.
- Nuevos `GET/PATCH /api/v1/usuarios/me/perfil` y `GET /api/v1/participacion/organizaciones-seleccionables`, con envelope v1, BIGINT decimal en cadena, entrada/salida estrictas y selector mínimo. Las RPC reciben `{usuario_id,auth_id}` del actor verificado y revalidan la cuenta. La función de actualización bloquea la cuenta y valida organización activa `FOR SHARE`; conserva afiliación guardada a organización luego inactiva. La lectura usa nombre vigente completo del catálogo. Búsqueda y orden usan NFC; cursor opaco por ID evita superar 1024 caracteres por nombres de catálogo largos. Entre páginas se lee el catálogo vigente, sin prometer snapshot inmutable.
- `GET /api/users/profile`, `POST /api/users/register-form`, selectores de usuarios y foto propia conservan sus rutas legadas con JWT obligatorio. Los aliases proyectan ID exacto del actor: número cuando es seguro o cadena para PK grande, conforme al tipo `string|number` que ya admite la PWA. `register-form` ya no escribe rol; `rol` enviado responde `422 CAMPO_NO_PERMITIDO`. Guarda perfil y campos históricos explícitos (documento, wallet, contacto) en una sola transacción. Foto propia revalida actividad después del HTTP de Storage, sin retener locks durante la subida. Los directorios `/api/users` y `/rol/:rol` deniegan VOLUNTARIO y conservan ADMIN/GENERAL/VALIDADOR para los consumidores operativos vigentes; la política completa por objeto corresponde a INT02-D. Se quitó `GET /api/auth/test-supabase`, que exponía un directorio sin sesión. Impacto público no recibió guard. GET/PUT del plan preservan audiencia y agregan caché privada.
- No se añadió operación de roles/baja, permisos contextuales, cambios de stock o UI del piloto.

## SQL y orden de integración

1. Ejecutar `scripts/sql/pa-int02a-catalog-preflight.sql` **solo lectura** en el entorno remoto identificado. Cotejar tipos, defaults, nulabilidad, duplicados `auth_id`, nombres, afiliaciones legadas, roles, índices, ACL de tablas/columnas, privilegios efectivos, RLS, triggers y funciones consumidoras. La URL en `.env` no identifica por sí sola el entorno; no se consultó el remoto.
2. Revisar datos y grants hallados; no aplicar `migrations/064_pa_int02a_identidad_perfil.sql` si aparecen divergencias. La migración añade `activo`, `revision_autoridad`, `organizacion_id`, FK RESTRICT, CHECK de exclusión, `auth_id` único/NOT NULL/no vacío, default VOLUNTARIO y RPC privadas con grants a `service_role`. Falla sin conciliar `auth_id` duplicado/vacío o cuenta sin nombre/username. No trunca afiliación textual ni reclasifica usuarios.
3. Aplicar la migración antes del backend que usa las nuevas RPC. Ejecutar regresión en staging y revisar ACL/RLS reales. La prueba local no demuestra permisos efectivos de la base remota ni que todos los clientes/RPC legados estén cerrados: ese corte pertenece a INT02-D/D12. No habilitar piloto con esta entrega sola.

Las RPC que adquieren locks establecen `lock_timeout` de 5 s. El objetivo `statement_timeout` de 30 s requiere configuración previa al comando en sesión/PostgREST y comprobación en el entorno identificado. Un ensayo aislado confirmó que configurarlo dentro de la función no limita la invocación corriente; se retiró esa falsa garantía. No se cambió configuración global/remota.

### Diagnóstico de intentos con versiones anteriores de 064

Pablo identificó el entorno como **desarrollo** y reportó intentos de ejecutar versiones anteriores de 064 con errores. Los primeros adjuntos contienen 66 triggers de FK y el SQL de una versión anterior; no contienen el mensaje de error. Después aportó el JSON completo del diagnóstico, observado el **2026-10-13 a las 20:39:22 UTC**, con estos datos:

| Comprobación | Estado observado en el resultado aportado |
|---|---|
| Cuentas/autoridad | 39 cuentas: ADMIN 5, GENERAL 32 y VOLUNTARIO 2. |
| Identidades | 8 `auth_id` nulos/vacíos y 1 grupo duplicado. El grupo puede corresponder a los vacíos; el agregado no lo distingue. |
| Objetos 064 | Ausentes `activo`, `revision_autoridad`, `organizacion_id`, constraints de identidad y las cinco RPC; ninguna sobrecarga PA presente. Default de rol aún GENERAL. |
| Datos de perfil | 0 cuentas sin nombre/username identificable; 0 afiliaciones textuales de más de 150 caracteres. |
| ACL/RLS | RLS desactivada en usuario/organizacion. `anon` y `authenticated` conservan INSERT/UPDATE efectivos en usuario; la revocación de 064 aún no está aplicada. |
| Sesión SQL Editor | PostgreSQL 17.6, UTF8, UTC; `statement_timeout=2min`. No acredita el límite de las llamadas PostgREST. |

Pablo aportó después el manifest de solo lectura observado el **2026-10-13 a las 20:51:56 UTC**: IDs **1–8**, todos con `auth_id` vacío, sin credenciales y sin FK a `auth_id`; **0 duplicados no vacíos**. El único grupo duplicado del diagnóstico anterior corresponde a esos ocho valores vacíos. Los IDs **2 y 7** son VOLUNTARIO; **1, 3, 4, 5, 6 y 8** son GENERAL. El script de escritura queda acotado a este manifest y vuelve a comprobarlo bajo locks antes de modificarlo.

El catálogo aportado corresponde al estado **previo a 064**. Las 8 identidades nulas/vacías bastan para activar el primer guard de ambas versiones y abortar la migración. No hace falta recuperar el error anterior para localizar esta precondición. El agente no se ha conectado al remoto.

**Conciliación aplicada por Pablo en desarrollo:** el resultado aportado, observado el **2026-10-13 a las 20:55:44 UTC**, devuelve `CONCILIACION_CONFIRMADA`, **8 cuentas actualizadas** y el manifest esperado `pa_legacy_1`…`pa_legacy_8`, conservando seis GENERAL y dos VOLUNTARIO. El script emite ese resultado después de COMMIT. Pablo confirma que sigue sin RLS; la conciliación no la modifica. En ese momento 064 aún no estaba acreditada. Esa migración restringe INSERT/UPDATE/DELETE de usuario y ejecución de las RPC mediante grants; no activa RLS ni cierra la lectura directa pública preexistente, que continúa como pendiente del corte completo.

**Primer intento posterior de 064:** Pablo reportó `42601: syntax error at or near "public"`, línea 161 de su consulta, en el listado de permisos. El archivo original pasó en PostgreSQL local y la [gramática de PostgreSQL 17](https://www.postgresql.org/docs/17/sql-grant.html) admite múltiples firmas; el mensaje por sí solo no permite identificar la diferencia del SQL ejecutado. Se simplificó el bloque a un REVOKE y un GRANT independientes por cada RPC, conservando sus destinatarios, cuerpos, argumentos y huellas. La 064 completa actualizada y sus permisos efectivos se probaron de nuevo en bases sintéticas aisladas.

**064 aplicada y cotejada en desarrollo:** el diagnóstico completo aportado por Pablo, observado el **13 de octubre a las 17:07:17 America/La_Paz (21:07:17 UTC)**, confirma:

- 39 cuentas y los mismos conteos ADMIN 5, GENERAL 32, VOLUNTARIO 2; cero `auth_id` nulos/vacíos/duplicados.
- `activo`, `revision_autoridad`, `organizacion_id`, default VOLUNTARIO, identidad NOT NULL/única/no vacía y constraints de afiliación/FK/revisión presentes y validados.
- Las cinco RPC con firmas, nombres de argumentos y huellas textuales coincidentes; SECURITY INVOKER, ejecución para service_role y denegada a anon/authenticated, sin sobrecargas antiguas.
- INSERT/UPDATE públicos de usuario denegados en todas las columnas; DELETE también retirado de la ACL.

El resultado posterior a 064 reveló un cierre incompleto: la ACL de usuario para anon/authenticated era `rDxtm`. Según [las abreviaturas de PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-priv.html), además de SELECT conservaba TRUNCATE, REFERENCES, TRIGGER y MAINTAIN. Se preparó **`migrations/065_pa_int02a_usuario_privilegios_residuales.sql`**, sin editar la 064 ya aplicada. Revoca esos privilegios en usuario y comprueba privilegios efectivos antes de COMMIT, incluyendo posibles grants heredados. MAINTAIN se ejecuta únicamente en PostgreSQL 17 o superior. El script emite `PERMISOS_RESIDUALES_CONFIRMADOS` después de COMMIT y es repetible.

**065 aplicada y verificada en desarrollo:** Pablo aportó el resultado observado el **13 de octubre a las 17:25:47 America/La_Paz (21:25:47 UTC)**, servidor **17.6**, con `PERMISOS_RESIDUALES_CONFIRMADOS` y los privilegios efectivos esperados:

| Rol SQL | SELECT de usuario | INSERT/UPDATE/DELETE | TRUNCATE/REFERENCES/TRIGGER/MAINTAIN |
|---|---|---|---|
| anon | true | todos false | todos false |
| authenticated | true | todos false | todos false |
| service_role | true | todos true | todos true |

Conserva **39 cuentas**, con **ADMIN 5, GENERAL 32 y VOLUNTARIO 2**. La rama MAINTAIN quedó confirmada en PostgreSQL 17.6 por el resultado aportado. Esto acredita el cierre de escritura y permisos residuales de usuario para los roles públicos; la lectura privada y el catálogo todavía requieren el corte descrito abajo. El agente no ejecutó SQL en Supabase.

RLS sigue desactivada en usuario/organizacion. SELECT de usuario y escritura directa pública de organizacion permanecen en el catálogo recibido: su corte requiere el inventario de consumidores y la integración INT02-D. La 065 cierra permisos residuales de usuario; no acredita el cierre completo de privacidad ni de catálogo. El diagnóstico de solo lectura ahora incluye `privilegios_tabla` con DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para hacer visibles estos accesos.

Usar `scripts/sql/pa-int02a-estado-aplicado.sql`, exclusivamente de solo lectura: devuelve columnas, constraints, índices, ACL/RLS, privilegios efectivos y las cinco firmas/huellas RPC esperadas en **un único JSON**, sin filas personales. La consulta se probó sobre el fixture antiguo (`pa_int02a_verify5`, solo una firma actual presente) y el revisado (`pa_int02a_review_complete`, cinco firmas/argumentos/huellas coincidentes). Las huellas son comparación textual, no sustituyen revisar diferencias de definición.

Para el catálogo observado, el orden de corrección es:

1. Revisar `scripts/sql/pa-int02a-conciliacion-auth-id.sql`, **solo lectura**. Completado con el JSON aportado por Pablo a las 20:51:56 UTC. Devuelve IDs técnicos y roles de las cuentas afectadas, su clasificación y cantidad de credenciales, y FK a `auth_id`; omite nombres, correos, identidades y claves.
2. Conciliación con escritura `scripts/sql/pa-int02a-conciliar-usuarios-legados.sql`: **completada según el resultado aportado por Pablo a las 20:55:44 UTC**. Asigna `pa_legacy_1`…`pa_legacy_8` exclusivamente a las ocho cuentas del manifest, conservando PK, los seis GENERAL/dos VOLUNTARIO y perfil. Son identificadores técnicos para filas legadas; no crean passkeys ni habilitan login. La transacción bloquea cuentas y credenciales y aborta sin cambios ante un manifest distinto, otra cuenta vacía, passkeys, duplicados no vacíos, colisiones o FK a `auth_id`. Devuelve `CONCILIACION_CONFIRMADA` y ocho actualizaciones después de COMMIT; una repetición ya conciliada devuelve cero cambios.
3. Si aparecen credenciales o duplicados no vacíos, resolver el vínculo de cada identidad con evidencia concreta antes de modificarla. El script no reasigna estas identidades ni elimina cuentas/credenciales.
4. **064 completada según el diagnóstico aportado a las 21:07:17 UTC.** Las cinco firmas/argumentos/huellas, constraints, default, identidad, conteos por rol y revocación de INSERT/UPDATE coinciden.
5. **065 completada según el JSON `verificacion_065` aportado a las 21:25:47 UTC.** Todos los privilegios distintos de SELECT en usuario están en false para anon/authenticated, incluidos TRUNCATE y MAINTAIN. Las 39 cuentas y conteos por rol se conservaron. La integración API/cliente y el corte de privacidad siguen pendientes.

La 064 contiene `ADD CONSTRAINT` y las firmas cambiaron durante la revisión: si un diagnóstico posterior ya muestra objetos de una versión aplicada, revisar ese catálogo y preparar el incremento correspondiente antes de repetirla. La corrección anterior se basa en la ausencia de esos objetos en el resultado aportado.

## Compatibilidad PWA observada

- La PWA vigente llama `GET /api/users/profile` y `POST /api/users/register-form` con Bearer; las respuestas legadas se conservan. También envía `x-auth-id` en selectores, junto con Bearer, compatible si coincide.
- `CompleteProfileScreen.tsx` inicializa `rol: user?.rol || 'GENERAL'` y envía `...formData`, por lo que el formulario actual recibirá **422** en `register-form`. Antes de publicar este backend, retirar `rol` del payload (y del tipo/estado del formulario) en la PWA. La validación actual de la PWA exige documento y limita texto de organización a 25; el recorrido nuevo opcional debe usar el contrato v1 cuando se integre la UI. No se editaron archivos de la PWA en esta tarea.
- No publicar backend y PWA actuales juntos sin ese ajuste. La migración de cliente más amplia queda para su entrega de integración.

## Evidencia local

- `npm run build`: pasó.
- `TMPDIR=/tmp npm test -- --runInBand --silent`: **52 suites, 570 tests pasaron**. Incluye límites/DTO, HTTP de alta manipulada, token, perfil, aliases, directorio, paginación, plan e Impacto público, y prueba de inserción VOLUNTARIO/PK exacta de credencial. Los tests HTTP sustituyen la frontera Supabase; no acreditan base remota ni una ceremonia real de dispositivo.
- PostgreSQL aislado en `/tmp`, puerto 6543, base `pa_int02a_review_complete`: `psql -h /tmp -p 6543 -U postgres -d pa_int02a_review_complete -v ON_ERROR_STOP=1 -f test/db/pa-int02a-fixture.sql` y luego `test/db/pa-int02a-assertions.sql` pasaron. El fixture requiere una base vacía aislada con privilegios para crear roles sintéticos. Comprueba edición de los cuatro roles conservando actividad y revisión 17, default de alta, texto legado largo, IDs > 2^53, exclusión/FK/unicidad/no vacío, selección activa, renombre/inactivación, NFC, paginación, nombre de catálogo de 2000 caracteres y rollback por conflicto histórico. Siembra grants/políticas RLS permisivos y ejecuta llamadas reales como service_role y denegaciones anon/authenticated. No se usaron datos reales.
- `python3 test/db/pa-int02a-concurrency.py --database pa_int02a_review_complete`: pasó en ambos órdenes de selección/inactivación, observando la espera de lock en `pg_stat_activity` antes de liberar la barrera; rechazo sin efectos si la inactivación gana. El script exige socket local y marcador sintético.
- La consulta de inventario se ejecutó correctamente **solo contra la base sintética**, sin cambios (`BEGIN READ ONLY` / `ROLLBACK`).
- Conciliación acotada al manifest y aplicación consecutiva de 064 en `pa_int02a_conciliacion_03`: `psql -h /tmp -p 6543 -U postgres -d pa_int02a_conciliacion_03 -v ON_ERROR_STOP=1 -f test/db/pa-int02a-conciliacion-fixture.sql` y `python3 test/db/pa-int02a-conciliacion.py --database pa_int02a_conciliacion_03` pasaron. Fixture vacío sintético con 39 cuentas/roles 5/32/2, los IDs y roles del manifest, ocho identidades vacías, historial referenciado y una credencial que impide la primera conciliación. Verifica seis rechazos sin cambios (credencial, duplicado no vacío, rol del manifest cambiado, afectada fuera del manifest, colisión y FK), conciliación de ocho cuentas sin credenciales, repetición con cero cambios, 064 y diagnóstico final coincidente; conserva todos los campos previos, credenciales de cuentas válidas e historial. El manifest real, la conciliación y 064 están acreditados por los resultados aportados por Pablo.
- Tras simplificar el bloque de permisos por el error 42601, se repitieron el fixture/runner de conciliación en `pa_int02a_conciliacion_04` y el fixture/assertions completos en `pa_int02a_permisos_04`: ambos pasaron con la 064 actualizada. El diagnóstico del runner confirmó las cinco firmas/argumentos/huellas y el cierre de INSERT/UPDATE público; las assertions ejecutaron denegaciones reales anon/authenticated y llamadas service_role. PostgreSQL local 14.17; entorno de desarrollo reportado 17.6. Estas pruebas no confirman la aplicación remota.
- `python3 test/db/pa-int02a-permisos-residuales.py --database pa_int02a_conciliacion_04`: pasó con 065. Siembra TRUNCATE/REFERENCES/TRIGGER permisivos y REFERENCES de columna a PUBLIC; verifica revocación, repetición, seis denegaciones SQL reales, las 39 cuentas/roles/perfiles/credenciales/historia íntegros, acceso service_role y las cinco huellas RPC. La regresión completa de `pa-int02a-fixture.sql` → 065 → `pa-int02a-assertions.sql` pasó en una base nueva `pa_int02a_acl_revision_05`. Un primer intento sobre el fixture ya modificado falló porque conservaba una organización inactiva de pruebas anteriores; se repitió sobre base vacía. MAINTAIN no existe en PostgreSQL local 14.17; su rama quedó confirmada en PostgreSQL 17.6 mediante el resultado aportado por Pablo de 065.
- ESLint de todos los archivos TypeScript modificados: pasó. La comprobación global encontró errores en archivos ajenos a la entrega (1.313 errores y 106 avisos restantes); no se aplicó `npm run lint` porque usa `--fix` sobre todo el árbol.
- `git diff --check`: pasó. No se creó commit ni se hizo push/despliegue.

## Pendientes concretos

- Conciliación, 064 y 065 confirmadas en desarrollo por resultados aportados. Completar consumidores/grants, cierre de SELECT privado de usuario y escrituras públicas de organizacion en INT02-D; no habilitar el piloto con esos accesos abiertos. Despliegue y regresión API/cliente reales siguen pendientes.
- Configuración y medida del límite de 30 s antes de ejecutar las RPC en PostgREST/sesión.
- Cambiar el payload de la PWA antes de publicar este backend; integrar formulario/selector v1 y retirar obligación de documento en el recorrido piloto.
- Cerrar rutas internas equivalentes y políticas por operación/objeto en INT02-D; permisos/manifest en INT02-B, comandos de rol/baja en INT02-C y snapshots de registros en INT03-A.

## Resultado de la revisión contra tarea y contrato

Se releyeron `inicio-pa-t-int02-a.md` y el contrato aceptado, con dos revisiones independientes de código y SQL. Se corrigieron actualización parcial del alias, directorio abierto a VOLUNTARIO, precisión de IDs legados/credencial, headers del plan, cursor con nombres largos, normalización del catálogo, constraints de identidad y negativos SQL que podían ocultar su propio fallo. Se añadió evidencia de permisos y concurrencia. La revisión descartó el supuesto bypass por ACL de columnas: PostgreSQL sí las revoca al revocar el privilegio de tabla; se conserva revocación explícita adicional y prueba con ACL previas.

Los criterios locales aplicables de INT02-A están acreditados por las pruebas anteriores; los permisos residuales detectados quedaron cerrados por 065 aplicada en desarrollo. Los pendientes de privacidad, API y consumidor impiden interpretar esta entrega como autorización de publicación o piloto. `r3foresta-docs/ESTADO.md` registra la implementación/revisión local y los resultados aportados de conciliación/064/065 en desarrollo, con enlace a esta evidencia; despliegue e integración real siguen pendientes. Ambas actualizaciones documentales quedan sin commit/push.
