-- RN-REC-09A. Requiere 014/015 y usuario.activo (identidad verificada).
-- Aplicar/cotejar en destino antes de publicar el backend consumidor.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Fallar antes de instalar ante un catálogo sin los antecedentes requeridos.
DO $$
BEGIN
  PERFORM u.id, u.rol, u.activo FROM public.usuario u LIMIT 0;
  PERFORM r.id, r.usuario_id, r.estado_registro, r.codigo_trazabilidad,
    r.eliminado_en, r.eliminado_por_usuario_id
    FROM public.recoleccion r LIMIT 0;
  PERFORM h.recoleccion_id, h.tipo_historial, h.estado_origen, h.estado_destino,
    h.actor_user_id, h.created_at, h.metadata
    FROM public.recoleccion_historial h LIMIT 0;
  PERFORM e.tipo_entidad_id, e.entidad_id FROM public.evidencias_trazabilidad e LIMIT 0;
  PERFORM t.id, t.codigo FROM public.tipos_entidad_evidencia t LIMIT 0;
  IF (
    SELECT a.atttypid FROM pg_attribute a
    WHERE a.attrelid = 'public.recoleccion'::regclass
      AND a.attname = 'eliminado_en' AND NOT a.attisdropped
  ) IS DISTINCT FROM 'date'::regtype OR (
    SELECT a.atttypid FROM pg_attribute a
    WHERE a.attrelid = 'public.recoleccion_historial'::regclass
      AND a.attname = 'created_at' AND NOT a.attisdropped
  ) IS DISTINCT FROM 'date'::regtype THEN
    RAISE EXCEPTION 'Cotejar 015: recoleccion.eliminado_en y recoleccion_historial.created_at deben ser DATE.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    WHERE e.enumtypid = 'public.tipo_historial_recoleccion'::regtype
      AND e.enumlabel = 'BORRADOR_ELIMINADO'
  ) THEN
    RAISE EXCEPTION 'Falta BORRADOR_ELIMINADO; aplicar/cotejar 014.';
  END IF;
  -- FOR SHARE requiere UPDATE sobre al menos una columna de usuario.
  -- Es antecedente de las operaciones privadas de cuenta; no ampliarlo aquí.
  IF NOT has_any_column_privilege('service_role', 'public.usuario', 'UPDATE') THEN
    RAISE EXCEPTION 'Cotejar privilegios privados de cuenta: service_role requiere UPDATE para FOR SHARE.';
  END IF;
END;
$$;

-- También protege frente a un UPDATE legado que leyó la ficha antes del DELETE.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_proteger_eliminado()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NEW.eliminado_en IS NOT NULL AND (
    OLD.estado_registro::text IS DISTINCT FROM 'BORRADOR'
    OR NEW.estado_registro::text IS DISTINCT FROM 'BORRADOR'
  ) THEN
    RAISE EXCEPTION 'Solo se puede eliminar una recolección en BORRADOR.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recoleccion_proteger_eliminado ON public.recoleccion;
CREATE TRIGGER trg_recoleccion_proteger_eliminado
BEFORE UPDATE ON public.recoleccion FOR EACH ROW
EXECUTE FUNCTION public.fn_recoleccion_proteger_eliminado();

