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

-- Eliminar firmas previas si existen
DROP FUNCTION IF EXISTS public.fn_vivero_registrar_adaptabilidad(
  BIGINT, DATE, BIGINT, public.subetapa_adaptabilidad, TEXT
);

DROP FUNCTION IF EXISTS public.fn_vivero_registrar_adaptabilidad(
  BIGINT, DATE, BIGINT, public.subetapa_adaptabilidad, TEXT, BIGINT[]
);

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_adaptabilidad(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_subetapa_destino public.subetapa_adaptabilidad,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_adaptabilidad_id  BIGINT,
  lote_vivero_id           BIGINT,
  codigo_trazabilidad      TEXT,
  subetapa_destino         public.subetapa_adaptabilidad,
  saldo_vivo_actual        INTEGER,
  evidencia_ids_vinculadas BIGINT[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
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

  IF p_subetapa_destino IS NULL THEN
    RAISE EXCEPTION 'subetapa_destino es obligatoria.';
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
  -- 3. Normalizar y deduplicar evidencias (son opcionales)
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL THEN
    v_evidencia_ids := ARRAY[]::BIGINT[];
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.subetapa_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote (RN-VIV-25)
  -- -----------------------------------------------------------------------
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar ADAPTABILIDAD.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que EMBOLSADO ya existe y obtener su fecha (RN-VIV-10)
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento EMBOLSADO registrado. ADAPTABILIDAD requiere EMBOLSADO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Validar que el saldo vivo esta materializado (debe existir tras EMBOLSADO)
  -- -----------------------------------------------------------------------
  IF v_lote.saldo_vivo_actual IS NULL THEN
    RAISE EXCEPTION
      'El lote % tiene EMBOLSADO, pero saldo_vivo_actual esta NULL. No se puede registrar ADAPTABILIDAD.',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO (solo si hay evidencias)
  -- -----------------------------------------------------------------------
  IF v_evidencias_solicitadas > 0 THEN
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
        'Todas las evidencias de ADAPTABILIDAD deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento ADAPTABILIDAD
  -- ADAPTABILIDAD no modifica saldo vivo: saldo_vivo_antes = saldo_vivo_despues = saldo_vivo_actual
  -- created_at usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    created_at,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    subetapa_destino,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'ADAPTABILIDAD',
    p_fecha_evento,
    CURRENT_DATE,
    p_responsable_id,
    v_lote.saldo_vivo_actual,
    'UNIDAD',
    p_subetapa_destino,
    v_lote.saldo_vivo_actual,
    v_lote.saldo_vivo_actual,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar subetapa_actual en LOTE_VIVERO
  -- updated_at usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    subetapa_actual = p_subetapa_destino,
    updated_at      = CURRENT_DATE
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento (solo si se enviaron)
  -- actualizado_en usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  IF v_evidencias_solicitadas > 0 THEN
    UPDATE public.evidencias_trazabilidad
    SET
      tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = CURRENT_DATE,
      actualizado_por_usuario_id = p_responsable_id
    WHERE id = ANY(v_evidencia_ids);
  END IF;

  -- -----------------------------------------------------------------------
  -- 14. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_adaptabilidad_id  := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  subetapa_destino         := p_subetapa_destino;
  saldo_vivo_actual        := v_lote.saldo_vivo_actual;
  evidencia_ids_vinculadas := v_evidencia_ids;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_adaptabilidad(
  BIGINT,
  DATE,
  BIGINT,
  public.subetapa_adaptabilidad,
  TEXT,
  BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
