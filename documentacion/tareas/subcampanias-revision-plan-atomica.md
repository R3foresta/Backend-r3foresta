# ADR-PLA-05 — Revisión atómica de metas y especies

Implementado el 9 de octubre de 2026. `PUT /subcampanias/:id/plan` permite a ADMIN global revisar la meta y todas las especies en BORRADOR o ACTIVA. Coordinadores sin ADMIN y estados cerrados, pausados o cancelados quedan rechazados. La campaña conserva su meta agregada derivada.

El contrato completo envía `meta_total_arboles`, `metas` y `revision_esperada`. `GET /subcampanias/:id/plan` devuelve meta, especies y `plan_revision` en un único snapshot; una revisión incrementa esa versión. En ACTIVA son obligatorios los tres campos. En BORRADOR se conserva `{metas}` con la meta vigente, pero cualquier meta explícita requiere versión. El backend vincula las peticiones históricas sin versión a la versión que lee al inicio del guardado. Para detectar también formularios antiguos, el cliente debe enviar la versión que leyó en su editor. Un 409 requiere leer y conciliar los cambios; no se reintenta automáticamente.

`PATCH /subcampanias/:id` rechaza `meta_total_arboles`, incluso en BORRADOR. La creación inicial sigue permitiendo una subcampaña BORRADOR todavía sin plan.

La migración 062 crea `fn_subcampania_revisar_plan` y comparte el bloqueo `subcampania FOR UPDATE` que usan las transacciones de asignación (060) y plantación (061). Comprueba dentro de ese bloqueo el estado, la versión, el catálogo, objetivos positivos, porcentajes con hasta dos decimales sumando 100 y cantidades sumando la meta. Protege la retirada de especies con plantación inicial registrada o stock de propósito PLANTACION_INICIAL disponible; stock de REPOSICION no impide por sí solo la retirada.

Meta, especies, versión, actor, fecha y snapshots anterior/nuevo se escriben juntos. `PLAN_REVISADO` se inserta en el historial append-only dentro de la RPC; un fallo revierte toda la operación. Las filas de especies retenidas conservan su identidad y autoría original. La RPC solo puede ejecutarla `service_role`, y vuelve a comprobar que el actor sea ADMIN.

La revisión no modifica plantaciones, contadores, autores, saldos físicos ni fechas/estado de cierre. Las metas siguen siendo orientativas, la pertenencia al plan se comprueba al asignar y plantar inicialmente, y el cierre continúa siendo manual. Los límites de reposición conservan su contrato. La lista devuelve progreso superior al 100% cuando corresponde; el contexto lee meta, versión y especies en un mismo snapshot.

## Verificación reproducible

```bash
npm run test:unit -- --runInBand src/subcampanias src/plantaciones src/lotes-vivero/tests/vivero-asignaciones.service.spec.ts
npm run test:db:plan
npm run build
```

Resultado local: 16 suites enfocadas / 214 pruebas unitarias aprobadas, 36 pruebas PostgreSQL aisladas aprobadas y compilación Nest completada. `git diff --check` sin errores.

La nueva suite DB crea y destruye un cluster PostgreSQL propio en un directorio temporal, con socket privado y TCP deshabilitado. Requiere `initdb`, `pg_ctl`, `createdb` y `psql` disponibles. No carga `.env` ni utiliza la base Supabase compartida. Aplica las migraciones reales 024, 030, 047, 060, 061 y 062 sobre una fixture acotada; GPS usa un helper fijo porque PostGIS y la validación geográfica no cambian en este ADR.

La cobertura incluye revisiones activas y BORRADOR, roles y estados rechazados, planes inválidos, incorporación de especies y plantación por encima del objetivo, retiradas protegidas, conservación de datos físicos/autores, fallo de auditoría, revisiones concurrentes y espera entre revisión/asignación/plantación. Comprueba también los permisos de ejecución y reaplicación de 062 dentro de una transacción sin perder datos.

## Aplicación en un entorno

Aplicar 060, 061 y 062 antes de desplegar este backend. Configurar `SUPABASE_SERVICE_ROLE_KEY` para el guardado. Coordinar los clientes para que envíen meta, plan y versión juntos; los cambios de meta mediante PATCH ya no se aceptan. La verificación local no aplica migraciones en bases compartidas ni acredita un despliegue.
