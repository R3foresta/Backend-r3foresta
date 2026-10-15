# PA-T-INT02-B — base de permisos y transición ensayada

**14 de octubre de 2026, America/La_Paz. Cierre técnico local parcial:** esquema y bootstrap implementados y ensayados; 068–071 aplicadas en desarrollo y estado SQL posterior compacto cotejado (PostgreSQL 17.6), además de 18 probes REST aprobados. Inventario complementario del catálogo y correspondencia real revisada pendientes. No completa INT02, PA-S03 ni el piloto. [Ficha](../../r3foresta-docs/specs/plantacion/participacion-aliada/implementacion/pa-t-int02-b.md).

## Versiones y entorno

| Repositorio / entorno | Evidencia |
|---|---|
| Backend al iniciar | `57e5b7155270e0d83936175ef51d31575876ec11`, árbol limpio, última migración 067. Esta entrega son cambios locales sin commit/push. |
| PWA consultada | `cf13036`, árbol limpio; sin cambios frontend en B. |
| Documentación consultada | `89dfdb2aaf8d976acb84d5692122c58d8da00b6e`, con cambios previos de preparación. Actualización puntual de ficha/tablero/tareas/estado, preservando esos cambios. |
| Ensayo | PostgreSQL **14.17**, clúster nuevo propio en `/private/tmp/pa-int02b-*`, base `pa_int02b_ensayo`, socket privado, TCP deshabilitado. Destruido al terminar. Datos sintéticos; no carga `.env`. |
| Destino confirmado por Pablo en este chat | Supabase de **desarrollo** `vyrjlehkhabydkhjxagx`. No hay conexión PostgreSQL configurada en `.env`. Pablo confirma las cuatro migraciones sin errores; 18 probes REST aprobados y salida SQL READ ONLY del 14 a las 18:39 cotejada. No se recibieron filas privadas. El catálogo posterior compacto está acreditado; el inventario complementario y el preflight previo siguen sin acreditarse. La evidencia de A sobre PostgreSQL 17.6/064–067 es histórica y no sustituye BE01 actual. |

[Resultados y huellas de archivos](evidencia/pa-int02b-local.json). Las huellas identifican fuentes locales ensayadas; un HEAD anterior no identifica por sí solo estos cambios.

## Entrega por tarea

| ID | Evidencia / estado |
|---|---|
| BE01 | Checkout/versiones y consumidores cotejados estáticamente. [Preflight amplio](../scripts/sql/pa-int02b-catalog-preflight.sql) y [estado compacto](../scripts/sql/pa-int02b-estado.sql) ejecutables, de solo lectura, probados en fixture. **Catálogo posterior compacto recibido y cotejado**: restricciones/privilegios/RLS/funciones/marca. Preflight previo no recibido; inventario complementario de índices/triggers/enums/políticas/secuencias/MAINTAIN/tipos completos pendiente. No reconstruir fotografía anterior a partir del estado posterior. |
| BE02 | [068](../migrations/068_pa_participacion_comando.sql) crea el DDL compartido §7.1 antes de las FKs de 070. Identidad interna BIGINT/publica UUID, clave por actor/operación/UUID, estados/ciclo/huella/JSON/fechas/FKs e índices; identidad/scope/terminal inmutables, tombstones no borrables. Catálogo de futuras operaciones reservado, sin motor ni API. |
| BE03 | [069](../migrations/069_pa_int02b_eventos_acceso.sql) añade eventos; [070](../migrations/070_pa_int02b_permisos_contextuales.sql) crea revisiones estables y vigencias, extiende historial existente y marca inicialización. FKs nuevas RESTRICT, un vigente por persona/ámbito, catálogo cerrado y retiro completo. Revisión primera 1 y avance de uno; ausencia 0 sin escritura; vigencia cerrada no se reabre. Administrador incluye plantar en una sola fila. |
| BE04 | RLS habilitada en las tres tablas nuevas, sin política pública; ACL de tabla/columna/secuencia cerradas para PUBLIC/anon/authenticated y helpers/sobrecargas cerrados. Servicio conserva solo operaciones necesarias; historial SELECT/INSERT. Vistas privadas públicas, permisos heredados y políticas públicas incompatibles abortan la migración. Protección real ensayada, **18 probes REST y cotejo SQL compacto en Supabase aprobados**: anon/authenticated sin SELECT/INSERT/UPDATE/DELETE/TRUNCATE, servicio acotado, tres RLS nuevas y seis funciones privadas con cuerpos coincidentes. Catálogo complementario no capturado por el estado compacto sigue pendiente. |
| BE05 | [Export de correspondencias](../scripts/sql/pa-int02b-manifest-propuesta.sql) versionado con propuestas null/decisiones PENDIENTE, fuentes y excepciones separadas. Equipo/hechos solo originan candidatos; GENERAL, VALIDADOR, COORDINADOR, organización e historia no asignan permisos. ADMIN global conserva acceso derivado. **Manifest real y decisión de Pablo por correspondencia pendientes**. |
| BE06 | [071](../migrations/071_pa_int02b_bootstrap_controlado.sql), [manifest sintético versionado](../test/db/fixtures/pa-int02b-manifest-sintetico.json) y [runner](../scripts/qa/pa-int02b-db-test.py). Inicialización explícita todo-o-nada de ámbitos sin marca/revisiones/vigencias, ≥1 administrador contextual activo; cerrados solo administradores, sin nuevos plantadores. Misma clave/manifest normalizado recupera recibo sin ampliar ni reactivar retiros; otra clave en un ámbito inicializado rechaza. |
| BE07 | Este informe, fixtures, comandos, resultados y actualización del seguimiento con límites. Entrega técnica parcial; aplicación 068–071 confirmada y cotejada por SQL compacto/REST. BE01 completo y BE05 real no se marcan completados. |

