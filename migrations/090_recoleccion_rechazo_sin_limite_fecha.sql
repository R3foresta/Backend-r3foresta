-- Corrección MVP: solo el rechazo de PENDIENTE_VALIDACION queda exento de fecha.
-- Requiere catálogo legado chk_fecha_rango y antecedentes 014/015/058.
-- Instalar/cotejar en destino antes de publicar el backend consumidor.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.recoleccion IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v_check text;
BEGIN
  PERFORM u.id, u.rol, u.activo FROM public.usuario u LIMIT 0;
  PERFORM r.id, r.fecha, r.estado_registro, r.eliminado_en,
    r.usuario_validacion_id, r.fecha_validacion, r.motivo_rechazo,
    r.codigo_trazabilidad FROM public.recoleccion r LIMIT 0;
  PERFORM h.recoleccion_id, h.tipo_historial, h.estado_origen, h.estado_destino,
    h.observaciones, h.actor_user_id, h.created_at, h.metadata
    FROM public.recoleccion_historial h LIMIT 0;
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE (a.attrelid, a.attname) IN (
      ('public.recoleccion'::regclass, 'fecha'),
      ('public.recoleccion_historial'::regclass, 'created_at')
    ) AND NOT a.attisdropped AND a.atttypid <> 'date'::regtype
  ) THEN
    RAISE EXCEPTION 'Cotejar 015: fecha e historial.created_at deben ser DATE.';
  END IF;
  SELECT pg_get_expr(c.conbin, c.conrelid)
  INTO v_check FROM pg_constraint c
  WHERE c.conrelid = 'public.recoleccion'::regclass
    AND c.conname = 'chk_fecha_rango' AND c.contype = 'c';
  -- El servidor canonicaliza las dos expresiones admitidas con los tipos reales.
  -- Nunca quitar paréntesis ni cambiar mayúsculas: afectan agrupación y literales.
  -- TEMP vacía, de esta sesión; no lee ni modifica filas de public.recoleccion.
  CREATE TEMP TABLE pg_temp._r3_090_checks_referencia ON COMMIT DROP AS
    SELECT r.fecha, r.estado_registro FROM public.recoleccion r WITH NO DATA;
  ALTER TABLE pg_temp._r3_090_checks_referencia
    ADD CONSTRAINT original CHECK (fecha >= CURRENT_DATE - 45 AND fecha <= CURRENT_DATE),
    ADD CONSTRAINT rechazo_090 CHECK (
      (fecha >= CURRENT_DATE - 45 AND fecha <= CURRENT_DATE)
      OR coalesce(estado_registro::text = 'RECHAZADO', false)
    );
  -- Aceptar únicamente el CHECK confirmado o la repetición exacta de 090.
  IF v_check IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'pg_temp._r3_090_checks_referencia'::regclass
      AND c.conname IN ('original', 'rechazo_090')
      AND pg_get_expr(c.conbin, c.conrelid) = v_check
  ) THEN
    RAISE EXCEPTION 'Drift en chk_fecha_rango: cotejar catálogo antes de instalar 090.';
  END IF;
  DROP TABLE pg_temp._r3_090_checks_referencia;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.recoleccion'::regclass
      AND c.conname = 'chk_recoleccion_motivo_rechazo_longitud' AND c.contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Cotejar 058: falta restricción de longitud de motivo_rechazo.';
  END IF;
  IF NOT has_any_column_privilege('service_role', 'public.usuario', 'UPDATE') THEN
    RAISE EXCEPTION 'Cotejar privilegios privados de cuenta: FOR SHARE requiere UPDATE.';
  END IF;
END;
$$;

ALTER TABLE public.recoleccion DROP CONSTRAINT chk_fecha_rango;
-- NOT VALID omite el barrido de filas históricas al instalar. PostgreSQL sigue
-- comprobando todo INSERT/UPDATE; no validar todo el legado con CURRENT_DATE.
-- COALESCE evita que un estado NULL convierta una fecha inválida en CHECK NULL.
ALTER TABLE public.recoleccion ADD CONSTRAINT chk_fecha_rango CHECK (
  (fecha >= CURRENT_DATE - 45 AND fecha <= CURRENT_DATE)
  OR coalesce(estado_registro::text = 'RECHAZADO', false)
) NOT VALID;

