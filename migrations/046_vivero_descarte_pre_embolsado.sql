-- 046_vivero_descarte_pre_embolsado.sql
-- Soporta el cierre de lotes que tuvieron INICIO pero nunca llegaron a EMBOLSADO.
--
-- Semantica:
--   - DESCARTE_PRE_EMBOLSADO no es MERMA: todavia no existe saldo vivo.
--   - El descarte es total sobre el material en proceso; no se permiten parciales.
--   - Cierra el lote con motivo_cierre = DESCARTE_PRE_EMBOLSADO.

-- =====================================================================
-- 1. Enums
-- =====================================================================

ALTER TYPE public.tipo_evento_vivero
  ADD VALUE IF NOT EXISTS 'DESCARTE_PRE_EMBOLSADO';

ALTER TYPE public.motivo_cierre_lote
  ADD VALUE IF NOT EXISTS 'DESCARTE_PRE_EMBOLSADO';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'causa_descarte_pre_embolsado'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.causa_descarte_pre_embolsado AS ENUM (
      'NO_GERMINACION',
      'NO_ENRAIZAMIENTO',
      'CONTAMINACION',
      'PERDIDA_TOTAL_MATERIAL',
      'MATERIAL_NO_VIABLE',
      'DANO_PRE_EMBOLSADO',
      'OTRO'
    );
  END IF;
END $$;

-- =====================================================================
-- 2. Columna de causa en evento_lote_vivero
-- =====================================================================

ALTER TABLE public.evento_lote_vivero
  ADD COLUMN IF NOT EXISTS causa_descarte_pre_embolsado public.causa_descarte_pre_embolsado NULL;

COMMENT ON COLUMN public.evento_lote_vivero.causa_descarte_pre_embolsado IS
  'Solo aplica a DESCARTE_PRE_EMBOLSADO. Registra la causa tecnica del descarte antes de que exista saldo vivo.';