068 conserva catálogo reservado `INICIALIZAR_PARTICIPACION_LEGADA` para mantenimiento B. 071 es **SECURITY INVOKER**, privado y sin endpoint HTTP; no instala despacho/ejecución/recuperación del motor INT03-A. Su huella operacional usa `PA-BOOTSTRAP/1` y el manifest JSONB ordenado por IDs; no sustituye el canonicalizador HTTP `PA-COMANDO/1`. El recibo contiene IDs/roles/revisión; fuentes/justificaciones/decisiones quedan en la auditoría contextual.

## Consumidores y compatibilidad

| Facultad / consumidor actual | Resultado de B / dependencia |
|---|---|
| Alta/perfil, identidad y afiliación | Conserva INT02-A, actividad/rol y perfiles. No hay conversión de GENERAL a VOLUNTARIO ni autoridad por afiliación. |
| Creación/edición/borrado/cierre/polígono de subcampañas | Escrituras pasan a `getAdminClient()`, conservando guard/policy ADMIN actuales. 070 revoca escritura pública de `subcampania` para proteger la nueva marca; SELECT legado se conserva. |
| Historial legado | `SubcampaniasHistorialService` pasa a cliente privado. Conserva eventos previos y su comportamiento existente; acceso nuevo se audita obligatoriamente dentro de 071. El servicio no recibe eventos nuevos de acceso ni sustituye la transacción. |
| Activación/cancelación/plan/equipo | Ya usan cliente administrativo; sin cambios de reglas/logística. 062/063 se conservan. |
| Inicial/contexto interno | Conserva autorización interna actual. B no añade fallback permiso OR equipo, ni habilita participantes; adaptación al motor contextual en INT03-A/D. |
| Entregas/devoluciones/reposición/mantenimiento | Roles/responsabilidad logística y hechos se preservan. Los permisos de participación no conceden esas facultades; locks/rutas equivalentes/origen del mismo ámbito siguen en D. |
| Impacto / PWA | Sin cambio de contrato público ni API nueva consumible. Gestión HTTP/capacidades/miembros/búsqueda en C; interfaz en INT06. |

Las nuevas FKs de historial a comando/actor son RESTRICT. La FK histórica de `actor_user_id` a `usuario` ON DELETE SET NULL de 047 se conserva: no se reescribe el contrato de filas antiguas ni se inventan comandos para ellas. El nuevo chequeo exige comando/actor, estado conservado y arrays antes/después no vacíos para eventos de acceso.

## Verificación reproducible

```sh
npm run build
npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/pa-int02b-jest-cache
npm run test:db:participacion
git diff --check
```

Build aprobado; **54 suites / 594 pruebas** de backend aprobadas; **53 casos PostgreSQL / 78 denegaciones SQL reales** aprobados. [Matriz completa](evidencia/pa-int02b-local.json) y [assertions](../test/db/pa-int02b-assertions.py).

