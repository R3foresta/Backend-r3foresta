-- RF-PLA-02: código histórico048 + BORRADOR + BORRADOR_CREADO en un único commit.
-- Requiere028/029/037/047/048 y ACL privadas de cuenta/campaña/subcampaña/historial.
-- Aditiva y repetible; no modifica filas, códigos ni auditoría existentes.
-- Instalar/cotejar en destino antes de publicar el backend consumidor.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
DECLARE v_f record; v_tabla text; v_secuencia text;
BEGIN
  PERFORM u.id, u.auth_id, u.rol, u.activo FROM public.usuario u LIMIT 0;
  PERFORM c.id, c.tipo, c.codigo_trazabilidad, c.deleted_at FROM public.campania c LIMIT 0;
  PERFORM s.id, s.campania_id, s.nombre, s.descripcion, s.tipo, s.estado, s.zona_id,
    s.meta_total_arboles, s.fecha_estimada_inicio, s.fecha_estimada_fin,
    s.tolerancia_gps_metros, s.codigo_trazabilidad, s.created_by, s.updated_by, s.created_at
    FROM public.subcampania s LIMIT 0;
  PERFORM h.subcampania_id, h.tipo_historial, h.estado_origen, h.estado_destino,
    h.metadata, h.actor_user_id FROM public.subcampania_historial h LIMIT 0;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.tipo_historial_subcampania'::regtype
      AND enumlabel='BORRADOR_CREADO') THEN
    RAISE EXCEPTION 'SUBCAMPANIA_112: cotejar historial047.';
  END IF;
  SELECT * INTO v_f FROM pg_proc WHERE oid=to_regprocedure('public.fn_generar_codigo_subcampania(integer)');
  IF v_f.oid IS NULL OR v_f.prokind<>'f' OR v_f.prorettype<>'text'::regtype OR v_f.proretset OR v_f.prosecdef THEN
    RAISE EXCEPTION 'SUBCAMPANIA_112: cotejar generador048 privado SECURITY INVOKER.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (
      (p.proname='fn_generar_codigo_subcampania' AND p.oid<>v_f.oid) OR
      (p.proname='pa_d_subcampania_crear' AND p.oid IS DISTINCT FROM
        to_regprocedure('public.pa_d_subcampania_crear(text,jsonb)')::oid)
    )
  ) THEN
    RAISE EXCEPTION 'SUBCAMPANIA_112: sobrecarga desconocida. Cotejar el catálogo.';
  END IF;
  -- FOR SHARE/UPDATE y SECURITY INVOKER requieren privilegios privados previos.
  -- No se amplían permisos de tablas/secuencias para habilitar la nueva RPC.
  FOREACH v_tabla IN ARRAY ARRAY['usuario','campania','subcampania'] LOOP
    IF NOT has_table_privilege('service_role','public.'||v_tabla,'SELECT')
      OR (v_tabla<>'subcampania' AND NOT has_any_column_privilege('service_role','public.'||v_tabla,'UPDATE')) THEN
      RAISE EXCEPTION 'SUBCAMPANIA_112: cotejar SELECT/lock privado de %.',v_tabla;
    END IF;
  END LOOP;
  FOREACH v_tabla IN ARRAY ARRAY['subcampania','subcampania_historial'] LOOP
    IF NOT has_table_privilege('service_role','public.'||v_tabla,'INSERT') THEN
      RAISE EXCEPTION 'SUBCAMPANIA_112: cotejar INSERT privado de %.',v_tabla;
    END IF;
    v_secuencia:=pg_get_serial_sequence('public.'||v_tabla,'id');
    IF v_secuencia IS NULL OR NOT has_sequence_privilege('service_role',v_secuencia,'USAGE') THEN
      RAISE EXCEPTION 'SUBCAMPANIA_112: cotejar secuencia privada de %.',v_tabla;
    END IF;
  END LOOP;
END $preflight$;

CREATE OR REPLACE FUNCTION public.fn_generar_codigo_subcampania(p_campania_id INT)
RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE v_codigo_campania text; v_siguiente numeric; v_correlativo text;
BEGIN
  -- Reentrante cuando lo invoca el alta; la campaña se lee después de su lock.
  SELECT c.codigo_trazabilidad INTO v_codigo_campania
  FROM public.campania c WHERE c.id=p_campania_id FOR UPDATE;
  IF NOT FOUND OR v_codigo_campania IS NULL THEN
    RAISE EXCEPTION 'CAMPANIA % no existe',p_campania_id USING ERRCODE='P0002';
  END IF;
  SELECT coalesce(max(CASE WHEN s.codigo_trazabilidad ~ '^SUB-[0-9]+-'
      THEN split_part(s.codigo_trazabilidad,'-',2)::numeric END),0)+1
  INTO v_siguiente FROM public.subcampania s WHERE s.campania_id=p_campania_id;
  -- lpad(text,3) trunca1000 a100; tres dígitos es un mínimo, nunca un máximo.
  v_correlativo:=v_siguiente::text;
  RETURN 'SUB-'||lpad(v_correlativo,greatest(3,length(v_correlativo)),'0')||'-'||v_codigo_campania;
END $$;
COMMENT ON FUNCTION public.fn_generar_codigo_subcampania(INT) IS
  'MAX histórico048 por campaña, incluidos soft-deleted; mínimo3 dígitos sin truncar1000. Invocar dentro de la transacción de alta (campaña FOR UPDATE). No reserva código por sí sola.';

