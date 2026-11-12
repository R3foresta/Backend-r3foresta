-- Recepción única conforme o rechazo de la misma ficha. Sin backfill ni hechos ficticios.
-- Requiere corte coordinado y reset explícito de datos operativos de prueba ANTES
-- de la primera instalación. Esta migración no borra datos ni Storage.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.recoleccion IN ACCESS EXCLUSIVE MODE;
DO $$ DECLARE t text; hay boolean; BEGIN
  IF to_regprocedure('public.m2_inicio_lote_impl(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)') IS NULL
    OR to_regprocedure('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean,boolean)') IS NULL THEN
    RAISE EXCEPTION 'RECEPCION_UNICA_CATALOGO_INCOMPATIBLE: requiere 097 y 099';
  END IF;
  -- Sólo la primera transición destructiva de esquema exige el corte vacío.
  IF to_regclass('public.recoleccion_recepcion_observacion') IS NOT NULL THEN
    FOREACH t IN ARRAY ARRAY['recoleccion','recoleccion_movimiento','lote_vivero','evento_lote_vivero','asignacion_vivero_subcampania',
      'recoleccion_recepcion','recoleccion_recepcion_comando',
      'recoleccion_recepcion_evidencia','recoleccion_recepcion_evidencia_contexto','recoleccion_recepcion_observacion',
      'recoleccion_conciliacion_comando','recoleccion_conciliacion_evento','recoleccion_conciliacion_evidencia',
      'recoleccion_conciliacion_evidencia_contexto'] LOOP
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t) INTO hay;
      IF hay THEN RAISE EXCEPTION 'RECEPCION_UNICA_REQUIERE_RESET_REVISADO: % conserva datos',t; END IF;
    END LOOP;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.recoleccion'::regclass
    AND conname='recoleccion_cantidad_canonica_100') THEN
    ALTER TABLE public.recoleccion ADD CONSTRAINT recoleccion_cantidad_canonica_100 CHECK(
      unidad_canonica::text IN ('G','UNIDAD') AND cantidad_inicial_canonica>0
      AND cantidad_inicial_canonica::text NOT IN ('NaN','Infinity','-Infinity')
      AND cantidad_inicial_canonica=round(cantidad_inicial_canonica,6)
      AND (unidad_canonica::text<>'UNIDAD' OR cantidad_inicial_canonica=trunc(cantidad_inicial_canonica))
      AND (tipo_material::text<>'ESQUEJE' OR unidad_canonica::text='UNIDAD'));
  END IF;
END $$;

ALTER TABLE public.recoleccion_recepcion DROP COLUMN IF EXISTS observacion_id;
ALTER TABLE public.recoleccion_recepcion_evidencia DROP COLUMN IF EXISTS observacion_id;
ALTER TABLE public.recoleccion_recepcion_evidencia ADD COLUMN IF NOT EXISTS recepcion_id bigint
  NOT NULL REFERENCES public.recoleccion_recepcion(id) ON DELETE RESTRICT;
ALTER TABLE public.recoleccion_recepcion_evidencia_contexto ADD COLUMN IF NOT EXISTS revision_captura bigint
  NOT NULL CHECK(revision_captura>=0);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.recoleccion_recepcion'::regclass
    AND conname='recepcion_comando_fk') THEN
    ALTER TABLE public.recoleccion_recepcion ADD CONSTRAINT recepcion_comando_fk
      FOREIGN KEY(recibido_por,comando_id) REFERENCES public.recoleccion_recepcion_comando(actor_id,comando_id)
      ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- IF NOT EXISTS no acepta silenciosamente un catálogo previo incompatible.
DO $$ DECLARE c record; t text; BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('recoleccion_recepcion','recoleccion_id','bigint'),('recoleccion_recepcion','vivero_id','bigint'),
    ('recoleccion_recepcion','cantidad_recibida','numeric'),('recoleccion_recepcion','unidad_recibida','public.unidad_medida'),
    ('recoleccion_recepcion','fecha_recepcion','date'),('recoleccion_recepcion','recibido_por','bigint'),
    ('recoleccion_recepcion','registrado_en','timestamp with time zone'),('recoleccion_recepcion','comando_id','uuid'),
    ('recoleccion_recepcion_comando','actor_id','bigint'),('recoleccion_recepcion_comando','comando_id','uuid'),
    ('recoleccion_recepcion_comando','intencion','jsonb'),('recoleccion_recepcion_comando','recibo','jsonb'),
    ('recoleccion_recepcion_comando','http_status','integer'),('recoleccion_recepcion_comando','registrado_en','timestamp with time zone'),
    ('recoleccion_recepcion_evidencia_contexto','evidencia_id','bigint'),('recoleccion_recepcion_evidencia_contexto','recoleccion_id','bigint'),
    ('recoleccion_recepcion_evidencia_contexto','vivero_id','bigint'),('recoleccion_recepcion_evidencia_contexto','actor_id','bigint'),
    ('recoleccion_recepcion_evidencia_contexto','revision_captura','bigint'),
    ('recoleccion_recepcion_evidencia_contexto','registrado_en','timestamp with time zone'),
    ('recoleccion_recepcion_evidencia','evidencia_id','bigint'),('recoleccion_recepcion_evidencia','recepcion_id','bigint')
  ) e(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||c.tabla)::regclass
      AND attname=c.columna AND atttypid=c.tipo::regtype AND attnotnull AND NOT attisdropped) THEN
      RAISE EXCEPTION 'RECEPCION_UNICA_CATALOGO_INCOMPATIBLE: %.%',c.tabla,c.columna; END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['recoleccion_recepcion','recoleccion_recepcion_comando',
    'recoleccion_recepcion_evidencia_contexto','recoleccion_recepcion_evidencia'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||t)::regclass AND relrowsecurity)
      OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||t)::regclass
        AND tgname='recepcion_inmutable' AND tgenabled='O'
        AND tgfoid='public.fn_subcampania_historial_prevent_mutation()'::regprocedure)
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(rol)
        WHERE has_any_column_privilege(r.rol,('public.'||t)::regclass,'SELECT,INSERT,UPDATE,REFERENCES')
          OR has_table_privilege(r.rol,('public.'||t)::regclass,'DELETE,TRUNCATE,TRIGGER'))
      OR has_any_column_privilege('service_role',('public.'||t)::regclass,'INSERT,UPDATE,REFERENCES')
      OR has_table_privilege('service_role',('public.'||t)::regclass,'DELETE,TRUNCATE,TRIGGER') THEN
      RAISE EXCEPTION 'RECEPCION_UNICA_PROTECCION_INCOMPATIBLE: %',t; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.recoleccion_recepcion'::regclass
    AND contype='f' AND conname='recepcion_comando_fk'
    AND confrelid='public.recoleccion_recepcion_comando'::regclass AND condeferrable AND condeferred
    AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(conkey) WITH ORDINALITY k(n,ord)
      JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.n)=ARRAY['recibido_por','comando_id']::name[]
    AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(confkey) WITH ORDINALITY k(n,ord)
      JOIN pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.n)=ARRAY['actor_id','comando_id']::name[]) THEN
    RAISE EXCEPTION 'RECEPCION_UNICA_CATALOGO_INCOMPATIBLE: recepción/comando'; END IF;
END $$;