El ensayo cubre instalación/repetición antes y después de cambios, restricciones/PK/FKs/retirada/revisión/marca, conservación de roles/equipo/perfiles/hechos/historia, un/dos administradores efectivos, cuenta inactiva que no cuenta, bootstrap cerrado/replay tras retiro, rechazo de manifest inconsistente/inactivo todo-o-nada, terminalidad de comandos, funciones y sobrecargas, secuencias, grants heredados, vista que elude la frontera y política pública incompatible. Rechazos comparan estado antes/después. El export de propuestas no aprueba correspondencias.

El primer intento de runner bajo sandbox falló por memoria compartida; se ejecutó luego con permiso local ampliado y TCP deshabilitado. Jest necesitó caché en `/private/tmp` y permiso para sockets HTTP locales de Supertest. Son restricciones del entorno de ejecución, no resultados acreditados contra Supabase. El fixture es antecedente mínimo post-067: **no acredita replay 001–067**, PostGIS, Storage, MAINTAIN de PostgreSQL 17 ni QA integrado. No se ejecutó lint global ni pruebas de integración que escriben en Supabase.

## Momento y orden de aplicación en Supabase

Pablo confirmó **068, 069, 070 y 071 sin errores**. Verificación REST aprobada y estado SQL compacto posterior recibido/cotejado. Paso pendiente de catálogo: completar índices/triggers/enums/políticas/secuencias/MAINTAIN/tipos completos y protección de marca en subcampania. No se recibió el preflight previo en este chat; no reconstruirlo a partir del estado posterior. El orden siguiente documenta la secuencia para otro entorno, no pide reaplicar en desarrollo. El estado compacto se guarda antes y después para comparar roles/cuentas/equipo/hechos/historial/ACL.

1. Ejecutar `scripts/sql/pa-int02b-catalog-preflight.sql` y `scripts/sql/pa-int02b-estado.sql` en el proyecto de desarrollo confirmado; revisar que no haya incompatibilidad ni vía pública de historia/permisos. No registrar credenciales ni filas personales en Git.
2. Preparar este backend con cliente privado y configuración de servicio; verificar que los consumidores nuevos sean los activos antes del cierre de escritura de 070. Git local/build aprobado no demuestra despliegue.
3. Aplicar **068 → 069 → 070 → 071**, cada archivo completo y como ejecución separada. **069 debe confirmar COMMIT antes de 070** por los valores ENUM nuevos. No envolver las cuatro en una sola transacción exterior.
4. Instalar 071 solo crea la función privada: **no ejecutar el manifest sintético en Supabase**. Ninguna de estas migraciones asigna permisos ni hace bootstrap de personas reales.
5. Volver a ejecutar ambos scripts de estado/catálogo y cotejar grants efectivos, todas las sobrecargas, FKs validadas y conteos legados. Registrar aplicación/versión/entorno por separado. Detener la secuencia si un archivo falla; conservar el error y estado sin asumir aplicación de los siguientes.

## Comprobación REST después de la aplicación informada

[Resultado real en desarrollo](evidencia/pa-int02b-rest-desarrollo.json), 14 de octubre a las 18:35 America/La_Paz: **18 probes aprobados, incluidas 10 denegaciones anon HTTP 401 / PostgreSQL 42501**. Tablas nuevas/historial y marca presentes; service_role obtiene SELECT `limit=0`, y el bootstrap privado rechaza el manifest vacío con `22023 PA_MANIFEST_INVALIDO` antes de leer cuentas/escribir. Se comprobó también que el cliente público sea aceptado por una lectura pública sin filas y que el cliente privado ejecute como service_role. No se confundió un error de clave con una denegación de DB.

```sh
node scripts/qa/pa-int02b-rest-verificar.cjs --project-ref vyrjlehkhabydkhjxagx
```

El script admite la clave pública publishable presente en el entorno, enviada en `apikey`; las claves JWT llevan además su Bearer. Fuente primaria: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys). No imprime claves ni filas privadas. Los PATCH tienen filtro contradictorio y el único probe de bootstrap usa un manifest inválido sin efectos. No ejecutó inicialización real.

Este resultado acredita presencia del esquema consumible y la denegación **anon REST**; no acredita authenticated, definición/validación de FKs, RLS, sobrecargas completas ni conservación de conteos reales. El JSON se recibió después y se cotejó en la sección siguiente; la evidencia REST conserva su alcance propio. La confirmación humana de aplicación se registra aparte del resultado observado; despliegue del backend consumidor y transición concreta siguen sin acreditarse.

