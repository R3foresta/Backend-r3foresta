DO $$
BEGIN
  IF to_regclass('public.lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.lote_vivero.';
  END IF;

  IF to_regclass('public.evento_lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evento_lote_vivero.';
  END IF;

  IF to_regclass('public.evidencias_trazabilidad') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evidencias_trazabilidad.';
  END IF;

  IF to_regclass('public.tipos_entidad_evidencia') IS NULL THEN
    RAISE EXCEPTION 'No existe public.tipos_entidad_evidencia.';
  END IF;

  IF to_regprocedure('public.fn_vivero_assert_fecha_operativa(date,date)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.fn_vivero_assert_fecha_operativa(date,date). Ejecuta antes la migracion 010.';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_vivero_registrar_embolsado(
  BIGINT, DATE, BIGINT, INTEGER, TEXT
);

DROP FUNCTION IF EXISTS public.fn_vivero_registrar_embolsado(
  BIGINT, BIGINT, DATE, INTEGER, TEXT, BIGINT[]
);

DROP FUNCTION IF EXISTS public.fn_vivero_registrar_embolsado(
  BIGINT, DATE, BIGINT, INTEGER, TEXT, BIGINT[]
);

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_embolsado(
  p_lote_id                 BIGINT,
  p_fecha_evento            DATE,
  p_responsable_id          BIGINT,
  p_plantas_vivas_iniciales INTEGER,
  p_observaciones           TEXT     DEFAULT NULL,
  p_evidencia_ids           BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_embolsado_id       BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad       TEXT,
  plantas_vivas_iniciales   INTEGER,
  saldo_vivo_antes          INTEGER,
  saldo_vivo_despues        INTEGER,
  evidencia_ids_vinculadas  BIGINT[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lote                    RECORD;
  v_evento_id               BIGINT;
  v_tipo_entidad_evento_id  BIGINT;
  v_evidencia_ids           BIGINT[];
  v_evidencias_solicitadas  INTEGER;
  v_evidencias_validas      INTEGER;
  v_ya_embolsado            BOOLEAN;
BEGIN
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_plantas_vivas_iniciales IS NULL OR p_plantas_vivas_iniciales < 1 THEN
    RAISE EXCEPTION 'plantas_vivas_iniciales debe ser un entero mayor o igual a 1.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION 'EMBOLSADO requiere al menos una evidencia obligatoria (RN-VIV-26).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.plantas_vivas_iniciales,
    lv.fecha_inicio
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote
  -- -----------------------------------------------------------------------
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar EMBOLSADO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que INICIO ya existe
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'INICIO'
  ) THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento INICIO registrado. EMBOLSADO requiere INICIO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Verificar que EMBOLSADO no existe ya
  -- -----------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'EMBOLSADO'
  )
  INTO v_ya_embolsado;

  IF v_ya_embolsado THEN
    RAISE EXCEPTION
      'El lote % ya tiene un evento EMBOLSADO registrado. No se puede registrar dos veces (RN-VIV-11).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_lote.fecha_inicio);

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 10. Validar que las evidencias existen, no estan eliminadas y son pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de EMBOLSADO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento EMBOLSADO
  -- -----------------------------------------------------------------------
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
    p_lote_id,
    'EMBOLSADO',
    p_fecha_evento,
    p_responsable_id,
    p_plantas_vivas_iniciales,
    'UNIDAD',
    NULL,
    p_plantas_vivas_iniciales,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar LOTE_VIVERO con el saldo vivo naciente
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    plantas_vivas_iniciales = p_plantas_vivas_iniciales,
    saldo_vivo_actual       = p_plantas_vivas_iniciales,
    updated_at              = CURRENT_DATE
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id             = v_tipo_entidad_evento_id,
    entidad_id                  = v_evento_id,
    codigo_trazabilidad         = v_lote.codigo_trazabilidad,
    actualizado_en              = CURRENT_DATE,
    actualizado_por_usuario_id  = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 14. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_embolsado_id      := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  plantas_vivas_iniciales  := p_plantas_vivas_iniciales;
  saldo_vivo_antes         := NULL;
  saldo_vivo_despues       := p_plantas_vivas_iniciales;
  evidencia_ids_vinculadas := v_evidencia_ids;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_embolsado(
  BIGINT,
  DATE,
  BIGINT,
  INTEGER,
  TEXT,
  BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';