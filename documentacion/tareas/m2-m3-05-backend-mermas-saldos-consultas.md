# M2-M3-05 - Backend mermas, saldos y consultas

## Objetivo

Alinear mermas y consultas de saldos con el modelo fisico: el saldo del lote representa plantas que siguen en vivero; el saldo asignado representa stock ya entregado a subcampania.

## Estado actual observado

- `fn_vivero_registrar_merma` resta del saldo vivo del lote y, si excede saldo no asignado, actualiza `cantidad_mermada` en asignaciones activas.
- `v_lote_vivero_saldos` calcula `saldo_vivo_disponible_asignacion = saldo_vivo_actual - saldo_asignado_total`.
- Los servicios y Swagger exponen `saldo_asignado_total` como reservas activas.
- El despacho manual valida contra `saldo_vivo_disponible_asignacion`, no contra `LOTE_VIVERO.saldo_vivo_actual`.

## Alcance

- Ajustar merma M2:
  - validar contra `LOTE_VIVERO.saldo_vivo_actual`
  - no leer ni modificar `ASIGNACION_VIVERO_SUBCAMPANIA`
  - no generar metadata de afectacion de asignaciones
- Crear flujo separado solo si producto decide implementar merma de stock asignado en campo:
  - fuera de MVP por defecto
  - si se implementa, debe vivir en M3 y afectar `cantidad_mermada`
- Rehacer consulta/vista de saldos:
  - saldo fisico en vivero = `LOTE_VIVERO.saldo_vivo_actual`
  - saldo asignado disponible por subcampania = suma de `saldo_asignado_disponible`
  - no publicar la identidad antigua como fuente vigente
- Ajustar despacho manual:
  - validar contra `LOTE_VIVERO.saldo_vivo_actual`
  - mantener bloqueo de `PLANTACION_CAMPANIA`
- Ajustar endpoints de consulta:
  - `GET /lotes-vivero`
  - `GET /lotes-vivero/:id`
  - `GET /lotes-vivero/:id/saldos`
  - `GET /lotes-vivero/stock/especies`
- Actualizar nombres en response si hace falta:
  - evitar `saldo_reservado`
  - usar `saldo_asignado_subcampanias` o similar.

## Fuera de alcance

- Crear asignacion fisica.
- Implementar UI.
- Implementar merma de campo si no se prioriza.

## Archivos probables

- `migrations/036_vivero_merma_lifo.sql`
- `migrations/035_v_lote_vivero_saldos.sql`
- nueva migracion `migrations/054_vivero_saldos_fisicos.sql`
- `src/lotes-vivero/application/vivero-merma.service.ts`
- `src/lotes-vivero/application/vivero-saldos.service.ts`
- `src/lotes-vivero/application/vivero-despacho.service.ts`
- `src/lotes-vivero/application/vivero-consultas.service.ts`
- `src/lotes-vivero/api/docs/lotes-vivero.swagger.ts`

## Criterios de aceptacion

- Una merma M2 nunca modifica asignaciones activas.
- Una merma M2 solo descuenta saldo fisico del lote.
- Despacho manual valida contra saldo fisico del lote.
- `GET /lotes-vivero/:id/saldos` muestra claramente:
  - saldo fisico en vivero
  - asignaciones activas y su saldo disponible
  - total asignado disponible, sin llamarlo reserva
- No queda documentacion Swagger que afirme la identidad antigua como vigente.

## Pruebas esperadas

- E2E DB de merma con asignaciones activas: asignaciones quedan intactas.
- E2E DB de merma que excede saldo fisico: bloquea.
- Unit test de despacho manual usando saldo fisico.
- Unit test de respuesta de saldos.
- E2E DB de vista/consulta de saldos.

## Riesgos

- Cambiar nombres de campos puede romper frontend; coordinar con `M2-M3-06`.
- Si se mantiene compatibilidad de campos antiguos, marcarlos como legado o derivado no vigente.