-- La ventana de captura se evalúa únicamente al crear o cambiar la fecha.
-- Una fecha conservada no caduca por corregir, reenviar, recibir o consumir.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE dia date:=(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  IF TG_OP='UPDATE' AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha THEN RETURN NEW; END IF;
  IF NEW.fecha BETWEEN dia-45 AND dia THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Fecha fuera de rango para captura o cambio de fecha de Recolección.'
    USING ERRCODE='23514',CONSTRAINT='chk_fecha_rango';
END $$;

-- Autoridad de recepción separada del acceso operativo GENERAL de M2.
CREATE OR REPLACE FUNCTION public.m1_recepcion_actor_autorizado(p_actor bigint,p_vivero bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS(SELECT 1 FROM public.usuario u WHERE u.id=p_actor AND u.activo
    AND (u.rol::text='ADMIN' OR (u.rol::text='VALIDADOR' AND EXISTS(SELECT 1 FROM public.usuario_vivero v
      WHERE v.usuario_id=u.id AND v.vivero_id=p_vivero AND v.revocado_en IS NULL))))
$$;
CREATE OR REPLACE FUNCTION public.m1_recepcion_exigir_receptor(p_actor bigint,p_origen bigint)
RETURNS public.recoleccion LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion;
BEGIN
  r:=public.m1_recepcion_exigir_objeto(p_actor,p_origen);
  IF NOT public.m1_recepcion_actor_autorizado(p_actor,r.vivero_id) THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  IF r.usuario_id=p_actor THEN RAISE EXCEPTION 'AUTORRECEPCION_PROHIBIDA' USING ERRCODE='42501'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_congelar_declaracion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.estado_registro::text='VALIDADO' AND NOT EXISTS(
    SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=NEW.id AND c.vivero_id=NEW.vivero_id
      AND c.cantidad_recibida=NEW.cantidad_inicial_canonica AND c.unidad_recibida=NEW.unidad_canonica) THEN
    RAISE EXCEPTION 'RECEPCION_CONFORME_REQUERIDA' USING ERRCODE='P0001'; END IF;
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.recoleccion_recepcion WHERE recoleccion_id=OLD.id)
    AND (to_jsonb(NEW)-ARRAY['blockchain_url','token_id','transaction_hash','estado_registro','saldo_actual','estado_operativo','revision_captura',
      'nombre_cientifico_snapshot','nombre_comercial_snapshot','variedad_snapshot','nombre_comunidad_snapshot',
      'nombre_recolector_snapshot','motivo_rechazo']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['blockchain_url','token_id','transaction_hash','estado_registro','saldo_actual','estado_operativo','revision_captura',
      'nombre_cientifico_snapshot','nombre_comercial_snapshot','variedad_snapshot','nombre_comunidad_snapshot',
      'nombre_recolector_snapshot','motivo_rechazo']) THEN
    RAISE EXCEPTION 'DECLARACION_RECIBIDA_CONGELADA' USING ERRCODE='P0001'; END IF;
  IF TG_OP='UPDATE' AND OLD.estado_registro::text='VALIDADO'
    AND (to_jsonb(NEW)-ARRAY['blockchain_url','token_id','transaction_hash','saldo_actual','estado_operativo']) IS DISTINCT FROM
      (to_jsonb(OLD)-ARRAY['blockchain_url','token_id','transaction_hash','saldo_actual','estado_operativo']) THEN
    RAISE EXCEPTION 'DECLARACION_RECIBIDA_CONGELADA' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recepcion_congelar ON public.recoleccion;
CREATE TRIGGER recepcion_congelar BEFORE INSERT OR UPDATE ON public.recoleccion
  FOR EACH ROW EXECUTE FUNCTION public.m1_recepcion_congelar_declaracion();

CREATE OR REPLACE FUNCTION public.m2_origen_estado_habilitacion(r public.recoleccion,p_vivero_id bigint)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
BEGIN
  IF r.vivero_id IS DISTINCT FROM p_vivero_id OR r.eliminado_en IS NOT NULL
    OR r.estado_registro::text<>'VALIDADO' OR coalesce(r.tipo_material::text,'') NOT IN ('SEMILLA','ESQUEJE')
    OR r.estado_operativo::text<>'ABIERTO' OR r.saldo_actual IS NULL OR r.saldo_actual<=0
    OR r.saldo_actual::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id)
    THEN RETURN 'RECEPCION_CONFORME'; END IF;
  RETURN 'PENDIENTE_RECEPCION';
END $$;
CREATE OR REPLACE FUNCTION public.m2_origen_exigir_habilitacion(r public.recoleccion,p_vivero_id bigint)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF r.vivero_id IS DISTINCT FROM p_vivero_id THEN
    RAISE EXCEPTION 'El origen debe pertenecer a la custodia del vivero.' USING ERRCODE='42501'; END IF;
  IF coalesce(public.m2_origen_estado_habilitacion(r,p_vivero_id),'')<>'RECEPCION_CONFORME' THEN
    RAISE EXCEPTION 'RECEPCION_CONFORME_REQUERIDA' USING ERRCODE='P0001'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.m2_movimiento_unidades(m public.recoleccion_movimiento)
RETURNS text[] LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT array_remove(ARRAY[to_jsonb(m)->>'unidad_medida_movimiento',to_jsonb(m)->>'unidad_operativa',
    to_jsonb(m)->>'unidad_medida_evento'],NULL)
$$;

