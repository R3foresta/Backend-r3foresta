-- 052_vivero_asignar_stock_subcampania_rpc.sql
-- Tarea M2-M3-02: RPC fn_vivero_asignar_stock_subcampania — asignacion FISICA
-- atomica de un lote de vivero a una subcampania (RF-VIV-11, RN-VIV-47/54/61).
--
-- Reemplaza el flujo de reserva logica (fn_vivero_reservar_stock_lote, 045/047/049):
--   - Valida contra LOTE_VIVERO.saldo_vivo_actual (sin restar asignaciones previas,
--     porque las asignaciones fisicas anteriores ya descontaron el saldo).
--   - Exige evidencia propia de la entrega (RN-VIV-54).
--   - En una sola transaccion:
--       1. inserta ASIGNACION_VIVERO_SUBCAMPANIA,
--       2. inserta EVENTO_LOTE_VIVERO DESPACHO origen ASIGNACION_SUBCAMPANIA,
--       3. descuenta LOTE_VIVERO.saldo_vivo_actual,
--       4. vincula evidencias al evento M2,
--       5. inserta EVENTO_PLANTACION tipo ASIGNACION_VIVERO,
--       6. cierra el lote si el saldo llega a 0.
--   - Permisos: ADMIN global o COORDINADOR de la subcampania.
--
-- La RPC antigua fn_vivero_reservar_stock_lote se ELIMINA: la reserva logica no
-- existe en el contrato vigente y mantenerla invitaria a saltarse el descuento
-- fisico. (Decision 2026-07-06: sin aliases legados.)
--
-- Depende de: 051 (enum ASIGNACION_SUBCAMPANIA, columna asignacion_id, CHECKs).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'origen_despacho_vivero'
      AND e.enumlabel = 'ASIGNACION_SUBCAMPANIA'
  ) THEN
    RAISE EXCEPTION 'Falta el valor ASIGNACION_SUBCAMPANIA en origen_despacho_vivero. Ejecuta antes la migracion 051.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'evento_lote_vivero'
      AND column_name = 'asignacion_id'
  ) THEN
    RAISE EXCEPTION 'Falta evento_lote_vivero.asignacion_id. Ejecuta antes la migracion 051.';
  END IF;

  IF to_regprocedure('public.fn_vivero_assert_fecha_operativa(date,date)') IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_vivero_assert_fecha_operativa. Ejecuta antes la migracion 010.';
  END IF;

  IF to_regprocedure('public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_vivero_cerrar_lote_si_corresponde. Ejecuta antes la migracion 010.';
  END IF;

  IF to_regclass('public.evento_plantacion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evento_plantacion. Ejecuta antes la migracion 031.';
  END IF;
END $$;

-- =====================================================================
-- 1. Eliminar la RPC de reserva logica (contrato anterior)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_vivero_reservar_stock_lote(
  BIGINT, BIGINT, INT, public.proposito_asignacion, BIGINT
);

-- =====================================================================
-- 2. RPC de asignacion fisica
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_vivero_asignar_stock_subcampania(
  BIGINT, BIGINT, INT, public.proposito_asignacion, BIGINT, DATE, BIGINT[], TEXT
);

CREATE OR REPLACE FUNCTION public.fn_vivero_asignar_stock_subcampania(
  p_lote_vivero_id        BIGINT,
  p_subcampania_id        BIGINT,
  p_cantidad_asignada     INT,
  p_proposito             public.proposito_asignacion,
  p_usuario_asignacion_id BIGINT,
  p_fecha_asignacion      DATE,
  p_evidencia_ids         BIGINT[],
  p_observaciones         TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad_lote  TEXT,
  subcampania_id            BIGINT,
  campania_id               BIGINT,
  proposito                 public.proposito_asignacion,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_asignada         INT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_lote                   RECORD;
  v_subcampania            RECORD;
  v_usuario_rol            TEXT;
  v_es_coordinador         BOOLEAN;
  v_fecha_embolsado        DATE;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_tipo_entidad_evento_id BIGINT;
  v_asignacion_id          BIGINT;
  v_evento_id              BIGINT;
  v_evento_plantacion_id   BIGINT;
  v_saldo_antes            INT;
  v_saldo_despues          INT;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_destino_referencia     TEXT;
  v_observaciones          TEXT;
BEGIN
  -- -----------------------------------------------------------------
  -- 1. Guards de parametros
  -- -----------------------------------------------------------------
  IF p_lote_vivero_id IS NULL THEN
    RAISE EXCEPTION 'lote_vivero_id es obligatorio.';
  END IF;

  IF p_subcampania_id IS NULL THEN
    RAISE EXCEPTION 'subcampania_id es obligatorio.';
  END IF;

  IF p_cantidad_asignada IS NULL OR p_cantidad_asignada <= 0 THEN
    RAISE EXCEPTION 'cantidad_asignada debe ser un entero mayor a 0.';
  END IF;

  IF p_proposito IS NULL THEN
    RAISE EXCEPTION 'proposito es obligatorio (PLANTACION_INICIAL | REPOSICION).';
  END IF;

  IF p_usuario_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_asignacion_id es obligatorio.';
  END IF;

  IF p_fecha_asignacion IS NULL THEN
    RAISE EXCEPTION 'fecha_asignacion es obligatoria.';
  END IF;

  v_observaciones := NULLIF(BTRIM(COALESCE(p_observaciones, '')), '');

  -- Evidencia de entrega obligatoria (RN-VIV-54).
  SELECT ARRAY_AGG(DISTINCT eid ORDER BY eid)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS eid
  WHERE eid IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'La asignacion fisica requiere al menos una evidencia de entrega/salida (RN-VIV-54).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------
  -- 2. Leer y bloquear la subcampania; validar estado por proposito.
  --    ORDEN DE LOCKS (anti-deadlock, estable en 052-055):
  --    subcampania -> asignaciones -> lote. La cancelacion (054) y la
  --    plantacion (053) siguen el mismo orden.
  -- -----------------------------------------------------------------
  SELECT s.id, s.estado, s.zona_id, s.campania_id, s.codigo_trazabilidad
  INTO v_subcampania
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada o eliminada.', p_subcampania_id;
  END IF;

  IF v_subcampania.estado IN ('BORRADOR', 'CANCELADA') THEN
    RAISE EXCEPTION
      'No se puede asignar a una subcampania en estado %.',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'PLANTACION_INICIAL' AND v_subcampania.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION
      'PLANTACION_INICIAL solo se permite con la subcampania ACTIVA (estado actual: %).',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'REPOSICION'
     AND v_subcampania.estado NOT IN ('ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL') THEN
    RAISE EXCEPTION
      'REPOSICION solo se permite con la subcampania en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: %).',
      v_subcampania.estado;
  END IF;

  -- -----------------------------------------------------------------
  -- 3. Leer y bloquear el lote (el lock serializa asignaciones concurrentes)
  -- -----------------------------------------------------------------
  SELECT
    lv.id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', p_lote_vivero_id;
  END IF;

  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'No se puede asignar desde un lote en estado %. Solo lotes ACTIVOS (RN-VIV-61).',
      v_lote.estado_lote;
  END IF;

  -- EMBOLSADO previo obligatorio (RN-VIV-61).
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_vivero_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene EMBOLSADO registrado. Antes de EMBOLSADO solo existe material en proceso, no plantas entregables (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  IF v_lote.saldo_vivo_actual IS NULL OR v_lote.saldo_vivo_actual <= 0 THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo fisico disponible (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  -- Validacion FISICA: contra el saldo del lote, sin restar asignaciones
  -- previas (ya descontaron el saldo al entregarse — RN-VIV-47/57).
  IF p_cantidad_asignada > v_lote.saldo_vivo_actual THEN
    RAISE EXCEPTION
      'La cantidad a asignar (%) excede el saldo vivo fisico del lote % (%).',
      p_cantidad_asignada,
      p_lote_vivero_id,
      v_lote.saldo_vivo_actual;
  END IF;

  -- Fecha operativa coherente con la vida del lote.
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_asignacion, v_fecha_embolsado);

  -- -----------------------------------------------------------------
  -- 4. Permisos: ADMIN global o COORDINADOR de la subcampania
  -- -----------------------------------------------------------------
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_asignacion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_asignacion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = p_subcampania_id
      AND se.usuario_id = p_usuario_asignacion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR de la subcampania pueden registrar la asignacion fisica.';
  END IF;

  -- -----------------------------------------------------------------
  -- 5. Validar evidencias (existen, no eliminadas, pendientes)
  -- -----------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

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
      'Todas las evidencias de la asignacion deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------
  -- 6. Efectos atomicos
  -- -----------------------------------------------------------------
  v_saldo_antes   := v_lote.saldo_vivo_actual;
  v_saldo_despues := v_saldo_antes - p_cantidad_asignada;

  -- 6.1 Asignacion (entrega fisica).
  INSERT INTO public.asignacion_vivero_subcampania (
    lote_vivero_id,
    subcampania_id,
    cantidad_asignada,
    proposito,
    usuario_asignacion_id,
    fecha_asignacion
  )
  VALUES (
    p_lote_vivero_id,
    p_subcampania_id,
    p_cantidad_asignada,
    p_proposito,
    p_usuario_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ
  )
  RETURNING id INTO v_asignacion_id;

  v_destino_referencia :=
    'ASG-' || v_asignacion_id::TEXT || '-' || v_subcampania.codigo_trazabilidad;

  -- 6.2 Evento M2 de salida fisica por asignacion (RN-VIV-47/54).
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
    subcampania_id,
    campania_id,
    registro_plantacion_id,
    asignacion_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_vivero_id,
    'DESPACHO',
    p_fecha_asignacion,
    p_usuario_asignacion_id,
    p_cantidad_asignada,
    'UNIDAD',
    'PLANTACION_CAMPANIA'::public.destino_tipo_vivero,
    v_destino_referencia,
    v_subcampania.zona_id,
    'ASIGNACION_SUBCAMPANIA'::public.origen_despacho_vivero,
    p_subcampania_id,
    v_subcampania.campania_id,
    NULL,
    v_asignacion_id,
    v_saldo_antes,
    v_saldo_despues,
    v_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- 6.3 Descuento fisico del saldo del lote.
  UPDATE public.lote_vivero
  SET saldo_vivo_actual = v_saldo_despues,
      updated_at        = NOW()
  WHERE id = p_lote_vivero_id;

  -- 6.4 Vincular evidencias al evento M2.
  UPDATE public.evidencias_trazabilidad
  SET tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = NOW(),
      actualizado_por_usuario_id = p_usuario_asignacion_id
  WHERE id = ANY(v_evidencia_ids);

  -- 6.5 Evento M3 para la linea de tiempo de la subcampania.
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_asignada_evento,
    created_by
  )
  VALUES (
    'ASIGNACION_VIVERO'::public.tipo_evento_plantacion,
    p_subcampania_id,
    v_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_usuario_asignacion_id,
    v_observaciones,
    p_cantidad_asignada,
    p_usuario_asignacion_id
  )
  RETURNING id INTO v_evento_plantacion_id;

  -- 6.6 Cierre automatico si el saldo fisico llego a 0.
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_vivero_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_vivero_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------
  -- 7. Resultado
  -- -----------------------------------------------------------------
  asignacion_id            := v_asignacion_id;
  evento_lote_vivero_id    := v_evento_id;
  evento_plantacion_id     := v_evento_plantacion_id;
  lote_vivero_id           := p_lote_vivero_id;
  codigo_trazabilidad_lote := v_lote.codigo_trazabilidad;
  subcampania_id           := p_subcampania_id;
  campania_id              := v_subcampania.campania_id;
  proposito                := p_proposito;
  estado_asignacion        := 'ACTIVA'::public.estado_asignacion_vivero;
  cantidad_asignada        := p_cantidad_asignada;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_vivero_asignar_stock_subcampania(
  BIGINT, BIGINT, INT, public.proposito_asignacion, BIGINT, DATE, BIGINT[], TEXT
) IS
  'Asignacion FISICA de stock de un lote de vivero a una subcampania (RF-VIV-11). Atomica: crea asignacion, evento M2 DESPACHO/ASIGNACION_SUBCAMPANIA, descuenta saldo_vivo_actual, vincula evidencia obligatoria y registra ASIGNACION_VIVERO en M3. Valida contra el saldo fisico del lote sin restar asignaciones previas (RN-VIV-47/54/57/61).';

GRANT EXECUTE ON FUNCTION public.fn_vivero_asignar_stock_subcampania(
  BIGINT, BIGINT, INT, public.proposito_asignacion, BIGINT, DATE, BIGINT[], TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