-- =====================================================================
-- 3. CHECK constraints especificos del evento
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_descarte_pre_embolsado_consistente'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_descarte_pre_embolsado_consistente
      CHECK (
        tipo_evento::text <> 'DESCARTE_PRE_EMBOLSADO'
        OR (
          cantidad_afectada IS NOT NULL
          AND unidad_medida_evento IS NOT NULL
          AND causa_descarte_pre_embolsado IS NOT NULL
          AND causa_merma IS NULL
          AND destino_tipo IS NULL
          AND NULLIF(BTRIM(destino_referencia), '') IS NULL
          AND comunidad_destino_id IS NULL
          AND subetapa_destino IS NULL
          AND saldo_vivo_antes IS NULL
          AND saldo_vivo_despues IS NULL
          AND motivo_cierre_calculado IS NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_causa_descarte_solo_evento'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_causa_descarte_solo_evento
      CHECK (
        tipo_evento::text = 'DESCARTE_PRE_EMBOLSADO'
        OR causa_descarte_pre_embolsado IS NULL
      );
  END IF;
END $$;

-- =====================================================================
-- 4. RPC transaccional
-- =====================================================================

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

DROP FUNCTION IF EXISTS public.fn_vivero_registrar_descarte_pre_embolsado(
  BIGINT,
  DATE,
  BIGINT,
  NUMERIC,
  public.unidad_medida,
  public.causa_descarte_pre_embolsado,
  TEXT,
  BIGINT[]
);

-- Los valores enum agregados arriba no son usables hasta el COMMIT si el SQL
-- corre dentro de una transaccion unica (comportamiento frecuente en Supabase).
-- Evitamos que el validador intente resolverlos al crear la funcion.
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_descarte_pre_embolsado(
  p_lote_id                         BIGINT,
  p_fecha_evento                    DATE,
  p_responsable_id                  BIGINT,
  p_cantidad_material_afectado      NUMERIC,
  p_unidad_medida_evento            public.unidad_medida,
  p_causa_descarte_pre_embolsado    public.causa_descarte_pre_embolsado,
  p_observaciones                   TEXT     DEFAULT NULL,
  p_evidencia_ids                   BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_descarte_pre_embolsado_id  BIGINT,
  evento_cierre_id                  BIGINT,
  lote_vivero_id                    BIGINT,
  codigo_trazabilidad               TEXT,
  cantidad_material_afectado        NUMERIC,
  unidad_medida_evento              public.unidad_medida,
  causa_descarte_pre_embolsado      public.causa_descarte_pre_embolsado,
  evidencia_ids_vinculadas          BIGINT[],
  lote_finalizado                   BOOLEAN,
  motivo_cierre                     public.motivo_cierre_lote
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lote                    RECORD;
  v_evento_descarte_id      BIGINT;
  v_evento_cierre_id        BIGINT;
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

  IF p_cantidad_material_afectado IS NULL OR p_cantidad_material_afectado <= 0 THEN
    RAISE EXCEPTION 'cantidad_material_afectado debe ser mayor a 0.';
  END IF;

  IF p_unidad_medida_evento IS NULL THEN
    RAISE EXCEPTION 'unidad_medida_evento es obligatoria.';
  END IF;

  IF p_causa_descarte_pre_embolsado IS NULL THEN
    RAISE EXCEPTION 'causa_descarte_pre_embolsado es obligatoria.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar responsable
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
    RAISE EXCEPTION 'DESCARTE_PRE_EMBOLSADO requiere al menos una evidencia obligatoria.';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.fecha_inicio,
    lv.cantidad_inicial_en_proceso,
    lv.unidad_medida_inicial,
    lv.plantas_vivas_iniciales,
    lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar DESCARTE_PRE_EMBOLSADO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento::text = 'INICIO'
  ) THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento INICIO registrado. DESCARTE_PRE_EMBOLSADO requiere INICIO previo.',
      p_lote_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento::text = 'EMBOLSADO'
  )
  INTO v_ya_embolsado;

  IF v_ya_embolsado THEN
    RAISE EXCEPTION
      'El lote % ya tiene EMBOLSADO. Use MERMA total sobre saldo_vivo_actual; DESCARTE_PRE_EMBOLSADO solo aplica antes de EMBOLSADO.',
      p_lote_id;
  END IF;

  IF p_unidad_medida_evento IS DISTINCT FROM v_lote.unidad_medida_inicial THEN
    RAISE EXCEPTION
      'unidad_medida_evento (%) debe coincidir con unidad_medida_inicial (%) del lote %.',
      p_unidad_medida_evento,
      v_lote.unidad_medida_inicial,
      p_lote_id;
  END IF;

  IF p_cantidad_material_afectado <> v_lote.cantidad_inicial_en_proceso THEN
    RAISE EXCEPTION
      'DESCARTE_PRE_EMBOLSADO es total: cantidad_material_afectado (%) debe coincidir con cantidad_inicial_en_proceso (%) del lote %.',
      p_cantidad_material_afectado,
      v_lote.cantidad_inicial_en_proceso,
      p_lote_id;
  END IF;

  IF v_lote.plantas_vivas_iniciales IS NOT NULL OR v_lote.saldo_vivo_actual IS NOT NULL THEN
    RAISE EXCEPTION
      'El lote % ya tiene datos de saldo vivo. DESCARTE_PRE_EMBOLSADO solo aplica antes de que exista saldo vivo.',
      p_lote_id;
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_lote.fecha_inicio);

  -- -----------------------------------------------------------------------
  -- 5. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
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
  -- 6. Validar evidencias pendientes
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
      'Todas las evidencias de DESCARTE_PRE_EMBOLSADO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Insertar evento DESCARTE_PRE_EMBOLSADO
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    causa_descarte_pre_embolsado,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'DESCARTE_PRE_EMBOLSADO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_material_afectado,
    p_unidad_medida_evento,
    p_causa_descarte_pre_embolsado,
    NULL,
    NULL,
    p_observaciones
  )
  RETURNING id INTO v_evento_descarte_id;

  -- -----------------------------------------------------------------------
  -- 8. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_descarte_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 9. Cerrar lote sin materializar saldo vivo
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    estado_lote   = 'FINALIZADO',
    motivo_cierre = 'DESCARTE_PRE_EMBOLSADO',
    updated_at    = NOW()
  WHERE id = p_lote_id;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    motivo_cierre_calculado,
    ref_evento_trigger_id,
    observaciones
  )
  VALUES (
    p_lote_id,
    'CIERRE_AUTOMATICO',
    p_fecha_evento,
    p_responsable_id,
    'DESCARTE_PRE_EMBOLSADO',
    v_evento_descarte_id,
    'Cierre automatico por descarte pre-embolsado'
  )
  RETURNING id INTO v_evento_cierre_id;

  -- -----------------------------------------------------------------------
  -- 10. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_descarte_pre_embolsado_id := v_evento_descarte_id;
  evento_cierre_id                 := v_evento_cierre_id;
  lote_vivero_id                   := p_lote_id;
  codigo_trazabilidad              := v_lote.codigo_trazabilidad;
  cantidad_material_afectado       := p_cantidad_material_afectado;
  unidad_medida_evento             := p_unidad_medida_evento;
  causa_descarte_pre_embolsado     := p_causa_descarte_pre_embolsado;
  evidencia_ids_vinculadas         := v_evidencia_ids;
  lote_finalizado                  := TRUE;
  motivo_cierre                    := 'DESCARTE_PRE_EMBOLSADO';

  RETURN NEXT;
END;
$$;

RESET check_function_bodies;

GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_descarte_pre_embolsado(
  BIGINT,
  DATE,
  BIGINT,
  NUMERIC,
  public.unidad_medida,
  public.causa_descarte_pre_embolsado,
  TEXT,
  BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