## Cotejo SQL posterior recibido — 14 de octubre, 18:39 America/La_Paz

Pablo confirma las cuatro migraciones completas y sin errores en el proyecto de desarrollo ya identificado. [Salida SQL aportada](evidencia/pa-int02b-estado-desarrollo-2026-10-14.json) y [cotejo reproducible](evidencia/pa-int02b-cotejo-desarrollo-2026-10-14.json): PostgreSQL **17.6**, base postgres, usuario postgres, transacción READ ONLY. **41 restricciones listadas validadas**, incluidas **17 FKs nuevas ON UPDATE/DELETE RESTRICT**; los vínculos históricos originales mantienen su definición. Marca con tipos TIMESTAMPTZ/BIGINT presentes.

Las **12 combinaciones rol/tabla** coinciden con los privilegios previstos: anon/authenticated no tienen SELECT/INSERT/UPDATE/DELETE/TRUNCATE; service_role tiene SELECT/INSERT/UPDATE en las tres nuevas y SELECT/INSERT en historial, sin DELETE/TRUNCATE. RLS está activa en las tres tablas nuevas. Historial conserva RLS=false legado; su ACL privada y la protección append-only prevista se mantienen. Las **seis funciones y sus firmas** son invoker con search_path fijo; ninguna permite EXECUTE a anon/authenticated. Solo el bootstrap permite EXECUTE al servicio. Se recalcularon MD5 de sus cuerpos locales y las seis huellas coinciden exactamente con las remotas.

```sh
python3 scripts/qa/pa-int02b-estado-verificar.py --evidence docs/evidencia/pa-int02b-estado-desarrollo-2026-10-14.json
```

Foto posterior: **40 usuarios activos (5 ADMIN, 32 GENERAL, 3 VOLUNTARIO), 44 filas de equipo, 9 hechos y 73 eventos de historial**. No se dispone de una foto inmediatamente anterior a B: estos conteos no prueban conservación real antes/después. La diferencia frente a las 39 cuentas de la evidencia histórica A no se atribuye a las migraciones ni a un alta concreta sin evidencia adicional.

El estado compacto no incluye índices y su validez, triggers habilitados, enum 069, políticas/vías indirectas, ACL de secuencias, REFERENCES/TRIGGER/MAINTAIN, FK/CHECK de marca ni todos los tipos/defaults/identidades. Tampoco informa conteos de permisos/comandos/inicializaciones reales. El preflight amplio continúa preparado para ampliar ese inventario; no marcar BE01 completo por esta fotografía. La base local y esta comprobación de desarrollo permiten **iniciar INT03-A**, conservando cierre técnico parcial de B y revisión/transición reales pendientes.

## Transición real y reconciliación pendiente

Exportar las correspondencias reales de solo lectura y conservar versión/fecha/proyecto/HEAD/huella fuera de Git. Pablo revisa **cada** `{usuario_id,subcampania_id,permiso_propuesto,justificacion,fuente_legada,decision_revisor}` y resuelve excepciones; no seleccionar otra persona automáticamente. El export inicial no es payload aplicable: transformar solamente decisiones admitidas al formato estricto del manifest sintético, con `estado_esperado`, revisión esperada `"0"` y referencia concreta de revisión. Esas referencias no se sustituyen por la aprobación sintética del fixture.

En una ventana de transición coordinada, el operador privado usa un actor ADMIN global activo y un UUID operacional retenido para todo el conjunto revisado. Capturar antes: roles/actividad/perfiles/equipo/hechos/historia, marcas/revisiones/vigencias por IDs exactos y huella del manifest. Ensayar primero con rollback en el entorno autorizado; después ejecutar la función en una transacción confirmada y comparar: un comando, una marca/un evento por ámbito, revisión 1 por correspondencia, roles/equipo/hechos intactos. Repetir **mismo actor/UUID/manifest** debe recuperar el recibo idéntico sin nuevas filas. Conservar cualquier retiro posterior; el replay nunca lo rehabilita. No ampliar el manifest o cambiar UUID para salvar un rechazo de ámbito ya inicializado.

**Siguiente equipo:** INT03-A recibe el DDL compartido y la base local reproducible. C implementa gestión HTTP/continuidad/revisiones/roles/baja sobre el motor probado; D prueba concurrencia del último administrador y orden común con stock/plan/cierre/rutas equivalentes. B no acredita esas garantías ni habilita registro participante/piloto.
