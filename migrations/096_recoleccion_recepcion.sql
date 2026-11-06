-- T4 local. No backfill, entradas de stock ni cambios a movimientos/lotes/M3.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF to_regprocedure('public.m2_exigir_vivero(bigint,bigint)') IS NULL
    OR to_regprocedure('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'T4_CATALOGO_INCOMPATIBLE: requiere 095'; END IF;
  PERFORM revision_captura,usuario_validacion_id,fecha_validacion FROM public.recoleccion LIMIT 0;
  PERFORM delta,created_by FROM public.recoleccion_movimiento LIMIT 0;
END $$;

INSERT INTO public.tipos_entidad_evidencia(codigo,descripcion,activo)
  VALUES('RECOLECCION_RECEPCION','Comprobación física de recepción de material M1',true)
  ON CONFLICT(codigo) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tipos_entidad_evidencia WHERE codigo='RECOLECCION_RECEPCION' AND activo) THEN
    RAISE EXCEPTION 'T4_CATALOGO_INCOMPATIBLE: tipo de evidencia de recepción inactivo'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.recoleccion_recepcion_comando(
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  comando_id uuid NOT NULL,
  intencion jsonb NOT NULL CHECK(jsonb_typeof(intencion)='object'),
  http_status integer NOT NULL CHECK(http_status IN (200,403,404,409,422)),
  recibo jsonb NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor_id,comando_id)
);
CREATE TABLE IF NOT EXISTS public.recoleccion_recepcion_observacion(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recoleccion_id bigint NOT NULL REFERENCES public.recoleccion(id) ON DELETE RESTRICT,
  vivero_id bigint NOT NULL REFERENCES public.vivero(id) ON DELETE RESTRICT,
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  comando_id uuid NOT NULL,
  clase text NOT NULL CHECK(clase IN ('INCIDENCIA','CONFORME')),
  cantidad_declarada numeric NOT NULL CHECK(cantidad_declarada>0),
  unidad_declarada public.unidad_medida NOT NULL,
  cantidad_observada numeric NOT NULL CHECK(cantidad_observada>0 AND cantidad_observada::text NOT IN ('NaN','Infinity','-Infinity')),
  unidad_observada public.unidad_medida NOT NULL CHECK(unidad_observada::text IN ('G','UNIDAD')),
  fecha_recepcion date NOT NULL,
  incidencia_id bigint UNIQUE REFERENCES public.recoleccion_recepcion_observacion(id) ON DELETE RESTRICT,
  motivo_resolucion text,
  revision_anterior bigint NOT NULL CHECK(revision_anterior>=0),
  revision_nueva bigint NOT NULL CHECK(revision_nueva=revision_anterior+1),
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(actor_id,comando_id),
  FOREIGN KEY(actor_id,comando_id) REFERENCES public.recoleccion_recepcion_comando(actor_id,comando_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK((incidencia_id IS NULL AND motivo_resolucion IS NULL) OR
    (clase='CONFORME' AND incidencia_id IS NOT NULL AND char_length(btrim(motivo_resolucion)) BETWEEN 10 AND 500))
);
CREATE INDEX IF NOT EXISTS recepcion_observacion_origen ON public.recoleccion_recepcion_observacion(recoleccion_id,id);
CREATE TABLE IF NOT EXISTS public.recoleccion_recepcion(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recoleccion_id bigint NOT NULL UNIQUE REFERENCES public.recoleccion(id) ON DELETE RESTRICT,
  vivero_id bigint NOT NULL REFERENCES public.vivero(id) ON DELETE RESTRICT,
  cantidad_recibida numeric NOT NULL CHECK(cantidad_recibida>0 AND cantidad_recibida::text NOT IN ('NaN','Infinity','-Infinity')),
  unidad_recibida public.unidad_medida NOT NULL CHECK(unidad_recibida::text IN ('G','UNIDAD')),
  fecha_recepcion date NOT NULL,
  recibido_por bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  comando_id uuid NOT NULL,
  observacion_id bigint NOT NULL UNIQUE REFERENCES public.recoleccion_recepcion_observacion(id) ON DELETE RESTRICT
);
-- Contexto inmutable de cada carga; el vínculo también es append-only.
CREATE TABLE IF NOT EXISTS public.recoleccion_recepcion_evidencia_contexto(
  evidencia_id bigint PRIMARY KEY REFERENCES public.evidencias_trazabilidad(id) ON DELETE RESTRICT,
  recoleccion_id bigint NOT NULL REFERENCES public.recoleccion(id) ON DELETE RESTRICT,
  vivero_id bigint NOT NULL REFERENCES public.vivero(id) ON DELETE RESTRICT,
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.recoleccion_recepcion_evidencia(
  evidencia_id bigint PRIMARY KEY REFERENCES public.recoleccion_recepcion_evidencia_contexto(evidencia_id) ON DELETE RESTRICT,
  observacion_id bigint NOT NULL REFERENCES public.recoleccion_recepcion_observacion(id) ON DELETE RESTRICT
);

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('recoleccion_recepcion','id','bigint',true),('recoleccion_recepcion','recoleccion_id','bigint',true),
    ('recoleccion_recepcion','vivero_id','bigint',true),('recoleccion_recepcion','recibido_por','bigint',true),
    ('recoleccion_recepcion','cantidad_recibida','numeric',true),('recoleccion_recepcion','unidad_recibida','public.unidad_medida',true),
    ('recoleccion_recepcion','fecha_recepcion','date',true),('recoleccion_recepcion','registrado_en','timestamp with time zone',true),
    ('recoleccion_recepcion','comando_id','uuid',true),('recoleccion_recepcion','observacion_id','bigint',true),
    ('recoleccion_recepcion_comando','actor_id','bigint',true),('recoleccion_recepcion_comando','comando_id','uuid',true),
    ('recoleccion_recepcion_comando','intencion','jsonb',true),('recoleccion_recepcion_comando','recibo','jsonb',true),
    ('recoleccion_recepcion_comando','http_status','integer',true),
    ('recoleccion_recepcion_observacion','revision_anterior','bigint',true),('recoleccion_recepcion_observacion','revision_nueva','bigint',true),
    ('recoleccion_recepcion_observacion','clase','text',true),('recoleccion_recepcion_observacion','incidencia_id','bigint',false),
    ('recoleccion_recepcion_observacion','motivo_resolucion','text',false),
    ('recoleccion_recepcion_evidencia_contexto','evidencia_id','bigint',true),('recoleccion_recepcion_evidencia_contexto','actor_id','bigint',true),
    ('recoleccion_recepcion_evidencia_contexto','recoleccion_id','bigint',true),('recoleccion_recepcion_evidencia_contexto','vivero_id','bigint',true),
    ('recoleccion_recepcion_evidencia','evidencia_id','bigint',true),('recoleccion_recepcion_evidencia','observacion_id','bigint',true)
  ) v(tabla,col,tipo,obligatorio) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||c.tabla)::regclass AND attname=c.col
      AND atttypid=c.tipo::regtype AND attnotnull=c.obligatorio AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T4_CATALOGO_INCOMPATIBLE: %.%',c.tabla,c.col; END IF;
  END LOOP;
