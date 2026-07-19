# M2-M3-01 - BD contrato de asignacion fisica

## Objetivo

Alinear la base de datos con el contrato vigente M2 Vivero - M3 Plantacion para soportar asignacion fisica a subcampania.

## Estado actual observado

- `origen_despacho_vivero` solo contempla `MANUAL` y `AUTOMATICO_PLANTACION`.
- El CHECK de `EVENTO_LOTE_VIVERO` permite `PLANTACION_CAMPANIA` solo con `AUTOMATICO_PLANTACION` y `registro_plantacion_id` obligatorio.
- `ASIGNACION_VIVERO_SUBCAMPANIA.subcampania_id` fue creado inicialmente como FK pendiente.
- `REGISTRO_PLANTACION_DETALLE.evento_lote_vivero_despacho_id` sigue documentado como FK al despacho automatico.
- `v_lote_vivero_saldos` expone la identidad antigua de reserva logica.

## Alcance

- Agregar `ASIGNACION_SUBCAMPANIA` al enum `origen_despacho_vivero`.
- Mantener `AUTOMATICO_PLANTACION` solo como legado si ya existe data previa.
- Ajustar CHECK de `EVENTO_LOTE_VIVERO`:
  - `DESPACHO + MANUAL`: `destino_tipo <> PLANTACION_CAMPANIA`, sin campos M3.
  - `DESPACHO + ASIGNACION_SUBCAMPANIA`: `destino_tipo = PLANTACION_CAMPANIA`, `subcampania_id` y `campania_id` obligatorios, `registro_plantacion_id IS NULL`.
  - `DESPACHO + AUTOMATICO_PLANTACION`: permitido solo para data legada o bloqueado para nuevas escrituras segun decision de migracion.
- Agregar o confirmar FKs:
  - `evento_lote_vivero.subcampania_id -> subcampania.id`
  - `evento_lote_vivero.campania_id -> campania.id`
  - `evento_lote_vivero.registro_plantacion_id -> registro_plantacion.id`
  - `asignacion_vivero_subcampania.subcampania_id -> subcampania.id`
- Confirmar que `REGISTRO_PLANTACION_DETALLE.evento_lote_vivero_despacho_id` queda nullable/legado para nuevas plantaciones.
- Preparar tipo de evento M2 para entrada por devolucion si se decide soportarlo ahora, sugerido `DEVOLUCION_PLANTACION`.
- Reemplazar o versionar `v_lote_vivero_saldos` para no publicar la identidad antigua como vigente.

## Fuera de alcance

- Implementar endpoints NestJS.
- Reescribir `fn_m3_registrar_plantacion`.
- Migracion de datos historicos compleja. Si aparece data con `AUTOMATICO_PLANTACION`, dejar plan de backfill separado.

## Archivos probables

- `migrations/023_vivero_despacho_automatico_m3.sql`
- `migrations/025_fix_origen_despacho_solo_en_despacho.sql`
- `migrations/030_m3_registro_plantacion.sql`
- `migrations/035_v_lote_vivero_saldos.sql`
- nueva migracion `migrations/051_m2_m3_asignacion_fisica_schema.sql`

## Criterios de aceptacion

- `ASIGNACION_SUBCAMPANIA` existe en BD.
- Un evento M2 de asignacion fisica puede insertarse con:
  - `tipo_evento = DESPACHO`
  - `origen_despacho = ASIGNACION_SUBCAMPANIA`
  - `destino_tipo = PLANTACION_CAMPANIA`
  - `registro_plantacion_id = NULL`
- Una plantacion nueva puede guardar detalles con `evento_lote_vivero_despacho_id = NULL`.
- La vista/consulta de saldos separa:
  - saldo fisico del lote en vivero,
  - saldo asignado disponible por subcampania.
- Los CHECKs impiden usar `PLANTACION_CAMPANIA` como despacho manual.

## Pruebas esperadas

- E2E DB para insertar evento de asignacion fisica valido.
- E2E DB para rechazar `PLANTACION_CAMPANIA` con `MANUAL`.
- E2E DB para confirmar FK de `subcampania_id`.
- E2E DB para confirmar que la vista nueva no calcula `saldo_vivo_actual - saldo_asignado_total` como saldo vigente de vivero.

## Riesgos

- Si hay data historica con `AUTOMATICO_PLANTACION`, el CHECK nuevo puede romper migraciones. Revisar datos antes del ALTER o hacer CHECK compatible con legado.
- Supabase puede requerir separar `ALTER TYPE ADD VALUE` y uso del valor en transacciones distintas.
