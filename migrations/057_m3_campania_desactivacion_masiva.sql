-- 057_m3_campania_desactivacion_masiva.sql
-- M3-PM-01: desactivacion atomica de una campania con cancelacion masiva de
-- subcampanias sin plantaciones.
--
--   1. Corrige la restriccion de poligono: BORRADOR y CANCELADA pueden no
--      tener poligono; todos los estados operativos siguen requiriendolo.
--   2. Extrae la cancelacion canonica de subcampania a un helper interno.
--   3. Mantiene compatible fn_subcampania_cancelar(BIGINT, BIGINT, TEXT).
--   4. Agrega fn_campania_desactivar_sin_plantaciones, atomica por campania.
--
-- Orden de locks:
--   campania -> subcampanias (id ASC) -> asignaciones (id ASC) -> lotes.
--
-- Depende de: 050 (soft-delete estricto), 054 (devolucion fisica) y
--             056 (constraint de saldo de devolucion).

DO $$
BEGIN
  IF to_regclass('public.campania') IS NULL
     OR to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION
      'No existen campania/subcampania. Ejecuta primero las migraciones M3 base.';
  END IF;

  IF to_regprocedure(
    'public.fn_m2_m3_aplicar_devolucion_fisica(bigint,integer,motivo_devolucion_plantacion,bigint,date,text)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'No existe fn_m2_m3_aplicar_devolucion_fisica. Ejecuta primero la migracion 054.';
  END IF;
END $$;

-- =====================================================================
-- 1. El poligono es requisito de operacion/activacion, no de cancelacion.
-- =====================================================================
ALTER TABLE public.subcampania
  DROP CONSTRAINT IF EXISTS subcampania_activacion_poligono_chk;

ALTER TABLE public.subcampania
  ADD CONSTRAINT subcampania_activacion_poligono_chk
  CHECK (
    estado IN ('BORRADOR', 'CANCELADA')
    OR poligono_geom IS NOT NULL
  );

COMMENT ON CONSTRAINT subcampania_activacion_poligono_chk
  ON public.subcampania IS
  'BORRADOR y CANCELADA pueden no tener poligono. ACTIVA, COMPLETADA, FINALIZADA_PARCIAL y PAUSADA requieren poligono.';

-- =====================================================================
-- 2. Helper interno comun de cancelacion RN-PLA-37.
--    No valida permisos: solo puede ser invocado por los wrappers autorizados.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_subcampania_cancelar_interna(
  p_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT,
  p_contexto JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub public.subcampania%ROWTYPE;
  v_estado_origen public.estado_subcampania;
  v_asig RECORD;
  v_asignaciones_devueltas INT := 0;
  v_unidades_devueltas INT := 0;
  v_contexto JSONB := COALESCE(p_contexto, '{}'::JSONB);
BEGIN
  IF p_motivo IS NULL
     OR LENGTH(BTRIM(p_motivo)) < 3
     OR LENGTH(BTRIM(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'El motivo de cancelacion debe tener entre 3 y 1000 caracteres.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor_user_id es obligatorio.'
      USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_contexto) <> 'object' THEN
    RAISE EXCEPTION 'El contexto de cancelacion debe ser un objeto JSON.'
      USING ERRCODE = 'P0001';
  END IF;

  -- El caller masivo ya bloqueo todas las subcampanias en orden estable.
  -- El lock se repite para que el helper tambien sea seguro desde la RPC
  -- individual.
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

  v_estado_origen := v_sub.estado;

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

  -- Prelock de todas las asignaciones y despues de todos sus lotes, ambos en
  -- orden global estable. En la operacion de campaña estos locks ya fueron
  -- adquiridos para todas las hijas y las lecturas siguientes son reentrantes.
  PERFORM 1
  FROM public.asignacion_vivero_subcampania av
  WHERE av.subcampania_id = p_id
    AND av.estado = 'ACTIVA'
    AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ORDER BY av.id ASC
  FOR UPDATE;

  PERFORM 1
  FROM public.lote_vivero lv
  JOIN (
    SELECT DISTINCT av.lote_vivero_id
    FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id = p_id
      AND av.estado = 'ACTIVA'
      AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ) lotes ON lotes.lote_vivero_id = lv.id
  ORDER BY lv.id ASC
  FOR UPDATE OF lv;

  -- Devolucion fisica de asignaciones activas con saldo disponible. El helper
  -- de M2/M3 registra DEVOLUCION_PLANTACION y DEVOLUCION_A_VIVERO.
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
        'Devolucion fisica automatica por cancelacion de subcampania. Motivo: '
          || BTRIM(p_motivo)
      );

      v_asignaciones_devueltas := v_asignaciones_devueltas + 1;
      v_unidades_devueltas :=
        v_unidades_devueltas + v_asig.saldo_asignado_disponible;
    END IF;
  END LOOP;

  UPDATE public.subcampania
  SET estado = 'CANCELADA',
      deleted_at = NOW(),
      deleted_by = p_actor_user_id,
      updated_at = NOW(),
      updated_by = p_actor_user_id
  WHERE id = p_id
  RETURNING * INTO v_sub;

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
    v_estado_origen,
    'CANCELADA',
    BTRIM(p_motivo),
    jsonb_build_object(
      'asignaciones_devueltas', v_asignaciones_devueltas,
      'unidades_devueltas', v_unidades_devueltas,
      'motivo_devolucion', 'CIERRE_SUBCAMPANIA',
      'devolucion_fisica', TRUE
    ) || v_contexto,
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'subcampania_id', v_sub.id,
    'asignaciones_devueltas', v_asignaciones_devueltas,
    'unidades_devueltas', v_unidades_devueltas
  );
END;
$$;

COMMENT ON FUNCTION public.fn_subcampania_cancelar_interna(
  BIGINT, BIGINT, TEXT, JSONB
) IS
  'Helper interno comun RN-PLA-37. Cancela una subcampania sin plantaciones, devuelve fisicamente sus asignaciones y registra historial. Los permisos se validan en el caller.';

REVOKE ALL ON FUNCTION public.fn_subcampania_cancelar_interna(
  BIGINT, BIGINT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_subcampania_cancelar_interna(
  BIGINT, BIGINT, TEXT, JSONB
) TO service_role;

-- =====================================================================
-- 3. Wrapper publico compatible de cancelacion individual.
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
  v_actor_rol TEXT;
BEGIN
  SELECT UPPER(u.rol::TEXT)
  INTO v_actor_rol
  FROM public.usuario u
  WHERE u.id = p_actor_user_id;

  IF v_actor_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_actor_user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_rol <> 'ADMIN' THEN
    RAISE EXCEPTION 'Solo el rol ADMIN puede cancelar subcampanias.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.fn_subcampania_cancelar_interna(
    p_id,
    p_actor_user_id,
    p_motivo,
    '{}'::JSONB
  );

  SELECT *
  INTO v_sub
  FROM public.subcampania
  WHERE id = p_id;

  RETURN v_sub;
END;
$$;

COMMENT ON FUNCTION public.fn_subcampania_cancelar(BIGINT, BIGINT, TEXT) IS
  'Cancela una subcampania sin plantaciones (RN-PLA-37) usando la implementacion interna compartida con la desactivacion masiva de campania. Firma y respuesta compatibles.';

-- El actor se resuelve y autoriza en backend. No exponer una RPC que permita
-- a clientes anon/authenticated enviar libremente el id de un ADMIN.
REVOKE ALL ON FUNCTION public.fn_subcampania_cancelar(
  BIGINT, BIGINT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_subcampania_cancelar(
  BIGINT, BIGINT, TEXT
) TO service_role;

-- =====================================================================
-- 4. Desactivacion atomica de una campania.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_campania_desactivar_sin_plantaciones(
  p_campania_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT
)
RETURNS TABLE (
  campania_id BIGINT,
  deleted_at TIMESTAMPTZ,
  subcampanias_canceladas INT,
  asignaciones_devueltas INT,
  unidades_devueltas INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_campania public.campania%ROWTYPE;
  v_actor_rol TEXT;
  v_sub RECORD;
  v_resultado JSONB;
  v_bloqueos JSONB;
  v_subcampanias_canceladas INT := 0;
  v_asignaciones_devueltas INT := 0;
  v_unidades_devueltas INT := 0;
BEGIN
  IF p_motivo IS NULL
     OR LENGTH(BTRIM(p_motivo)) < 3
     OR LENGTH(BTRIM(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'El motivo debe tener entre 3 y 1000 caracteres.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT UPPER(u.rol::TEXT)
  INTO v_actor_rol
  FROM public.usuario u
  WHERE u.id = p_actor_user_id;

  IF v_actor_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_actor_user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_rol <> 'ADMIN' THEN
    RAISE EXCEPTION 'Solo el rol ADMIN puede desactivar campanias.'
      USING ERRCODE = 'P0001';
  END IF;

  -- La campania define la unidad transaccional.
  SELECT *
  INTO v_campania
  FROM public.campania c
  WHERE c.id = p_campania_id
    AND c.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campania % no encontrada o ya desactivada.', p_campania_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock de todas las subcampanias vivas antes de validar o mutar.
  PERFORM 1
  FROM public.subcampania s
  WHERE s.campania_id = p_campania_id
    AND s.deleted_at IS NULL
  ORDER BY s.id ASC
  FOR UPDATE;

  -- La validacion completa ocurre despues de adquirir locks y antes de la
  -- primera devolucion/cancelacion.
  SELECT jsonb_agg(
    jsonb_build_object(
      'subcampania_id', s.id,
      'estado', s.estado,
      'total_plantado_inicial', COALESCE(s.total_plantado_inicial, 0),
      'codigo',
        CASE
          WHEN COALESCE(s.total_plantado_inicial, 0) > 0
            THEN 'SUBCAMPANIA_CON_PLANTACIONES'
          ELSE 'ESTADO_NO_ELEGIBLE'
        END
    )
    ORDER BY s.id
  )
  INTO v_bloqueos
  FROM public.subcampania s
  WHERE s.campania_id = p_campania_id
    AND s.deleted_at IS NULL
    AND (
      COALESCE(s.total_plantado_inicial, 0) > 0
      OR s.estado NOT IN ('BORRADOR', 'ACTIVA', 'CANCELADA')
    );

  IF v_bloqueos IS NOT NULL THEN
    RAISE EXCEPTION
      'La campania % no es elegible para desactivacion masiva. Bloqueos: %',
      p_campania_id,
      v_bloqueos::TEXT
      USING ERRCODE = 'P0003',
            DETAIL = v_bloqueos::TEXT;
  END IF;

  -- Prelock global de recursos de devolucion. Evita que el procesamiento
  -- subcampania por subcampania introduzca ordenes de lotes distintos entre
  -- transacciones concurrentes.
  PERFORM 1
  FROM public.asignacion_vivero_subcampania av
  JOIN public.subcampania s ON s.id = av.subcampania_id
  WHERE s.campania_id = p_campania_id
    AND s.deleted_at IS NULL
    AND s.estado IN ('BORRADOR', 'ACTIVA')
    AND av.estado = 'ACTIVA'
    AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ORDER BY av.id ASC
  FOR UPDATE OF av;

  PERFORM 1
  FROM public.lote_vivero lv
  JOIN (
    SELECT DISTINCT av.lote_vivero_id
    FROM public.asignacion_vivero_subcampania av
    JOIN public.subcampania s ON s.id = av.subcampania_id
    WHERE s.campania_id = p_campania_id
      AND s.deleted_at IS NULL
      AND s.estado IN ('BORRADOR', 'ACTIVA')
      AND av.estado = 'ACTIVA'
      AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ) lotes ON lotes.lote_vivero_id = lv.id
  ORDER BY lv.id ASC
  FOR UPDATE OF lv;

  FOR v_sub IN
    SELECT s.id
    FROM public.subcampania s
    WHERE s.campania_id = p_campania_id
      AND s.deleted_at IS NULL
      AND s.estado IN ('BORRADOR', 'ACTIVA')
    ORDER BY s.id ASC
  LOOP
    v_resultado := public.fn_subcampania_cancelar_interna(
      v_sub.id,
      p_actor_user_id,
      BTRIM(p_motivo),
      jsonb_build_object(
        'origen', 'DESACTIVACION_CAMPANIA',
        'campania_id', p_campania_id
      )
    );

    v_subcampanias_canceladas := v_subcampanias_canceladas + 1;
    v_asignaciones_devueltas := v_asignaciones_devueltas
      + COALESCE((v_resultado->>'asignaciones_devueltas')::INT, 0);
    v_unidades_devueltas := v_unidades_devueltas
      + COALESCE((v_resultado->>'unidades_devueltas')::INT, 0);
  END LOOP;

  UPDATE public.campania c
  SET deleted_at = NOW(),
      deleted_by = p_actor_user_id,
      updated_at = NOW(),
      updated_by = p_actor_user_id
  WHERE c.id = p_campania_id
  RETURNING c.* INTO v_campania;

  campania_id := v_campania.id;
  deleted_at := v_campania.deleted_at;
  subcampanias_canceladas := v_subcampanias_canceladas;
  asignaciones_devueltas := v_asignaciones_devueltas;
  unidades_devueltas := v_unidades_devueltas;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_campania_desactivar_sin_plantaciones(
  BIGINT, BIGINT, TEXT
) IS
  'Desactiva atomicamente una campania: valida y bloquea todas sus subcampanias vivas, cancela BORRADOR/ACTIVA sin plantaciones mediante RN-PLA-37, devuelve stock al vivero y aplica soft-delete a la campania.';

REVOKE ALL ON FUNCTION public.fn_campania_desactivar_sin_plantaciones(
  BIGINT, BIGINT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_campania_desactivar_sin_plantaciones(
  BIGINT, BIGINT, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