END $$;

DO $$ DECLARE t text; c record; BEGIN
  FOREACH t IN ARRAY ARRAY['recoleccion_recepcion_comando','recoleccion_recepcion_observacion','recoleccion_recepcion',
    'recoleccion_recepcion_evidencia_contexto','recoleccion_recepcion_evidencia'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    FOR c IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON public.%I FROM PUBLIC,anon,authenticated,service_role',c.attname,t);
    END LOOP;
    EXECUTE format('DROP TRIGGER IF EXISTS recepcion_inmutable ON public.%I',t);
    EXECUTE format('CREATE TRIGGER recepcion_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.fn_subcampania_historial_prevent_mutation()',t);
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) rol
      WHERE has_any_column_privilege(rol,('public.'||t)::regclass,'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege(rol,('public.'||t)::regclass,'DELETE,TRUNCATE,TRIGGER')) THEN
      RAISE EXCEPTION 'T4_PRIVILEGIO_TABLA_INESPERADO: %',t; END IF;
  END LOOP;
END $$;
-- Solo proyección privada M1 por el servicio; no DML ni acceso público.
GRANT SELECT ON public.recoleccion_recepcion TO service_role;

CREATE OR REPLACE FUNCTION public.m1_recepcion_exigir_objeto(p_actor bigint,p_origen bigint)
RETURNS public.recoleccion LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion;
BEGIN
  PERFORM public.m1_exigir_actor(p_actor,false);
  SELECT * INTO r FROM public.recoleccion WHERE id=p_origen AND eliminado_en IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORIGEN_NO_DISPONIBLE' USING ERRCODE='P0002'; END IF;
  PERFORM public.m2_exigir_vivero(p_actor,r.vivero_id);
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_evidencias_preparar(p_actor_id bigint,p_recoleccion_id bigint,p_fotos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; f jsonb; tipo bigint; eid bigint; ids jsonb:='[]';
BEGIN
  r:=public.m1_recepcion_exigir_objeto(p_actor_id,p_recoleccion_id);
  IF r.usuario_id=p_actor_id THEN RAISE EXCEPTION 'AUTORRECEPCION_PROHIBIDA' USING ERRCODE='42501'; END IF;
  IF r.estado_registro::text NOT IN ('PENDIENTE_VALIDACION','VALIDADO')
    OR EXISTS(SELECT 1 FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id) THEN
    RAISE EXCEPTION 'ESTADO_NO_RECEPCIONABLE' USING ERRCODE='P0001'; END IF;
  IF jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
  SELECT id INTO STRICT tipo FROM public.tipos_entidad_evidencia WHERE upper(codigo)='RECOLECCION_RECEPCION' AND activo;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','') NOT LIKE 'recepcion/pendientes/'||p_actor_id||'/'||r.id||'/%'
      OR coalesce(f->>'mime_type','') NOT LIKE 'image/%' OR coalesce((f->>'tamano_bytes')::bigint,0)<=0 THEN
      RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,metadata,es_principal,orden,creado_por_usuario_id)
    VALUES(tipo,0,'recoleccion_fotos',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',
      (f->>'tamano_bytes')::bigint,f->>'hash_sha256','Comprobación física de recepción',
      jsonb_build_object('origen','T4_RECEPCION'),false,jsonb_array_length(ids),p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.recoleccion_recepcion_evidencia_contexto(evidencia_id,recoleccion_id,vivero_id,actor_id)
      VALUES(eid,r.id,r.vivero_id,p_actor_id);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_ejecutar(p_actor_id bigint,p_auth_id text,p_comando_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; previo public.recoleccion_recepcion_comando; obs bigint; recepcion bigint;
  origen bigint; rev bigint; cantidad numeric; unidad text; fecha date; incidencia bigint; abierta bigint;
  motivo text; eid bigint; ids bigint[]; n integer; conforme boolean; recibo jsonb; resultado jsonb;
  status integer:=200; estado text; codigo text; dia date:=(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  planta jsonb; recolector jsonb; nombre text; error_estado text;
BEGIN
  -- Cuenta primero: comparte serialización con retiro094 y rol/baja072.
  PERFORM 1 FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id AND activo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_DISPONIBLE' USING ERRCODE='42501'; END IF;
  IF p_comando_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('T4:'||p_actor_id||':'||p_comando_id,0));
  SELECT * INTO previo FROM public.recoleccion_recepcion_comando WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  IF FOUND THEN
    IF previo.intencion IS DISTINCT FROM p_payload THEN
      RETURN jsonb_build_object('http_status',409,'body',jsonb_build_object('comando_id',p_comando_id,
        'estado','CONFLICTO_CLAVE','resultado',NULL,'error',jsonb_build_object('codigo','CLAVE_REUTILIZADA'),'finalizado_en',NULL));
    END IF;
    RETURN jsonb_build_object('http_status',previo.http_status,'body',previo.recibo);
  END IF;
  BEGIN
    IF (p_payload-ARRAY['recoleccion_id','revision_esperada','cantidad_recibida','unidad_recibida','fecha_recepcion',
      'evidencia_ids','incidencia_id','motivo_resolucion'])<>'{}'::jsonb
      OR jsonb_typeof(p_payload->'recoleccion_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_payload->'revision_esperada') IS DISTINCT FROM 'string'
      OR coalesce(p_payload->>'recoleccion_id','') !~ '^[1-9][0-9]*$'
      OR coalesce(p_payload->>'revision_esperada','') !~ '^(0|[1-9][0-9]*)$'
      OR jsonb_typeof(p_payload->'cantidad_recibida') IS DISTINCT FROM 'number'
      OR coalesce(p_payload->>'fecha_recepcion','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
    origen:=(p_payload->>'recoleccion_id')::bigint; rev:=(p_payload->>'revision_esperada')::bigint;
    r:=public.m1_recepcion_exigir_objeto(p_actor_id,origen);
    IF r.usuario_id=p_actor_id THEN RAISE EXCEPTION 'AUTORRECEPCION_PROHIBIDA' USING ERRCODE='42501'; END IF;
    IF rev<>r.revision_captura OR rev=9223372036854775807 THEN
      RAISE EXCEPTION 'REVISION_OBSOLETA' USING ERRCODE='P0001'; END IF;
    IF r.estado_registro::text NOT IN ('PENDIENTE_VALIDACION','VALIDADO')
      OR EXISTS(SELECT 1 FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id) THEN
      RAISE EXCEPTION 'ESTADO_NO_RECEPCIONABLE' USING ERRCODE='P0001'; END IF;
    IF EXISTS(SELECT 1 FROM public.recoleccion_movimiento WHERE recoleccion_id=r.id)
      OR EXISTS(SELECT 1 FROM public.lote_vivero WHERE recoleccion_id=r.id)
      OR r.fecha<dia-45 OR r.fecha>dia OR r.saldo_actual IS DISTINCT FROM r.cantidad_inicial_canonica THEN
      RAISE EXCEPTION 'CONCILIACION_HISTORICA_REQUERIDA' USING ERRCODE='P0001'; END IF;
    cantidad:=(p_payload->>'cantidad_recibida')::numeric; unidad:=p_payload->>'unidad_recibida';
    IF unidad='KG' THEN cantidad:=cantidad*1000; unidad:='G'; END IF;
    IF unidad IS NULL OR unidad NOT IN ('G','UNIDAD') OR cantidad IS NULL OR cantidad<=0
      OR cantidad::text IN ('NaN','Infinity','-Infinity') OR cantidad<>round(cantidad,6)
      OR (unidad='UNIDAD' AND cantidad<>trunc(cantidad))
      OR r.tipo_material::text NOT IN ('SEMILLA','ESQUEJE')
      OR (r.tipo_material::text='ESQUEJE' AND unidad<>'UNIDAD') THEN
      RAISE EXCEPTION 'CANTIDAD_UNIDAD_INVALIDA' USING ERRCODE='22023'; END IF;
    fecha:=(p_payload->>'fecha_recepcion')::date;
    IF fecha<r.fecha OR fecha>dia THEN RAISE EXCEPTION 'FECHA_RECEPCION_INVALIDA' USING ERRCODE='22023'; END IF;
    SELECT o.id INTO abierta FROM public.recoleccion_recepcion_observacion o WHERE o.recoleccion_id=r.id AND o.clase='INCIDENCIA'
      AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion_observacion s WHERE s.incidencia_id=o.id) ORDER BY o.id DESC LIMIT 1;
    incidencia:=(p_payload->>'incidencia_id')::bigint; motivo:=nullif(btrim(p_payload->>'motivo_resolucion'),'');
    conforme:=cantidad=r.cantidad_inicial_canonica AND unidad=r.unidad_canonica::text;
    IF abierta IS NOT NULL THEN
      IF incidencia IS DISTINCT FROM abierta OR NOT conforme OR coalesce(char_length(motivo),0) NOT BETWEEN 10 AND 500 THEN
        RAISE EXCEPTION 'INCIDENCIA_REQUIERE_COMPROBACION_CONFORME' USING ERRCODE='P0001'; END IF;
    ELSIF incidencia IS NOT NULL OR motivo IS NOT NULL THEN
      RAISE EXCEPTION 'INCIDENCIA_NO_DISPONIBLE' USING ERRCODE='P0001';
    END IF;
    IF jsonb_typeof(p_payload->'evidencia_ids') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'evidencia_ids') NOT BETWEEN 1 AND 5 THEN
      RAISE EXCEPTION 'EVIDENCIA_REQUERIDA' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'evidencia_ids') v
      WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v#>>'{}') !~ '^[1-9][0-9]*$') THEN
      RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
    SELECT array_agg(x::bigint ORDER BY x::bigint),count(DISTINCT x) INTO ids,n
      FROM jsonb_array_elements_text(p_payload->'evidencia_ids') x;
    IF n<>cardinality(ids) THEN RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
    FOREACH eid IN ARRAY ids LOOP
      PERFORM 1 FROM public.evidencias_trazabilidad e
        JOIN public.recoleccion_recepcion_evidencia_contexto c ON c.evidencia_id=e.id
        JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
        WHERE e.id=eid AND e.entidad_id=0 AND e.eliminado_en IS NULL AND e.creado_por_usuario_id=p_actor_id
          AND c.actor_id=p_actor_id AND c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id
          AND e.bucket='recoleccion_fotos' AND t.activo AND upper(t.codigo)='RECOLECCION_RECEPCION'
          AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion_evidencia v WHERE v.evidencia_id=e.id)
        FOR UPDATE OF e;
      IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
    END LOOP;
    INSERT INTO public.recoleccion_recepcion_observacion(recoleccion_id,vivero_id,actor_id,comando_id,clase,
      cantidad_declarada,unidad_declarada,cantidad_observada,unidad_observada,fecha_recepcion,incidencia_id,motivo_resolucion,
      revision_anterior,revision_nueva)
    VALUES(r.id,r.vivero_id,p_actor_id,p_comando_id,CASE WHEN conforme THEN 'CONFORME' ELSE 'INCIDENCIA' END,
      r.cantidad_inicial_canonica,r.unidad_canonica,cantidad,unidad::public.unidad_medida,fecha,incidencia,motivo,rev,rev+1) RETURNING id INTO obs;
    INSERT INTO public.recoleccion_recepcion_evidencia(evidencia_id,observacion_id) SELECT unnest(ids),obs;
    UPDATE public.evidencias_trazabilidad SET entidad_id=r.id,codigo_trazabilidad=r.codigo_trazabilidad WHERE id=ANY(ids);
    IF conforme THEN
      -- Comprueba la ficha sin cambiarla ni confiar snapshots del cliente.
      IF r.metodo_id IS NULL OR r.planta_id IS NULL OR r.unidad_canonica::text NOT IN ('G','UNIDAD')
        OR NOT EXISTS(SELECT 1 FROM public.ubicacion WHERE id=r.ubicacion_id AND latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)
        OR (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          WHERE t.activo AND upper(t.codigo)='RECOLECCION' AND e.entidad_id=r.id AND e.eliminado_en IS NULL
            AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion_evidencia_contexto c WHERE c.evidencia_id=e.id))<2 THEN
        RAISE EXCEPTION 'FICHA_INCOMPLETA' USING ERRCODE='22023'; END IF;
      INSERT INTO public.recoleccion_recepcion(recoleccion_id,vivero_id,cantidad_recibida,unidad_recibida,fecha_recepcion,recibido_por,comando_id,observacion_id)
        VALUES(r.id,r.vivero_id,cantidad,unidad::public.unidad_medida,fecha,p_actor_id,p_comando_id,obs) RETURNING id INTO recepcion;
      IF r.estado_registro::text='PENDIENTE_VALIDACION' THEN
        SELECT to_jsonb(p) INTO planta FROM public.planta p WHERE p.id=r.planta_id;
        SELECT to_jsonb(u) INTO recolector FROM public.usuario u WHERE u.id=r.usuario_id;
        nombre:=coalesce(nullif(btrim(concat_ws(' ',recolector->>'nombre',recolector->>'apellido')),''),recolector->>'username');
        IF nullif(btrim(planta->>'nombre_cientifico'),'') IS NULL OR nombre IS NULL
          OR coalesce(nullif(btrim(planta->>'nombre_comun_principal'),''),nullif(btrim(planta->>'especie'),'')) IS NULL THEN
          RAISE EXCEPTION 'SNAPSHOT_INCOMPLETO' USING ERRCODE='22023'; END IF;
        UPDATE public.recoleccion SET estado_registro='VALIDADO',usuario_validacion_id=p_actor_id,fecha_validacion=dia,
          nombre_cientifico_snapshot=planta->>'nombre_cientifico',
          nombre_comercial_snapshot=coalesce(nullif(btrim(planta->>'nombre_comun_principal'),''),planta->>'especie'),
          variedad_snapshot=coalesce(nullif(btrim(planta->>'variedad'),''),'comun'),
          nombre_comunidad_snapshot=coalesce(nullif(btrim(r.nombre_comunidad_snapshot),''),'SIN ESPECIFICAR'),
          nombre_recolector_snapshot=nombre,revision_captura=rev+1 WHERE id=r.id;
        INSERT INTO public.recoleccion_historial(recoleccion_id,tipo_historial,estado_origen,estado_destino,actor_user_id,created_at,metadata)
          VALUES(r.id,'VALIDACION_APROBADA','PENDIENTE_VALIDACION','VALIDADO',p_actor_id,dia,
            jsonb_build_object('origen','T4_RECIBIR_VALIDAR','recepcion_id',recepcion::text,'comando_id',p_comando_id));
      ELSE
        UPDATE public.recoleccion SET revision_captura=rev+1 WHERE id=r.id;
      END IF;
    ELSE
      UPDATE public.recoleccion SET revision_captura=rev+1 WHERE id=r.id;
    END IF;
    estado:=CASE WHEN conforme THEN 'CONFIRMADO' ELSE 'INCIDENCIA' END;
    resultado:=jsonb_build_object('recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,'observacion_id',obs::text,
      'recepcion_id',recepcion::text,'incidencia_id',CASE WHEN conforme THEN incidencia::text ELSE obs::text END,
      'revision_anterior',rev::text,'revision_nueva',(rev+1)::text,'cantidad_recibida',cantidad,'unidad_recibida',unidad,
      'fecha_recepcion',fecha,'recibido_por',p_actor_id::text,'saldo_actual',r.saldo_actual,
      'estado_registro',CASE WHEN conforme THEN 'VALIDADO' ELSE r.estado_registro::text END,
      'anclaje_externo','PENDIENTE_NO_EJECUTADO');
  EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE 'P0002' OR SQLSTATE 'P0001' OR SQLSTATE '22023'
    OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
    GET STACKED DIAGNOSTICS codigo=MESSAGE_TEXT,error_estado=RETURNED_SQLSTATE;
    -- Solo rechazos de negocio conocidos generan terminal. Un fallo de trigger,
    -- catálogo o infraestructura no se transforma en un rechazo concluyente.
    IF error_estado='42501' THEN
      IF codigo IN ('Se requiere cuenta interna activa con acceso M1.','CAPACIDAD_INSUFICIENTE: sin acceso al vivero.') THEN
        codigo:='CAPACIDAD_INSUFICIENTE';
      ELSIF codigo NOT IN ('AUTORRECEPCION_PROHIBIDA','EVIDENCIA_FUERA_DE_AMBITO') THEN RAISE; END IF;
    ELSIF error_estado IN ('P0001','P0002','22023') AND codigo NOT IN (
      'ORIGEN_NO_DISPONIBLE','REVISION_OBSOLETA','ESTADO_NO_RECEPCIONABLE','CONCILIACION_HISTORICA_REQUERIDA',
      'CANTIDAD_UNIDAD_INVALIDA','FECHA_RECEPCION_INVALIDA','INCIDENCIA_REQUIERE_COMPROBACION_CONFORME',
      'INCIDENCIA_NO_DISPONIBLE','EVIDENCIA_REQUERIDA','EVIDENCIA_INVALIDA','FICHA_INCOMPLETA','SNAPSHOT_INCOMPLETO','ENTRADA_INVALIDA') THEN
      RAISE;
    END IF;
    status:=CASE error_estado WHEN '42501' THEN 403 WHEN 'P0002' THEN 404 WHEN 'P0001' THEN 409 ELSE 422 END;
    estado:='RECHAZADO'; resultado:=NULL;
    IF error_estado NOT IN ('42501','P0002','P0001','22023') THEN codigo:='ENTRADA_INVALIDA'; END IF;
  END;
  recibo:=jsonb_build_object('comando_id',p_comando_id,'estado',estado,'resultado',resultado,
    'error',CASE WHEN estado='RECHAZADO' THEN jsonb_build_object('codigo',codigo) ELSE NULL END,'finalizado_en',clock_timestamp());
  INSERT INTO public.recoleccion_recepcion_comando(actor_id,comando_id,intencion,http_status,recibo)
    VALUES(p_actor_id,p_comando_id,p_payload,status,recibo);
  RETURN jsonb_build_object('http_status',status,'body',recibo);
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_recuperar(p_actor_id bigint,p_auth_id text,p_comando_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE recibo jsonb;
BEGIN
  PERFORM 1 FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_DISPONIBLE' USING ERRCODE='42501'; END IF;
  SELECT c.recibo INTO recibo FROM public.recoleccion_recepcion_comando c WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  RETURN jsonb_build_object('http_status',CASE WHEN recibo IS NULL THEN 202 ELSE 200 END,
    'body',coalesce(recibo,jsonb_build_object('comando_id',p_comando_id,'estado','SIN_RESULTADO','resultado',NULL,'error',NULL,'finalizado_en',NULL)));
END $$;

-- Barrera común a INICIO, DESECHO y cualquier escritor legado del ledger.
CREATE OR REPLACE FUNCTION public.m1_recepcion_proteger_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion;
BEGIN
  IF NEW.tipo_movimiento::text IN ('CONSUMO_A_VIVERO','DESECHO') THEN
    r:=public.m1_recepcion_exigir_objeto(NEW.created_by,NEW.recoleccion_id);
    IF r.estado_registro::text<>'VALIDADO' OR NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id AND vivero_id=r.vivero_id) THEN
      RAISE EXCEPTION 'RECEPCION_CONFORME_REQUERIDA' USING ERRCODE='P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recepcion_exigida ON public.recoleccion_movimiento;
