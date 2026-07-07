-- 054_m3_devolucion_fisica.sql
-- Tarea M2-M3-04: devolucion FISICA de stock asignado al vivero (RF-VIV-12,
-- RN-VIV-48) y cancelacion de subcampania con devolucion fisica.
--
--   1. fn_m3_devolver_asignacion_vivero: devolucion parcial o total de una
--      asignacion. Aumenta cantidad_devuelta Y LOTE_VIVERO.saldo_vivo_actual,
--      registra DEVOLUCION_A_VIVERO (M3) y DEVOLUCION_PLANTACION (M2).
--      Sin evidencia obligatoria en MVP.
--   2. fn_subcampania_cancelar (v2): la liberacion de asignaciones activas
--      pasa de devolucion logica a devolucion FISICA (retorna el stock al
--      lote y deja rastro en ambos modulos).
--
-- Si el saldo del lote habia llegado a 0 y el lote quedo FINALIZADO por cierre
-- automatico, la devolucion lo REABRE (estado ACTIVO, motivo_cierre NULL):
-- el estado FINALIZADO<->saldo 0 se mantiene como invariante fisico.
--
-- Orden de locks (anti-deadlock, estable en 052-055):
--   subcampania -> asignaciones (id ASC) -> lotes (id ASC).
--
-- Depende de: 051 (DEVOLUCION_PLANTACION, asignacion_id), 047 (historial).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'tipo_evento_vivero'
      AND e.enumlabel = 'DEVOLUCION_PLANTACION'
  ) THEN
    RAISE EXCEPTION 'Falta el valor DEVOLUCION_PLANTACION en tipo_evento_vivero. Ejecuta antes la migracion 051.';
  END IF;

  IF to_regclass('public.subcampania_historial') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania_historial. Ejecuta antes la migracion 047.';
  END IF;
END $$;

-- =====================================================================
-- 1. Helper interno: aplica una devolucion fisica sobre una asignacion
--    YA BLOQUEADA. Reutilizado por la RPC individual y por la cancelacion.
--    No valida permisos (responsabilidad del caller).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_m2_m3_aplicar_devolucion_fisica(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT
)
RETURNS TABLE (
  evento_lote_vivero_id BIGINT,
  evento_plantacion_id  BIGINT,
  lote_vivero_id        BIGINT,
  saldo_vivo_antes      INT,
  saldo_vivo_despues    INT,
  lote_reabierto        BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_asignacion       RECORD;
  v_lote             RECORD;
  v_saldo_antes      INT;
  v_saldo_despues    INT;
  v_lote_reabierto   BOOLEAN := FALSE;
  v_evento_m2_id     BIGINT;
  v_evento_m3_id     BIGINT;
  v_campania_id      BIGINT;
BEGIN
  -- La asignacion debe venir bloqueada por el caller; se relee por seguridad.
  SELECT av.id, av.lote_vivero_id, av.subcampania_id, av.estado,
         av.saldo_asignado_disponible
  INTO v_asignacion
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignacion % no encontrada.', p_asignacion_id;
  END IF;

  IF p_cantidad_devuelta IS NULL OR p_cantidad_devuelta <= 0 THEN
    RAISE EXCEPTION 'cantidad_devuelta debe ser un entero mayor a 0.';
  END IF;

  IF v_asignacion.estado = 'DEVUELTA'::public.estado_asignacion_vivero THEN
    RAISE EXCEPTION 'La asignacion % ya esta DEVUELTA.', p_asignacion_id;
  END IF;

  IF p_cantidad_devuelta > COALESCE(v_asignacion.saldo_asignado_disponible, 0) THEN
    RAISE EXCEPTION
      'La devolucion (%) excede el saldo asignado disponible (%) de la asignacion %.',
      p_cantidad_devuelta,
      COALESCE(v_asignacion.saldo_asignado_disponible, 0),
      p_asignacion_id;
  END IF;

  -- Lock del lote (despues de la asignacion: orden estable anti-deadlock).
  SELECT lv.id, lv.codigo_trazabilidad, lv.estado_lote, lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = v_asignacion.lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', v_asignacion.lote_vivero_id;
  END IF;

  v_saldo_antes   := COALESCE(v_lote.saldo_vivo_actual, 0);
  v_saldo_despues := v_saldo_antes + p_cantidad_devuelta;

  SELECT s.campania_id INTO v_campania_id
  FROM public.subcampania s
  WHERE s.id = v_asignacion.subcampania_id;

  -- 1. Aumentar cantidad_devuelta (el trigger de estado transiciona la fila).
  UPDATE public.asignacion_vivero_subcampania
  SET cantidad_devuelta = cantidad_devuelta + p_cantidad_devuelta
  WHERE id = p_asignacion_id;

  -- 2. Retorno fisico al lote (RN-VIV-48). Reabre el lote si estaba FINALIZADO.
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        estado_lote       = 'ACTIVO',
        motivo_cierre     = NULL,
        updated_at        = NOW()
    WHERE id = v_lote.id;
    v_lote_reabierto := TRUE;
  ELSE
    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        updated_at        = NOW()
    WHERE id = v_lote.id;
  END IF;

  -- 3. Evento M2 de entrada fisica (explica el aumento de saldo en el lote).
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    asignacion_id,
    subcampania_id,
    campania_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    v_lote.id,
    'DEVOLUCION_PLANTACION'::public.tipo_evento_vivero,
    p_fecha_devolucion,
    p_usuario_devolucion_id,
    p_cantidad_devuelta,
    'UNIDAD',
    p_asignacion_id,
    v_asignacion.subcampania_id,
    v_campania_id,
    v_saldo_antes,
    v_saldo_despues,
    NULLIF(BTRIM(COALESCE(p_observaciones, '')), '')
  )
  RETURNING id INTO v_evento_m2_id;

  -- 4. Evento M3 (linea de tiempo de la subcampania).
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_devuelta,
    motivo_devolucion,
    created_by
  )
  VALUES (
    'DEVOLUCION_A_VIVERO'::public.tipo_evento_plantacion,
    v_asignacion.subcampania_id,
    p_asignacion_id,
    p_fecha_devolucion::TIMESTAMPTZ,
    p_usuario_devolucion_id,
    NULLIF(BTRIM(COALESCE(p_observaciones, '')), ''),
    p_cantidad_devuelta,
    p_motivo_devolucion,
    p_usuario_devolucion_id
  )
  RETURNING id INTO v_evento_m3_id;

  evento_lote_vivero_id := v_evento_m2_id;
  evento_plantacion_id  := v_evento_m3_id;
  lote_vivero_id        := v_lote.id;
  saldo_vivo_antes      := v_saldo_antes;
  saldo_vivo_despues    := v_saldo_despues;
  lote_reabierto        := v_lote_reabierto;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_m2_m3_aplicar_devolucion_fisica(
  BIGINT, INT, public.motivo_devolucion_plantacion, BIGINT, DATE, TEXT
) IS
  'Helper interno: aplica una devolucion fisica sobre una asignacion (aumenta cantidad_devuelta y saldo_vivo_actual, eventos M2/M3, reapertura de lote). No valida permisos. Usado por fn_m3_devolver_asignacion_vivero y fn_subcampania_cancelar.';