CREATE OR REPLACE FUNCTION public.pa_d_subcampania_crear(p_auth_id TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_actor public.usuario%ROWTYPE; v_campania public.campania%ROWTYPE;
  v_sub public.subcampania%ROWTYPE; v_campania_id integer; v_inicio date; v_fin date;
  v_codigo text;
BEGIN
  -- El backend pasa auth_id del Bearer verificado; nunca un actor del body.
  -- Cuenta SHARE -> campaña UPDATE -> hija nueva. Rol/baja072 toman cuenta UPDATE;
  -- desactivación/cancelación077 toman campaña antes de sus hijas y stock.
  SELECT * INTO v_actor FROM public.usuario WHERE auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario de la sesión no existe.' USING ERRCODE='PT401';
  END IF;
  IF v_actor.activo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE='PT403';
  END IF;
  IF upper(v_actor.rol::text) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo el rol ADMIN puede realizar esta operación.' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR
    (p_payload-ARRAY['campania_id','nombre','descripcion','zona_id','meta_total_arboles',
      'fecha_estimada_inicio','fecha_estimada_fin','tolerancia_gps_metros'])<>'{}'::jsonb THEN
    RAISE EXCEPTION 'Datos inválidos para crear la subcampaña.' USING ERRCODE='22023';
  END IF;
  -- Mantener precedencia ADMIN -> coherencia temporal -> campaña. No se añade
  -- restricción de fechas futuras a la admisión vigente de este endpoint.
  v_inicio:=(p_payload->>'fecha_estimada_inicio')::date;
  v_fin:=(p_payload->>'fecha_estimada_fin')::date;
  IF v_fin<v_inicio THEN
    RAISE EXCEPTION 'fecha_estimada_fin no puede ser anterior a fecha_estimada_inicio.' USING ERRCODE='22023';
  END IF;
  v_campania_id:=(p_payload->>'campania_id')::integer;
  SELECT * INTO v_campania FROM public.campania
    WHERE id=v_campania_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaña con id % no encontrada',v_campania_id USING ERRCODE='P0002';
  END IF;
  -- El MAX histórico se obtiene con el lock retenido hasta el INSERT/historial
  -- y commit. No hay una llamada REST independiente que libere este lock.
  v_codigo:=public.fn_generar_codigo_subcampania(v_campania_id);
  INSERT INTO public.subcampania(campania_id,nombre,descripcion,tipo,estado,zona_id,
    meta_total_arboles,fecha_estimada_inicio,fecha_estimada_fin,tolerancia_gps_metros,
    codigo_trazabilidad,created_by,updated_by)
  VALUES(v_campania.id,p_payload->>'nombre',p_payload->>'descripcion',v_campania.tipo,'BORRADOR',
    (p_payload->>'zona_id')::bigint,(p_payload->>'meta_total_arboles')::integer,v_inicio,v_fin,
    coalesce((p_payload->>'tolerancia_gps_metros')::integer,50),v_codigo,v_actor.id,v_actor.id)
  RETURNING * INTO v_sub;
  INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,estado_origen,
    estado_destino,metadata,actor_user_id)
  VALUES(v_sub.id,'BORRADOR_CREADO',NULL,'BORRADOR',jsonb_build_object(
    'codigo_trazabilidad',v_sub.codigo_trazabilidad,'campania_id',v_sub.campania_id,
    'zona_id',v_sub.zona_id,'meta_total_arboles',v_sub.meta_total_arboles),v_actor.id);
  -- Misma proyección HTTP vigente; los snapshots oficiales siguen congelándose
  -- al activar y no se copian permisos, equipo ni organizaciones al crear.
  RETURN jsonb_build_object('id',v_sub.id,'campania_id',v_sub.campania_id,'nombre',v_sub.nombre,
    'tipo',v_sub.tipo,'estado',v_sub.estado,'zona_id',v_sub.zona_id,
    'meta_total_arboles',v_sub.meta_total_arboles,'codigo_trazabilidad',v_sub.codigo_trazabilidad,
    'descripcion',v_sub.descripcion,'fecha_estimada_inicio',v_sub.fecha_estimada_inicio,
    'fecha_estimada_fin',v_sub.fecha_estimada_fin,'tolerancia_gps_metros',v_sub.tolerancia_gps_metros,
    'created_at',v_sub.created_at);
END $$;

REVOKE ALL ON FUNCTION public.fn_generar_codigo_subcampania(INT),
  public.pa_d_subcampania_crear(TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_generar_codigo_subcampania(INT),
  public.pa_d_subcampania_crear(TEXT,JSONB) TO service_role;
DO $postflight$
DECLARE v_f regprocedure;
BEGIN
  FOREACH v_f IN ARRAY ARRAY['public.fn_generar_codigo_subcampania(integer)'::regprocedure,
    'public.pa_d_subcampania_crear(text,jsonb)'::regprocedure] LOOP
    IF has_function_privilege('anon',v_f::oid,'EXECUTE')
      OR has_function_privilege('authenticated',v_f::oid,'EXECUTE')
      OR NOT has_function_privilege('service_role',v_f::oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SUBCAMPANIA_112: ACL heredada incompatible en %. Cotejar permisos.',v_f;
    END IF;
  END LOOP;
END $postflight$;
NOTIFY pgrst,'reload schema';
COMMIT;
