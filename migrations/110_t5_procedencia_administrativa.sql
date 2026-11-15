-- T5: audiencia ADMIN global separada para consumos persistidos por registro.
-- Requiere 073/103. No modifica procedencia-propia, Impacto, stock ni hechos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE f RECORD; r RECORD; v_firma REGPROCEDURE;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.pa_lecturas_actor(bigint,text)','ef1d5ff117c3f41d68249077ee4623a2','text'),
    ('public.pa_registro_procedencia_propia_leer(bigint,text,bigint)','3bd2bcc4a4c1b23db24ac31cddf5bdfc','jsonb')
  ) x(firma,huella,retorno) LOOP
    SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(r.firma);
    IF f.oid IS NULL OR md5(f.prosrc)<>r.huella OR f.prosecdef OR f.prokind<>'f'
      OR f.prorettype<>r.retorno::regtype OR f.provolatile<>'v' OR f.proretset
      OR f.proisstrict OR f.proleakproof OR f.proparallel<>'u' OR f.pronargdefaults<>0
      OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR f.proconfig IS DISTINCT FROM (CASE WHEN r.retorno='text'
        THEN ARRAY['search_path=pg_catalog, public']::text[]
        ELSE ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[] END) THEN
      RAISE EXCEPTION 'T5_ADMIN_PROCEDENCIA_ANTECEDENTE_INCOMPATIBLE: %',r.firma;
    END IF;
    IF NOT has_function_privilege('service_role',f.oid,'EXECUTE')
      OR has_function_privilege('anon',f.oid,'EXECUTE')
      OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T5_ADMIN_PROCEDENCIA_ANTECEDENTE_EXPUESTO: %',r.firma;
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('registro_plantacion','id','bigint'),
    ('registro_plantacion','cantidad_total_plantada','integer'),
    ('registro_plantacion_detalle','id','bigint'),
    ('registro_plantacion_detalle','registro_plantacion_id','bigint'),
    ('registro_plantacion_detalle','asignacion_id','bigint'),
    ('registro_plantacion_detalle','lote_vivero_id','bigint'),
    ('registro_plantacion_detalle','planta_id','bigint'),
    ('registro_plantacion_detalle','cantidad','integer'),
    ('registro_plantacion_detalle','nombre_cientifico_snapshot','text'),
    ('registro_plantacion_detalle','nombre_comercial_snapshot','text'),
    ('registro_plantacion_detalle','variedad_snapshot','text'),
    ('lote_vivero','codigo_trazabilidad','text'),
    ('lote_vivero','recoleccion_id','bigint'),
    ('vivero_incorporacion','evento_id','bigint'),
    ('vivero_incorporacion','modalidad','text'),
    ('vivero_incorporacion','procedencia','text')
  ) x(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||r.tabla)
      AND attname=r.columna AND atttypid=r.tipo::regtype AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T5_ADMIN_PROCEDENCIA_CATALOGO_INCOMPATIBLE: %.%',r.tabla,r.columna;
    END IF;
  END LOOP;
  v_firma:=to_regprocedure('public.pa_registro_procedencia_administrativa_leer(bigint,text,bigint)');
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pa_registro_procedencia_administrativa_leer'
      AND (v_firma IS NULL OR p.oid<>v_firma::oid)) THEN
    RAISE EXCEPTION 'T5_ADMIN_PROCEDENCIA_SOBRECARGA_INESPERADA';
  END IF;
  SELECT * INTO f FROM pg_proc WHERE oid=v_firma;
  IF f.oid IS NOT NULL THEN
    IF md5(f.prosrc)<>'aca676bd620b720d970756d7a13bc473' OR f.prosecdef OR f.prokind<>'f'
      OR f.prorettype<>'jsonb'::regtype OR f.provolatile<>'v' OR f.proretset
      OR f.proisstrict OR f.proleakproof OR f.proparallel<>'u' OR f.pronargdefaults<>0
      OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR f.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
      OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[] THEN
      RAISE EXCEPTION 'T5_ADMIN_PROCEDENCIA_FUNCION_INCOMPATIBLE';
    END IF;
    IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
      OR has_function_privilege('anon',f.oid,'EXECUTE')
      OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T5_ADMIN_PROCEDENCIA_FUNCION_EXPUESTA';
    END IF;
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.pa_registro_procedencia_administrativa_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v public.registro_plantacion%ROWTYPE; v_consumos JSONB;
BEGIN
  -- Identidad, actividad y ADMIN global bajo SHARE de cuenta, antes de revelar
  -- existencia del registro; comparte la disciplina de cambios de autoridad072.
  IF public.pa_lecturas_actor(p_actor_id,p_auth_id) IS DISTINCT FROM 'ADMIN' THEN
    PERFORM public.pa_r_error(403,'CAPACIDAD_INSUFICIENTE','No tiene capacidad para esta operación.');
  END IF;
  SELECT * INTO v FROM public.registro_plantacion WHERE id=p_registro_id FOR SHARE;
  IF v.id IS NULL THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
  END IF;
  -- Misma proyección mínima de103, con autorización independiente. No consulta
  -- permisos M2 ni deduce lotes por especie, stock disponible o LIFO actual.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'detalle_id',d.id::text,'asignacion_id',d.asignacion_id::text,
    'lote_vivero_id',d.lote_vivero_id::text,'codigo_lote',l.codigo_trazabilidad,
    'planta_id',d.planta_id::text,'cantidad',d.cantidad,
    'nombre_cientifico_snapshot',d.nombre_cientifico_snapshot,
    'nombre_comercial_snapshot',d.nombre_comercial_snapshot,'variedad_snapshot',d.variedad_snapshot,
    'origen',jsonb_build_object(
      'tipo',CASE WHEN i.evento_id IS NOT NULL THEN 'INCORPORACION'
        WHEN l.recoleccion_id IS NOT NULL THEN 'RECOLECCION' ELSE 'HISTORICO_SIN_ORIGEN' END,
      'recoleccion_id',l.recoleccion_id::text,'modalidad',i.modalidad,'procedencia',i.procedencia)
    ) ORDER BY d.id),'[]'::jsonb) INTO v_consumos
  FROM public.registro_plantacion_detalle d JOIN public.lote_vivero l ON l.id=d.lote_vivero_id
    LEFT JOIN public.evento_lote_vivero e ON e.lote_id=l.id AND e.tipo_evento='INCORPORACION'
    LEFT JOIN public.vivero_incorporacion i ON i.evento_id=e.id
  WHERE d.registro_plantacion_id=v.id;
  RETURN jsonb_build_object('data',jsonb_build_object('registro_plantacion_id',v.id::text,
    'cantidad_total_plantada',v.cantidad_total_plantada,'criterio_atribucion','CONSUMOS_PERSISTIDOS',
    'consumos',v_consumos),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

REVOKE ALL ON FUNCTION public.pa_registro_procedencia_administrativa_leer(BIGINT,TEXT,BIGINT)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_registro_procedencia_administrativa_leer(BIGINT,TEXT,BIGINT)
  TO service_role;
COMMENT ON FUNCTION public.pa_registro_procedencia_administrativa_leer(BIGINT,TEXT,BIGINT) IS
  'T5: lectura mínima ADMIN global activo de consumos persistidos, sin autoría/M2. No abre ficha/fotos M2 ni Impacto público; no modifica stock ni LIFO.';
COMMIT;
