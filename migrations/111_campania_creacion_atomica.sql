-- RF-PLA-01: alta MVP de campaña y organizaciones en una sola RPC privada.
-- Aditiva sobre028/037/039/050 y la superficie privada083. No agrega estado,
-- permisos contextuales ni recibos; no reescribe campañas o códigos históricos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

DO $preflight$
DECLARE r record; f record;
BEGIN
  IF EXISTS(SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) x(nombre)
    WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=x.nombre)) THEN
    RAISE EXCEPTION 'CAMPANIA_111_ROLES_INCOMPATIBLES';
  END IF;
  IF to_regclass('public.usuario') IS NULL OR to_regclass('public.organizacion') IS NULL
    OR to_regclass('public.campania') IS NULL OR to_regclass('public.campania_organizacion') IS NULL THEN
    RAISE EXCEPTION 'CAMPANIA_111_ANTECEDENTE_INCOMPATIBLE: requiere028/037 y cuenta activa';
  END IF;
  -- Resolver el catálogo real antes de publicar la función; cualquier deriva
  -- aborta la migración completa sin conceder nuevos accesos a las tablas.
  PERFORM u.id,u.auth_id,u.rol,u.activo FROM public.usuario u LIMIT 0;
  PERFORM c.id,c.nombre,c.descripcion,c.tipo,c.codigo_trazabilidad,
    c.fecha_estimada_inicio,c.fecha_estimada_fin,c.created_at,c.created_by,c.updated_by
    FROM public.campania c LIMIT 0;
  PERFORM o.id,o.campania_id,o.organizacion_id,o.created_by FROM public.campania_organizacion o LIMIT 0;
  FOR r IN SELECT * FROM (VALUES
    ('usuario','SELECT'),
    ('campania','SELECT'),('campania','INSERT'),('campania_organizacion','INSERT')
  ) x(tabla,permiso) LOOP
    IF NOT has_table_privilege('service_role','public.'||r.tabla,r.permiso) THEN
      RAISE EXCEPTION 'CAMPANIA_111_ACL_INCOMPATIBLE: service_role % %',r.tabla,r.permiso;
    END IF;
  END LOOP;
  IF NOT has_any_column_privilege('service_role','public.usuario','UPDATE') THEN
    RAISE EXCEPTION 'CAMPANIA_111_ACL_INCOMPATIBLE: usuario requiere UPDATE en alguna columna para FOR SHARE';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_sequence WHERE seqrelid=to_regclass('public.seq_codigo_campania_contador')
    AND seqincrement=1 AND seqmin>=1 AND NOT seqcycle) THEN
    RAISE EXCEPTION 'CAMPANIA_111_SECUENCIA_INCOMPATIBLE: requiere039 sin reinicio ni ciclo';
  END IF;
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.fn_generar_codigo_campania(integer)');
  IF f.oid IS NULL OR f.prorettype<>'text'::regtype OR f.proretset OR f.prosecdef
    OR md5(f.prosrc) NOT IN('096055703b934966cddbab9ad24b2eaa','648980ad372814e81b423dfc63661629') THEN
    RAISE EXCEPTION 'CAMPANIA_111_GENERADOR_INCOMPATIBLE: cotejar039/111';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN('fn_generar_codigo_campania','fn_crear_campania')
    AND oid NOT IN(f.oid,coalesce(to_regprocedure(
      'public.fn_crear_campania(text,text,public.tipo_subcampania,text,date,date,bigint[])'),0))) THEN
    RAISE EXCEPTION 'CAMPANIA_111_RPC_INCOMPATIBLE: sobrecarga no reconocida';
  END IF;
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(
    'public.fn_crear_campania(text,text,public.tipo_subcampania,text,date,date,bigint[])');
  IF f.oid IS NOT NULL AND (f.prosecdef OR f.proretset OR f.prorettype<>'jsonb'::regtype
    OR md5(f.prosrc)<>'e77b2dc71232a5bab6e397685cd37586') THEN
    RAISE EXCEPTION 'CAMPANIA_111_RPC_INCOMPATIBLE: cotejar111 existente';
  END IF;
END $preflight$;

-- Mantiene la secuencia global039 y su valor consumido, incluso si una
-- transacción aborta o la campaña queda soft-deleted. Nunca setval/restart.
-- lpad(text,3,...) trunca1000 a100; el ancho debe ser al menos el del número.
CREATE OR REPLACE FUNCTION public.fn_generar_codigo_campania(p_anio INT)
RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_siguiente TEXT;
BEGIN
  v_siguiente:=nextval('public.seq_codigo_campania_contador')::text;
  RETURN 'CMP-'||p_anio::text||'-'||lpad(v_siguiente,greatest(3,length(v_siguiente)),'0');
END $$;
COMMENT ON FUNCTION public.fn_generar_codigo_campania(INT) IS
  'Contador global039, privado y sin reinicio anual. CMP-YYYY-NNN con mínimo3 dígitos y sin truncamiento. nextval no revierte: un aborto puede dejar saltos, sin reutilizar el correlativo consumido.';

