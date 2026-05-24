-- 026_vivero_despacho_rpc.sql
-- RPC fn_vivero_registrar_despacho: registra un evento DESPACHO MANUAL desde Vivero (M2)
-- en una sola transaccion. Cierra el lote automaticamente si saldo llega a 0.
--
-- Invariantes que cumple esta RPC (alineadas con migraciones 023 + 025):
--   - origen_despacho se setea EXPLICITAMENTE a 'MANUAL'
--     (despues de la 025 ya no hay default en la columna).
--   - destino_tipo NUNCA puede ser 'PLANTACION_CAMPANIA'
--     (ese destino esta reservado para despachos automaticos generados desde M3).
--   - Los IDs hacia M3 (subcampania_id, campania_id, registro_plantacion_id)
--     quedan en NULL en este flujo.
--   - cantidad_afectada se mide en UNIDAD (post-EMBOLSADO ya hay conteo de plantas).
--
-- Si destino_tipo = 'PLANTACION_CAMPANIA' es enviado por error desde un cliente,
-- la RPC RAISE EXCEPTION explicita antes de cualquier INSERT.

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

  IF to_regprocedure('public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint). Ejecuta antes la migracion 010.';
  END IF;

  -- Asegurar que el valor 'MANUAL' existe en el enum origen_despacho_vivero (migracion 023)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'origen_despacho_vivero'
      AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION
      'No existe el enum public.origen_despacho_vivero. Ejecuta antes la migracion 023.';
  END IF;
END;
$$;

-- Eliminar cualquier firma previa por si hubo intentos anteriores
DROP FUNCTION IF EXISTS public.fn_vivero_registrar_despacho(
  BIGINT, DATE, BIGINT, INTEGER, public.destino_tipo_vivero, TEXT, BIGINT, TEXT, BIGINT[]
);

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_despacho(
  p_lote_id              BIGINT,
  p_fecha_evento         DATE,
  p_responsable_id       BIGINT,
  p_cantidad_despachada  INTEGER,
  p_destino_tipo         public.destino_tipo_vivero,
  p_destino_referencia   TEXT,
  p_comunidad_destino_id BIGINT   DEFAULT NULL,
  p_observaciones        TEXT     DEFAULT NULL,
  p_evidencia_ids        BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_despacho_id        BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad       TEXT,
  cantidad_despachada       INTEGER,
  destino_tipo              public.destino_tipo_vivero,
  destino_referencia        TEXT,
  comunidad_destino_id      BIGINT,
  saldo_vivo_antes          INTEGER,
  saldo_vivo_despues        INTEGER,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
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
  v_destino_referencia     TEXT;
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

  IF p_cantidad_despachada IS NULL OR p_cantidad_despachada < 1 THEN
    RAISE EXCEPTION 'cantidad_despachada debe ser un entero mayor o igual a 1.';
  END IF;

  IF p_destino_tipo IS NULL THEN
    RAISE EXCEPTION 'destino_tipo es obligatorio.';
  END IF;

  -- Bloqueo explicito: PLANTACION_CAMPANIA esta reservado para despachos automaticos
  -- generados desde el Modulo 3. Casteo a TEXT para evitar la dependencia con el
  -- valor de enum recien agregado (mismo workaround que en migracion 023).
  IF p_destino_tipo::TEXT = 'PLANTACION_CAMPANIA' THEN
    RAISE EXCEPTION
      'destino_tipo PLANTACION_CAMPANIA esta reservado para despachos automaticos generados desde Modulo 3. Use el endpoint correspondiente.';
  END IF;

  v_destino_referencia := NULLIF(BTRIM(COALESCE(p_destino_referencia, '')), '');
  IF v_destino_referencia IS NULL THEN
    RAISE EXCEPTION 'destino_referencia es obligatorio y no puede ser vacio.';
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
  -- 3. Validar comunidad_destino_id (si fue enviado, debe existir)
  -- -----------------------------------------------------------------------
  IF p_comunidad_destino_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.division_administrativa
      WHERE id = p_comunidad_destino_id
    ) THEN
      RAISE EXCEPTION
        'comunidad_destino_id % no existe en division_administrativa.',
        p_comunidad_destino_id;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 4. Normalizar y deduplicar evidencias (obligatorio para DESPACHO MANUAL)
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'DESPACHO requiere al menos una evidencia obligatoria (RN-VIV-23).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 5. Leer y bloquear el lote
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
  -- 6. Validar estado del lote
  -- -----------------------------------------------------------------------
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar DESPACHO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Verificar que EMBOLSADO ya existe y obtener su fecha (RN-VIV-10)
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento EMBOLSADO registrado. DESPACHO requiere EMBOLSADO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 9. Validar saldo vivo disponible
  -- -----------------------------------------------------------------------
  v_saldo_antes := v_lote.saldo_vivo_actual;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo materializado. Verifique que EMBOLSADO fue registrado correctamente.',
      p_lote_id;
  END IF;

  IF p_cantidad_despachada > v_saldo_antes THEN
    RAISE EXCEPTION
      'El despacho (%) no puede exceder el saldo vivo disponible (%) del lote %.',
      p_cantidad_despachada,
      v_saldo_antes,
      p_lote_id;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_despachada;

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
      'Todas las evidencias de DESPACHO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 12. Insertar evento DESPACHO MANUAL
  --     origen_despacho = 'MANUAL' explicito (la 025 quito el default).
  --     subcampania_id / campania_id / registro_plantacion_id quedan NULL
  --     (CHECK constraint evento_lote_vivero_origen_despacho_consistency_chk).
  -- -----------------------------------------------------------------------
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
    origen_despacho,
    saldo_vivo_antes,
    saldo_vivo_despues,
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
    v_destino_referencia,
    p_comunidad_destino_id,
    'MANUAL'::public.origen_despacho_vivero,
    v_saldo_antes,
    v_saldo_despues,
    p_observaciones
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
  evento_despacho_id       := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  cantidad_despachada      := p_cantidad_despachada;
  destino_tipo             := p_destino_tipo;
  destino_referencia       := v_destino_referencia;
  comunidad_destino_id     := p_comunidad_destino_id;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_despacho(
  BIGINT,
  DATE,
  BIGINT,
  INTEGER,
  public.destino_tipo_vivero,
  TEXT,
  BIGINT,
  TEXT,
  BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