-- =====================================================================
-- 2. RPC publica de devolucion fisica (RF-VIV-12)
-- =====================================================================
DROP FUNCTION IF EXISTS public.fn_m3_devolver_asignacion_vivero(
  BIGINT, INT, public.motivo_devolucion_plantacion, BIGINT, DATE, TEXT
);

CREATE OR REPLACE FUNCTION public.fn_m3_devolver_asignacion_vivero(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_devuelta_delta   INT,
  cantidad_devuelta_total   INT,
  saldo_asignado_disponible INT,
  lote_vivero_id            BIGINT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  lote_reabierto            BOOLEAN,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_asignacion    RECORD;
  v_usuario_rol   TEXT;
  v_es_coordinador BOOLEAN;
  v_resultado     RECORD;
  v_final         RECORD;
BEGIN
  IF p_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'asignacion_id es obligatorio.';
  END IF;

  IF p_motivo_devolucion IS NULL THEN
    RAISE EXCEPTION 'motivo_devolucion es obligatorio.';
  END IF;

  IF p_usuario_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_devolucion_id es obligatorio.';
  END IF;

  IF p_fecha_devolucion IS NULL THEN
    RAISE EXCEPTION 'fecha_devolucion es obligatoria.';
  END IF;

  -- Lock de la asignacion (primer lock del orden estable).
  SELECT av.id, av.subcampania_id, av.fecha_asignacion
  INTO v_asignacion
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignacion % no encontrada.', p_asignacion_id;
  END IF;

  -- Fecha coherente: no antes de la entrega, no futura, max 10 dias atras.
  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_devolucion, v_asignacion.fecha_asignacion::DATE
  );

  -- Permisos: ADMIN global o COORDINADOR de la subcampania.
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_devolucion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_devolucion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = v_asignacion.subcampania_id
      AND se.usuario_id = p_usuario_devolucion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR de la subcampania pueden registrar la devolucion fisica.';
  END IF;

  -- Aplicar la devolucion (valida cantidad y estado, mueve saldos, eventos).
  SELECT *
  INTO v_resultado
  FROM public.fn_m2_m3_aplicar_devolucion_fisica(
    p_asignacion_id,
    p_cantidad_devuelta,
    p_motivo_devolucion,
    p_usuario_devolucion_id,
    p_fecha_devolucion,
    p_observaciones
  );

  SELECT av.estado, av.cantidad_devuelta, av.saldo_asignado_disponible
  INTO v_final
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id;

  asignacion_id             := p_asignacion_id;
  estado_asignacion         := v_final.estado;
  cantidad_devuelta_delta   := p_cantidad_devuelta;
  cantidad_devuelta_total   := v_final.cantidad_devuelta;
  saldo_asignado_disponible := v_final.saldo_asignado_disponible;
  lote_vivero_id            := v_resultado.lote_vivero_id;
  saldo_vivo_antes          := v_resultado.saldo_vivo_antes;
  saldo_vivo_despues        := v_resultado.saldo_vivo_despues;
  lote_reabierto            := v_resultado.lote_reabierto;
  evento_lote_vivero_id     := v_resultado.evento_lote_vivero_id;
  evento_plantacion_id      := v_resultado.evento_plantacion_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_m3_devolver_asignacion_vivero(
  BIGINT, INT, public.motivo_devolucion_plantacion, BIGINT, DATE, TEXT
) IS
  'Devolucion FISICA de stock asignado al vivero (RF-VIV-12, RN-VIV-48). Atomica: aumenta cantidad_devuelta y LOTE_VIVERO.saldo_vivo_actual, registra DEVOLUCION_PLANTACION (M2) y DEVOLUCION_A_VIVERO (M3), reabre el lote si estaba FINALIZADO. Sin evidencia obligatoria en MVP. Permisos: ADMIN o COORDINADOR.';

