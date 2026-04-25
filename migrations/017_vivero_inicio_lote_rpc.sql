-- 017_vivero_inicio_lote_rpc.sql
-- Objetivo:
-- - Crear una RPC atomica para iniciar un lote de vivero desde una recoleccion validada.
-- - Insertar LOTE_VIVERO, EVENTO_LOTE_VIVERO(INICIO) y RECOLECCION_MOVIMIENTO
--   en una sola transaccion de base de datos.
-- - Mantener invariantes de cantidad, unidad, snapshot y saldo origen.

DO $$
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion.';
  END IF;

  IF to_regclass('public.recoleccion_movimiento') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion_movimiento.';
  END IF;

  IF to_regclass('public.lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.lote_vivero.';
  END IF;

  IF to_regclass('public.evento_lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evento_lote_vivero.';
  END IF;

  IF to_regprocedure('public.fn_vivero_assert_fecha_operativa(date,date)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.fn_vivero_assert_fecha_operativa(date,date). Ejecuta antes la migracion 010.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(
  p_recoleccion_id BIGINT,
  p_vivero_id BIGINT,
  p_responsable_id BIGINT,
  p_fecha_inicio DATE,
  p_fecha_evento DATE,
  p_cantidad_inicial_en_proceso NUMERIC,
  p_unidad_medida_inicial public.unidad_medida,
  p_codigo_trazabilidad TEXT DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS TABLE (
  lote_vivero_id BIGINT,
  evento_inicio_id BIGINT,
  recoleccion_movimiento_id BIGINT,
  codigo_trazabilidad TEXT,
  saldo_recoleccion_antes NUMERIC,
  saldo_recoleccion_despues NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_recoleccion RECORD;
  v_responsable_nombre TEXT;
  v_codigo_trazabilidad TEXT;
  v_lote_id BIGINT;
  v_evento_id BIGINT;
  v_movimiento_id BIGINT;
  v_saldo_despues NUMERIC;
  v_movimiento_columns TEXT[];
  v_movimiento_values TEXT[];
  v_has_unidad_operativa BOOLEAN;
  v_has_unidad_medida_evento BOOLEAN;
  v_has_unidad_medida_movimiento BOOLEAN;
  v_has_detalle_cambios BOOLEAN;
BEGIN
  IF p_recoleccion_id IS NULL THEN
    RAISE EXCEPTION 'recoleccion_id es obligatorio.';
  END IF;

  IF p_vivero_id IS NULL THEN
    RAISE EXCEPTION 'vivero_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_cantidad_inicial_en_proceso IS NULL
     OR p_cantidad_inicial_en_proceso <= 0 THEN
    RAISE EXCEPTION 'cantidad_inicial_en_proceso debe ser mayor a 0.';
  END IF;

  IF p_unidad_medida_inicial IS NULL THEN
    RAISE EXCEPTION 'unidad_medida_inicial es obligatoria.';
  END IF;

  IF p_unidad_medida_inicial = 'UNIDAD'
     AND p_cantidad_inicial_en_proceso <> TRUNC(p_cantidad_inicial_en_proceso) THEN
    RAISE EXCEPTION
      'cantidad_inicial_en_proceso debe ser entera cuando unidad_medida_inicial=UNIDAD.';
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_inicio, NULL);
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, p_fecha_inicio);

  IF NOT EXISTS (
    SELECT 1
    FROM public.vivero
    WHERE id = p_vivero_id
  ) THEN
    RAISE EXCEPTION 'El vivero % no existe.', p_vivero_id;
  END IF;

  SELECT NULLIF(BTRIM(u.nombre), '')
  INTO v_responsable_nombre
  FROM public.usuario u
  WHERE u.id = p_responsable_id;

  IF v_responsable_nombre IS NULL THEN
    RAISE EXCEPTION 'El responsable % no existe o no tiene nombre valido.', p_responsable_id;
  END IF;

  SELECT
    r.id,
    r.estado_registro,
    r.estado_operativo,
    r.saldo_actual,
    r.unidad_canonica,
    r.planta_id,
    r.tipo_material,
    r.nombre_cientifico_snapshot,
    r.nombre_comercial_snapshot,
    r.variedad_snapshot,
    r.nombre_comunidad_snapshot
  INTO v_recoleccion
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recoleccion % no existe.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.estado_registro IS DISTINCT FROM 'VALIDADO' THEN
    RAISE EXCEPTION 'La recoleccion % no esta validada.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.estado_operativo IS DISTINCT FROM 'ABIERTO' THEN
    RAISE EXCEPTION
      'La recoleccion % no esta abierta para consumo hacia vivero.',
      p_recoleccion_id;
  END IF;

  IF v_recoleccion.saldo_actual IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene saldo_actual materializado.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.saldo_actual < p_cantidad_inicial_en_proceso THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene saldo suficiente. Disponible %, solicitado %.',
      p_recoleccion_id,
      v_recoleccion.saldo_actual,
      p_cantidad_inicial_en_proceso;
  END IF;

  IF v_recoleccion.unidad_canonica IS DISTINCT FROM p_unidad_medida_inicial THEN
    RAISE EXCEPTION
      'unidad_medida_inicial (%) debe coincidir con unidad_canonica de la recoleccion (%).',
      p_unidad_medida_inicial,
      v_recoleccion.unidad_canonica;
  END IF;

  IF v_recoleccion.tipo_material = 'ESQUEJE'
     AND p_unidad_medida_inicial <> 'UNIDAD' THEN
    RAISE EXCEPTION 'Para ESQUEJE la unidad de inicio debe ser UNIDAD.';
  END IF;

  IF v_recoleccion.planta_id IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene planta asociada.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.nombre_cientifico_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene nombre_cientifico_snapshot.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.nombre_comercial_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene nombre_comercial_snapshot.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.variedad_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene variedad_snapshot.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.nombre_comunidad_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene nombre_comunidad_snapshot.', p_recoleccion_id;
  END IF;

  v_codigo_trazabilidad := COALESCE(
    NULLIF(BTRIM(p_codigo_trazabilidad), ''),
    CONCAT(
      'VIV-',
      EXTRACT(YEAR FROM p_fecha_inicio)::INT,
      '-',
      UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 10))
    )
  );

  INSERT INTO public.lote_vivero (
    recoleccion_id,
    planta_id,
    vivero_id,
    responsable_id,
    nombre_cientifico_snapshot,
    nombre_comercial_snapshot,
    tipo_material_snapshot,
    variedad_snapshot,
    nombre_comunidad_origen_snapshot,
    nombre_responsable_snapshot,
    fecha_inicio,
    cantidad_inicial_en_proceso,
    unidad_medida_inicial,
    codigo_trazabilidad
  )
  VALUES (
    p_recoleccion_id,
    v_recoleccion.planta_id,
    p_vivero_id,
    p_responsable_id,
    v_recoleccion.nombre_cientifico_snapshot,
    v_recoleccion.nombre_comercial_snapshot,
    v_recoleccion.tipo_material,
    v_recoleccion.variedad_snapshot,
    v_recoleccion.nombre_comunidad_snapshot,
    v_responsable_nombre,
    p_fecha_inicio,
    p_cantidad_inicial_en_proceso,
    p_unidad_medida_inicial,
    v_codigo_trazabilidad
  )
  RETURNING id INTO v_lote_id;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    v_lote_id,
    'INICIO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_inicial_en_proceso,
    p_unidad_medida_inicial,
    NULL,
    NULL,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_operativa'
  ) INTO v_has_unidad_operativa;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_medida_evento'
  ) INTO v_has_unidad_medida_evento;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_medida_movimiento'
  ) INTO v_has_unidad_medida_movimiento;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'detalle_cambios'
  ) INTO v_has_detalle_cambios;

  IF NOT v_has_unidad_operativa
     AND NOT v_has_unidad_medida_evento
     AND NOT v_has_unidad_medida_movimiento THEN
    RAISE EXCEPTION
      'public.recoleccion_movimiento no tiene columna de unidad compatible.';
  END IF;

  v_movimiento_columns := ARRAY[
    'recoleccion_id',
    'tipo_movimiento',
    'delta'
  ];
  v_movimiento_values := ARRAY['$1', '$2', '$3'];

  IF v_has_unidad_operativa THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'unidad_operativa');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$4');
  END IF;

  IF v_has_unidad_medida_evento THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'unidad_medida_evento');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$4');
  END IF;

  IF v_has_unidad_medida_movimiento THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'unidad_medida_movimiento');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$4');
  END IF;

  v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'motivo');
  v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$5');
  v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'lote_vivero_id');
  v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$6');
  v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'created_by');
  v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$7');

  IF v_has_detalle_cambios THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'detalle_cambios');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$8');
  END IF;

  EXECUTE FORMAT(
    'INSERT INTO public.recoleccion_movimiento (%s) VALUES (%s) RETURNING id',
    ARRAY_TO_STRING(v_movimiento_columns, ', '),
    ARRAY_TO_STRING(v_movimiento_values, ', ')
  )
  INTO v_movimiento_id
  USING
    p_recoleccion_id,
    'CONSUMO_A_VIVERO'::public.tipo_movimiento_recoleccion,
    -p_cantidad_inicial_en_proceso,
    p_unidad_medida_inicial,
    'CONSUMO_PARA_VIVERO'::public.motivo_movimiento_recoleccion,
    v_lote_id,
    p_responsable_id,
    JSONB_BUILD_OBJECT(
      'origen', 'fn_vivero_crear_lote_desde_recoleccion',
      'evento_lote_vivero_id', v_evento_id,
      'cantidad_inicial_en_proceso', p_cantidad_inicial_en_proceso,
      'unidad_medida_inicial', p_unidad_medida_inicial
    );

  IF to_regprocedure('public.fn_recoleccion_recalcular_saldo_operativo(bigint)') IS NOT NULL THEN
    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(p_recoleccion_id);
  END IF;

  SELECT r.saldo_actual
  INTO v_saldo_despues
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id;

  lote_vivero_id := v_lote_id;
  evento_inicio_id := v_evento_id;
  recoleccion_movimiento_id := v_movimiento_id;
  codigo_trazabilidad := v_codigo_trazabilidad;
  saldo_recoleccion_antes := v_recoleccion.saldo_actual;
  saldo_recoleccion_despues := v_saldo_despues;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(
  BIGINT,
  BIGINT,
  BIGINT,
  DATE,
  DATE,
  NUMERIC,
  public.unidad_medida,
  TEXT,
  TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
