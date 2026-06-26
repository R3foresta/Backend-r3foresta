-- 045_vivero_reserva_stock_lote_rpc.sql
-- Reserva stock de un lote de vivero para una subcampania en una operacion
-- atomica. Bloquea el lote y sus reservas activas antes de calcular saldo.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asignacion_vivero_subcampania_subcampania_fk'
      AND conrelid = 'public.asignacion_vivero_subcampania'::regclass
  ) THEN
    ALTER TABLE public.asignacion_vivero_subcampania
      ADD CONSTRAINT asignacion_vivero_subcampania_subcampania_fk
      FOREIGN KEY (subcampania_id)
      REFERENCES public.subcampania (id)
      NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_vivero_reservar_stock_lote(
  p_lote_vivero_id BIGINT,
  p_subcampania_id BIGINT,
  p_cantidad_asignada INT,
  p_proposito public.proposito_asignacion,
  p_usuario_asignacion_id BIGINT
)
RETURNS public.asignacion_vivero_subcampania
LANGUAGE plpgsql
AS $$
DECLARE
  v_lote public.lote_vivero%ROWTYPE;
  v_subcampania_estado public.estado_subcampania;
  v_saldo_reservado INT;
  v_saldo_disponible INT;
  v_asignacion public.asignacion_vivero_subcampania%ROWTYPE;
BEGIN
  IF p_cantidad_asignada IS NULL OR p_cantidad_asignada <= 0 THEN
    RAISE EXCEPTION 'No se puede reservar una cantidad menor o igual a 0.';
  END IF;

  SELECT *
  INTO v_lote
  FROM public.lote_vivero
  WHERE id = p_lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', p_lote_vivero_id;
  END IF;

  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'No se puede reservar desde un lote en estado %.',
      v_lote.estado_lote;
  END IF;

  IF v_lote.saldo_vivo_actual IS NULL OR v_lote.saldo_vivo_actual <= 0 THEN
    RAISE EXCEPTION 'El lote % no tiene saldo vivo disponible.', p_lote_vivero_id;
  END IF;

  SELECT estado
  INTO v_subcampania_estado
  FROM public.subcampania
  WHERE id = p_subcampania_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada.', p_subcampania_id;
  END IF;

  IF v_subcampania_estado NOT IN ('BORRADOR', 'ACTIVA') THEN
    RAISE EXCEPTION
      'No se puede reservar para una subcampania en estado %.',
      v_subcampania_estado;
  END IF;

  PERFORM 1
  FROM public.asignacion_vivero_subcampania
  WHERE lote_vivero_id = p_lote_vivero_id
    AND estado = 'ACTIVA'
  FOR UPDATE;

  SELECT COALESCE(SUM(saldo_asignado_disponible), 0)::INT
  INTO v_saldo_reservado
  FROM public.asignacion_vivero_subcampania
  WHERE lote_vivero_id = p_lote_vivero_id
    AND estado = 'ACTIVA';

  v_saldo_disponible := v_lote.saldo_vivo_actual - v_saldo_reservado;

  IF p_cantidad_asignada > v_saldo_disponible THEN
    RAISE EXCEPTION
      'La cantidad solicitada (%) excede el saldo vivo disponible para asignacion del lote % (%).',
      p_cantidad_asignada,
      p_lote_vivero_id,
      v_saldo_disponible;
  END IF;

  INSERT INTO public.asignacion_vivero_subcampania (
    lote_vivero_id,
    subcampania_id,
    cantidad_asignada,
    proposito,
    usuario_asignacion_id
  )
  VALUES (
    p_lote_vivero_id,
    p_subcampania_id,
    p_cantidad_asignada,
    p_proposito,
    p_usuario_asignacion_id
  )
  RETURNING * INTO v_asignacion;

  RETURN v_asignacion;
END;
$$;

COMMENT ON FUNCTION public.fn_vivero_reservar_stock_lote(
  BIGINT,
  BIGINT,
  INT,
  public.proposito_asignacion,
  BIGINT
) IS
  'Reserva stock de un lote de vivero para una subcampania bloqueando lote y reservas activas antes de calcular saldo disponible.';

NOTIFY pgrst, 'reload schema';
