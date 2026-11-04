-- Selector de usuarios activos para gestión de roles globales por ADMIN.
-- Requiere 064/073 y sus privilegios privados existentes. No cambia cuentas,
-- permisos, comandos, índices ni la disciplina de locks de autoridad.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE v_columna RECORD; v_firma REGPROCEDURE;
BEGIN
  IF current_setting('server_encoding')<>'UTF8' OR lower(normalize('ÁÉÑ',NFC))<>'áéñ' THEN
    RAISE EXCEPTION 'USUARIOS_ADMIN_UNICODE_INCOMPATIBLE: cotejar encoding y locale';
  END IF;
  IF to_regclass('public.usuario') IS NULL OR
    to_regprocedure('public.pa_lecturas_actor(bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'USUARIOS_ADMIN_ANTECEDENTE_INCOMPLETO: cotejar 064/073';
  END IF;
  -- Comprobar el catálogo, sin barrer ni reclasificar cuentas legadas.
  FOR v_columna IN SELECT * FROM (VALUES
    ('id',ARRAY['int8']::TEXT[]),('auth_id',ARRAY['text','varchar']::TEXT[]),
    ('nombre',ARRAY['text','varchar']::TEXT[]),('username',ARRAY['text','varchar']::TEXT[]),
    ('rol',ARRAY['rol_usuario']::TEXT[]),('activo',ARRAY['bool']::TEXT[]),
    ('revision_autoridad',ARRAY['int8']::TEXT[])
  ) AS columnas(nombre,tipos) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_type t ON t.oid=a.atttypid
      WHERE a.attrelid='public.usuario'::regclass AND a.attname=v_columna.nombre
        AND a.attnum>0 AND NOT a.attisdropped AND t.typname=ANY(v_columna.tipos)) THEN
      RAISE EXCEPTION 'USUARIOS_ADMIN_CATALOGO_INCOMPATIBLE: columna %',v_columna.nombre;
    END IF;
    IF NOT has_column_privilege('service_role','public.usuario',v_columna.nombre,'SELECT') THEN
      RAISE EXCEPTION 'USUARIOS_ADMIN_PRIVILEGIO_PREVIO_AUSENTE: SELECT de %',v_columna.nombre;
    END IF;
  END LOOP;
  IF (SELECT array_agg(e.enumlabel::TEXT ORDER BY e.enumlabel::TEXT)
      FROM pg_enum e WHERE e.enumtypid='public.rol_usuario'::regtype)
      IS DISTINCT FROM ARRAY['ADMIN','GENERAL','VALIDADOR','VOLUNTARIO']::TEXT[] OR
    EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.usuario'::regclass
      AND a.attname IN('id','rol','activo','revision_autoridad') AND NOT a.attnotnull) OR
    NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='public.pa_lecturas_actor(bigint,text)'::regprocedure
      AND p.prorettype='text'::regtype AND NOT p.prosecdef) THEN
    RAISE EXCEPTION 'USUARIOS_ADMIN_CATALOGO_INCOMPATIBLE: roles, nulabilidad o helper';
  END IF;
  -- El helper usa FOR SHARE: necesita UPDATE previo en alguna columna.
  IF NOT has_any_column_privilege('service_role','public.usuario','UPDATE') OR
    NOT has_function_privilege('service_role','public.pa_lecturas_actor(bigint,text)','EXECUTE') OR
    has_function_privilege('anon','public.pa_lecturas_actor(bigint,text)','EXECUTE') OR
    has_function_privilege('authenticated','public.pa_lecturas_actor(bigint,text)','EXECUTE') THEN
    RAISE EXCEPTION 'USUARIOS_ADMIN_FRONTERA_PREVIA_INCOMPATIBLE: cotejar privilegios 064/073';
  END IF;
  v_firma:=to_regprocedure('public.pa_usuarios_administracion_leer(bigint,text,text,text,bigint,integer)');
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pa_usuarios_administracion_leer'
      AND (v_firma IS NULL OR p.oid<>v_firma::OID)) THEN
    RAISE EXCEPTION 'USUARIOS_ADMIN_SOBRECARGA_INESPERADA: cotejar catálogo';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pa_usuarios_administracion_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_consulta TEXT,p_rol_global TEXT,
  p_despues_id BIGINT,p_limite INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_consulta TEXT; v_rows JSONB;
