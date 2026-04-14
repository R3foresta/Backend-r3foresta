-- 010_vivero_operational_rules.sql
-- Reglas operativas minimas para modulo vivero
-- Alcance:
-- - checks basicos e invariantes directos
-- - trigger updated_at en lote_vivero
-- - helper temporal de validacion
-- - cierre automatico por saldo en 0
-- - funciones operativas para embolsado, adaptabilidad, merma y despacho

-- =========================================================
-- CHECKS BASICOS: lote_vivero
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_lote_vivero_cantidad_inicial_positiva'
      AND conrelid = 'public.lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.lote_vivero
      ADD CONSTRAINT chk_lote_vivero_cantidad_inicial_positiva
      CHECK (cantidad_inicial_en_proceso > 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_lote_vivero_plantas_vivas_no_negativo'
      AND conrelid = 'public.lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.lote_vivero
      ADD CONSTRAINT chk_lote_vivero_plantas_vivas_no_negativo
      CHECK (
        plantas_vivas_iniciales IS NULL
        OR plantas_vivas_iniciales >= 0
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_lote_vivero_saldo_vivo_no_negativo'
      AND conrelid = 'public.lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.lote_vivero
      ADD CONSTRAINT chk_lote_vivero_saldo_vivo_no_negativo
      CHECK (
        saldo_vivo_actual IS NULL
        OR saldo_vivo_actual >= 0
      );
  END IF;
END;
$$;

-- =========================================================
-- CHECKS BASICOS: evento_lote_vivero
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_cantidad_afectada_positiva'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_cantidad_afectada_positiva
      CHECK (
        cantidad_afectada IS NULL
        OR cantidad_afectada > 0
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_saldo_vivo_antes_no_negativo'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_saldo_vivo_antes_no_negativo
      CHECK (
        saldo_vivo_antes IS NULL
        OR saldo_vivo_antes >= 0
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_saldo_vivo_despues_no_negativo'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_saldo_vivo_despues_no_negativo
      CHECK (
        saldo_vivo_despues IS NULL
        OR saldo_vivo_despues >= 0
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_unidad_eventos_vivos'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_unidad_eventos_vivos
      CHECK (
        tipo_evento NOT IN ('EMBOLSADO', 'MERMA', 'DESPACHO')
        OR unidad_medida_evento = 'UNIDAD'
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_merma_causa_requerida'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_merma_causa_requerida
      CHECK (
        tipo_evento <> 'MERMA'
        OR causa_merma IS NOT NULL
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_adaptabilidad_subetapa_requerida'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_adaptabilidad_subetapa_requerida
      CHECK (
        tipo_evento <> 'ADAPTABILIDAD'
        OR subetapa_destino IS NOT NULL
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_despacho_destino_requerido'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_despacho_destino_requerido
      CHECK (
        tipo_evento <> 'DESPACHO'
        OR (
          destino_tipo IS NOT NULL
          AND NULLIF(BTRIM(destino_referencia), '') IS NOT NULL
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_donacion_comunidad_requerida'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_donacion_comunidad_requerida
      CHECK (
        tipo_evento <> 'DESPACHO'
        OR destino_tipo <> 'DONACION_COMUNIDAD'
        OR comunidad_destino_id IS NOT NULL
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_cierre_campos_requeridos'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_cierre_campos_requeridos
      CHECK (
        tipo_evento <> 'CIERRE_AUTOMATICO'
        OR (
          motivo_cierre_calculado IS NOT NULL
          AND ref_evento_trigger_id IS NOT NULL
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_saldos_eventos_vivos_requeridos'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_saldos_eventos_vivos_requeridos
      CHECK (
        tipo_evento NOT IN ('EMBOLSADO', 'MERMA', 'DESPACHO')
        OR (
          saldo_vivo_antes IS NOT NULL
          AND saldo_vivo_despues IS NOT NULL
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_saldo_no_incrementa'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_saldo_no_incrementa
      CHECK (
        saldo_vivo_antes IS NULL
        OR saldo_vivo_despues IS NULL
        OR tipo_evento = 'EMBOLSADO'
        OR saldo_vivo_despues <= saldo_vivo_antes
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_evento_lote_vivero_embolsado_consistente'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT chk_evento_lote_vivero_embolsado_consistente
      CHECK (
        tipo_evento <> 'EMBOLSADO'
        OR (
          saldo_vivo_antes = 0
          AND cantidad_afectada IS NOT NULL
          AND cantidad_afectada = saldo_vivo_despues::NUMERIC
        )
      );
  END IF;
END;
$$;

-- =========================================================
-- TRIGGER updated_at
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_lote_vivero_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lote_vivero_set_updated_at ON public.lote_vivero;

CREATE TRIGGER trg_lote_vivero_set_updated_at
BEFORE UPDATE ON public.lote_vivero
FOR EACH ROW
EXECUTE FUNCTION public.fn_lote_vivero_set_updated_at();

-- =========================================================
-- HELPER TEMPORAL
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_vivero_assert_fecha_operativa(
  p_fecha_evento DATE,
  p_fecha_minima DATE DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_fecha_evento > CURRENT_DATE THEN
    RAISE EXCEPTION 'fecha_evento (%) no puede ser futura.', p_fecha_evento;
  END IF;

  IF p_fecha_evento < (CURRENT_DATE - 10) THEN
    RAISE EXCEPTION
      'fecha_evento (%) no puede exceder la ventana retroactiva de 10 dias.',
      p_fecha_evento;
  END IF;

  IF p_fecha_minima IS NOT NULL AND p_fecha_evento < p_fecha_minima THEN
    RAISE EXCEPTION
      'fecha_evento (%) no puede ser anterior a la fecha habilitante (%).',
      p_fecha_evento,
      p_fecha_minima;
  END IF;
END;
$$;

-- =========================================================
-- CIERRE AUTOMATICO
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_vivero_cerrar_lote_si_corresponde(
  p_lote_id BIGINT,
  p_evento_trigger_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_actual INTEGER;
  v_tuvo_despacho BOOLEAN;
  v_tuvo_merma BOOLEAN;
  v_motivo public.motivo_cierre_lote;
  v_responsable_id BIGINT;
  v_fecha_cierre DATE;
BEGIN
  SELECT saldo_vivo_actual
  INTO v_saldo_actual
  FROM public.lote_vivero
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote % no existe.', p_lote_id;
  END IF;

  IF v_saldo_actual IS NULL OR v_saldo_actual <> 0 THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'DESPACHO'
  ) INTO v_tuvo_despacho;

  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'MERMA'
  ) INTO v_tuvo_merma;

  IF v_tuvo_despacho AND v_tuvo_merma THEN
    v_motivo := 'MIXTO';
  ELSIF v_tuvo_despacho THEN
    v_motivo := 'DESPACHO_TOTAL';
  ELSE
    v_motivo := 'PERDIDA_TOTAL';
  END IF;

  UPDATE public.lote_vivero
  SET estado_lote = 'FINALIZADO',
      motivo_cierre = v_motivo
  WHERE id = p_lote_id
    AND estado_lote <> 'FINALIZADO';

  SELECT COALESCE(ev.responsable_id, lv.responsable_id),
         COALESCE(ev.fecha_evento, CURRENT_DATE)
  INTO v_responsable_id, v_fecha_cierre
  FROM public.lote_vivero lv
  LEFT JOIN public.evento_lote_vivero ev
    ON ev.id = p_evento_trigger_id
  WHERE lv.id = p_lote_id;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    motivo_cierre_calculado,
    ref_evento_trigger_id,
    observaciones
  )
  SELECT
    lv.id,
    'CIERRE_AUTOMATICO',
    v_fecha_cierre,
    v_responsable_id,
    v_motivo,
    p_evento_trigger_id,
    'Cierre automatico por saldo vivo igual a 0'
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.evento_lote_vivero ev
      WHERE ev.lote_id = p_lote_id
        AND ev.tipo_evento = 'CIERRE_AUTOMATICO'
    );
END;
$$;

-- =========================================================
-- EMBOLSADO
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_embolsado(
  p_lote_id BIGINT,
  p_fecha_evento DATE,
  p_responsable_id BIGINT,
  p_plantas_vivas_iniciales INTEGER,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento_id BIGINT;
  v_lote_estado public.estado_lote_vivero;
  v_fecha_inicio DATE;
  v_fecha_evento_inicio DATE;
BEGIN
  SELECT estado_lote, fecha_inicio
  INTO v_lote_estado, v_fecha_inicio
  FROM public.lote_vivero
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote % no existe.', p_lote_id;
  END IF;

  IF v_lote_estado = 'FINALIZADO' THEN
    RAISE EXCEPTION 'No se puede embolsar un lote finalizado.';
  END IF;

  IF p_plantas_vivas_iniciales IS NULL OR p_plantas_vivas_iniciales <= 0 THEN
    RAISE EXCEPTION 'plantas_vivas_iniciales debe ser mayor a 0.';
  END IF;

  SELECT MIN(fecha_evento)
  INTO v_fecha_evento_inicio
  FROM public.evento_lote_vivero
  WHERE lote_id = p_lote_id
    AND tipo_evento = 'INICIO';

  IF v_fecha_evento_inicio IS NULL THEN
    RAISE EXCEPTION 'No se puede registrar EMBOLSADO sin INICIO previo.';
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_evento,
    GREATEST(v_fecha_inicio, v_fecha_evento_inicio)
  );

  IF EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'EMBOLSADO'
  ) THEN
    RAISE EXCEPTION 'El lote % ya tiene un evento EMBOLSADO.', p_lote_id;
  END IF;

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
    0,
    p_plantas_vivas_iniciales,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  UPDATE public.lote_vivero
  SET plantas_vivas_iniciales = p_plantas_vivas_iniciales,
      saldo_vivo_actual = p_plantas_vivas_iniciales
  WHERE id = p_lote_id;

  RETURN v_evento_id;
END;
$$;

-- =========================================================
-- ADAPTABILIDAD
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_adaptabilidad(
  p_lote_id BIGINT,
  p_fecha_evento DATE,
  p_responsable_id BIGINT,
  p_subetapa_destino public.subetapa_adaptabilidad,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento_id BIGINT;
  v_lote_estado public.estado_lote_vivero;
  v_fecha_embolsado DATE;
  v_saldo_actual INTEGER;
BEGIN
  SELECT estado_lote, saldo_vivo_actual
  INTO v_lote_estado, v_saldo_actual
  FROM public.lote_vivero
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote % no existe.', p_lote_id;
  END IF;

  IF v_lote_estado = 'FINALIZADO' THEN
    RAISE EXCEPTION 'No se puede registrar adaptabilidad en un lote finalizado.';
  END IF;

  IF p_subetapa_destino IS NULL THEN
    RAISE EXCEPTION 'subetapa_destino es obligatoria.';
  END IF;

  SELECT MIN(fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero
  WHERE lote_id = p_lote_id
    AND tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION 'No se puede registrar ADAPTABILIDAD sin EMBOLSADO previo.';
  END IF;

  IF v_saldo_actual IS NULL THEN
    RAISE EXCEPTION 'El lote % no tiene saldo vivo materializado.', p_lote_id;
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_evento,
    v_fecha_embolsado
  );

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    subetapa_destino,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'ADAPTABILIDAD',
    p_fecha_evento,
    p_responsable_id,
    p_subetapa_destino,
    v_saldo_actual,
    v_saldo_actual,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  UPDATE public.lote_vivero
  SET subetapa_actual = p_subetapa_destino
  WHERE id = p_lote_id;

  RETURN v_evento_id;
END;
$$;

-- =========================================================
-- MERMA
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_merma(
  p_lote_id BIGINT,
  p_fecha_evento DATE,
  p_responsable_id BIGINT,
  p_cantidad_perdida INTEGER,
  p_causa_merma public.causa_merma_vivero,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento_id BIGINT;
  v_lote_estado public.estado_lote_vivero;
  v_fecha_embolsado DATE;
  v_saldo_antes INTEGER;
  v_saldo_despues INTEGER;
BEGIN
  SELECT estado_lote, saldo_vivo_actual
  INTO v_lote_estado, v_saldo_antes
  FROM public.lote_vivero
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote % no existe.', p_lote_id;
  END IF;

  IF v_lote_estado = 'FINALIZADO' THEN
    RAISE EXCEPTION 'No se puede registrar merma en un lote finalizado.';
  END IF;

  SELECT MIN(fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero
  WHERE lote_id = p_lote_id
    AND tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION 'No se puede registrar MERMA sin EMBOLSADO previo.';
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_evento,
    v_fecha_embolsado
  );

  IF p_cantidad_perdida IS NULL OR p_cantidad_perdida <= 0 THEN
    RAISE EXCEPTION 'La cantidad de merma debe ser mayor a 0.';
  END IF;

  IF p_causa_merma IS NULL THEN
    RAISE EXCEPTION 'causa_merma es obligatoria.';
  END IF;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION 'El lote % no tiene saldo vivo inicial materializado.', p_lote_id;
  END IF;

  IF p_cantidad_perdida > v_saldo_antes THEN
    RAISE EXCEPTION
      'La merma (%) no puede exceder el saldo disponible (%).',
      p_cantidad_perdida,
      v_saldo_antes;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_perdida;

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
    observaciones
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
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  UPDATE public.lote_vivero
  SET saldo_vivo_actual = v_saldo_despues
  WHERE id = p_lote_id;

  PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

  RETURN v_evento_id;
END;
$$;

-- =========================================================
-- DESPACHO
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_despacho(
  p_lote_id BIGINT,
  p_fecha_evento DATE,
  p_responsable_id BIGINT,
  p_cantidad_despachada INTEGER,
  p_destino_tipo public.destino_tipo_vivero,
  p_destino_referencia TEXT,
  p_comunidad_destino_id BIGINT DEFAULT NULL,
  p_metadata_blockchain JSONB DEFAULT NULL,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_evento_id BIGINT;
  v_lote_estado public.estado_lote_vivero;
  v_fecha_embolsado DATE;
  v_saldo_antes INTEGER;
  v_saldo_despues INTEGER;
BEGIN
  SELECT estado_lote, saldo_vivo_actual
  INTO v_lote_estado, v_saldo_antes
  FROM public.lote_vivero
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote % no existe.', p_lote_id;
  END IF;

  IF v_lote_estado = 'FINALIZADO' THEN
    RAISE EXCEPTION 'No se puede registrar despacho en un lote finalizado.';
  END IF;

  SELECT MIN(fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero
  WHERE lote_id = p_lote_id
    AND tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION 'No se puede registrar DESPACHO sin EMBOLSADO previo.';
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_evento,
    v_fecha_embolsado
  );

  IF p_cantidad_despachada IS NULL OR p_cantidad_despachada <= 0 THEN
    RAISE EXCEPTION 'La cantidad de despacho debe ser mayor a 0.';
  END IF;

  IF p_destino_tipo IS NULL THEN
    RAISE EXCEPTION 'destino_tipo es obligatorio.';
  END IF;

  IF NULLIF(BTRIM(p_destino_referencia), '') IS NULL THEN
    RAISE EXCEPTION 'destino_referencia es obligatoria.';
  END IF;

  IF p_destino_tipo = 'DONACION_COMUNIDAD' AND p_comunidad_destino_id IS NULL THEN
    RAISE EXCEPTION
      'comunidad_destino_id es obligatorio para destino_tipo DONACION_COMUNIDAD.';
  END IF;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION 'El lote % no tiene saldo vivo inicial materializado.', p_lote_id;
  END IF;

  IF p_cantidad_despachada > v_saldo_antes THEN
    RAISE EXCEPTION
      'El despacho (%) no puede exceder el saldo disponible (%).',
      p_cantidad_despachada,
      v_saldo_antes;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_despachada;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    destino_tipo,
    destino_referencia,
    comunidad_destino_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    metadata_blockchain,
    observaciones
  )
  VALUES (
    p_lote_id,
    'DESPACHO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_despachada,
    'UNIDAD',
    p_destino_tipo,
    BTRIM(p_destino_referencia),
    p_comunidad_destino_id,
    v_saldo_antes,
    v_saldo_despues,
    p_metadata_blockchain,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  UPDATE public.lote_vivero
  SET saldo_vivo_actual = v_saldo_despues
  WHERE id = p_lote_id;

  PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

  RETURN v_evento_id;
END;
$$;
