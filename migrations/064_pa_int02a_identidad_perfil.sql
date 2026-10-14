-- PA-T-INT02-A. Preparada para aplicar solo después de cotejar el catálogo real.
-- Esta migración no reclasifica cuentas ni trunca texto legado.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.usuario') IS NULL OR to_regclass('public.organizacion') IS NULL THEN
    RAISE EXCEPTION 'Faltan usuario u organizacion; cotejar catálogo antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario WHERE auth_id IS NULL OR btrim(auth_id) = '') OR
     EXISTS (SELECT 1 FROM public.usuario GROUP BY auth_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'auth_id nulo, vacío o duplicado: conciliar antes de migrar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario WHERE
    NULLIF(btrim(nombre), '') IS NULL AND NULLIF(btrim(username), '') IS NULL) THEN
    RAISE EXCEPTION 'Cuenta sin nombre ni username identificable: conciliar antes de migrar';
  END IF;
END $$;

ALTER TABLE public.usuario
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revision_autoridad BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS organizacion_id BIGINT;
ALTER TABLE public.usuario ALTER COLUMN rol SET DEFAULT 'VOLUNTARIO'::public.rol_usuario;
ALTER TABLE public.usuario ALTER COLUMN auth_id SET NOT NULL;
ALTER TABLE public.usuario ADD CONSTRAINT usuario_auth_id_no_vacio_pa_ck
  CHECK (btrim(auth_id) <> '');
CREATE UNIQUE INDEX IF NOT EXISTS usuario_auth_id_uq_pa ON public.usuario (auth_id);
CREATE INDEX IF NOT EXISTS usuario_organizacion_id_pa_idx ON public.usuario (organizacion_id);
ALTER TABLE public.usuario ADD CONSTRAINT usuario_organizacion_id_pa_fk
  FOREIGN KEY (organizacion_id) REFERENCES public.organizacion(id) ON DELETE RESTRICT;
ALTER TABLE public.usuario ADD CONSTRAINT usuario_afiliacion_excluyente_pa_ck
  CHECK (organizacion_id IS NULL OR organizacion IS NULL);
ALTER TABLE public.usuario ADD CONSTRAINT usuario_revision_autoridad_pa_ck
  CHECK (revision_autoridad >= 0);

