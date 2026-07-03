-- 049_vivero_reserva_requiere_embolsado.sql
-- Refuerza RN-VIV-61: una reserva/asignacion solo puede crearse sobre un
-- lote ACTIVO que ya tenga evento EMBOLSADO. Antes de EMBOLSADO solo existe
-- material en proceso, no saldo vivo reservable.
-- Depende de: 024 (asignacion), 045 (reserva RPC), 047 (guard por proposito).

DO $$
BEGIN
  IF to_regclass('public.lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.lote_vivero. Ejecuta la migracion 007 primero.';
  END IF;

  IF to_regclass('public.evento_lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evento_lote_vivero. Ejecuta la migracion 007 primero.';
  END IF;

  IF to_regclass('public.asignacion_vivero_subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.asignacion_vivero_subcampania. Ejecuta la migracion 024 primero.';
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero elv
    WHERE elv.lote_id = p_lote_vivero_id
      AND elv.tipo_evento = 'EMBOLSADO'::public.tipo_evento_vivero
  ) THEN
    RAISE EXCEPTION
      'No se puede reservar el lote % porque no tiene EMBOLSADO registrado. Antes de EMBOLSADO solo existe material en proceso.',
      p_lote_vivero_id;
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

  -- Nunca se acepta reserva contra BORRADOR ni CANCELADA (RN-VIV-11 / RF-PLA-04).
  IF v_subcampania_estado IN ('BORRADOR', 'CANCELADA') THEN
    RAISE EXCEPTION
      'No se puede reservar para una subcampania en estado %. Solo se admite tras activar y siempre que no este cancelada.',
      v_subcampania_estado;
  END IF;

  -- Guard por proposito (RN-PLA-12).
  IF p_proposito = 'PLANTACION_INICIAL' AND v_subcampania_estado <> 'ACTIVA' THEN
    RAISE EXCEPTION
      'PLANTACION_INICIAL solo se permite con la subcampania en ACTIVA (estado actual: %).',
      v_subcampania_estado;
  END IF;

  IF p_proposito = 'REPOSICION'
     AND v_subcampania_estado NOT IN ('ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL') THEN
    RAISE EXCEPTION
      'REPOSICION solo se permite con la subcampania en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: %).',
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
  'Reserva stock de un lote para una subcampania. Requiere lote ACTIVO con EMBOLSADO y saldo vivo positivo; respeta proposito y no modifica saldo_vivo_actual ni crea eventos M2 (RN-VIV-47, RN-VIV-61).';

NOTIFY pgrst, 'reload schema';