CREATE OR REPLACE FUNCTION public.fn_crear_campania(
  p_auth_id TEXT,p_nombre TEXT,p_tipo public.tipo_subcampania,
  p_descripcion TEXT DEFAULT NULL,p_fecha_estimada_inicio DATE DEFAULT NULL,
  p_fecha_estimada_fin DATE DEFAULT NULL,p_organizacion_ids BIGINT[] DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
DECLARE v_actor public.usuario%ROWTYPE; v_campania public.campania%ROWTYPE;
  v_restriccion TEXT; v_tabla TEXT;
BEGIN
  -- p_auth_id sólo llega del JWT verificado por InternalActorGuard. El lock
  -- SHARE revalida el rol/actividad y coordina el alta con rol/baja072.
  SELECT * INTO v_actor FROM public.usuario WHERE auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta de la sesión no existe.' USING ERRCODE='PT404';
  END IF;
  IF v_actor.activo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE='PT403';
  END IF;
  IF v_actor.rol::text IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo el rol ADMIN puede realizar esta operación.' USING ERRCODE='PT403';
  END IF;
  -- Repite las reglas vigentes del DTO/policies en la frontera privada.
  IF p_nombre IS NULL OR char_length(p_nombre) NOT BETWEEN 3 AND 200
    OR char_length(p_descripcion)>1000 OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'Datos de campaña inválidos.' USING ERRCODE='PT400';
  END IF;
  IF p_fecha_estimada_fin<p_fecha_estimada_inicio THEN
    RAISE EXCEPTION 'fecha_estimada_fin no puede ser anterior a fecha_estimada_inicio.' USING ERRCODE='PT400';
  END IF;

  INSERT INTO public.campania(nombre,descripcion,tipo,fecha_estimada_inicio,fecha_estimada_fin,
    codigo_trazabilidad,created_by,updated_by)
  VALUES(p_nombre,p_descripcion,p_tipo,p_fecha_estimada_inicio,p_fecha_estimada_fin,
    public.fn_generar_codigo_campania(extract(year FROM CURRENT_DATE)::int),v_actor.id,v_actor.id)
  RETURNING * INTO v_campania;

  -- El FK decide existencia del catálogo. No agrega una regla de actividad
  -- ni convierte la asociación referencial en autoridad. Un fallo revierte
  -- también la campaña ya insertada y sus campos de auditoría.
  INSERT INTO public.campania_organizacion(campania_id,organizacion_id,created_by)
  SELECT v_campania.id,o.id,v_actor.id FROM unnest(p_organizacion_ids) o(id) ORDER BY o.id;

  RETURN jsonb_build_object('id',v_campania.id,'nombre',v_campania.nombre,'tipo',v_campania.tipo,
    'codigo_trazabilidad',v_campania.codigo_trazabilidad,'descripcion',v_campania.descripcion,
    'fecha_estimada_inicio',v_campania.fecha_estimada_inicio,'fecha_estimada_fin',v_campania.fecha_estimada_fin,
    'created_at',v_campania.created_at);
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_restriccion=CONSTRAINT_NAME,v_tabla=TABLE_NAME;
    IF v_tabla='campania' AND EXISTS(
      SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
      WHERE c.conrelid='public.campania'::regclass AND c.conname=v_restriccion
        AND c.contype='u' AND cardinality(c.conkey)=1 AND a.attname='nombre'
    ) THEN
      RAISE EXCEPTION 'Ya existe una campaña con ese nombre.' USING ERRCODE='PT422';
    END IF;
    RAISE EXCEPTION 'No se pudo crear la campaña: código u organizaciones duplicadas.' USING ERRCODE='PT400';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Las organizaciones asociadas deben existir en el catálogo.' USING ERRCODE='PT400';
  WHEN not_null_violation OR check_violation THEN
    RAISE EXCEPTION 'Datos de campaña u organizaciones inválidos.' USING ERRCODE='PT400';
END $$;
COMMENT ON FUNCTION public.fn_crear_campania(TEXT,TEXT,public.tipo_subcampania,TEXT,DATE,DATE,BIGINT[]) IS
  'RF-PLA-01: cuenta ADMIN activa bajo SHARE; código039, campaña/auditoría y organizaciones en una sola transacción. Invocación exclusiva service_role tras JWT verificado; sin recibo ni reintento idempotente.';

REVOKE ALL ON FUNCTION public.fn_crear_campania(TEXT,TEXT,public.tipo_subcampania,TEXT,DATE,DATE,BIGINT[])
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fn_generar_codigo_campania(INT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_crear_campania(TEXT,TEXT,public.tipo_subcampania,TEXT,DATE,DATE,BIGINT[]),
  public.fn_generar_codigo_campania(INT) TO service_role;
REVOKE ALL ON SEQUENCE public.seq_codigo_campania_contador FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.seq_codigo_campania_contador TO service_role;

DO $acl$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(r,'public.fn_crear_campania(text,text,public.tipo_subcampania,text,date,date,bigint[])','EXECUTE')
      OR has_function_privilege(r,'public.fn_generar_codigo_campania(integer)','EXECUTE')
      OR has_sequence_privilege(r,'public.seq_codigo_campania_contador','USAGE,SELECT,UPDATE') THEN
      RAISE EXCEPTION 'CAMPANIA_111_ACL_HEREDADA_INCOMPATIBLE: %',r;
    END IF;
  END LOOP;
END $acl$;

NOTIFY pgrst, 'reload schema';
COMMIT;