-- JWT de la aplicación no equivale a auth.uid() de Supabase. Solo el backend
-- con service_role invoca estas funciones; la autorización se revalida en SQL.
CREATE OR REPLACE FUNCTION public.pa_actor_verificar(p_auth_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  SELECT jsonb_build_object('usuario_id', id::TEXT, 'rol', rol::TEXT, 'activo', activo)
  INTO v FROM public.usuario WHERE auth_id = p_auth_id;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pa_perfil_leer(p_usuario_id BIGINT, p_auth_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v JSONB; v_activo BOOLEAN;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  SELECT activo INTO v_activo FROM public.usuario WHERE id=p_usuario_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_ENCONTRADA' USING ERRCODE='P0002'; END IF;
  IF NOT v_activo THEN RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE='P0001'; END IF;
  SELECT jsonb_build_object(
    'usuario_id', u.id::TEXT, 'nombre', COALESCE(NULLIF(btrim(u.nombre), ''), btrim(u.username)), 'apellido', u.apellido,
    'rol_global', u.rol::TEXT,
    'afiliacion', CASE
      WHEN u.organizacion_id IS NOT NULL THEN jsonb_build_object(
        'tipo', 'ORGANIZACION_REGISTRADA', 'organizacion_id', u.organizacion_id::TEXT,
        'nombre', o.nombre)
      WHEN NULLIF(btrim(u.organizacion), '') IS NOT NULL THEN jsonb_build_object(
        'tipo', 'OTRA', 'organizacion_id', NULL, 'nombre', u.organizacion)
      ELSE NULL END)
  INTO v FROM public.usuario u LEFT JOIN public.organizacion o ON o.id = u.organizacion_id
  WHERE u.id = p_usuario_id AND u.auth_id = p_auth_id AND u.activo;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pa_perfil_actualizar(
  p_usuario_id BIGINT, p_auth_id TEXT, p_cambiar_nombre BOOLEAN, p_nombre TEXT,
  p_cambiar_apellido BOOLEAN, p_apellido TEXT,
  p_cambiar_afiliacion BOOLEAN, p_organizacion_id BIGINT, p_organizacion_otra TEXT,
  p_datos_historicos JSONB DEFAULT '{}'::JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id BIGINT; v_activo BOOLEAN; v_org_activo BOOLEAN;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  -- statement_timeout debe configurarse antes del comando en PostgREST/sesión;
  -- set_config dentro de esta función no limita la invocación corriente.
  IF p_datos_historicos IS NULL OR jsonb_typeof(p_datos_historicos) <> 'object' OR
     EXISTS (SELECT 1 FROM jsonb_object_keys(p_datos_historicos) k WHERE k NOT IN ('doc_identidad','wallet_address','contacto')) THEN
    RAISE EXCEPTION 'CAMPO_NO_PERMITIDO' USING ERRCODE = 'P0001';
  END IF;
  IF p_cambiar_nombre AND (p_nombre IS NULL OR btrim(p_nombre) = '' OR char_length(p_nombre) > 100) THEN
    RAISE EXCEPTION 'NOMBRE_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  IF p_cambiar_apellido AND p_apellido IS NOT NULL AND
     (btrim(p_apellido) = '' OR char_length(p_apellido) > 30) THEN
    RAISE EXCEPTION 'APELLIDO_INVALIDO' USING ERRCODE = 'P0001';
  END IF;
  IF p_cambiar_afiliacion AND (
    (p_organizacion_id IS NOT NULL AND p_organizacion_otra IS NOT NULL) OR
    (p_organizacion_otra IS NOT NULL AND (btrim(p_organizacion_otra) = '' OR char_length(p_organizacion_otra) > 150))
  ) THEN RAISE EXCEPTION 'AFILIACION_INVALIDA' USING ERRCODE = 'P0001'; END IF;
  SELECT id, activo INTO v_id, v_activo FROM public.usuario
    WHERE id = p_usuario_id AND auth_id = p_auth_id FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'CUENTA_NO_ENCONTRADA' USING ERRCODE = 'P0002'; END IF;
  IF NOT v_activo THEN RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE = 'P0001'; END IF;
  IF p_cambiar_afiliacion AND p_organizacion_id IS NOT NULL THEN
    SELECT activo INTO v_org_activo FROM public.organizacion
      WHERE id = p_organizacion_id FOR SHARE;
    IF v_org_activo IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ORGANIZACION_NO_SELECCIONABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  UPDATE public.usuario SET
    nombre = CASE WHEN p_cambiar_nombre THEN p_nombre ELSE nombre END,
    apellido = CASE WHEN p_cambiar_apellido THEN p_apellido ELSE apellido END,
    organizacion_id = CASE WHEN p_cambiar_afiliacion THEN p_organizacion_id ELSE organizacion_id END,
    organizacion = CASE WHEN p_cambiar_afiliacion THEN p_organizacion_otra ELSE organizacion END,
    doc_identidad = CASE WHEN p_datos_historicos ? 'doc_identidad' THEN p_datos_historicos->>'doc_identidad' ELSE doc_identidad END,
    wallet_address = CASE WHEN p_datos_historicos ? 'wallet_address' THEN p_datos_historicos->>'wallet_address' ELSE wallet_address END,
    contacto = CASE WHEN p_datos_historicos ? 'contacto' THEN p_datos_historicos->>'contacto' ELSE contacto END
  WHERE id = v_id;
  RETURN public.pa_perfil_leer(p_usuario_id, p_auth_id);
END $$;

CREATE OR REPLACE FUNCTION public.pa_organizaciones_seleccionables(
  p_usuario_id BIGINT, p_auth_id TEXT, p_consulta TEXT, p_despues_id BIGINT, p_limite INTEGER)
RETURNS TABLE(organizacion_id TEXT, nombre TEXT)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_activo BOOLEAN; v_despues_nombre TEXT;
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  SELECT activo INTO v_activo FROM public.usuario WHERE id=p_usuario_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_ENCONTRADA' USING ERRCODE='P0002'; END IF;
  IF v_activo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE='P0001';
  END IF;
  IF p_despues_id IS NOT NULL THEN
    SELECT lower(normalize(btrim(o.nombre), NFC)) INTO v_despues_nombre FROM public.organizacion o WHERE o.id=p_despues_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CURSOR_INVALIDO' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN QUERY
  SELECT o.id::TEXT, o.nombre
  FROM public.organizacion o
  WHERE o.activo = true
    AND (p_consulta IS NULL OR strpos(lower(normalize(o.nombre, NFC)), lower(normalize(p_consulta, NFC))) > 0)
    AND (p_despues_id IS NULL OR (lower(normalize(btrim(o.nombre), NFC)), o.id) > (v_despues_nombre, p_despues_id))
  ORDER BY lower(normalize(btrim(o.nombre), NFC)), o.id LIMIT p_limite;
END
$$;

CREATE OR REPLACE FUNCTION public.pa_perfil_foto_actualizar(p_usuario_id BIGINT,p_auth_id TEXT,p_foto_url TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_activo BOOLEAN;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  SELECT activo INTO v_activo FROM public.usuario WHERE id=p_usuario_id AND auth_id=p_auth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_ENCONTRADA' USING ERRCODE='P0002'; END IF;
  IF v_activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE='P0001'; END IF;
  UPDATE public.usuario SET foto_perfil_url=p_foto_url WHERE id=p_usuario_id;
END $$;

-- Una sentencia por RPC deja cada firma y destinatario completos al copiar.
REVOKE ALL ON FUNCTION public.pa_actor_verificar(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_actor_verificar(TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.pa_perfil_leer(BIGINT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_perfil_leer(BIGINT,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.pa_perfil_actualizar(BIGINT,TEXT,BOOLEAN,TEXT,BOOLEAN,TEXT,BOOLEAN,BIGINT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_perfil_actualizar(BIGINT,TEXT,BOOLEAN,TEXT,BOOLEAN,TEXT,BOOLEAN,BIGINT,TEXT,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.pa_organizaciones_seleccionables(BIGINT,TEXT,TEXT,BIGINT,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_organizaciones_seleccionables(BIGINT,TEXT,TEXT,BIGINT,INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.pa_perfil_foto_actualizar(BIGINT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_perfil_foto_actualizar(BIGINT,TEXT,TEXT) TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.usuario FROM PUBLIC, anon, authenticated;
-- Revocación explícita adicional de ACL de columnas para dejar el corte visible.
DO $$ DECLARE v_columnas TEXT; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO v_columnas
  FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON public.usuario FROM PUBLIC, anon, authenticated', v_columnas, v_columnas);
END $$;
COMMIT;
