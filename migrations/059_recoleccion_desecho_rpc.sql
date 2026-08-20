-- 059_recoleccion_desecho_rpc.sql
-- Registra un descarte parcial o total sobre el saldo disponible de una
-- recoleccion VALIDADA. No elimina la ficha ni crea evidencias.

DO $$
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion.';
  END IF;

  IF to_regclass('public.recoleccion_movimiento') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion_movimiento.';
  END IF;

  IF to_regprocedure('public.fn_recoleccion_recalcular_saldo_operativo(bigint)') IS NULL THEN
    RAISE EXCEPTION
      'No existe fn_recoleccion_recalcular_saldo_operativo(bigint). Ejecuta antes la migracion 011.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_recoleccion_registrar_desecho(
  p_recoleccion_id      BIGINT,
  p_cantidad_desechada NUMERIC,
  p_usuario_id          BIGINT
)
RETURNS TABLE (
  recoleccion_movimiento_id BIGINT,
  recoleccion_id            BIGINT,
  cantidad_desechada        NUMERIC,
  unidad_medida             public.unidad_medida,
  saldo_antes               NUMERIC,
  saldo_despues             NUMERIC,
  estado_operativo          public.estado_operativo_recoleccion
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_recoleccion       RECORD;
  v_saldo_antes       NUMERIC;
  v_saldo_despues     NUMERIC;
  v_movimiento_id     BIGINT;
  v_unidad            public.unidad_medida;
  v_unit_column       TEXT;
  v_unit_columns      TEXT[] := ARRAY[]::TEXT[];
  v_insert_columns    TEXT[] := ARRAY['recoleccion_id', 'tipo_movimiento', 'delta'];
  v_insert_values     TEXT[] := ARRAY['$1', '$2', '$3'];
  v_has_lote_vivero   BOOLEAN;
  v_has_created_by    BOOLEAN;
  v_has_detalle       BOOLEAN;
  v_sql               TEXT;
BEGIN
  IF p_recoleccion_id IS NULL OR p_recoleccion_id <= 0 THEN
    RAISE EXCEPTION 'p_recoleccion_id es obligatorio.';
  END IF;

  IF p_usuario_id IS NULL OR p_usuario_id <= 0 THEN
    RAISE EXCEPTION 'p_usuario_id es obligatorio.';
  END IF;

  IF p_cantidad_desechada IS NULL OR p_cantidad_desechada <= 0 THEN
    RAISE EXCEPTION 'La cantidad a desechar debe ser mayor que cero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_usuario_id
  ) THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_id;
  END IF;

  SELECT
    r.id,
    r.estado_registro,
    r.estado_operativo,
    r.saldo_actual,
    r.unidad_canonica
  INTO v_recoleccion
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recoleccion % no existe.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.estado_registro::TEXT <> 'VALIDADO' THEN
    RAISE EXCEPTION
      'Solo se puede desechar una recoleccion VALIDADO. Estado actual: %.',
      v_recoleccion.estado_registro;
  END IF;

  IF v_recoleccion.estado_operativo::TEXT <> 'ABIERTO'
     OR COALESCE(v_recoleccion.saldo_actual, 0) <= 0 THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene saldo disponible para desechar.',
      p_recoleccion_id;
  END IF;

  IF v_recoleccion.unidad_canonica IS NULL THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene unidad canonica.',
      p_recoleccion_id;
  END IF;

  v_saldo_antes := v_recoleccion.saldo_actual;
  v_unidad := v_recoleccion.unidad_canonica;

  IF p_cantidad_desechada > v_saldo_antes THEN
    RAISE EXCEPTION
      'La cantidad a desechar (%) no puede superar el saldo disponible (%).',
      p_cantidad_desechada,
      v_saldo_antes;
  END IF;

  SELECT ARRAY_AGG(column_name ORDER BY ordinal_position)
  INTO v_unit_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'recoleccion_movimiento'
    AND column_name IN (
      'unidad_operativa',
      'unidad_medida_evento',
      'unidad_medida_movimiento'
    );

  IF v_unit_columns IS NULL OR CARDINALITY(v_unit_columns) = 0 THEN
    RAISE EXCEPTION
      'recoleccion_movimiento no tiene una columna de unidad compatible.';
  END IF;

  FOREACH v_unit_column IN ARRAY v_unit_columns LOOP
    v_insert_columns := ARRAY_APPEND(v_insert_columns, quote_ident(v_unit_column));
    v_insert_values := ARRAY_APPEND(v_insert_values, '$4');
  END LOOP;

  v_insert_columns := ARRAY_APPEND(v_insert_columns, 'motivo');
  v_insert_values := ARRAY_APPEND(v_insert_values, '$5');

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'lote_vivero_id'
  )
  INTO v_has_lote_vivero;

  IF v_has_lote_vivero THEN
    v_insert_columns := ARRAY_APPEND(v_insert_columns, 'lote_vivero_id');
    v_insert_values := ARRAY_APPEND(v_insert_values, '$6');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'created_by'
  )
  INTO v_has_created_by;

  IF NOT v_has_created_by THEN
    RAISE EXCEPTION
      'recoleccion_movimiento no tiene created_by.';
  END IF;

  v_insert_columns := ARRAY_APPEND(v_insert_columns, 'created_by');
  v_insert_values := ARRAY_APPEND(v_insert_values, '$7');

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'detalle_cambios'
  )
  INTO v_has_detalle;

  IF v_has_detalle THEN
    v_insert_columns := ARRAY_APPEND(v_insert_columns, 'detalle_cambios');
    v_insert_values := ARRAY_APPEND(v_insert_values, '$8');
  END IF;

  v_sql := FORMAT(
    'INSERT INTO public.recoleccion_movimiento (%s) VALUES (%s) RETURNING id',
    ARRAY_TO_STRING(v_insert_columns, ', '),
    ARRAY_TO_STRING(v_insert_values, ', ')
  );

  EXECUTE v_sql
  INTO v_movimiento_id
  USING
    p_recoleccion_id,
    'DESECHO'::public.tipo_movimiento_recoleccion,
    -p_cantidad_desechada,
    v_unidad,
    'DESECHO_OTRO'::public.motivo_movimiento_recoleccion,
    NULL::BIGINT,
    p_usuario_id,
    JSONB_BUILD_OBJECT(
      'origen', 'fn_recoleccion_registrar_desecho',
      'sin_evidencia', TRUE
    );

  PERFORM public.fn_recoleccion_recalcular_saldo_operativo(p_recoleccion_id);

  SELECT
    r.saldo_actual,
    r.estado_operativo
  INTO v_saldo_despues, estado_operativo
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id;

  recoleccion_movimiento_id := v_movimiento_id;
  recoleccion_id := p_recoleccion_id;
  cantidad_desechada := p_cantidad_desechada;
  unidad_medida := v_unidad;
  saldo_antes := v_saldo_antes;
  saldo_despues := v_saldo_despues;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_recoleccion_registrar_desecho(
  BIGINT,
  NUMERIC,
  BIGINT
) TO service_role;

NOTIFY pgrst, 'reload schema';
