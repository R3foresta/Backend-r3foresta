# M2-M3-04 - Backend devolucion fisica y cancelacion de subcampania

## Objetivo

Implementar devolucion fisica de stock asignado al vivero y ajustar cancelacion de subcampania para resolver asignaciones activas segun el contrato vigente.

## Estado actual observado

- `DELETE /lotes-vivero/:id/asignaciones/:asignacionId` marca `cantidad_devuelta = cantidad_asignada`, pero no aumenta saldo del lote.
- `fn_subcampania_cancelar` libera asignaciones activas como devolucion logica.
- No se encontro endpoint/RPC de devolucion fisica parcial con motivo.
- `EVENTO_PLANTACION` ya tiene estructura para `DEVOLUCION_A_VIVERO`.

## Alcance

- Crear endpoint de devolucion fisica:
  - sugerido: `POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion`
  - alternativa M3: `POST /subcampanias/:id/devoluciones-vivero`
- Crear RPC transaccional:
  - nombre sugerido: `fn_m3_devolver_asignacion_vivero`
- Request minimo:
  - `asignacion_id`
  - `cantidad_devuelta`
  - `motivo_devolucion`
  - `fecha_devolucion`
  - `observaciones`
- Validar:
  - asignacion existe
  - asignacion no esta `DEVUELTA`
  - `cantidad_devuelta <= saldo_asignado_disponible`
  - actor es `ADMIN` o `COORDINADOR` de la subcampania
  - no exige fotos en MVP
- Efectos atomicos:
  - aumentar `ASIGNACION_VIVERO_SUBCAMPANIA.cantidad_devuelta`
  - aumentar `LOTE_VIVERO.saldo_vivo_actual`
  - registrar `EVENTO_PLANTACION` tipo `DEVOLUCION_A_VIVERO`
  - opcional segun BD: registrar evento M2 de entrada fisica si se implementa `DEVOLUCION_PLANTACION`
- Ajustar cancelacion:
  - mantener guard `total_plantado_inicial = 0`
  - si hay asignaciones activas con saldo disponible, devolverlas fisicamente en la misma transaccion o bloquear con mensaje claro
  - registrar `SUBCAMPANIA_CANCELADA`
- Decidir destino del endpoint `DELETE /asignaciones/:id`:
  - convertirlo en alias de devolucion total fisica, o
  - deprecarlo y exigir el endpoint nuevo con motivo.

## Fuera de alcance

- Mermas de stock asignado en campo.
- Evidencias de devolucion, porque MVP no las exige.

## Archivos probables

- `src/lotes-vivero/application/vivero-asignaciones.service.ts`
- `src/lotes-vivero/api/lotes-vivero.controller.ts`
- `src/lotes-vivero/api/docs/lotes-vivero.swagger.ts`
- `src/subcampanias/application/subcampanias-cancelacion.service.ts`
- `migrations/047_m3_cancelacion_subcampania_y_plan.sql`
- nueva migracion `migrations/053_m3_devolucion_fisica.sql`
- tests de asignaciones y cancelacion

## Criterios de aceptacion

- Una devolucion parcial aumenta `cantidad_devuelta` y `LOTE_VIVERO.saldo_vivo_actual`.
- Una devolucion total cambia la asignacion a `DEVUELTA` por trigger.
- Se registra `EVENTO_PLANTACION.DEVOLUCION_A_VIVERO`.
- No se requiere evidencia en MVP.
- Cancelar subcampania con asignaciones activas devuelve fisicamente el saldo asignado disponible o bloquea si no puede hacerlo.
- Cancelar subcampania con `total_plantado_inicial > 0` sigue bloqueado.

## Pruebas esperadas

- Unit test de servicio de devolucion.
- E2E DB de devolucion parcial.
- E2E DB de devolucion total.
- E2E DB de cancelacion con asignaciones activas.
- E2E DB de cancelacion bloqueada por plantaciones existentes.
- E2E DB de concurrencia devolver/plantar sobre la misma asignacion.

## Riesgos

- Si se permite `DELETE` como devolucion total, se pierde la semantica de motivo obligatorio salvo que se cambie contrato.
- La cancelacion debe bloquear filas de subcampania, asignaciones y lote en orden estable para evitar carreras.

