# ADR-PLA-05 — Revisión atómica de metas y especies

Implementado el 9 de octubre de 2026. `PUT /subcampanias/:id/plan` permite a ADMIN global revisar la meta y todas las especies en BORRADOR o ACTIVA. Coordinadores sin ADMIN y estados cerrados, pausados o cancelados quedan rechazados. La campaña conserva su meta agregada derivada.

El contrato completo envía `meta_total_arboles`, `metas` y `revision_esperada`. `GET /subcampanias/:id/plan` devuelve meta, especies y `plan_revision` en un único snapshot; una revisión incrementa esa versión. En ACTIVA son obligatorios los tres campos. En BORRADOR se conserva `{metas}` con la meta vigente, pero cualquier meta explícita requiere versión. El backend vincula las peticiones históricas sin versión a la versión que lee al inicio del guardado. Para detectar también formularios antiguos, el cliente debe enviar la versión que leyó en su editor. Un 409 requiere leer y conciliar los cambios; no se reintenta automáticamente.

`PATCH /subcampanias/:id` rechaza `meta_total_arboles`, incluso en BORRADOR. La creación inicial sigue permitiendo una subcampaña BORRADOR todavía sin plan.

La migración 062 crea `fn_subcampania_revisar_plan` y comparte el bloqueo `subcampania FOR UPDATE` que usan las transacciones de asignación (060) y plantación (061). Comprueba dentro de ese bloqueo el estado, la versión, el catálogo, objetivos positivos, porcentajes con hasta dos decimales sumando 100 y cantidades sumando la meta. Protege la retirada de especies con plantación inicial registrada o stock de propósito PLANTACION_INICIAL disponible; stock de REPOSICION no impide por sí solo la retirada.

Meta, especies, versión, actor, fecha y snapshots anterior/nuevo se escriben juntos. `PLAN_REVISADO` se inserta en el historial append-only dentro de la RPC; un fallo revierte toda la operación. Las filas de especies retenidas conservan su identidad y autoría original. La RPC solo puede ejecutarla `service_role`, y vuelve a comprobar que el actor sea ADMIN.

La revisión no modifica plantaciones, contadores, autores, saldos físicos ni fechas/estado de cierre. Las metas siguen siendo orientativas, la pertenencia al plan se comprueba al asignar y plantar inicialmente, y el cierre continúa siendo manual. Los límites de reposición conservan su contrato. La lista devuelve progreso superior al 100% cuando corresponde; el contexto lee meta, versión y especies en un mismo snapshot.

## Refuerzo posterior a la revisión

`GET/PUT /plan` ahora verifican el JWT emitido por el login WebAuthn. Cualquier usuario registrado con sesión válida puede leer, sin pertenecer al equipo. Solo ADMIN global puede guardar; el actor se resuelve en la base y un `x-auth-id` distinto del JWT se rechaza. El header de identidad es opcional para estas dos rutas. Configurar `JWT_SECRET` y coordinar `Authorization: Bearer <token>` en el frontend.

La nueva migración 063 restringe también la RPC de lectura a `service_role`; debe aplicarse manualmente después de 062. Las migraciones 060–062 ya aplicadas conservan sus archivos. La selección del cliente administrativo exige `SUPABASE_SERVICE_ROLE_KEY` explícita en lugar de reutilizar el cliente normal cuando falta.

Se elimina la prelectura del plan en asignaciones: 060 valida la pertenencia de especies bajo el bloqueo compartido con la revisión y evita rechazos basados en un plan anterior. Las devoluciones conservan su RPC actual; una devolución sin commit puede provocar un rechazo conservador de retirada, que se puede reevaluar después del commit. Las pruebas cubren ese caso y el ajuste de metas concurrente con devolución sin alterar cantidades físicas.

El diagnóstico manual de la base compartida está en `documentacion/sql/verificar_subcampania_plan_062_063.sql`, con instrucciones en `documentacion/tareas/verificacion-supabase-plan-062-063.md`. Solo lee datos y no acredita el despliegue remoto.

## Verificación reproducible

```bash
npm run test:unit -- --runInBand src/subcampanias src/plantaciones src/lotes-vivero/tests/vivero-asignaciones.service.spec.ts src/supabase/supabase.service.spec.ts
npm run test:db:plan
npm run build
```

La implementación inicial verificó 16 suites / 214 pruebas unitarias y 36 pruebas PostgreSQL aisladas. El refuerzo amplía la cobertura con pruebas HTTP de sesión, configuración administrativa, devoluciones concurrentes, permisos 063 y el diagnóstico manual.

Verificación del refuerzo: 49 suites / 531 pruebas unitarias y HTTP aprobadas, 46 pruebas PostgreSQL aisladas aprobadas (incluido el SQL de diagnóstico), compilación Nest y `git diff --check` correctos. Las pruebas que abren sockets locales o memoria compartida requieren ejecutarse fuera de un sandbox que bloquee esas operaciones.

La suite DB crea y destruye un cluster PostgreSQL propio en un directorio temporal, con socket privado y TCP deshabilitado. Requiere `initdb`, `pg_ctl`, `createdb` y `psql` disponibles. No carga `.env` ni utiliza la base Supabase compartida. Aplica las migraciones reales 024, 030, 047, 054, 056 y 060–063 sobre una fixture acotada; GPS usa un helper fijo porque PostGIS y la validación geográfica no cambian en este ADR.

La cobertura incluye revisiones activas y BORRADOR, roles y estados rechazados, planes inválidos, incorporación de especies y plantación por encima del objetivo, retiradas protegidas, conservación de datos físicos/autores, fallo de auditoría, revisiones concurrentes y espera entre revisión/asignación/plantación. Comprueba también los permisos de ejecución y reaplicación de 062 dentro de una transacción sin perder datos.

## Aplicación en un entorno

Aplicar 060–063 antes de desplegar este backend. Configurar `SUPABASE_SERVICE_ROLE_KEY` y `JWT_SECRET`. Coordinar los clientes para que envíen el JWT, meta, plan y versión juntos; los cambios de meta mediante PATCH ya no se aceptan. La verificación local no aplica migraciones en bases compartidas ni acredita un despliegue.

## Cierre del acceso al plan en el entorno local — 2026-10-10

Se configuró una clave privada propia del backend en `JWT_SECRET` dentro del `.env` local, ignorado por Git y con permisos `600`, conservando la configuración de Supabase. Se reinició el backend con `npm run start:dev`. Las comprobaciones locales devolvieron `200` en `/health` y `/api/auth/challenge`, y `401` al consultar el plan sin sesión o con un token inválido, en lugar del `500` por la variable ausente.

Tras renovar la sesión con passkey, el usuario confirmó que la consulta del plan devuelve `200` con datos y que el mix de especies se muestra correctamente. El problema de acceso local queda resuelto. El mensaje amigable del frontend ante errores `500` y la investigación de posibles `GET` repetidos quedan como tareas separadas; las peticiones `OPTIONS` de CORS no son lecturas adicionales del plan. Este cierre local no acredita un despliegue remoto.
