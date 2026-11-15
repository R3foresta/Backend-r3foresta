-- T5 integración frontend: incorporación y fotos nuevas exclusivas de ADMIN global.
-- Aditiva tras108; no modifica M2/T4, roles, hechos, saldos ni fotos existentes.
-- Repetible sobre109. No reaplicar102 después de este cierre de autoridad.
-- Recuperación y replay CONFIRMADO propios conservan sólo cuenta activa.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

-- Cotejar cuerpos exactos102/109 antes de redefinir. Un helper de igual firma
-- sin el lock de cuenta no basta; drift y ACL públicas requieren revisión.
DO $preflight$
DECLARE c record; f record; rol text;
BEGIN
  IF to_regclass('public.vivero_incorporacion') IS NULL OR to_regclass('public.m2_evidencia_contexto') IS NULL THEN
    RAISE EXCEPTION 'T5_ADMIN_109_ANTECEDENTE_INCOMPATIBLE: requiere102'; END IF;
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.pa_d_cuenta(bigint)');
  IF f.oid IS NULL OR f.prosecdef OR f.proretset OR f.prorettype<>'text'::regtype
    OR f.prokind<>'f' OR f.provolatile<>'v' OR f.proisstrict OR f.proleakproof
    OR f.proparallel<>'u' OR f.pronargdefaults<>0
    OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
    OR encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'055c53cbd84b34a34fa6fd1e1734b54222b81e7cc80de17f0d74fca7252edd56' THEN
    RAISE EXCEPTION 'T5_ADMIN_109_ANTECEDENTE_INCOMPATIBLE: pa_d_cuenta077'; END IF;
  FOR c IN SELECT * FROM (VALUES
    ('public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb)',ARRAY['f7aaa4b7e0c90599ec750291ec9b5d0232aa65e881f6cfc2e3fe5c56b5192936','ee089fdcdcecf19402d692fffa62ec1831efb83040a2c003d66a1db1ed0e78cb']::text[],ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[]),
    ('public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid)',ARRAY['2f2c67f6605b0c3f484362bfcead4c2235c0d47b8a8b0e62e6f691dec21ecac6','e6c4bb0c056c719d54fbd16037d6a574400e968dbe88ea2fd40b439c0c21240b']::text[],ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[]),
    ('public.m2_incorporacion_crear(bigint,uuid,jsonb)',ARRAY['a8c18b371af2ba8631f8e3f0dc36be63ca637a16828d9e83fc38ddeb4827025f','10caed7770b0a569c4e3fa9dfa5c7bccd8854afc92699ce9a5a11400c192f374']::text[],ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s','TimeZone=America/La_Paz']::text[])
  ) x(firma,huellas,config) LOOP
    SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(c.firma);
    IF f.oid IS NULL OR NOT f.prosecdef OR f.proretset OR f.prorettype<>'jsonb'::regtype
      OR f.prokind<>'f' OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      OR f.provolatile<>'v' OR f.proisstrict OR f.proleakproof OR f.proparallel<>'u'
      OR f.pronargdefaults<>0 OR f.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
      OR f.proconfig IS DISTINCT FROM c.config
      OR NOT (encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')=ANY(c.huellas)) THEN
      RAISE EXCEPTION 'T5_ADMIN_109_ANTECEDENTE_INCOMPATIBLE: %',c.firma; END IF;
    IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
      AND p.proname=f.proname AND p.oid<>f.oid) THEN
      RAISE EXCEPTION 'T5_ADMIN_109_ANTECEDENTE_INCOMPATIBLE: sobrecarga %',c.firma; END IF;
    IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T5_ADMIN_109_ACL_INCOMPATIBLE: service_role %',c.firma; END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(rol,f.oid,'EXECUTE') THEN
        RAISE EXCEPTION 'T5_ADMIN_109_ACL_INCOMPATIBLE: % %',rol,c.firma; END IF;
    END LOOP;
  END LOOP;
END $preflight$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_evidencias_preparar(
  p_actor_id bigint,p_vivero_id bigint,p_solicitud_id uuid,p_fotos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE f jsonb; tipo bigint; eid bigint; ids jsonb:='[]';
BEGIN
  -- Cuenta SHARE coordina esta autorización con retiro de ADMIN y baja072.
  IF public.pa_d_cuenta(p_actor_id) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE: fotos de incorporación exclusivas ADMIN global' USING ERRCODE='42501'; END IF;
  IF p_solicitud_id IS NULL OR jsonb_typeof(p_fotos) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'CONTEXTO_INCORPORACION_INVALIDO' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('m2.incorporacion:'||p_solicitud_id::text,0));
  IF EXISTS(SELECT 1 FROM public.vivero_incorporacion WHERE solicitud_id=p_solicitud_id) THEN
    RAISE EXCEPTION 'SOLICITUD_YA_CONFIRMADA' USING ERRCODE='23505'; END IF;
  PERFORM 1 FROM public.vivero WHERE id=p_vivero_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VIVERO_NO_DISPONIBLE' USING ERRCODE='22023'; END IF;
  SELECT t.id INTO STRICT tipo FROM public.tipos_entidad_evidencia t WHERE upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','') NOT LIKE 'vivero/incorporaciones/'||p_actor_id||'/'||p_solicitud_id||'/%'
      OR coalesce(f->>'mime_type','') NOT IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')
      OR coalesce((f->>'tamano_bytes')::bigint,0) NOT BETWEEN 1 AND 15728640 THEN
      RAISE EXCEPTION 'FOTO_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_por_usuario_id)
    VALUES(tipo,0,'vivero_incorporaciones',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',
      (f->>'tamano_bytes')::bigint,f->>'hash_sha256',f->>'titulo',f->>'descripcion',coalesce(f->'metadata','{}'::jsonb),
      false,jsonb_array_length(ids),(f->>'tomado_en')::timestamptz,p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.m2_evidencia_contexto(evidencia_id,vivero_id,lote_id,evento,actor_id,solicitud_id)
      VALUES(eid,p_vivero_id,NULL,'INCORPORACION',p_actor_id,p_solicitud_id);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_evidencias_leer(
  p_actor_id bigint,p_vivero_id bigint,p_solicitud_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
BEGIN
  -- Cuenta SHARE coordina esta autorización con retiro de ADMIN y baja072.
  IF public.pa_d_cuenta(p_actor_id) IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE: fotos de incorporación exclusivas ADMIN global' USING ERRCODE='42501'; END IF;
  IF p_solicitud_id IS NULL THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA' USING ERRCODE='22023'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'bucket',e.bucket,
      'ruta_archivo',e.ruta_archivo,'mime_type',e.mime_type,'tipo_archivo',e.tipo_archivo,
      'es_principal',e.es_principal,'orden',e.orden) ORDER BY e.id)
    FROM public.m2_evidencia_contexto c JOIN public.evidencias_trazabilidad e ON e.id=c.evidencia_id
    JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
    WHERE c.actor_id=p_actor_id AND c.vivero_id=p_vivero_id AND c.solicitud_id=p_solicitud_id
      AND c.evento='INCORPORACION' AND c.lote_id IS NULL AND e.creado_por_usuario_id=p_actor_id
      AND e.bucket='vivero_incorporaciones' AND coalesce(e.entidad_id,0)=0 AND e.eliminado_en IS NULL
      AND upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_crear(p_actor_id bigint,p_solicitud_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
DECLARE h jsonb; i public.vivero_incorporacion; e public.evento_lote_vivero; p public.planta;
  viv bigint; pid bigint; cantidad integer; fecha date; modo text; origen text; tercero text; referencia text; notas text;
  fotos bigint[]; eid bigint; lid bigint; evento bigint; codigo text; actor_nombre text; tipo bigint; actor_rol text;
BEGIN
  -- Cuenta SHARE se conserva hasta el commit; rol/baja usan UPDATE sobre la misma fila.
  -- Replay propio sólo exige cuenta activa; una nueva clave exige ADMIN global.
  actor_rol:=public.pa_d_cuenta(p_actor_id);
  IF p_solicitud_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN
      ('vivero_id','planta_id','modalidad','procedencia','fecha_evento','cantidad','tercero_origen','referencia_documental','observaciones','evidencia_ids')) THEN
    RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
  BEGIN
    IF (p_payload->>'vivero_id') !~ '^[1-9][0-9]*$' OR (p_payload->>'planta_id') !~ '^[1-9][0-9]*$'
      OR (p_payload->>'cantidad') !~ '^[1-9][0-9]*$' OR (p_payload->>'fecha_evento') !~ '^\d{4}-\d{2}-\d{2}$'
      OR jsonb_typeof(p_payload->'evidencia_ids') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'evidencia_ids') NOT BETWEEN 1 AND 5
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'evidencia_ids') x WHERE x !~ '^[1-9][0-9]*$') THEN
      RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
    viv:=(p_payload->>'vivero_id')::bigint; pid:=(p_payload->>'planta_id')::bigint;
    cantidad:=(p_payload->>'cantidad')::integer; fecha:=(p_payload->>'fecha_evento')::date;
    SELECT array_agg(DISTINCT x::bigint ORDER BY x::bigint) INTO fotos FROM jsonb_array_elements_text(p_payload->'evidencia_ids') x;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023';
  END;
  modo:=p_payload->>'modalidad'; origen:=p_payload->>'procedencia';
  tercero:=nullif(normalize(btrim(p_payload->>'tercero_origen'),NFC),'');
  referencia:=nullif(normalize(btrim(p_payload->>'referencia_documental'),NFC),'');
  notas:=nullif(normalize(btrim(p_payload->>'observaciones'),NFC),'');
  IF viv IS NULL OR pid IS NULL OR cantidad IS NULL OR fecha IS NULL OR modo IS NULL OR origen IS NULL
    OR modo NOT IN ('RECEPCION','SALDO_INICIAL') OR origen NOT IN ('COMPRA','DONACION','PRODUCCION_PROPIA','DESCONOCIDA')
    OR (modo='RECEPCION' AND origen NOT IN ('COMPRA','DONACION'))
    OR (origen='DESCONOCIDA' AND notas IS NULL) OR char_length(tercero)>200 OR char_length(referencia)>200 OR char_length(notas)>1000
    OR cardinality(fotos) IS DISTINCT FROM jsonb_array_length(p_payload->'evidencia_ids')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['tercero_origen','referencia_documental','observaciones']) k
      WHERE p_payload ? k AND jsonb_typeof(p_payload->k) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
  h:=jsonb_build_object('version',1,'vivero_id',viv::text,'planta_id',pid::text,'modalidad',modo,'procedencia',origen,
    'fecha_evento',fecha,'cantidad',cantidad,'tercero_origen',tercero,'referencia_documental',referencia,'observaciones',notas,
    'evidencia_ids',(SELECT jsonb_agg(x::text ORDER BY x) FROM unnest(fotos) x));
  PERFORM pg_advisory_xact_lock(hashtextextended('m2.incorporacion:'||p_solicitud_id::text,0));
  SELECT * INTO i FROM public.vivero_incorporacion WHERE solicitud_id=p_solicitud_id;
  IF FOUND THEN
    SELECT * INTO STRICT e FROM public.evento_lote_vivero WHERE id=i.evento_id;
    IF e.responsable_id<>p_actor_id THEN RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
    IF i.huella_solicitud IS DISTINCT FROM h THEN RAISE EXCEPTION 'SOLICITUD_INTENCION_DISTINTA' USING ERRCODE='23505'; END IF;
    RETURN public.m2_incorporacion_recibo(e.id);
  END IF;
  IF actor_rol IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE: incorporación exclusiva ADMIN global' USING ERRCODE='42501'; END IF;
  -- SALDO_INICIAL registra el conteo actual. No abre fechas antiguas ni producción nueva libre.
  PERFORM public.fn_vivero_assert_fecha_operativa(fecha,NULL);
  SELECT * INTO p FROM public.planta WHERE id=pid AND activo FOR SHARE;
  IF NOT FOUND OR nullif(btrim(p.nombre_cientifico),'') IS NULL THEN
    RAISE EXCEPTION 'PLANTA_NO_DISPONIBLE' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.vivero WHERE id=viv;
  IF NOT FOUND THEN RAISE EXCEPTION 'VIVERO_NO_DISPONIBLE' USING ERRCODE='22023'; END IF;
  SELECT nullif(btrim(concat_ws(' ',nullif(btrim(u.nombre),''),nullif(btrim(u.apellido),''))),'')
    INTO actor_nombre FROM public.usuario u WHERE u.id=p_actor_id;
  SELECT t.id INTO STRICT tipo FROM public.tipos_entidad_evidencia t WHERE upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo;
  codigo:='VIV-INC-'||replace(p_solicitud_id::text,'-','');
  INSERT INTO public.lote_vivero(recoleccion_id,planta_id,vivero_id,responsable_id,
    nombre_cientifico_snapshot,nombre_comercial_snapshot,tipo_material_snapshot,variedad_snapshot,
    nombre_comunidad_origen_snapshot,nombre_responsable_snapshot,fecha_inicio,cantidad_inicial_en_proceso,
    unidad_medida_inicial,plantas_vivas_iniciales,saldo_vivo_actual,codigo_trazabilidad)
  VALUES(NULL,pid,viv,p_actor_id,btrim(p.nombre_cientifico),coalesce(nullif(btrim(p.nombre_comun_principal),''),btrim(p.nombre_cientifico)),
    NULL,nullif(btrim(p.variedad),''),NULL,actor_nombre,fecha,NULL,NULL,cantidad,cantidad,codigo) RETURNING id INTO lid;
  -- Lote recién creado -> fotos ASC. Contextos de otra solicitud/actor/vivero nunca se aceptan.
  FOREACH eid IN ARRAY fotos LOOP
    PERFORM 1 FROM public.evidencias_trazabilidad ev JOIN public.m2_evidencia_contexto c ON c.evidencia_id=ev.id
      WHERE ev.id=eid AND ev.tipo_entidad_id=tipo AND ev.eliminado_en IS NULL AND coalesce(ev.entidad_id,0)=0
        AND ev.creado_por_usuario_id=p_actor_id AND ev.bucket='vivero_incorporaciones'
        AND c.actor_id=p_actor_id AND c.vivero_id=viv AND c.lote_id IS NULL
        AND c.evento='INCORPORACION' AND c.solicitud_id=p_solicitud_id FOR UPDATE OF ev;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
  END LOOP;
  INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,
    unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues,observaciones)
  VALUES(lid,'INCORPORACION',fecha,p_actor_id,cantidad,'UNIDAD',0,cantidad,notas) RETURNING id INTO evento;
  INSERT INTO public.vivero_incorporacion(evento_id,modalidad,procedencia,tercero_origen,referencia_documental,solicitud_id,huella_solicitud)
    VALUES(evento,modo,origen,tercero,referencia,p_solicitud_id,h);
  UPDATE public.evidencias_trazabilidad SET entidad_id=evento,codigo_trazabilidad=codigo,
    actualizado_en=CURRENT_DATE,actualizado_por_usuario_id=p_actor_id WHERE id=ANY(fotos);
  RETURN public.m2_incorporacion_recibo(evento);
END $$;

REVOKE ALL ON FUNCTION public.m2_incorporacion_crear(bigint,uuid,jsonb),
  public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb),
  public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m2_incorporacion_crear(bigint,uuid,jsonb),
  public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb),
  public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid) TO service_role;
COMMENT ON FUNCTION public.m2_incorporacion_crear(bigint,uuid,jsonb) IS
  'T5/109: nueva clave sólo ADMIN global activo bajo lock de cuenta; replay propio confirmado sólo requiere cuenta activa, incluso sin ADMIN/M2.';
COMMENT ON FUNCTION public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb) IS
  'T5/109: fotos pendientes nuevas sólo ADMIN global activo; cuenta SHARE antes de solicitud/fotos.';
COMMENT ON FUNCTION public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid) IS
  'T5/109: pendientes propias sólo ADMIN global activo; no amplía lectura del recibo histórico.';
COMMIT;
