-- Revisión T5: reposición interna con IDs exactos antes del transporte JSON.
-- No modifica 077, inicial 075, LIFO, stock, autoridad ni orden de locks.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE p RECORD; q RECORD; rol TEXT;
BEGIN
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(
    'public.fn_m3_registrar_plantacion(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])');
  IF p.oid IS NULL OR md5(p.prosrc)<>'dc6938d1a1ec8cec18aad46ccaf6ecb0' OR p.prosecdef
    OR NOT p.proretset OR p.prorettype<>'record'::regtype
    OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp','lock_timeout=5s','statement_timeout=30s']::text[]
      AND p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp','lock_timeout=5s','statement_timeout=30s','TimeZone=America/La_Paz']::text[] THEN
    RAISE EXCEPTION 'T5_M3_IDS_ANTECEDENTE_077_INCOMPATIBLE';
  END IF;
  SELECT * INTO q FROM pg_proc WHERE oid=to_regprocedure(
    'public.fn_m3_registrar_plantacion_exacto(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])');
  IF q.oid IS NOT NULL THEN
    IF md5(q.prosrc)<>'2746d56071ac674fdd6f0dd6ca72d9db' OR q.prosecdef OR q.prokind<>'f' OR NOT q.proretset
      OR q.prorettype<>'record'::regtype OR q.provolatile<>'v' OR q.proisstrict OR q.proleakproof
      OR q.proparallel<>'u' OR q.pronargdefaults<>0
      OR q.prolang<>(SELECT oid FROM pg_language WHERE lanname='sql')
      OR q.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
      OR q.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s','TimeZone=America/La_Paz']::text[] THEN
      RAISE EXCEPTION 'T5_M3_IDS_WRAPPER_INCOMPATIBLE';
    END IF;
    IF EXISTS(SELECT 1 FROM aclexplode(coalesce(q.proacl,acldefault('f',q.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
      RAISE EXCEPTION 'T5_M3_IDS_WRAPPER_PUBLICO';
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(rol,q.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'T5_M3_IDS_WRAPPER_EXPUESTO: %',rol;
      END IF;
    END LOOP;
  END IF;
END $preflight$;

DO $preflight_evidencias$
DECLARE p RECORD; rol TEXT;
BEGIN
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.pa_d_evidencias_reposicion(bigint,bigint,text,jsonb)');
  IF p.oid IS NULL OR md5(p.prosrc)<>'346ecf005d644bc38d4440c93e70263f' OR p.prosecdef OR p.prorettype<>'jsonb'::regtype THEN
    RAISE EXCEPTION 'T5_M3_IDS_EVIDENCIAS_079_INCOMPATIBLE';
  END IF;
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.pa_d_evidencias_reposicion_exacto(bigint,bigint,text,jsonb)');
  IF p.oid IS NOT NULL THEN
    IF md5(p.prosrc)<>'0ab404a494ed94b7e7815399fa92d531' OR p.prosecdef OR p.prorettype<>'jsonb'::regtype OR p.proretset
      OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
      OR p.pronargdefaults<>1 OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM '''{}''::jsonb'
      OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
      OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[] THEN
      RAISE EXCEPTION 'T5_M3_IDS_EVIDENCIAS_WRAPPER_INCOMPATIBLE';
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(rol,p.oid,'EXECUTE') THEN RAISE EXCEPTION 'T5_M3_IDS_EVIDENCIAS_WRAPPER_EXPUESTO'; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'T5_M3_IDS_EVIDENCIAS_WRAPPER_PUBLICO'; END IF;
  END IF;
END $preflight_evidencias$;

CREATE OR REPLACE FUNCTION public.fn_m3_registrar_plantacion_exacto(
  p_subcampania_id                BIGINT,
  p_es_reposicion                 BOOLEAN,
  p_registro_plantacion_origen_id BIGINT,
  p_fecha_plantacion              DATE,
  p_responsable_id                BIGINT,
  p_latitud                       NUMERIC,
  p_longitud                      NUMERIC,
  p_observaciones                 TEXT,
  p_coresponsable_ids             BIGINT[],
  p_detalles                      JSONB,
  p_evidencia_ids                 BIGINT[]
) RETURNS TABLE (
  registro_plantacion_id TEXT,
  codigo_trazabilidad TEXT,
  cantidad_total_plantada INT,
  gps_dentro_poligono BOOLEAN,
  gps_distancia_a_poligono_m NUMERIC,
  consumos JSONB,
  coresponsable_ids_vinculados TEXT[],
  evidencia_ids_vinculadas TEXT[]
) LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
  SELECT r.registro_plantacion_id::text,r.codigo_trazabilidad,r.cantidad_total_plantada,
    r.gps_dentro_poligono,r.gps_distancia_a_poligono_m,
    coalesce((SELECT jsonb_agg(c.value || jsonb_build_object(
      'asignacion_id',c.value->>'asignacion_id',
      'lote_vivero_id',c.value->>'lote_vivero_id') ORDER BY c.ordinality)
      FROM jsonb_array_elements(r.consumos) WITH ORDINALITY c(value,ordinality)),'[]'::jsonb),
    r.coresponsable_ids_vinculados::text[],r.evidencia_ids_vinculadas::text[]
  FROM public.fn_m3_registrar_plantacion(p_subcampania_id,p_es_reposicion,p_registro_plantacion_origen_id,p_fecha_plantacion,p_responsable_id,p_latitud,p_longitud,p_observaciones,p_coresponsable_ids,p_detalles,p_evidencia_ids) r
$$;

REVOKE ALL ON FUNCTION public.fn_m3_registrar_plantacion_exacto(BIGINT,BOOLEAN,BIGINT,DATE,BIGINT,NUMERIC,NUMERIC,TEXT,BIGINT[],JSONB,BIGINT[])
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_m3_registrar_plantacion_exacto(BIGINT,BOOLEAN,BIGINT,DATE,BIGINT,NUMERIC,NUMERIC,TEXT,BIGINT[],JSONB,BIGINT[])
  TO service_role;
DO $postflight$
DECLARE rol TEXT;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(rol,
      'public.fn_m3_registrar_plantacion_exacto(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])','EXECUTE') THEN
      RAISE EXCEPTION 'T5_M3_IDS_PRIVILEGIO_HEREDADO: %',rol;
    END IF;
  END LOOP;
END $postflight$;
COMMENT ON FUNCTION public.fn_m3_registrar_plantacion_exacto(BIGINT,BOOLEAN,BIGINT,DATE,BIGINT,NUMERIC,NUMERIC,TEXT,BIGINT[],JSONB,BIGINT[]) IS
  'T5 revisión: una ejecución de reposición interna077 con IDs/arrays TEXT y consumos JSONB con IDs en cadenas antes de serializar. Misma autoridad y transacción; no crea idempotencia ni modifica inicial075.';
CREATE OR REPLACE FUNCTION public.pa_d_evidencias_reposicion_exacto(
  p_actor_id BIGINT,p_subcampania_id BIGINT,p_accion TEXT,p_payload JSONB DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE payload JSONB:=p_payload;
BEGIN
  -- 079 recibe números JSON en DESCARTAR; convertir aquí conserva BIGINT antes
  -- del transporte y deja su autorización/locks/efectos en la misma llamada.
  IF p_accion='DESCARTAR' AND jsonb_typeof(p_payload->'evidencia_ids')='array' THEN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'evidencia_ids') x
      WHERE jsonb_typeof(x) NOT IN ('string','number') OR (x#>>'{}') !~ '^[1-9][0-9]{0,18}$') THEN
      RAISE EXCEPTION 'EVIDENCIA_ID_INEXACTO' USING ERRCODE='22023';
    END IF;
    payload:=jsonb_set(p_payload,'{evidencia_ids}',coalesce((SELECT jsonb_agg(to_jsonb((x#>>'{}')::bigint))
      FROM jsonb_array_elements(p_payload->'evidencia_ids') x),'[]'::jsonb));
  END IF;
  RETURN public.pa_d_evidencias_reposicion(p_actor_id,p_subcampania_id,p_accion,payload);
END
$$;
REVOKE ALL ON FUNCTION public.pa_d_evidencias_reposicion_exacto(BIGINT,BIGINT,TEXT,JSONB)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pa_d_evidencias_reposicion_exacto(BIGINT,BIGINT,TEXT,JSONB) TO service_role;
DO $acl_evidencias$
BEGIN
  IF has_function_privilege('anon','public.pa_d_evidencias_reposicion_exacto(bigint,bigint,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.pa_d_evidencias_reposicion_exacto(bigint,bigint,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'T5_M3_IDS_EVIDENCIAS_PRIVILEGIO_HEREDADO';
  END IF;
END $acl_evidencias$;
NOTIFY pgrst,'reload schema';
COMMIT;
