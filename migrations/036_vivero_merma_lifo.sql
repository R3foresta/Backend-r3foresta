-- 035_vivero_merma_lifo.sql
-- Implementa la politica LIFO de mermas sobre asignaciones (Tarea 04)
-- Modifica el handler fn_vivero_registrar_merma para que la merma
-- absorba primero el saldo no asignado, y el excedente se distribuya
-- entre asignaciones priorizando aquellas sin fecha o con fecha de inicio mas lejana.

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

  IF to_regclass('public.asignacion_vivero_subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.asignacion_vivero_subcampania. Ejecuta la migracion 024 primero.';
  END IF;

  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta la migracion 029 primero.';
  END IF;

  IF to_regprocedure('public.fn_vivero_assert_fecha_operativa(date,date)') IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_vivero_assert_fecha_operativa(date,date).';
  END IF;

  IF to_regprocedure('public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint).';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------
-- 1. Alteraciones de esquema
-- -----------------------------------------------------------------------

-- Añadir columna metadata si no existe
ALTER TABLE public.evento_lote_vivero ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Renombrar indice obsoleto a un nombre coherente
ALTER INDEX IF EXISTS asignacion_vivero_subcampania_fecha_fifo_idx RENAME TO asignacion_vivero_subcampania_lote_fecha_idx;

-- -----------------------------------------------------------------------
-- 2. Eliminar funcion previa
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_vivero_registrar_merma(
  BIGINT, DATE, BIGINT, INTEGER, public.causa_merma_vivero, TEXT, BIGINT[]
);

-- -----------------------------------------------------------------------
-- 3. Crear nueva funcion
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_merma(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_cantidad_perdida INTEGER,
  p_causa_merma      public.causa_merma_vivero,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_merma_id          BIGINT,
  lote_vivero_id           BIGINT,
  codigo_trazabilidad      TEXT,
  cantidad_perdida         INTEGER,
  causa_merma              public.causa_merma_vivero,
  saldo_vivo_antes         INTEGER,
  saldo_vivo_despues       INTEGER,
  evidencia_ids_vinculadas BIGINT[],
  lote_finalizado          BOOLEAN,
  motivo_cierre            public.motivo_cierre_lote
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
  v_saldo_antes            INTEGER;
  v_saldo_despues          INTEGER;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  
  -- Variables LIFO
  v_saldo_asignado         INTEGER;
  v_saldo_no_asignado      INTEGER;
  v_excedente              INTEGER;
  v_afectaciones           JSONB := '[]'::JSONB;
  v_asig                   RECORD;
  v_a_mermar               INTEGER;
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

  IF p_cantidad_perdida IS NULL OR p_cantidad_perdida < 1 THEN
    RAISE EXCEPTION 'cantidad_perdida debe ser un entero mayor o igual a 1.';
  END IF;

  IF p_causa_merma IS NULL THEN
    RAISE EXCEPTION 'causa_merma es obligatoria.';
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
    RAISE EXCEPTION 'MERMA requiere al menos una evidencia obligatoria (RF-VIV-03).';
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
    lv.fecha_inicio,
    lv.motivo_cierre
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
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar MERMA.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que EMBOLSADO ya existe y obtener su fecha
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento EMBOLSADO registrado. MERMA requiere EMBOLSADO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 8. Validar saldo vivo total disponible
  -- -----------------------------------------------------------------------
  v_saldo_antes := v_lote.saldo_vivo_actual;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo materializado. Verifique que EMBOLSADO fue registrado correctamente.',
      p_lote_id;
  END IF;

  IF p_cantidad_perdida > v_saldo_antes THEN
    RAISE EXCEPTION
      'La merma (%) no puede exceder el saldo vivo total (%) del lote %.',
      p_cantidad_perdida,
      v_saldo_antes,
      p_lote_id;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_perdida;

  -- -----------------------------------------------------------------------
  -- 9. Bloqueo anti-deadlock de asignaciones y logica LIFO
  -- -----------------------------------------------------------------------
  -- Bloquear filas en orden ASC por id para evitar deadlocks
  PERFORM 1
  FROM public.asignacion_vivero_subcampania av
  WHERE av.lote_vivero_id = p_lote_id AND av.estado = 'ACTIVA'
  ORDER BY av.id ASC
  FOR UPDATE;

  -- Obtener la suma del saldo ya comprometido/asignado
  SELECT COALESCE(SUM(saldo_asignado_disponible), 0)
  INTO v_saldo_asignado
  FROM public.asignacion_vivero_subcampania
  WHERE lote_vivero_id = p_lote_id AND estado = 'ACTIVA';

  v_saldo_no_asignado := v_lote.saldo_vivo_actual - v_saldo_asignado;

  IF p_cantidad_perdida <= v_saldo_no_asignado THEN
    -- CASO SIMPLE: La merma no toca las asignaciones
    v_excedente := 0;
  ELSE
    -- CASO COMPLEJO: La merma se "come" las asignaciones (LIFO)
    v_excedente := p_cantidad_perdida - v_saldo_no_asignado;

    FOR v_asig IN (
      SELECT av.id, av.saldo_asignado_disponible, av.subcampania_id
      FROM public.asignacion_vivero_subcampania av
      LEFT JOIN public.subcampania sc ON sc.id = av.subcampania_id
      WHERE av.lote_vivero_id = p_lote_id 
        AND av.estado = 'ACTIVA'
        AND av.saldo_asignado_disponible > 0
      -- IMPORTANTE: Las mas lejanas o nulas se sacrifican primero
      ORDER BY sc.fecha_estimada_inicio DESC NULLS FIRST, av.id DESC
    ) LOOP
      IF v_excedente <= 0 THEN 
        EXIT; 
      END IF;

      -- ¿Cuánto podemos absorber de esta asignación?
      v_a_mermar := LEAST(v_asig.saldo_asignado_disponible, v_excedente);

      -- Actualizar la tabla asignacion_vivero_subcampania (cantidad_asignada no cambia)
      UPDATE public.asignacion_vivero_subcampania
      SET cantidad_mermada = cantidad_mermada + v_a_mermar
      WHERE id = v_asig.id;

      -- Guardar registro en el JSON array
      v_afectaciones := v_afectaciones || jsonb_build_object(
        'asignacion_id', v_asig.id,
        'subcampania_id', v_asig.subcampania_id,
        'cantidad', v_a_mermar
      );

      v_excedente := v_excedente - v_a_mermar;
    END LOOP;

    -- Si sobra excedente, significa que hay inconsistencia de saldos
    IF v_excedente > 0 THEN
       RAISE EXCEPTION 'La merma total supera el saldo real disponible del lote (inconsistencia de saldo de asignaciones).';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 10. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
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
  -- 11. Validar que las evidencias existen, no estan eliminadas y son pendientes
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
      'Todas las evidencias de MERMA deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 12. Insertar evento MERMA
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    causa_merma,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones,
    metadata
  )
  VALUES (
    p_lote_id,
    'MERMA',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_perdida,
    'UNIDAD',
    p_causa_merma,
    v_saldo_antes,
    v_saldo_despues,
    p_observaciones,
    CASE 
      WHEN jsonb_array_length(v_afectaciones) > 0 THEN jsonb_build_object('afectacion_asignaciones', v_afectaciones) 
      ELSE NULL 
    END
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 13. Actualizar saldo_vivo_actual en LOTE_VIVERO
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    saldo_vivo_actual = v_saldo_despues,
    updated_at        = NOW()
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 14. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 15. Activar cierre automatico si el saldo llego a 0
  -- -----------------------------------------------------------------------
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------------
  -- 16. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_merma_id          := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  cantidad_perdida         := p_cantidad_perdida;
  causa_merma              := p_causa_merma;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_merma(
  BIGINT,
  DATE,
  BIGINT,
  INTEGER,
  public.causa_merma_vivero,
  TEXT,
  BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