DROP FUNCTION IF EXISTS public.m1_recepcion_evidencias_preparar(bigint,bigint,jsonb);
CREATE OR REPLACE FUNCTION public.m1_recepcion_evidencias_preparar(p_actor_id bigint,p_recoleccion_id bigint,p_revision_esperada bigint,p_fotos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; f jsonb; tipo bigint; eid bigint; ids jsonb:='[]';
BEGIN
  r:=public.m1_recepcion_exigir_receptor(p_actor_id,p_recoleccion_id);
  IF p_revision_esperada IS NULL OR p_revision_esperada<>r.revision_captura THEN
    RAISE EXCEPTION 'REVISION_OBSOLETA' USING ERRCODE='P0001'; END IF;
  IF r.usuario_id=p_actor_id THEN RAISE EXCEPTION 'AUTORRECEPCION_PROHIBIDA' USING ERRCODE='42501'; END IF;
  IF r.estado_registro::text<>'PENDIENTE_VALIDACION'
    OR EXISTS(SELECT 1 FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id) THEN
    RAISE EXCEPTION 'ESTADO_NO_RECEPCIONABLE' USING ERRCODE='P0001'; END IF;
  IF jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
  SELECT id INTO STRICT tipo FROM public.tipos_entidad_evidencia WHERE upper(codigo)='RECOLECCION_RECEPCION' AND activo;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','') NOT LIKE 'recepcion/pendientes/'||p_actor_id||'/'||r.id||'/%'
      OR coalesce(f->>'mime_type','') NOT LIKE 'image/%' OR coalesce((f->>'tamano_bytes')::bigint,0) NOT BETWEEN 1 AND 15728640 THEN
      RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,metadata,es_principal,orden,creado_por_usuario_id)
    VALUES(tipo,0,'recoleccion_fotos',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',
      (f->>'tamano_bytes')::bigint,f->>'hash_sha256','Comprobación física de recepción',
      jsonb_build_object('origen','T4_RECEPCION'),false,jsonb_array_length(ids),p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.recoleccion_recepcion_evidencia_contexto(evidencia_id,recoleccion_id,vivero_id,actor_id,revision_captura)
      VALUES(eid,r.id,r.vivero_id,p_actor_id,r.revision_captura);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_ejecutar(p_actor_id bigint,p_auth_id text,p_comando_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; previo public.recoleccion_recepcion_comando; recepcion bigint;
  origen bigint; rev bigint; cantidad numeric; unidad text; fecha date; accion text; motivo text;
  eid bigint; ids bigint[]; n integer; recibo jsonb; resultado jsonb; ficha jsonb;
  status integer:=200; estado text; codigo text; error_estado text;
  dia date:=(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date; instante timestamptz;
BEGIN
  -- Cuenta -> clave -> origen -> fotos ASC. Retiro094 y rol/baja072 usan cuenta UPDATE.
  PERFORM 1 FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id AND activo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_DISPONIBLE' USING ERRCODE='42501'; END IF;
  IF p_comando_id IS NULL OR p_comando_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('T4:'||p_actor_id||':'||p_comando_id,0));
  SELECT * INTO previo FROM public.recoleccion_recepcion_comando WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  IF FOUND THEN
    IF previo.intencion IS DISTINCT FROM p_payload THEN
      RETURN jsonb_build_object('ejecucion_nueva',false,'http_status',409,'body',jsonb_build_object('comando_id',p_comando_id,
        'estado','CONFLICTO_CLAVE','resultado',NULL,'error',jsonb_build_object('codigo','CLAVE_REUTILIZADA'),'finalizado_en',NULL));
    END IF;
    RETURN jsonb_build_object('ejecucion_nueva',false,'http_status',previo.http_status,'body',previo.recibo);
  END IF;
  BEGIN
    accion:=p_payload->>'accion';
    IF accion IS NULL OR accion NOT IN ('RECIBIR','RECHAZAR')
      OR jsonb_typeof(p_payload->'recoleccion_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_payload->'revision_esperada') IS DISTINCT FROM 'string'
      OR coalesce(p_payload->>'recoleccion_id','') !~ '^[1-9][0-9]*$'
      OR coalesce(p_payload->>'revision_esperada','') !~ '^(0|[1-9][0-9]*)$'
      OR (accion='RECIBIR' AND (p_payload-ARRAY['accion','recoleccion_id','revision_esperada','cantidad_recibida',
        'unidad_recibida','fecha_recepcion','evidencia_ids'])<>'{}'::jsonb)
      OR (accion='RECHAZAR' AND (p_payload-ARRAY['accion','recoleccion_id','revision_esperada','motivo_rechazo'])<>'{}'::jsonb) THEN
      RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
    origen:=(p_payload->>'recoleccion_id')::bigint; rev:=(p_payload->>'revision_esperada')::bigint;
    r:=public.m1_recepcion_exigir_receptor(p_actor_id,origen);
    IF rev<>r.revision_captura OR rev=9223372036854775807 THEN
      RAISE EXCEPTION 'REVISION_OBSOLETA' USING ERRCODE='P0001'; END IF;
    IF r.estado_registro::text<>'PENDIENTE_VALIDACION'
      OR EXISTS(SELECT 1 FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id) THEN
      RAISE EXCEPTION 'ESTADO_NO_RECEPCIONABLE' USING ERRCODE='P0001'; END IF;
    IF EXISTS(SELECT 1 FROM public.recoleccion_movimiento WHERE recoleccion_id=r.id)
      OR EXISTS(SELECT 1 FROM public.lote_vivero WHERE recoleccion_id=r.id)
      OR r.saldo_actual IS DISTINCT FROM r.cantidad_inicial_canonica THEN
      RAISE EXCEPTION 'ORIGEN_CON_OPERACIONES_PREVIAS' USING ERRCODE='P0001'; END IF;
    -- Snapshot ANTERIOR a rechazar/corregir; no se reconstruye desde la ficha viva.
    ficha:=to_jsonb(r)||jsonb_build_object('id',r.id::text,'usuario_id',r.usuario_id::text,
      'ubicacion_id',r.ubicacion_id::text,'vivero_id',r.vivero_id::text,'planta_id',r.planta_id::text,
      'metodo_id',r.metodo_id::text,'revision_captura',r.revision_captura::text,
      'eliminado_por_usuario_id',r.eliminado_por_usuario_id::text,
      'ubicacion',(SELECT to_jsonb(u)||jsonb_build_object('id',u.id::text,
        'pais_id',to_jsonb(u)->>'pais_id','division_id',to_jsonb(u)->>'division_id')
        FROM public.ubicacion u WHERE u.id=r.ubicacion_id),
      'evidencia_ids',(SELECT coalesce(jsonb_agg(e.id::text ORDER BY e.id),'[]'::jsonb)
        FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
        WHERE e.entidad_id=r.id AND upper(t.codigo)='RECOLECCION' AND e.eliminado_en IS NULL));
    IF accion='RECHAZAR' THEN
      motivo:=normalize(btrim(p_payload->>'motivo_rechazo'),NFC);
      IF jsonb_typeof(p_payload->'motivo_rechazo') IS DISTINCT FROM 'string'
        OR char_length(motivo) NOT BETWEEN 10 AND 500 THEN
        RAISE EXCEPTION 'MOTIVO_RECHAZO_INVALIDO' USING ERRCODE='22023'; END IF;
      UPDATE public.recoleccion SET estado_registro='RECHAZADO',motivo_rechazo=motivo,revision_captura=rev+1 WHERE id=r.id;
    ELSE
      IF jsonb_typeof(p_payload->'cantidad_recibida') IS DISTINCT FROM 'number'
        OR coalesce(p_payload->>'fecha_recepcion','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
        RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
      cantidad:=(p_payload->>'cantidad_recibida')::numeric; unidad:=p_payload->>'unidad_recibida';
      IF unidad='KG' THEN cantidad:=cantidad*1000; unidad:='G'; END IF;
      IF unidad IS NULL OR unidad NOT IN ('G','UNIDAD') OR cantidad IS NULL OR cantidad<=0
        OR cantidad::text IN ('NaN','Infinity','-Infinity') OR cantidad<>round(cantidad,6)
        OR (unidad='UNIDAD' AND cantidad<>trunc(cantidad))
        OR r.tipo_material::text NOT IN ('SEMILLA','ESQUEJE')
        OR (r.tipo_material::text='ESQUEJE' AND unidad<>'UNIDAD') THEN
        RAISE EXCEPTION 'CANTIDAD_UNIDAD_INVALIDA' USING ERRCODE='22023'; END IF;
      IF cantidad IS DISTINCT FROM r.cantidad_inicial_canonica OR unidad IS DISTINCT FROM r.unidad_canonica::text THEN
        RAISE EXCEPTION 'RECEPCION_NO_CONFORME' USING ERRCODE='P0001'; END IF;
      fecha:=(p_payload->>'fecha_recepcion')::date;
      IF fecha<r.fecha OR fecha>dia THEN RAISE EXCEPTION 'FECHA_RECEPCION_INVALIDA' USING ERRCODE='22023'; END IF;
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
            AND c.actor_id=p_actor_id AND c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id AND c.revision_captura=rev
            AND e.bucket='recoleccion_fotos' AND t.activo AND upper(t.codigo)='RECOLECCION_RECEPCION'
            AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion_evidencia v WHERE v.evidencia_id=e.id)
          FOR UPDATE OF e;
        IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
      END LOOP;
      IF r.metodo_id IS NULL OR r.planta_id IS NULL
        OR NOT EXISTS(SELECT 1 FROM public.ubicacion WHERE id=r.ubicacion_id AND latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)
        OR (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          WHERE t.activo AND upper(t.codigo)='RECOLECCION' AND e.entidad_id=r.id AND e.eliminado_en IS NULL)<2 THEN
        RAISE EXCEPTION 'FICHA_INCOMPLETA' USING ERRCODE='22023'; END IF;
      -- Congelar la misma versión precargada que revisó el receptor. Un cambio
      -- posterior del catálogo o del perfil no reescribe esa ficha en silencio.
      IF nullif(btrim(r.nombre_cientifico_snapshot),'') IS NULL
        OR nullif(btrim(r.nombre_comercial_snapshot),'') IS NULL
        OR nullif(btrim(r.variedad_snapshot),'') IS NULL
        OR nullif(btrim(r.nombre_comunidad_snapshot),'') IS NULL
        OR nullif(btrim(r.nombre_recolector_snapshot),'') IS NULL THEN
        RAISE EXCEPTION 'SNAPSHOT_INCOMPLETO' USING ERRCODE='22023'; END IF;
      INSERT INTO public.recoleccion_recepcion(recoleccion_id,vivero_id,cantidad_recibida,unidad_recibida,fecha_recepcion,recibido_por,comando_id)
        VALUES(r.id,r.vivero_id,cantidad,unidad::public.unidad_medida,fecha,p_actor_id,p_comando_id) RETURNING id,registrado_en INTO recepcion,instante;
      INSERT INTO public.recoleccion_recepcion_evidencia(evidencia_id,recepcion_id) SELECT unnest(ids),recepcion;
      UPDATE public.evidencias_trazabilidad SET entidad_id=r.id,codigo_trazabilidad=r.codigo_trazabilidad WHERE id=ANY(ids);
      UPDATE public.recoleccion SET estado_registro='VALIDADO',motivo_rechazo=NULL,
        revision_captura=rev+1 WHERE id=r.id;
    END IF;
    instante:=coalesce(instante,clock_timestamp());
    INSERT INTO public.recoleccion_historial(recoleccion_id,tipo_historial,estado_origen,estado_destino,actor_user_id,created_at,observaciones,metadata)
      VALUES(r.id,CASE WHEN accion='RECIBIR' THEN 'VALIDACION_APROBADA'::public.tipo_historial_recoleccion ELSE 'VALIDACION_RECHAZADA'::public.tipo_historial_recoleccion END,
        'PENDIENTE_VALIDACION',CASE WHEN accion='RECIBIR' THEN 'VALIDADO'::public.estado_registro_recoleccion ELSE 'RECHAZADO'::public.estado_registro_recoleccion END,
        p_actor_id,dia,motivo,jsonb_build_object('origen','RECEPCION_UNICA','accion',accion,'comando_id',p_comando_id,
          'recepcion_id',recepcion::text,'revision_anterior',rev::text,'revision_nueva',(rev+1)::text,
          'motivo_rechazo',motivo,'registrado_en',instante,'ficha_revisada',ficha));
    estado:='CONFIRMADO';
    resultado:=jsonb_build_object('accion',accion,'recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,'recepcion_id',recepcion::text,
      'revision_anterior',rev::text,'revision_nueva',(rev+1)::text,'cantidad_recibida',cantidad,'unidad_recibida',unidad,
      'fecha_recepcion',fecha,'actor_id',p_actor_id::text,'saldo_actual',r.saldo_actual,
      'estado_registro',CASE WHEN accion='RECIBIR' THEN 'VALIDADO' ELSE 'RECHAZADO' END,
      'anclaje_externo',CASE WHEN accion='RECIBIR' THEN 'FUERA_TRANSACCION' ELSE 'NO_APLICA' END,
      'motivo_rechazo',motivo,'registrado_en',instante);
  EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE 'P0002' OR SQLSTATE 'P0001' OR SQLSTATE '22023'
    OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
    GET STACKED DIAGNOSTICS codigo=MESSAGE_TEXT,error_estado=RETURNED_SQLSTATE;
    IF error_estado='42501' THEN
      IF codigo IN ('Se requiere cuenta interna activa con acceso M1.','CAPACIDAD_INSUFICIENTE: sin acceso al vivero.') THEN
        codigo:='CAPACIDAD_INSUFICIENTE';
      ELSIF codigo NOT IN ('CAPACIDAD_INSUFICIENTE','AUTORRECEPCION_PROHIBIDA','EVIDENCIA_FUERA_DE_AMBITO') THEN RAISE; END IF;
    ELSIF error_estado IN ('P0001','P0002','22023') AND codigo NOT IN (
      'ORIGEN_NO_DISPONIBLE','REVISION_OBSOLETA','ESTADO_NO_RECEPCIONABLE','ORIGEN_CON_OPERACIONES_PREVIAS',
      'CANTIDAD_UNIDAD_INVALIDA','FECHA_RECEPCION_INVALIDA','MOTIVO_RECHAZO_INVALIDO','RECEPCION_NO_CONFORME',
      'EVIDENCIA_REQUERIDA','EVIDENCIA_INVALIDA','FICHA_INCOMPLETA','SNAPSHOT_INCOMPLETO','ENTRADA_INVALIDA') THEN RAISE;
    END IF;
    status:=CASE error_estado WHEN '42501' THEN 403 WHEN 'P0002' THEN 404 WHEN 'P0001' THEN 409 ELSE 422 END;
    estado:='RECHAZADO'; resultado:=NULL;
    IF error_estado NOT IN ('42501','P0002','P0001','22023') THEN codigo:='ENTRADA_INVALIDA'; END IF;
  END;
  recibo:=jsonb_build_object('comando_id',p_comando_id,'estado',estado,'resultado',resultado,
    'error',CASE WHEN estado='RECHAZADO' THEN jsonb_build_object('codigo',codigo) ELSE NULL END,'finalizado_en',clock_timestamp());
  INSERT INTO public.recoleccion_recepcion_comando(actor_id,comando_id,intencion,http_status,recibo)
    VALUES(p_actor_id,p_comando_id,p_payload,status,recibo);
  RETURN jsonb_build_object('ejecucion_nueva',true,'http_status',status,'body',recibo);
END $$;

CREATE OR REPLACE FUNCTION public.m1_recoleccion_guardar(
  p_actor_id bigint,p_accion text,p_recoleccion_id bigint,p_revision_esperada bigint,p_payload jsonb,p_fotos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rol text; r public.recoleccion%ROWTYPE; v public.recoleccion%ROWTYPE; ids jsonb; estado public.estado_registro_recoleccion;
  evento public.tipo_historial_recoleccion; permitidos text[]; loc record; dia date;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  rol:=public.m1_exigir_actor(p_actor_id,true);
  IF p_accion IS NULL OR p_accion NOT IN ('CREAR','EDITAR','ENVIAR','FOTOS')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Entrada inválida.' USING ERRCODE='22023';
  END IF;
  permitidos:=ARRAY['fecha','tipo_material','observaciones','ubicacion_id','vivero_id','metodo_id','planta_id',
    'unidad_canonica','cantidad_inicial_canonica','nombre_cientifico_snapshot','nombre_comercial_snapshot',
    'variedad_snapshot','nombre_comunidad_snapshot','nombre_recolector_snapshot'];
  IF p_accion='CREAR' THEN permitidos:=array_append(permitidos,'codigo_trazabilidad'); END IF;
  IF (p_payload-permitidos)<>'{}'::jsonb THEN RAISE EXCEPTION 'Campo no permitido.' USING ERRCODE='22023'; END IF;
  dia:=(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  IF p_accion='CREAR' THEN
    IF p_recoleccion_id IS NOT NULL OR jsonb_array_length(p_fotos)<2 THEN
      RAISE EXCEPTION 'Creación inválida: requiere al menos dos fotos.' USING ERRCODE='22023';
    END IF;
    v:=jsonb_populate_record(NULL::public.recoleccion,p_payload);
    INSERT INTO public.recoleccion(fecha,tipo_material,especie_nueva,observaciones,usuario_id,ubicacion_id,vivero_id,metodo_id,planta_id,
      codigo_trazabilidad,estado_registro,unidad_canonica,cantidad_inicial_canonica,saldo_actual,estado_operativo,
      nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,nombre_comunidad_snapshot,nombre_recolector_snapshot)
    VALUES(v.fecha,v.tipo_material,false,v.observaciones,p_actor_id,v.ubicacion_id,v.vivero_id,v.metodo_id,v.planta_id,
      v.codigo_trazabilidad,'BORRADOR',v.unidad_canonica,v.cantidad_inicial_canonica,v.cantidad_inicial_canonica,'ABIERTO',
      v.nombre_cientifico_snapshot,v.nombre_comercial_snapshot,v.variedad_snapshot,v.nombre_comunidad_snapshot,v.nombre_recolector_snapshot)
    RETURNING * INTO r;
    evento:='BORRADOR_CREADO'; estado:=NULL;
  ELSE
    SELECT * INTO r FROM public.recoleccion WHERE id=p_recoleccion_id FOR UPDATE;
    IF NOT FOUND OR r.eliminado_en IS NOT NULL THEN RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE='P0002'; END IF;
    IF rol<>'ADMIN' AND r.usuario_id<>p_actor_id THEN
      RAISE EXCEPTION 'Solo el creador con M1 o ADMIN.' USING ERRCODE='42501';
    END IF;
    IF p_revision_esperada IS NULL OR p_revision_esperada<>r.revision_captura OR r.revision_captura=9223372036854775807 THEN
      RAISE EXCEPTION 'La ficha cambió. Vuelva a consultarla.' USING ERRCODE='40001';
    END IF;
    estado:=r.estado_registro;
    IF p_accion IN ('EDITAR','FOTOS') THEN
      IF r.estado_registro::text NOT IN ('BORRADOR','RECHAZADO') THEN
        RAISE EXCEPTION 'Solo se mantiene BORRADOR o RECHAZADO.' USING ERRCODE='P0001';
      END IF;
      IF p_accion='FOTOS' AND (p_payload<>'{}'::jsonb OR jsonb_array_length(p_fotos)=0) THEN
        RAISE EXCEPTION 'Fotos inválidas.' USING ERRCODE='22023';
      END IF;
      IF p_accion='EDITAR' THEN
      v:=jsonb_populate_record(r,p_payload);
      UPDATE public.recoleccion SET fecha=v.fecha,tipo_material=v.tipo_material,observaciones=v.observaciones,ubicacion_id=v.ubicacion_id,
        vivero_id=v.vivero_id,metodo_id=v.metodo_id,planta_id=v.planta_id,unidad_canonica=v.unidad_canonica,
        cantidad_inicial_canonica=v.cantidad_inicial_canonica,saldo_actual=v.cantidad_inicial_canonica,
        nombre_cientifico_snapshot=v.nombre_cientifico_snapshot,nombre_comercial_snapshot=v.nombre_comercial_snapshot,
        variedad_snapshot=v.variedad_snapshot,nombre_comunidad_snapshot=v.nombre_comunidad_snapshot,nombre_recolector_snapshot=v.nombre_recolector_snapshot,
        estado_registro='BORRADOR',motivo_rechazo=NULL,
        revision_captura=revision_captura+1 WHERE id=r.id RETURNING * INTO r;
      END IF;
      IF p_accion='FOTOS' THEN
        UPDATE public.recoleccion SET revision_captura=revision_captura+1 WHERE id=r.id RETURNING * INTO r;
      END IF;
      -- 014 no tiene evento de edición: se conserva esa semántica, sin fabricar una transición.
      evento:=NULL;
    ELSE
      IF r.estado_registro::text<>'BORRADOR' THEN
        RAISE EXCEPTION 'Estado no permitido.' USING ERRCODE='P0001'; END IF;
      IF jsonb_array_length(p_fotos)<>0 OR p_payload<>'{}'::jsonb THEN
        RAISE EXCEPTION 'Campo no permitido.' USING ERRCODE='22023'; END IF;
      SELECT latitud,longitud INTO loc FROM public.ubicacion WHERE id=r.ubicacion_id;
      IF r.vivero_id IS NULL OR r.planta_id IS NULL OR r.metodo_id IS NULL OR r.fecha IS NULL OR r.tipo_material IS NULL
        OR r.unidad_canonica IS NULL OR coalesce(r.cantidad_inicial_canonica,0)<=0
        OR loc.latitud IS NULL OR loc.longitud IS NULL OR loc.latitud NOT BETWEEN -90 AND 90 OR loc.longitud NOT BETWEEN -180 AND 180
        OR (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          WHERE upper(t.codigo)='RECOLECCION' AND t.activo AND e.entidad_id=r.id AND e.eliminado_en IS NULL)<2 THEN
        RAISE EXCEPTION 'Ficha incompleta para validación.' USING ERRCODE='22023';
      END IF;
      v:=jsonb_populate_record(r,p_payload);
      UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION',motivo_rechazo=NULL,
        nombre_cientifico_snapshot=v.nombre_cientifico_snapshot,nombre_comercial_snapshot=v.nombre_comercial_snapshot,
        variedad_snapshot=v.variedad_snapshot,nombre_comunidad_snapshot=v.nombre_comunidad_snapshot,nombre_recolector_snapshot=v.nombre_recolector_snapshot,
        revision_captura=revision_captura+1 WHERE id=r.id RETURNING * INTO r;
      evento:='SOLICITUD_VALIDACION';
    END IF;
  END IF;
  ids:=public.m1_recoleccion_fotos_insertar(r.id,p_actor_id,p_fotos);
  IF evento IS NOT NULL THEN
    INSERT INTO public.recoleccion_historial(recoleccion_id,tipo_historial,estado_origen,estado_destino,actor_user_id,created_at,metadata)
      VALUES(r.id,evento,estado,r.estado_registro,p_actor_id,dia,jsonb_build_object('codigo_trazabilidad',r.codigo_trazabilidad,'origen','T1_M1'));
  END IF;
  RETURN jsonb_build_object('id',r.id,'revision_captura',r.revision_captura::text,'evidencia_ids',ids);
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_proteger_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE r public.recoleccion; l public.lote_vivero; estado text; unidades text[];
BEGIN
  IF NEW.tipo_movimiento::text IN ('CONSUMO_A_VIVERO','DESECHO') THEN
    r:=public.m1_recepcion_exigir_objeto(NEW.created_by,NEW.recoleccion_id);
    PERFORM public.m2_origen_exigir_habilitacion(r,r.vivero_id);
    unidades:=public.m2_movimiento_unidades(NEW);
    IF NEW.delta IS NULL OR NEW.delta>=0 OR NEW.delta::text IN ('NaN','Infinity','-Infinity')
      OR -NEW.delta>r.saldo_actual
      OR NEW.delta<>round(NEW.delta,6)
      OR (r.unidad_canonica::text='UNIDAD' AND NEW.delta<>trunc(NEW.delta))
      OR cardinality(unidades)=0 OR (r.unidad_canonica::text=ALL(unidades)) IS NOT TRUE THEN
      RAISE EXCEPTION 'DEBITO_ORIGEN_INVALIDO' USING ERRCODE='22023';
    END IF;
    IF NEW.tipo_movimiento::text='CONSUMO_A_VIVERO' THEN
      SELECT * INTO l FROM public.lote_vivero WHERE id=NEW.lote_vivero_id AND recoleccion_id=r.id;
      IF NOT FOUND OR l.cantidad_inicial_en_proceso IS DISTINCT FROM -NEW.delta
        OR l.unidad_medida_inicial IS DISTINCT FROM r.unidad_canonica
        OR l.fecha_inicio<(SELECT fecha_recepcion FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id)
        OR NOT EXISTS(SELECT 1 FROM public.evento_lote_vivero e WHERE e.lote_id=l.id
          AND e.tipo_evento::text='INICIO' AND e.cantidad_afectada=-NEW.delta AND e.unidad_medida_evento=r.unidad_canonica
          AND e.fecha_evento>=l.fecha_inicio)
        OR EXISTS(SELECT 1 FROM public.recoleccion_movimiento m WHERE m.recoleccion_id=r.id
          AND m.lote_vivero_id=l.id AND m.tipo_movimiento::text='CONSUMO_A_VIVERO') THEN
        RAISE EXCEPTION 'VINCULO_CONSUMO_LOTE_INICIO_INCONSISTENTE' USING ERRCODE='P0001';
      END IF;
      estado:=public.m2_origen_estado_habilitacion(r,r.vivero_id);
      PERFORM public.m2_exigir_vivero(NEW.created_by,l.vivero_id);
      IF l.vivero_id IS DISTINCT FROM r.vivero_id
        AND (estado<>'RECEPCION_CONFORME' OR public.m1_exigir_actor(NEW.created_by,false)<>'ADMIN') THEN
        RAISE EXCEPTION 'El origen debe pertenecer a la custodia del vivero.' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.lote_vivero_id IS NOT NULL THEN
      RAISE EXCEPTION 'DEBITO_ORIGEN_INVALIDO' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(
  p_recoleccion_id bigint,p_vivero_id bigint,p_responsable_id bigint,p_fecha_inicio date,p_fecha_evento date,
  p_cantidad_inicial_en_proceso numeric,p_unidad_medida_inicial public.unidad_medida,
  p_observaciones text DEFAULT NULL,p_evidencia_ids bigint[] DEFAULT NULL,p_codigo_trazabilidad text DEFAULT NULL
) RETURNS TABLE (
  lote_vivero_id bigint,evento_inicio_id bigint,recoleccion_movimiento_id bigint,codigo_trazabilidad text,
  saldo_recoleccion_antes numeric,saldo_recoleccion_despues numeric,evidencia_inicio_ids bigint[]
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE r public.recoleccion; rol text;
BEGIN
  rol:=public.m1_exigir_actor(p_responsable_id,false);
  PERFORM public.m2_exigir_vivero(p_responsable_id,p_vivero_id);
  r:=public.m1_recepcion_exigir_objeto(p_responsable_id,p_recoleccion_id);
  PERFORM public.m2_origen_exigir_habilitacion(r,r.vivero_id);
  IF r.vivero_id IS DISTINCT FROM p_vivero_id
    AND (rol<>'ADMIN' OR public.m2_origen_estado_habilitacion(r,r.vivero_id)<>'RECEPCION_CONFORME') THEN
    RAISE EXCEPTION 'El origen debe pertenecer a la custodia del vivero.' USING ERRCODE='42501';
  END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_evento IS NULL
    OR p_fecha_inicio<(SELECT fecha_recepcion FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id)
    OR p_fecha_evento<p_fecha_inicio
    OR p_fecha_inicio>(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date
    OR p_fecha_evento>(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date THEN
    RAISE EXCEPTION 'INICIO_NO_PUEDE_PRECEDER_RECEPCION' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT * FROM public.m2_inicio_lote_impl(p_recoleccion_id,p_vivero_id,p_responsable_id,p_fecha_inicio,
    p_fecha_evento,p_cantidad_inicial_en_proceso,p_unidad_medida_inicial,p_observaciones,p_evidencia_ids,p_codigo_trazabilidad);
END $$;

CREATE OR REPLACE FUNCTION public.m2_acceso_leer(
  p_actor_id bigint,p_auth_id text,p_usuario_id bigint,p_antes_de_id bigint DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.usuario%ROWTYPE; u public.usuario%ROWTYPE; n bigint; filas jsonb; vigentes jsonb;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  IF p_usuario_id IS NULL OR p_usuario_id<=0 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50
    OR (p_antes_de_id IS NOT NULL AND p_antes_de_id<=0) THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no es válida.',NULL);
  END IF;
  FOR n IN SELECT DISTINCT x FROM unnest(ARRAY[p_actor_id,p_usuario_id]) x ORDER BY x LOOP
    PERFORM 1 FROM public.usuario WHERE id=n FOR SHARE;
  END LOOP;
  SELECT * INTO a FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',NULL); END IF;
  IF NOT a.activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',NULL); END IF;
  IF a.id<>p_usuario_id AND a.rol::text<>'ADMIN' THEN
    RETURN public.pa_c_fuera(403,'CAPACIDAD_INSUFICIENTE','Solo ADMIN consulta accesos ajenos.',NULL);
  END IF;
  SELECT * INTO u FROM public.usuario WHERE id=p_usuario_id;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(404,'RECURSO_NO_VISIBLE','La cuenta no está disponible.',NULL); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id::text,'vivero_id',v.vivero_id::text,
    'otorgado_en',v.otorgado_en,'otorgado_por',v.otorgado_por::text,
    'acceso_efectivo',public.m2_acceso_efectivo(u.id,v.vivero_id),
    'capacidades',jsonb_build_object('operar',public.m2_acceso_efectivo(u.id,v.vivero_id),
      'consultar_material',public.m2_acceso_efectivo(u.id,v.vivero_id),'desechar_semillas',public.m2_acceso_efectivo(u.id,v.vivero_id),
      'recibir_y_validar',public.m2_acceso_efectivo(u.id,v.vivero_id) AND u.rol::text IN ('ADMIN','VALIDADOR'))) ORDER BY v.vivero_id),'[]'::jsonb)
    INTO vigentes FROM public.usuario_vivero v WHERE v.usuario_id=u.id AND v.revocado_en IS NULL;
  SELECT coalesce(jsonb_agg(fila ORDER BY id DESC),'[]'::jsonb) INTO filas FROM (
    SELECT h.id,jsonb_build_object('id',h.id::text,'vivero_id',h.vivero_id::text,'evento',h.evento,'acceso_id',h.acceso_id::text,
      'actor_id',h.actor_id::text,'revision_anterior',h.revision_anterior::text,'revision_nueva',h.revision_nueva::text,
      'motivo',h.motivo,'creado_en',h.creado_en,'comando_id',c.comando_id,
      'otorgado_en',v.otorgado_en,'revocado_en',v.revocado_en) fila
    FROM public.usuario_vivero_historial h
    JOIN public.vivero_acceso_comando c ON c.id=h.comando_id
    JOIN public.usuario_vivero v ON v.id=h.acceso_id
    WHERE h.usuario_id=u.id AND (p_antes_de_id IS NULL OR h.id<p_antes_de_id)
    ORDER BY h.id DESC LIMIT p_limite+1
  ) t;
  RETURN jsonb_build_object('http_status',200,'body',jsonb_build_object('data',jsonb_build_object(
    'usuario_id',u.id::text,'rol_global',u.rol::text,'activo',u.activo,
    'revision_acceso',coalesce((SELECT revision FROM public.usuario_vivero_revision WHERE usuario_id=u.id),0)::text,
    'revision_autoridad',u.revision_autoridad::text,
    'alcance_global',u.activo AND u.rol::text='ADMIN',
    'viveros',vigentes,
    'capacidades_globales',jsonb_build_object('administrar',u.activo AND u.rol::text='ADMIN',
      'operar_cualquier_vivero',u.activo AND u.rol::text='ADMIN','desechar_semillas_cualquier_vivero',u.activo AND u.rol::text='ADMIN',
      'recibir_y_validar_cualquier_vivero',u.activo AND u.rol::text='ADMIN'),
    'historial',CASE WHEN jsonb_array_length(filas)>p_limite THEN filas-p_limite ELSE filas END,
    'siguiente_antes_de_id',CASE WHEN jsonb_array_length(filas)>p_limite THEN filas->(p_limite-1)->>'id' ELSE NULL END),
    'observado_en',clock_timestamp()));
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_proyectar(p_actor bigint,p_origen bigint,p_detalle boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; recepcion jsonb; bloqueado boolean; fila jsonb; puede boolean;
BEGIN
  SELECT * INTO STRICT r FROM public.recoleccion WHERE id=p_origen;
  SELECT jsonb_build_object('id',id::text,'fecha_recepcion',fecha_recepcion,'recibido_por',recibido_por::text,
    'registrado_en',registrado_en) INTO recepcion FROM public.recoleccion_recepcion WHERE recoleccion_id=r.id;
  bloqueado:=EXISTS(SELECT 1 FROM public.recoleccion_movimiento WHERE recoleccion_id=r.id)
    OR EXISTS(SELECT 1 FROM public.lote_vivero WHERE recoleccion_id=r.id)
    OR r.saldo_actual IS DISTINCT FROM r.cantidad_inicial_canonica;
  puede:=public.m1_recepcion_actor_autorizado(p_actor,r.vivero_id) AND r.usuario_id<>p_actor
    AND recepcion IS NULL AND NOT bloqueado AND r.estado_registro::text='PENDIENTE_VALIDACION';
  fila:=jsonb_build_object('recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,'recolector_id',r.usuario_id::text,
    'codigo_trazabilidad',r.codigo_trazabilidad,'fecha_recoleccion',r.fecha,'tipo_material',r.tipo_material,
    'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,'nombre_comercial_snapshot',r.nombre_comercial_snapshot,
    'nombre_recolector_snapshot',r.nombre_recolector_snapshot,'cantidad_declarada',r.cantidad_inicial_canonica,
    'unidad_declarada',r.unidad_canonica,'saldo_actual',r.saldo_actual,'revision',r.revision_captura::text,
    'estado_registro',r.estado_registro,'motivo_rechazo',r.motivo_rechazo,'recepcion',recepcion,
    'puede_recibir_validar',puede,'puede_rechazar',puede);
  IF p_detalle THEN
    fila:=fila||jsonb_build_object('observaciones',r.observaciones,'ubicacion_id',r.ubicacion_id::text,
      'metodo_id',r.metodo_id::text,'planta_id',r.planta_id::text,
      'ubicacion',(SELECT jsonb_build_object('id',u.id::text,'pais_id',to_jsonb(u)->>'pais_id',
        'division_id',to_jsonb(u)->>'division_id','nombre',to_jsonb(u)->>'nombre','referencia',to_jsonb(u)->>'referencia',
        'latitud',u.latitud,'longitud',u.longitud,'precision_m',to_jsonb(u)->'precision_m','fuente',to_jsonb(u)->>'fuente')
        FROM public.ubicacion u WHERE u.id=r.ubicacion_id),
      'historial',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id::text,
      'tipo_historial',h.tipo_historial,'estado_origen',h.estado_origen,'estado_destino',h.estado_destino,
      'actor_id',h.actor_user_id::text,'fecha',h.created_at,'metadata',h.metadata) ORDER BY h.id)
      FROM public.recoleccion_historial h WHERE h.recoleccion_id=r.id),'[]'::jsonb),
      'evidencias',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'bucket',e.bucket,'ruta_archivo',e.ruta_archivo,
        'mime_type',e.mime_type,'titulo',e.titulo,'recepcion_id',v.recepcion_id::text) ORDER BY e.id)
        FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          LEFT JOIN public.recoleccion_recepcion_evidencia v ON v.evidencia_id=e.id
        WHERE e.entidad_id=r.id AND e.eliminado_en IS NULL AND t.activo
          AND (upper(t.codigo)='RECOLECCION' OR (upper(t.codigo)='RECOLECCION_RECEPCION' AND v.recepcion_id IS NOT NULL))),'[]'::jsonb));
  END IF;
  RETURN fila;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recepcion_leer(p_actor_id bigint,p_recoleccion_id bigint DEFAULT NULL,p_antes_de_id bigint DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; filas jsonb; siguiente bigint;
BEGIN
  PERFORM public.m1_exigir_actor(p_actor_id,false);
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 OR (p_antes_de_id IS NOT NULL AND p_antes_de_id<=0) THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023'; END IF;
  IF p_recoleccion_id IS NOT NULL THEN
    SELECT * INTO r FROM public.recoleccion WHERE id=p_recoleccion_id AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORIGEN_NO_DISPONIBLE' USING ERRCODE='P0002'; END IF;
    IF NOT public.m1_recepcion_actor_autorizado(p_actor_id,r.vivero_id) OR r.usuario_id=p_actor_id THEN
      RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
    IF r.estado_registro::text NOT IN ('PENDIENTE_VALIDACION','VALIDADO','RECHAZADO') THEN
      RAISE EXCEPTION 'ESTADO_NO_RECEPCIONABLE' USING ERRCODE='P0001'; END IF;
    RETURN public.m1_recepcion_proyectar(p_actor_id,r.id,true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.usuario u WHERE u.id=p_actor_id AND u.activo
    AND (u.rol::text='ADMIN' OR (u.rol::text='VALIDADOR' AND EXISTS(
      SELECT 1 FROM public.usuario_vivero v WHERE v.usuario_id=u.id AND v.revocado_en IS NULL)))) THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(public.m1_recepcion_proyectar(p_actor_id,id,false) ORDER BY id DESC),'[]'::jsonb),
    CASE WHEN count(*)=p_limite THEN min(id) END INTO filas,siguiente FROM (
    SELECT q.id FROM public.recoleccion q WHERE q.eliminado_en IS NULL AND q.estado_registro::text='PENDIENTE_VALIDACION'
      AND q.usuario_id<>p_actor_id AND public.m1_recepcion_actor_autorizado(p_actor_id,q.vivero_id)
      AND NOT EXISTS(SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=q.id)
      AND (p_antes_de_id IS NULL OR q.id<p_antes_de_id) ORDER BY q.id DESC LIMIT p_limite) x;
  RETURN jsonb_build_object('data',filas,'siguiente_antes_de_id',siguiente::text);