CREATE TRIGGER recepcion_exigida BEFORE INSERT ON public.recoleccion_movimiento FOR EACH ROW EXECUTE FUNCTION public.m1_recepcion_proteger_movimiento();

CREATE OR REPLACE FUNCTION public.m1_recepcion_congelar_declaracion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.recoleccion_recepcion_observacion WHERE recoleccion_id=OLD.id) AND
    (NEW.usuario_id,NEW.vivero_id,NEW.tipo_material,NEW.unidad_canonica,NEW.cantidad_inicial_canonica,NEW.fecha)
      IS DISTINCT FROM (OLD.usuario_id,OLD.vivero_id,OLD.tipo_material,OLD.unidad_canonica,OLD.cantidad_inicial_canonica,OLD.fecha) THEN
    RAISE EXCEPTION 'DECLARACION_CON_INCIDENCIA_O_RECEPCION_CONGELADA' USING ERRCODE='P0001'; END IF;
  IF NEW.estado_registro::text='VALIDADO' AND OLD.estado_registro::text<>'VALIDADO'
    AND EXISTS(SELECT 1 FROM public.recoleccion_recepcion_observacion o WHERE o.recoleccion_id=OLD.id AND o.clase='INCIDENCIA'
      AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion_observacion s WHERE s.incidencia_id=o.id)) THEN
    RAISE EXCEPTION 'INCIDENCIA_ABIERTA' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recepcion_congelar ON public.recoleccion;