BEGIN
  IF p_actor_id IS NULL OR p_actor_id<=0 OR p_auth_id IS NULL OR btrim(p_auth_id)='' THEN
    RAISE EXCEPTION 'SESION_INVALIDA' USING ERRCODE='PT401', DETAIL='{"codigo":"SESION_INVALIDA","mensaje":"La sesión no es válida.","campos":[],"ambitos":[],"reintento":"RECUPERAR_SESION"}';
  END IF;
  -- Revalidar identidad/actividad/rol en esta transacción; el helper mantiene
  -- SHARE sobre la cuenta frente a cambios de autoridad e inactivación.
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  IF v_rol<>'ADMIN' THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='PT403', DETAIL='{"codigo":"CAPACIDAD_INSUFICIENTE","mensaje":"No tiene capacidad para esta operación.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
  END IF;
  v_consulta:=normalize(btrim(p_consulta),NFC);
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 21 OR p_despues_id<=0 OR
    (p_consulta IS NOT NULL AND char_length(v_consulta) NOT BETWEEN 2 AND 100) OR
    (p_rol_global IS NOT NULL AND p_rol_global NOT IN('ADMIN','GENERAL','VALIDADOR','VOLUNTARIO')) THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"La entrada no cumple el contrato v1.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
  END IF;
  -- strpos evita interpretar %, _ o barras como comodines. Las colisiones
  -- de nombres/username permanecen cuentas distintas; el orden es solo por ID.
  SELECT coalesce(jsonb_agg(q.fila ORDER BY q.id),'[]'::JSONB) INTO v_rows FROM (
    SELECT u.id,jsonb_build_object(
      'usuario_id',u.id::TEXT,
      'nombre',coalesce(nullif(btrim(u.nombre),''),nullif(btrim(u.username),''),'Usuario'),
      'username',nullif(btrim(u.username),''),'rol_global',u.rol::TEXT,
      'activo',u.activo,'revision_autoridad',u.revision_autoridad::TEXT) fila
    FROM public.usuario u WHERE u.activo IS TRUE
      AND (p_despues_id IS NULL OR u.id>p_despues_id)
      AND (p_rol_global IS NULL OR u.rol::TEXT=p_rol_global)
      AND (v_consulta IS NULL OR
        strpos(lower(normalize(coalesce(nullif(btrim(u.nombre),''),nullif(btrim(u.username),''),''),NFC)),lower(v_consulta))>0 OR
        strpos(lower(normalize(coalesce(nullif(btrim(u.username),''),''),NFC)),lower(v_consulta))>0)
    ORDER BY u.id LIMIT p_limite
  ) q;
  RETURN jsonb_build_object('data',v_rows,'observado_en',
    to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END;
$$;

-- Cerrar también grants explícitos residuales si se reinstala esta firma.
-- El propietario conserva sus facultades inherentes; no se conceden tablas.
DO $$
DECLARE v_grantee RECORD;
BEGIN
  FOR v_grantee IN SELECT DISTINCT a.grantee,r.rolname FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    LEFT JOIN pg_roles r ON r.oid=a.grantee
    WHERE p.oid='public.pa_usuarios_administracion_leer(bigint,text,text,text,bigint,integer)'::regprocedure
      AND a.grantee<>p.proowner LOOP
    IF v_grantee.grantee=0 THEN
      REVOKE ALL ON FUNCTION public.pa_usuarios_administracion_leer(BIGINT,TEXT,TEXT,TEXT,BIGINT,INTEGER) FROM PUBLIC;
    ELSE
      EXECUTE format('REVOKE ALL ON FUNCTION public.pa_usuarios_administracion_leer(BIGINT,TEXT,TEXT,TEXT,BIGINT,INTEGER) FROM %I',v_grantee.rolname);
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.pa_usuarios_administracion_leer(BIGINT,TEXT,TEXT,TEXT,BIGINT,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_usuarios_administracion_leer(BIGINT,TEXT,TEXT,TEXT,BIGINT,INTEGER) TO service_role;

DO $$
DECLARE v_oid OID:='public.pa_usuarios_administracion_leer(bigint,text,text,text,bigint,integer)'::regprocedure;
BEGIN
  IF has_function_privilege('anon',v_oid,'EXECUTE') OR
    has_function_privilege('authenticated',v_oid,'EXECUTE') OR
    NOT has_function_privilege('service_role',v_oid,'EXECUTE') OR
    EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=v_oid
      AND (p.prosecdef OR p.prorettype<>'jsonb'::regtype)) OR
    EXISTS(SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid=v_oid AND a.grantee<>p.proowner
        AND (a.grantee<>'service_role'::regrole::OID OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN
    RAISE EXCEPTION 'USUARIOS_ADMIN_PRIVILEGIO_RESIDUAL: no publicar';
  END IF;
END;
$$;
COMMENT ON FUNCTION public.pa_usuarios_administracion_leer(BIGINT,TEXT,TEXT,TEXT,BIGINT,INTEGER) IS
  '091: selector mínimo de cuentas activas, solo ADMIN global vigente; lectura privada sin autoridad derivada de headers o afiliación.';
NOTIFY pgrst,'reload schema';
COMMIT;