-- El CHECK no conoce OLD. Este trigger limita su exención a la transición
-- puntual, sin habilitar altas, reintentos, edición de ficha/saldo/snapshots o
-- reenvío con fechas inválidas. AFTER observa también cambios de otros triggers.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.estado_registro::text IS NOT DISTINCT FROM 'RECHAZADO'
    AND (NEW.fecha >= CURRENT_DATE - 45 AND NEW.fecha <= CURRENT_DATE) IS NOT TRUE THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.estado_registro::text IS NOT DISTINCT FROM 'PENDIENTE_VALIDACION'
        AND NEW.usuario_validacion_id IS NULL AND NEW.fecha_validacion IS NULL
        AND NEW.motivo_rechazo IS NOT NULL
        AND char_length(NEW.motivo_rechazo) BETWEEN 10 AND 500
        AND (to_jsonb(NEW) - ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo'])
          IS NOT DISTINCT FROM
            (to_jsonb(OLD) - ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo']) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Fecha fuera de rango: solo se permite rechazar una recolección pendiente sin editar su ficha.'
      USING ERRCODE = '23514', CONSTRAINT = 'chk_fecha_rango';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_recoleccion_acotar_excepcion_fecha_rechazo ON public.recoleccion;
CREATE TRIGGER trg_recoleccion_acotar_excepcion_fecha_rechazo
AFTER INSERT OR UPDATE ON public.recoleccion FOR EACH ROW
EXECUTE FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo();

CREATE OR REPLACE FUNCTION public.fn_recoleccion_rechazar_validacion(
  p_recoleccion_id bigint, p_actor_id bigint, p_motivo_rechazo text
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s' SET statement_timeout = '30s' AS $$
DECLARE
  v_recoleccion record;
BEGIN
  -- Actor resuelto por el backend desde identidad verificada; no rol del body.
  -- Orden compartido con las operaciones de cuenta y 089: cuenta -> registro.
  PERFORM 1 FROM public.usuario u
  WHERE u.id = p_actor_id AND u.activo IS TRUE
    AND u.rol::text IN ('ADMIN','VALIDADOR') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Se requiere cuenta activa VALIDADOR o ADMIN.' USING ERRCODE = '42501';
  END IF;
  IF p_motivo_rechazo IS NULL OR char_length(p_motivo_rechazo) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'motivo_rechazo debe tener entre 10 y 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  SELECT r.estado_registro, r.eliminado_en, r.codigo_trazabilidad
  INTO v_recoleccion FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id FOR UPDATE;
  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_recoleccion.estado_registro::text IS DISTINCT FROM 'PENDIENTE_VALIDACION' THEN
    RAISE EXCEPTION 'Solo se puede rechazar una recolección en PENDIENTE_VALIDACION.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.recoleccion
  SET estado_registro = 'RECHAZADO', usuario_validacion_id = NULL,
    fecha_validacion = NULL, motivo_rechazo = p_motivo_rechazo
  WHERE id = p_recoleccion_id;
  INSERT INTO public.recoleccion_historial (
    recoleccion_id, tipo_historial, estado_origen, estado_destino,
    observaciones, actor_user_id, created_at, metadata
  ) VALUES (
    p_recoleccion_id, 'VALIDACION_RECHAZADA', 'PENDIENTE_VALIDACION', 'RECHAZADO',
    nullif(btrim(p_motivo_rechazo), ''), p_actor_id,
    (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date,
    jsonb_build_object('codigo_trazabilidad', v_recoleccion.codigo_trazabilidad,
      'motivo_rechazo', p_motivo_rechazo)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recoleccion_rechazar_validacion(bigint,bigint,text) TO service_role;
GRANT SELECT (id,rol,activo) ON public.usuario TO service_role;
GRANT SELECT (id,estado_registro,eliminado_en,codigo_trazabilidad) ON public.recoleccion TO service_role;
GRANT UPDATE (estado_registro,usuario_validacion_id,fecha_validacion,motivo_rechazo)
  ON public.recoleccion TO service_role;
-- INSERT historial/USAGE secuencia siguen siendo antecedentes privados de 014.
COMMENT ON CONSTRAINT chk_fecha_rango ON public.recoleccion IS
  '090: ventana original de 45 días; excepción exclusiva para rechazo pendiente acotada por trigger. NOT VALID conserva legado sin barrerlo.';
NOTIFY pgrst, 'reload schema';
COMMIT;