CREATE TRIGGER recepcion_congelar BEFORE UPDATE ON public.recoleccion FOR EACH ROW EXECUTE FUNCTION public.m1_recepcion_congelar_declaracion();

-- Proyección necesaria para recepción; nunca devuelve correo, afiliación ni ficha M1 completa.
CREATE OR REPLACE FUNCTION public.m1_recepcion_proyectar(p_actor bigint,p_origen bigint,p_detalle boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; recepcion jsonb; incidencia jsonb; bloqueado boolean; fila jsonb;
BEGIN
  SELECT * INTO STRICT r FROM public.recoleccion WHERE id=p_origen;
  SELECT jsonb_build_object('id',id::text,'fecha_recepcion',fecha_recepcion,'recibido_por',recibido_por::text,'registrado_en',registrado_en)
    INTO recepcion FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id;
  SELECT jsonb_build_object('id',o.id::text,'cantidad_observada',o.cantidad_observada,'unidad_observada',o.unidad_observada,
    'fecha_recepcion',o.fecha_recepcion,'registrado_en',o.registrado_en) INTO incidencia
    FROM public.recoleccion_recepcion_observacion o WHERE o.recoleccion_id=r.id AND o.clase='INCIDENCIA'
      AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion_observacion s WHERE s.incidencia_id=o.id) ORDER BY o.id DESC LIMIT 1;
  bloqueado:=EXISTS(SELECT 1 FROM public.recoleccion_movimiento WHERE recoleccion_id=r.id)
    OR EXISTS(SELECT 1 FROM public.lote_vivero WHERE recoleccion_id=r.id)
    OR r.fecha<(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date-45
    OR r.fecha>(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date
    OR r.saldo_actual IS DISTINCT FROM r.cantidad_inicial_canonica;
  fila:=jsonb_build_object('recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,'recolector_id',r.usuario_id::text,
    'codigo_trazabilidad',r.codigo_trazabilidad,'fecha_recoleccion',r.fecha,'tipo_material',r.tipo_material,
    'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,'nombre_comercial_snapshot',r.nombre_comercial_snapshot,
    'nombre_recolector_snapshot',r.nombre_recolector_snapshot,'cantidad_declarada',r.cantidad_inicial_canonica,
    'unidad_declarada',r.unidad_canonica,'saldo_actual',r.saldo_actual,'revision',r.revision_captura::text,
    'estado_registro',r.estado_registro,'recepcion',recepcion,'incidencia',incidencia,
    'requiere_conciliacion',bloqueado AND recepcion IS NULL,
    'puede_recibir_validar',r.usuario_id<>p_actor AND recepcion IS NULL AND NOT bloqueado AND r.estado_registro::text IN ('PENDIENTE_VALIDACION','VALIDADO'));
  IF p_detalle THEN
    fila:=fila||jsonb_build_object('historial',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id::text,'clase',o.clase,
      'actor_id',o.actor_id::text,'cantidad_declarada',o.cantidad_declarada,'unidad_declarada',o.unidad_declarada,
      'cantidad_observada',o.cantidad_observada,'unidad_observada',o.unidad_observada,'fecha_recepcion',o.fecha_recepcion,
      'incidencia_id',o.incidencia_id::text,'motivo_resolucion',o.motivo_resolucion,'registrado_en',o.registrado_en) ORDER BY o.id)
      FROM public.recoleccion_recepcion_observacion o WHERE o.recoleccion_id=r.id),'[]'::jsonb),
      'evidencias',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'bucket',e.bucket,'ruta_archivo',e.ruta_archivo,
        'mime_type',e.mime_type,'titulo',e.titulo,'observacion_id',v.observacion_id::text) ORDER BY e.id)
        FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          LEFT JOIN public.recoleccion_recepcion_evidencia v ON v.evidencia_id=e.id
        WHERE e.entidad_id=r.id AND e.eliminado_en IS NULL AND t.activo
          AND (upper(t.codigo)='RECOLECCION' OR (upper(t.codigo)='RECOLECCION_RECEPCION' AND v.observacion_id IS NOT NULL))),'[]'::jsonb));
  END IF;
  RETURN fila;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_leer(p_actor_id bigint,p_recoleccion_id bigint DEFAULT NULL,p_antes_de_id bigint DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; filas jsonb; siguiente bigint;
BEGIN
  PERFORM public.m1_exigir_actor(p_actor_id,false);
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
  IF p_recoleccion_id IS NOT NULL THEN
    SELECT * INTO r FROM public.recoleccion WHERE id=p_recoleccion_id AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORIGEN_NO_DISPONIBLE' USING ERRCODE='P0002'; END IF;
    PERFORM public.m2_exigir_vivero(p_actor_id,r.vivero_id);
    IF r.estado_registro::text NOT IN ('PENDIENTE_VALIDACION','VALIDADO') THEN
      RAISE EXCEPTION 'ESTADO_NO_RECEPCIONABLE' USING ERRCODE='P0001'; END IF;
    RETURN public.m1_recepcion_proyectar(p_actor_id,r.id,true);
  END IF;
  -- El predicado de autoridad se aplica antes de cursor/límite, también para GENERAL solo M2.
  IF NOT EXISTS(SELECT 1 FROM public.usuario WHERE id=p_actor_id AND rol::text='ADMIN')
    AND NOT EXISTS(SELECT 1 FROM public.usuario_vivero WHERE usuario_id=p_actor_id AND revocado_en IS NULL) THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(public.m1_recepcion_proyectar(p_actor_id,id,false) ORDER BY id DESC),'[]'::jsonb),
    CASE WHEN count(*)=p_limite THEN min(id) END INTO filas,siguiente FROM (
    SELECT q.id FROM public.recoleccion q WHERE q.eliminado_en IS NULL AND q.estado_registro::text IN ('PENDIENTE_VALIDACION','VALIDADO')
      AND public.m2_acceso_efectivo(p_actor_id,q.vivero_id)
      AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=q.id)
      AND (p_antes_de_id IS NULL OR q.id<p_antes_de_id) ORDER BY q.id DESC LIMIT p_limite) x;
  RETURN jsonb_build_object('data',filas,'siguiente_antes_de_id',siguiente::text);
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_diagnostico(p_actor_id bigint,p_antes_de_id bigint DEFAULT NULL,p_limite integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE filas jsonb;
BEGIN
  IF public.m1_exigir_actor(p_actor_id,false)<>'ADMIN' THEN RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,
    'cantidad_original',r.cantidad_inicial_canonica,'saldo_actual',r.saldo_actual,'unidad',r.unidad_canonica,'fecha_recoleccion',r.fecha,
    'movimientos',(SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=r.id),
    'lotes',(SELECT count(*) FROM public.lote_vivero WHERE recoleccion_id=r.id),
    'recepcion_acreditada',false) ORDER BY r.id DESC),'[]'::jsonb) INTO filas
    FROM (SELECT * FROM public.recoleccion r WHERE r.estado_registro::text='VALIDADO' AND r.eliminado_en IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=r.id)
      AND (p_antes_de_id IS NULL OR r.id<p_antes_de_id) ORDER BY r.id DESC LIMIT p_limite) r;
  RETURN filas;
