-- Alta pública después de verificar WebAuthn en el backend privado.
-- Antecedente de identidad y privacidad 064–067. Ejecutar el archivo completo.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE v_columna RECORD; v_unica RECORD; v_rol TEXT; v_tabla TEXT;
BEGIN
  IF to_regclass('public.usuario') IS NULL OR
     to_regclass('public.usuario_credencial') IS NULL OR
     to_regprocedure('public.pa_actor_verificar(text)') IS NULL THEN
    RAISE EXCEPTION 'ALTA_113_ANTECEDENTE_INCOMPLETO';
  END IF;
  FOR v_columna IN SELECT * FROM (VALUES
    ('usuario','id','bigint'), ('usuario','auth_id','text'),
    ('usuario','username','text'), ('usuario','nombre','text'),
    ('usuario','correo','text'), ('usuario','rol','public.rol_usuario'),
    ('usuario','activo','boolean'), ('usuario','created_at','timestamp with time zone'),
    ('usuario_credencial','id','bigint'), ('usuario_credencial','usuario_id','bigint'),
    ('usuario_credencial','credential_id','text'), ('usuario_credencial','public_key','text'),
    ('usuario_credencial','algorithm','text'), ('usuario_credencial','counter','integer'),
    ('usuario_credencial','transports','text[]')
  ) c(tabla,columna,tipo) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute
      WHERE attrelid=to_regclass('public.'||v_columna.tabla)
        AND attname=v_columna.columna AND NOT attisdropped
        AND atttypid=to_regtype(v_columna.tipo)) THEN
      RAISE EXCEPTION 'ALTA_113_COLUMNA_INCOMPATIBLE: %.%',v_columna.tabla,v_columna.columna;
    END IF;
  END LOOP;

  -- Los índices existentes arbitran también los INSERT concurrentes.
  FOR v_unica IN SELECT * FROM (VALUES
    ('usuario','id'), ('usuario','username'), ('usuario','auth_id'), ('usuario','correo'),
    ('usuario_credencial','credential_id')
  ) u(tabla,columna) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_attribute a
      ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0]
      WHERE i.indrelid=to_regclass('public.'||v_unica.tabla)
        AND a.attname=v_unica.columna
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
        AND i.indnkeyatts=1 AND i.indpred IS NULL AND i.indexprs IS NULL) THEN
      RAISE EXCEPTION 'ALTA_113_UNICIDAD_INCOMPATIBLE: %.%',v_unica.tabla,v_unica.columna;
    END IF;
  END LOOP;

  FOREACH v_tabla IN ARRAY ARRAY['public.usuario','public.usuario_credencial'] LOOP
    IF NOT has_table_privilege('service_role',v_tabla,'SELECT') OR
       NOT has_table_privilege('service_role',v_tabla,'INSERT') THEN
      RAISE EXCEPTION 'ALTA_113_SERVICIO_SIN_PRIVILEGIOS: %',v_tabla;
    END IF;
    FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_any_column_privilege(v_rol,v_tabla,'SELECT') OR
         has_any_column_privilege(v_rol,v_tabla,'INSERT') OR
         has_any_column_privilege(v_rol,v_tabla,'UPDATE') OR
         has_table_privilege(v_rol,v_tabla,'DELETE') THEN
        RAISE EXCEPTION 'ALTA_113_PRIVACIDAD_INCOMPATIBLE: % %',v_tabla,v_rol;
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.pa_usuario_registrar(
  p_auth_id TEXT, p_username TEXT, p_correo TEXT,
  p_credential_id TEXT, p_public_key TEXT, p_algorithm TEXT,
  p_counter INTEGER, p_transports TEXT[]
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
AS $$
DECLARE v_usuario public.usuario%ROWTYPE;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  IF NULLIF(btrim(p_auth_id),'') IS NULL OR
     NULLIF(btrim(p_username),'') IS NULL OR
     NULLIF(btrim(p_credential_id),'') IS NULL OR
     NULLIF(btrim(p_public_key),'') IS NULL OR
     NULLIF(btrim(p_algorithm),'') IS NULL OR
     p_counter IS NULL OR p_counter<0 THEN
    RAISE EXCEPTION 'DATOS_ALTA_INVALIDOS' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.usuario(auth_id,username,nombre,correo,rol,activo)
  VALUES(p_auth_id,p_username,p_username,p_correo,'VOLUNTARIO',true)
  RETURNING * INTO v_usuario;

  INSERT INTO public.usuario_credencial(
    usuario_id,credential_id,public_key,algorithm,counter,transports
  ) VALUES (
    v_usuario.id,p_credential_id,p_public_key,p_algorithm,p_counter,
    COALESCE(p_transports,ARRAY[]::TEXT[])
  );

  RETURN jsonb_build_object(
    'usuario_id',v_usuario.id::TEXT,'auth_id',v_usuario.auth_id,
    'username',v_usuario.username,'correo',v_usuario.correo,
    'created_at',v_usuario.created_at
  );
EXCEPTION WHEN unique_violation THEN
  -- La excepción revierte ambas inserciones antes de clasificar el conflicto.
  IF EXISTS (SELECT 1 FROM public.usuario WHERE username=p_username) THEN
    RAISE EXCEPTION 'USUARIO_YA_EXISTE' USING ERRCODE='23505';
  END IF;
  RAISE EXCEPTION 'DATOS_ALTA_EN_USO' USING ERRCODE='23505';
END $$;

REVOKE ALL ON FUNCTION public.pa_usuario_registrar(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_usuario_registrar(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT[])
  TO service_role;
DO $$
BEGIN
  IF has_function_privilege('anon','public.pa_usuario_registrar(text,text,text,text,text,text,integer,text[])','EXECUTE') OR
     has_function_privilege('authenticated','public.pa_usuario_registrar(text,text,text,text,text,text,integer,text[])','EXECUTE') THEN
    RAISE EXCEPTION 'ALTA_113_EXECUTE_PUBLICO_RESIDUAL';
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