END $$;

CREATE OR REPLACE FUNCTION public.m2_origenes_leer(
  p_actor_id bigint,p_vivero_id bigint,p_recoleccion_id bigint,p_pagina integer,p_limite integer,p_incluir_pendientes boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE filas jsonb; total bigint;
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 1000000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paginación inválida.' USING ERRCODE='22023'; END IF;
  WITH estados AS MATERIALIZED (
    SELECT r.*,public.m2_origen_estado_habilitacion(r,p_vivero_id) estado_habilitacion
    FROM public.recoleccion r WHERE r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL AND r.estado_registro='VALIDADO'
      AND r.estado_operativo='ABIERTO' AND r.saldo_actual>0 AND (p_recoleccion_id IS NULL OR r.id=p_recoleccion_id)
  ), disponibles AS MATERIALIZED (
    SELECT e.* FROM estados e WHERE e.estado_habilitacion='RECEPCION_CONFORME'
      OR (p_incluir_pendientes AND e.estado_habilitacion IS NOT NULL)
  ), pagina AS (
    SELECT r.id,jsonb_build_object('recoleccion_id',r.id::text,'vivero_almacenamiento_id',r.vivero_id::text,
      'recolector_id',r.usuario_id::text,'codigo_trazabilidad',r.codigo_trazabilidad,'fecha',r.fecha,'planta_id',r.planta_id::text,
      'tipo_material',r.tipo_material,'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,
      'nombre_comercial_snapshot',r.nombre_comercial_snapshot,'variedad_snapshot',r.variedad_snapshot,'estado_registro',r.estado_registro,
      'estado_operativo',r.estado_operativo,'saldo_actual',r.saldo_actual,'unidad_canonica',r.unidad_canonica)
      ||CASE WHEN p_incluir_pendientes THEN jsonb_build_object('estado_habilitacion',r.estado_habilitacion) ELSE '{}'::jsonb END fila
    FROM disponibles r ORDER BY r.id DESC OFFSET (p_pagina-1)*p_limite LIMIT p_limite
  ) SELECT (SELECT count(*) FROM disponibles),coalesce((SELECT jsonb_agg(p.fila ORDER BY p.id DESC) FROM pagina p),'[]'::jsonb)
    INTO total,filas;
  IF p_recoleccion_id IS NOT NULL AND total=0 AND NOT EXISTS(
    SELECT 1 FROM public.recoleccion r WHERE r.id=p_recoleccion_id AND r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL
      AND r.estado_registro='VALIDADO' AND (p_incluir_pendientes OR EXISTS(
        SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id))) THEN
    RAISE EXCEPTION 'Origen sin recepción conforme disponible.' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object('success',true,'data',filas,'pagination',jsonb_build_object('page',p_pagina,'limit',p_limite,'total',total));
END $$;

CREATE OR REPLACE FUNCTION public.m2_origen_motivo_no_inicio(r public.recoleccion,p_estado text,p_saldo numeric)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT CASE
    WHEN p_estado='PENDIENTE_RECEPCION' THEN 'Pendiente de recepción física conforme.'
    WHEN r.id IS NULL OR coalesce(p_estado,'') <>'RECEPCION_CONFORME'
      THEN 'El origen no está disponible para iniciar un lote.'
    WHEN coalesce(r.unidad_canonica::text,'') NOT IN ('G','UNIDAD')
      OR (r.tipo_material::text='ESQUEJE' AND r.unidad_canonica::text<>'UNIDAD')
      THEN 'La unidad canónica del origen no es compatible con INICIO.'
    WHEN p_saldo IS NULL OR p_saldo::text IN ('NaN','Infinity','-Infinity')
      OR p_saldo<CASE WHEN r.unidad_canonica::text='UNIDAD' THEN 1 ELSE 0.000001 END
      THEN 'El saldo no alcanza la cantidad mínima admitida para su unidad.'
    WHEN NOT EXISTS(SELECT 1 FROM public.ubicacion u WHERE u.id=r.ubicacion_id
      AND u.latitud BETWEEN -90 AND 90 AND u.longitud BETWEEN -180 AND 180)
      THEN 'La ficha del origen no tiene ubicación válida para INICIO.'
    WHEN (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
      WHERE e.entidad_id=r.id AND upper(t.codigo)='RECOLECCION' AND t.activo AND e.eliminado_en IS NULL)<2
      THEN 'La ficha del origen necesita al menos dos evidencias de Recolección vigentes.'
    WHEN nullif(btrim(r.codigo_trazabilidad),'') IS NULL THEN 'La ficha del origen no tiene código de trazabilidad.'
    WHEN r.planta_id IS NULL THEN 'La ficha del origen no tiene planta asociada.'
    WHEN nullif(btrim(r.nombre_cientifico_snapshot),'') IS NULL OR nullif(btrim(r.nombre_comercial_snapshot),'') IS NULL
      OR nullif(btrim(r.variedad_snapshot),'') IS NULL OR nullif(btrim(r.nombre_comunidad_snapshot),'') IS NULL
      THEN 'Faltan datos históricos de la especie o la comunidad en la ficha del origen.'
    ELSE NULL
  END
$$;

-- Retirar exclusivamente la familia obsoleta, después de sustituir todos los
-- consumidores compartidos. Sin CASCADE: cualquier dependencia externa aborta.
DO $$ DECLARE firmas text; BEGIN
  SELECT string_agg(p.oid::regprocedure::text,',' ORDER BY p.oid) INTO firmas
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'm2_conciliacion_%'
      OR p.proname IN ('m1_recepcion_diagnostico','fn_recoleccion_rechazar_validacion'));
  IF firmas IS NOT NULL THEN EXECUTE 'DROP FUNCTION '||firmas; END IF;
