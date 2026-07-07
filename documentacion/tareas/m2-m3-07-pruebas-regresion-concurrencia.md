# M2-M3-07 - Pruebas de regresion y concurrencia M2-M3

## Objetivo

Agregar cobertura suficiente para cerrar la migracion de contrato M2-M3 sin regresiones de saldo, trazabilidad ni evidencia.

## Estado actual observado

- La suite unitaria pasa.
- Varias pruebas actuales validan el contrato viejo:
  - plantacion devuelve `despachos`
  - asignacion llama a `fn_vivero_reservar_stock_lote`
  - merma puede afectar asignaciones activas.

## Alcance

Crear o actualizar pruebas para:

- Asignacion fisica:
  - descuenta saldo del lote
  - crea evento M2 con `ASIGNACION_SUBCAMPANIA`
  - vincula evidencia propia
  - registra evento M3 `ASIGNACION_VIVERO`
  - rechaza falta de evidencia
  - rechaza saldo insuficiente
- Plantacion inicial:
  - consume asignaciones activas `PLANTACION_INICIAL`
  - no crea eventos M2
  - no modifica saldo del lote
  - guarda detalle por `asignacion_id`, `lote_vivero_id`, `planta_id`
  - bloquea exceso de meta por especie
- Reposicion:
  - consume asignaciones `REPOSICION`
  - no avanza meta
  - bloquea exceso sobre pendiente de reposicion
  - permite estados `ACTIVA`, `COMPLETADA`, `FINALIZADA_PARCIAL`
- Devolucion/cancelacion:
  - devolucion parcial aumenta saldo del lote
  - devolucion total cambia asignacion a `DEVUELTA`
  - cancelacion sin plantaciones resuelve asignaciones fisicamente
  - cancelacion con plantaciones bloquea
- Merma:
  - merma M2 no modifica asignaciones activas
  - merma M2 bloquea si excede saldo fisico del lote
- Despacho manual:
  - rechaza `PLANTACION_CAMPANIA`
  - valida contra saldo fisico del lote
- Concurrencia:
  - dos asignaciones simultaneas no dejan saldo negativo
  - plantar y devolver la misma asignacion no deja saldo asignado negativo
  - asignar y mermar el mismo lote no deja saldo fisico negativo.

## Fuera de alcance

- Pruebas visuales de frontend.
- Pruebas de performance.

## Archivos probables

- `src/lotes-vivero/tests/vivero-asignaciones.service.spec.ts`
- `src/lotes-vivero/tests/vivero-despacho.service.spec.ts`
- `src/plantaciones/tests/plantacion-creation.service.spec.ts`
- `src/subcampanias/tests/subcampanias-cancelacion.service.spec.ts`
- `test/e2e/db/*.e2e-spec.ts`
- `test/e2e/p0/*.e2e-spec.ts`
- `test/helpers/p0-flow.helpers.ts`

## Criterios de aceptacion

- `npm test -- --runInBand` pasa.
- `npm run test:e2e:db` pasa contra entorno configurado.
- Existe al menos un test que falla si se vuelve a emitir `AUTOMATICO_PLANTACION`.
- Existe al menos un test que falla si plantar modifica `LOTE_VIVERO.saldo_vivo_actual`.
- Existe al menos un test que falla si merma M2 toca `ASIGNACION_VIVERO_SUBCAMPANIA`.

## Notas de ejecucion

La suite e2e puede requerir Supabase real o entorno de pruebas con variables `.env`. Si no se puede ejecutar localmente, dejar documentado:

- comando intentado,
- razon del bloqueo,
- cobertura unitaria que queda como respaldo temporal.