GRANT EXECUTE ON FUNCTION public.fn_m3_devolver_asignacion_vivero(
  BIGINT, INT, public.motivo_devolucion_plantacion, BIGINT, DATE, TEXT
) TO service_role;

-- =====================================================================
-- 3. fn_subcampania_cancelar v2: devolucion FISICA de asignaciones activas
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_subcampania_cancelar(
  p_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT
)
RETURNS public.subcampania
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub public.subcampania%ROWTYPE;
  v_asig RECORD;
  v_asignaciones_devueltas INT := 0;
  v_unidades_devueltas INT := 0;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de cancelacion es obligatorio.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock pesimista de la subcampania para evitar carreras con plantacion.
  SELECT *
  INTO v_sub
  FROM public.subcampania
  WHERE id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada.', p_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_sub.estado NOT IN ('BORRADOR', 'ACTIVA') THEN
    RAISE EXCEPTION
      'Solo se puede cancelar una subcampania en BORRADOR o ACTIVA (estado actual: %).',
      v_sub.estado
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_sub.total_plantado_inicial, 0) > 0 THEN
    RAISE EXCEPTION
      'La subcampania ya tiene plantaciones registradas (total_plantado_inicial = %). Usar cierre FINALIZADA_PARCIAL.',
      v_sub.total_plantado_inicial
      USING ERRCODE = 'P0001';
  END IF;

  -- Devolucion FISICA de todas las asignaciones activas con saldo disponible
  -- (RN-VIV-48): el stock vuelve al lote y queda rastro en M2 y M3.
  -- Locks en orden estable: asignaciones por id ASC; el helper bloquea cada
  -- lote despues de su asignacion.
  FOR v_asig IN
    SELECT av.id, av.saldo_asignado_disponible
    FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id = p_id
      AND av.estado = 'ACTIVA'
    ORDER BY av.id ASC
    FOR UPDATE
  LOOP
    IF COALESCE(v_asig.saldo_asignado_disponible, 0) > 0 THEN
      PERFORM public.fn_m2_m3_aplicar_devolucion_fisica(
        v_asig.id,
        v_asig.saldo_asignado_disponible,
        'CIERRE_SUBCAMPANIA'::public.motivo_devolucion_plantacion,
        p_actor_user_id,
        CURRENT_DATE,
        'Devolucion fisica automatica por cancelacion de subcampania. Motivo: ' || p_motivo
      );

      v_asignaciones_devueltas := v_asignaciones_devueltas + 1;
      v_unidades_devueltas := v_unidades_devueltas + v_asig.saldo_asignado_disponible;
    END IF;
  END LOOP;

  -- Marcar subcampania como CANCELADA. Inactivacion, no borrado fisico.
  UPDATE public.subcampania
     SET estado      = 'CANCELADA',
         deleted_at  = NOW(),
         deleted_by  = p_actor_user_id,
         updated_at  = NOW(),
         updated_by  = p_actor_user_id
   WHERE id = p_id
  RETURNING * INTO v_sub;

  -- Registrar evento en historial.
  INSERT INTO public.subcampania_historial (
    subcampania_id,
    tipo_historial,
    estado_origen,
    estado_destino,
    observaciones,
    metadata,
    actor_user_id
  )
  VALUES (
    p_id,
    'SUBCAMPANIA_CANCELADA',
    NULL,
    'CANCELADA',
    p_motivo,
    jsonb_build_object(
      'asignaciones_devueltas', v_asignaciones_devueltas,
      'unidades_devueltas', v_unidades_devueltas,
      'motivo_devolucion', 'CIERRE_SUBCAMPANIA',
      'devolucion_fisica', TRUE
    ),
    p_actor_user_id
  );

  RETURN v_sub;
END;
$$;

COMMENT ON FUNCTION public.fn_subcampania_cancelar(BIGINT, BIGINT, TEXT) IS
  'Cancela una subcampania sin plantaciones (RN-PLA-37): devuelve FISICAMENTE el saldo disponible de las asignaciones activas al vivero (RN-VIV-48, eventos M2 DEVOLUCION_PLANTACION + M3 DEVOLUCION_A_VIVERO), setea estado=CANCELADA y registra SUBCAMPANIA_CANCELADA en historial. Atomico.';

NOTIFY pgrst, 'reload schema';