END $$;
DROP TABLE IF EXISTS public.recoleccion_recepcion_observacion;
DROP TABLE IF EXISTS public.recoleccion_conciliacion_evidencia;
DROP TABLE IF EXISTS public.recoleccion_conciliacion_evidencia_contexto;
DROP TABLE IF EXISTS public.recoleccion_conciliacion_evento;
DROP TABLE IF EXISTS public.recoleccion_conciliacion_comando;
ALTER TABLE public.recoleccion DROP COLUMN IF EXISTS usuario_validacion_id;
ALTER TABLE public.recoleccion DROP COLUMN IF EXISTS fecha_validacion;

-- Conserva RLS/inmutabilidad y cierre DML097 en tablas existentes. Las nuevas
-- funciones son privadas; sólo entradas acotadas quedan disponibles al servicio.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid,p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'm1_recepcion_%' OR p.proname IN (
      'm1_recoleccion_guardar','m2_acceso_leer','m2_movimiento_unidades','m2_origen_estado_habilitacion',
      'm2_origen_exigir_habilitacion','m2_origen_motivo_no_inicio','m2_origenes_leer',
      'fn_recoleccion_acotar_excepcion_fecha_rechazo','fn_vivero_crear_lote_desde_recoleccion')) LOOP
    EXECUTE format('ALTER FUNCTION %s SET lock_timeout TO %L',f.firma,'5s');
    EXECUTE format('ALTER FUNCTION %s SET statement_timeout TO %L',f.firma,'30s');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'RECEPCION_UNICA_PRIVILEGIO_FUNCION_INESPERADO: %',f.firma; END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb),
  public.m1_recepcion_ejecutar(bigint,text,uuid,jsonb),public.m1_recepcion_recuperar(bigint,text,uuid),
  public.m1_recepcion_leer(bigint,bigint,bigint,integer),public.m1_recepcion_evidencias_preparar(bigint,bigint,bigint,jsonb),
  public.m2_acceso_leer(bigint,text,bigint,bigint,integer),
  public.m2_origenes_leer(bigint,bigint,bigint,integer,integer),
  public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean),
  public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean,boolean),
  public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)
TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