CREATE OR REPLACE FUNCTION public.fn_recoleccion_eliminar_borrador(
  p_recoleccion_id bigint,
  p_actor_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s' SET statement_timeout = '30s' AS $$
DECLARE
  v_rol text;
  v_recoleccion record;
  v_fecha date;
BEGIN
  -- Mismo orden que las operaciones contextuales: cuenta -> registro.
  SELECT u.rol::text INTO v_rol FROM public.usuario u
  WHERE u.id = p_actor_id AND u.activo IS TRUE FOR SHARE;
  IF NOT FOUND OR coalesce(v_rol, '') NOT IN ('ADMIN', 'GENERAL', 'VALIDADOR') THEN
    RAISE EXCEPTION 'Cuenta interna activa requerida.' USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.usuario_id, r.estado_registro, r.eliminado_en, r.codigo_trazabilidad
  INTO v_recoleccion FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id FOR UPDATE;
  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_rol <> 'ADMIN' AND v_recoleccion.usuario_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Solo el creador o un ADMIN pueden eliminar el borrador.'
      USING ERRCODE = '42501';
  END IF;
  IF v_recoleccion.estado_registro::text IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se puede eliminar una recolección en BORRADOR.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 015 conserva granularidad de día. La fecha de negocio no depende del
  -- TimeZone de la sesión PostgREST (por ejemplo, UTC).
  v_fecha := (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  UPDATE public.recoleccion
  SET eliminado_en = v_fecha, eliminado_por_usuario_id = p_actor_id
  WHERE id = p_recoleccion_id
  RETURNING eliminado_en INTO v_fecha;
  INSERT INTO public.recoleccion_historial (
    recoleccion_id, tipo_historial, estado_origen, estado_destino,
    actor_user_id, created_at, metadata
  ) VALUES (
    p_recoleccion_id, 'BORRADOR_ELIMINADO', 'BORRADOR', 'BORRADOR',
    p_actor_id, v_fecha,
    jsonb_build_object('codigo_trazabilidad', v_recoleccion.codigo_trazabilidad)
  );
  RETURN jsonb_build_object(
    'recoleccion_id', p_recoleccion_id,
    'eliminado_en', v_fecha,
    'eliminado_por_usuario_id', p_actor_id
  );
END;
$$;

-- Todas las altas de fotos M1 (creación, PATCH y ruta general de evidencias)
-- toman el lock del padre dentro de su INSERT. Así DELETE ve las fotos ya
-- confirmadas, o la vinculación posterior al DELETE se rechaza por completo.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_evidencia_padre_vigente()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public SET lock_timeout = '5s' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tipos_entidad_evidencia t
             WHERE t.id = NEW.tipo_entidad_id AND t.codigo = 'RECOLECCION') THEN
    PERFORM 1 FROM public.recoleccion r
    WHERE r.id = NEW.entidad_id AND r.eliminado_en IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recoleccion_evidencia_padre_vigente ON public.evidencias_trazabilidad;
CREATE TRIGGER trg_recoleccion_evidencia_padre_vigente
BEFORE INSERT ON public.evidencias_trazabilidad FOR EACH ROW
EXECUTE FUNCTION public.fn_recoleccion_evidencia_padre_vigente();

-- Una creación fallida puede compensarse solo antes del primer hecho de su
-- ciclo de vida. El chequeo y los DELETE comparten el lock con el soft delete;
-- nunca se limpia mediante un SELECT separado seguido de DELETE desde Node.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_compensar_creacion(
  p_recoleccion_id bigint, p_actor_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s' SET statement_timeout = '30s' AS $$
DECLARE
  v_recoleccion record;
BEGIN
  PERFORM 1 FROM public.usuario u
  WHERE u.id = p_actor_id AND u.activo IS TRUE
    AND u.rol::text IN ('ADMIN', 'GENERAL') FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('compensado', false);
  END IF;
  SELECT r.usuario_id, r.estado_registro, r.eliminado_en
  INTO v_recoleccion FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id FOR UPDATE;
  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL
    OR v_recoleccion.estado_registro::text IS DISTINCT FROM 'BORRADOR'
    OR v_recoleccion.usuario_id IS DISTINCT FROM p_actor_id
    OR EXISTS (SELECT 1 FROM public.recoleccion_historial h
               WHERE h.recoleccion_id = p_recoleccion_id) THEN
    RETURN jsonb_build_object('compensado', false);
  END IF;
  DELETE FROM public.evidencias_trazabilidad e
  WHERE e.entidad_id = p_recoleccion_id
    AND e.tipo_entidad_id IN (SELECT t.id FROM public.tipos_entidad_evidencia t
                             WHERE t.codigo = 'RECOLECCION');
  DELETE FROM public.recoleccion WHERE id = p_recoleccion_id;
  RETURN jsonb_build_object('compensado', true);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recoleccion_eliminar_borrador(bigint,bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recoleccion_proteger_eliminado()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recoleccion_evidencia_padre_vigente()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recoleccion_compensar_creacion(bigint,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recoleccion_eliminar_borrador(bigint,bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_recoleccion_compensar_creacion(bigint,bigint)
  TO service_role;
GRANT DELETE ON public.recoleccion TO service_role;
GRANT SELECT (id,rol,activo) ON public.usuario TO service_role;
GRANT SELECT (id,usuario_id,estado_registro,eliminado_en,codigo_trazabilidad),
  UPDATE (eliminado_en,eliminado_por_usuario_id) ON public.recoleccion TO service_role;
-- 014 ya concede INSERT de historial y USAGE de su secuencia al servicio.

NOTIFY pgrst, 'reload schema';
COMMIT;
