-- 035_v_lote_vivero_saldos.sql
-- Vista que expone saldos derivados por lote:
--   saldo_asignado_total           = suma de saldo_asignado_disponible de asignaciones ACTIVAS
--   saldo_vivo_disponible_asignacion = saldo_vivo_actual - saldo_asignado_total
--
-- El segundo saldo es el que el backend valida antes de permitir un DESPACHO MANUAL:
-- un operario no puede tocar stock ya reservado para una subcampaña.
--
-- Depende de: 007 (lote_vivero), 024 (asignacion_vivero_subcampania).
-- Idempotente: CREATE OR REPLACE VIEW.

CREATE OR REPLACE VIEW public.v_lote_vivero_saldos AS
SELECT
  lv.id                                                                       AS lote_id,
  lv.saldo_vivo_actual,
  COALESCE(
    SUM(a.saldo_asignado_disponible) FILTER (WHERE a.estado = 'ACTIVA'), 0
  )                                                                           AS saldo_asignado_total,
  lv.saldo_vivo_actual
    - COALESCE(
        SUM(a.saldo_asignado_disponible) FILTER (WHERE a.estado = 'ACTIVA'), 0
      )                                                                       AS saldo_vivo_disponible_asignacion
FROM public.lote_vivero lv
LEFT JOIN public.asignacion_vivero_subcampania a ON a.lote_vivero_id = lv.id
GROUP BY lv.id, lv.saldo_vivo_actual;

NOTIFY pgrst, 'reload schema';