END $$;

CREATE OR REPLACE FUNCTION public.m2_origenes_leer(
  p_actor_id bigint,p_vivero_id bigint,p_recoleccion_id bigint DEFAULT NULL,p_pagina integer DEFAULT 1,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE filas jsonb; total bigint;
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 1000000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paginación inválida.' USING ERRCODE='22023'; END IF;
  IF p_recoleccion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recoleccion r JOIN public.recoleccion_recepcion c
    ON c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id WHERE r.id=p_recoleccion_id
    AND r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL AND r.estado_registro='VALIDADO') THEN
    RAISE EXCEPTION 'Origen sin recepción conforme disponible.' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO total FROM public.recoleccion r JOIN public.recoleccion_recepcion c ON c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id
    WHERE r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL AND r.estado_registro='VALIDADO' AND r.estado_operativo='ABIERTO' AND r.saldo_actual>0
    AND (p_recoleccion_id IS NULL OR r.id=p_recoleccion_id);
  SELECT coalesce(jsonb_agg(fila ORDER BY id DESC),'[]'::jsonb) INTO filas FROM (
    SELECT r.id,jsonb_build_object('recoleccion_id',r.id::text,'vivero_almacenamiento_id',r.vivero_id::text,
      'recolector_id',r.usuario_id::text,'codigo_trazabilidad',r.codigo_trazabilidad,'fecha',r.fecha,'planta_id',r.planta_id::text,'tipo_material',r.tipo_material,
      'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,'nombre_comercial_snapshot',r.nombre_comercial_snapshot,
      'variedad_snapshot',r.variedad_snapshot,'estado_registro',r.estado_registro,'estado_operativo',r.estado_operativo,
      'saldo_actual',r.saldo_actual,'unidad_canonica',r.unidad_canonica) fila
    FROM public.recoleccion r JOIN public.recoleccion_recepcion c ON c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id
    WHERE r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL AND r.estado_registro='VALIDADO' AND r.estado_operativo='ABIERTO' AND r.saldo_actual>0
      AND (p_recoleccion_id IS NULL OR r.id=p_recoleccion_id)
    ORDER BY r.id DESC OFFSET (p_pagina-1)*p_limite LIMIT p_limite) x;
  RETURN jsonb_build_object('success',true,'data',filas,'pagination',jsonb_build_object('page',p_pagina,'limit',p_limite,'total',total));
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid,p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'm1_recepcion_%' OR p.proname='m2_origenes_leer') LOOP
    EXECUTE format('ALTER FUNCTION %s SET lock_timeout TO %L',f.firma,'5s');
    EXECUTE format('ALTER FUNCTION %s SET statement_timeout TO %L',f.firma,'30s');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T4_PRIVILEGIO_FUNCION_INESPERADO: %',f.firma; END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.m1_recepcion_ejecutar(bigint,text,uuid,jsonb),public.m1_recepcion_recuperar(bigint,text,uuid),
  public.m1_recepcion_leer(bigint,bigint,bigint,integer),public.m1_recepcion_diagnostico(bigint,bigint,integer),
  public.m1_recepcion_evidencias_preparar(bigint,bigint,jsonb),public.m2_origenes_leer(bigint,bigint,bigint,integer,integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
