-- T1: escrituras M1 cooperativas con retiro/rol/baja (092/072).
-- Lecturas HTTP se acotan por objeto antes de fotos/agregados/paginación.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF to_regprocedure('public.m1_acceso_efectivo(bigint)') IS NULL
    OR to_regprocedure('public.fn_recoleccion_eliminar_borrador(bigint,bigint)') IS NULL
    OR to_regprocedure('public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)') IS NULL
    OR to_regprocedure('public.fn_recoleccion_registrar_desecho(bigint,numeric,bigint)') IS NULL THEN
    RAISE EXCEPTION 'T1_CATALOGO_INCOMPATIBLE: requiere 059/089/090/092';
  END IF;
  PERFORM r.usuario_id,r.fecha,r.estado_registro,r.eliminado_en,r.saldo_actual,r.unidad_canonica,
    r.usuario_validacion_id,r.fecha_validacion,r.nombre_recolector_snapshot FROM public.recoleccion r LIMIT 0;
  PERFORM e.bucket,e.ruta_archivo,e.creado_por_usuario_id,e.eliminado_en FROM public.evidencias_trazabilidad e LIMIT 0;
END $$;
ALTER TABLE public.recoleccion ADD COLUMN IF NOT EXISTS revision_captura bigint NOT NULL DEFAULT 0 CHECK(revision_captura>=0);

DO $$ DECLARE v record; BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('recoleccion','revision_captura','bigint'),('recoleccion','fecha','date'),
    ('recoleccion','eliminado_en','date'),('recoleccion','fecha_validacion','date'),
    ('recoleccion_historial','created_at','date'),('evidencias_trazabilidad','storage_object_id','uuid'),
    ('evidencias_trazabilidad','tomado_en','timestamp with time zone')
  ) esperado(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||v.tabla)::regclass
      AND attname=v.columna AND atttypid=v.tipo::regtype AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T1_CATALOGO_INCOMPATIBLE: %.%',v.tabla,v.columna;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.m1_exigir_actor(p_actor_id bigint,p_acceso boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rol text;
BEGIN
  SELECT u.rol::text INTO rol FROM public.usuario u WHERE u.id=p_actor_id AND u.activo FOR SHARE;
  IF NOT FOUND OR rol NOT IN ('ADMIN','GENERAL','VALIDADOR') OR (p_acceso AND NOT public.m1_acceso_efectivo(p_actor_id)) THEN
    RAISE EXCEPTION 'Se requiere cuenta interna activa con acceso M1.' USING ERRCODE='42501';
  END IF;
  RETURN rol;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recoleccion_fotos_insertar(p_id bigint,p_actor bigint,p_fotos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE tipo bigint; r public.recoleccion%ROWTYPE; f jsonb; n integer; ids jsonb:='[]'; eid bigint;
BEGIN
  -- Solo se llama bajo cuenta SHARE y ficha UPDATE del ejecutor.
  IF jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fotos)>10 THEN
    RAISE EXCEPTION 'Fotos inválidas.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_fotos)=0 THEN RETURN ids; END IF;
  SELECT * INTO STRICT r FROM public.recoleccion WHERE id=p_id;
  SELECT id INTO STRICT tipo FROM public.tipos_entidad_evidencia WHERE upper(codigo)='RECOLECCION' AND activo;
  SELECT coalesce(max(orden),-1)+1 INTO n FROM public.evidencias_trazabilidad
    WHERE tipo_entidad_id=tipo AND entidad_id=p_id AND eliminado_en IS NULL;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','')='' OR coalesce(f->>'mime_type','') NOT LIKE 'image/%'
      OR coalesce((f->>'tamano_bytes')::bigint,0)<=0 THEN RAISE EXCEPTION 'Foto inválida.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,codigo_trazabilidad,bucket,ruta_archivo,
      storage_object_id,tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_por_usuario_id)
    VALUES(tipo,p_id,r.codigo_trazabilidad,'recoleccion_fotos',f->>'ruta_archivo',
      (f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',(f->>'tamano_bytes')::bigint,f->>'hash_sha256',
      coalesce(f->>'titulo','Foto '||(n+1)),f->>'descripcion',coalesce(f->'metadata','{}'::jsonb),coalesce((f->>'es_principal')::boolean,n=0),n,
      (f->>'tomado_en')::timestamptz,p_actor) RETURNING id INTO eid;
    ids:=ids||jsonb_build_array(eid); n:=n+1;
  END LOOP;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.m1_recoleccion_guardar(
  p_actor_id bigint,p_accion text,p_recoleccion_id bigint,p_revision_esperada bigint,p_payload jsonb,p_fotos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rol text; r public.recoleccion%ROWTYPE; v public.recoleccion%ROWTYPE; ids jsonb; estado public.estado_registro_recoleccion;
  evento public.tipo_historial_recoleccion; permitidos text[]; loc record; dia date;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  rol:=public.m1_exigir_actor(p_actor_id,p_accion IS DISTINCT FROM 'APROBAR');
  IF p_accion IS NULL OR p_accion NOT IN ('CREAR','EDITAR','ENVIAR','APROBAR','FOTOS')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Entrada inválida.' USING ERRCODE='22023';
  END IF;
  IF p_accion='APROBAR' AND rol NOT IN ('ADMIN','VALIDADOR') THEN
    RAISE EXCEPTION 'Se requiere revisor autorizado.' USING ERRCODE='42501';
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
    IF p_accion='APROBAR' THEN
      IF r.usuario_id=p_actor_id THEN RAISE EXCEPTION 'No se permite confirmar la recolección propia.' USING ERRCODE='42501'; END IF;
    ELSIF rol<>'ADMIN' AND r.usuario_id<>p_actor_id THEN
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
        estado_registro=CASE WHEN p_accion='EDITAR' THEN 'BORRADOR'::public.estado_registro_recoleccion ELSE r.estado_registro END,
        revision_captura=revision_captura+1 WHERE id=r.id RETURNING * INTO r;
      END IF;
      -- 014 no tiene evento de edición: se conserva esa semántica, sin fabricar una transición.
      evento:=NULL;
    ELSE
      IF (p_accion='ENVIAR' AND r.estado_registro::text<>'BORRADOR') OR
        (p_accion='APROBAR' AND r.estado_registro::text<>'PENDIENTE_VALIDACION') THEN
        RAISE EXCEPTION 'Estado no permitido.' USING ERRCODE='P0001';
      END IF;
      IF jsonb_array_length(p_fotos)<>0 OR (p_accion='ENVIAR' AND p_payload<>'{}'::jsonb)
        OR (p_accion='APROBAR' AND (p_payload-ARRAY['nombre_cientifico_snapshot','nombre_comercial_snapshot',
          'variedad_snapshot','nombre_comunidad_snapshot','nombre_recolector_snapshot'])<>'{}'::jsonb) THEN
        RAISE EXCEPTION 'Campo no permitido.' USING ERRCODE='22023';
      END IF;
      SELECT latitud,longitud INTO loc FROM public.ubicacion WHERE id=r.ubicacion_id;
      IF r.vivero_id IS NULL OR r.planta_id IS NULL OR r.metodo_id IS NULL OR r.fecha IS NULL OR r.tipo_material IS NULL
        OR r.unidad_canonica IS NULL OR coalesce(r.cantidad_inicial_canonica,0)<=0
        OR loc.latitud IS NULL OR loc.longitud IS NULL OR loc.latitud NOT BETWEEN -90 AND 90 OR loc.longitud NOT BETWEEN -180 AND 180
        OR (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          WHERE upper(t.codigo)='RECOLECCION' AND t.activo AND e.entidad_id=r.id AND e.eliminado_en IS NULL)<2 THEN
        RAISE EXCEPTION 'Ficha incompleta para validación.' USING ERRCODE='22023';
      END IF;
      v:=jsonb_populate_record(r,p_payload);
      UPDATE public.recoleccion SET estado_registro=CASE WHEN p_accion='ENVIAR' THEN 'PENDIENTE_VALIDACION'::public.estado_registro_recoleccion ELSE 'VALIDADO'::public.estado_registro_recoleccion END,
        usuario_validacion_id=CASE WHEN p_accion='APROBAR' THEN p_actor_id ELSE r.usuario_validacion_id END,
        fecha_validacion=CASE WHEN p_accion='APROBAR' THEN dia ELSE r.fecha_validacion END,
        nombre_cientifico_snapshot=v.nombre_cientifico_snapshot,nombre_comercial_snapshot=v.nombre_comercial_snapshot,
        variedad_snapshot=v.variedad_snapshot,nombre_comunidad_snapshot=v.nombre_comunidad_snapshot,nombre_recolector_snapshot=v.nombre_recolector_snapshot,
        revision_captura=revision_captura+1 WHERE id=r.id RETURNING * INTO r;
      evento:=CASE WHEN p_accion='ENVIAR' THEN 'SOLICITUD_VALIDACION'::public.tipo_historial_recoleccion ELSE 'VALIDACION_APROBADA'::public.tipo_historial_recoleccion END;
    END IF;
  END IF;
  ids:=public.m1_recoleccion_fotos_insertar(r.id,p_actor_id,p_fotos);
  IF evento IS NOT NULL THEN
    INSERT INTO public.recoleccion_historial(recoleccion_id,tipo_historial,estado_origen,estado_destino,actor_user_id,created_at,metadata)
      VALUES(r.id,evento,estado,r.estado_registro,p_actor_id,dia,jsonb_build_object('codigo_trazabilidad',r.codigo_trazabilidad,'origen','T1_M1'));
  END IF;
  RETURN jsonb_build_object('id',r.id,'revision_captura',r.revision_captura::text,'evidencia_ids',ids);
END $$;

-- Redefinición aditiva de 089; conserva borrado lógico e historial.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_eliminar_borrador(
  p_recoleccion_id bigint,
  p_actor_id bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s' SET statement_timeout = '30s' AS $$
DECLARE
  v_rol text;
  v_recoleccion record;
  v_fecha date;
BEGIN
  -- Mismo orden que las operaciones contextuales: cuenta -> registro.
  v_rol := public.m1_exigir_actor(p_actor_id);

  SELECT r.id, r.usuario_id, r.estado_registro, r.eliminado_en, r.codigo_trazabilidad
  INTO v_recoleccion FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id FOR UPDATE;
  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_rol <> 'ADMIN' AND v_recoleccion.usuario_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'Solo el creador o un ADMIN pueden eliminar el borrador.'
      USING ERRCODE = '42501';
  END IF;
  IF v_recoleccion.estado_registro::text IS DISTINCT FROM 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se puede eliminar una recolección en BORRADOR.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 015 conserva granularidad de día. La fecha de negocio no depende del
  -- TimeZone de la sesión PostgREST (por ejemplo, UTC).
  v_fecha := (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  UPDATE public.recoleccion
  SET eliminado_en = v_fecha, eliminado_por_usuario_id = p_actor_id, revision_captura=revision_captura+1
  WHERE id = p_recoleccion_id
  RETURNING eliminado_en INTO v_fecha;
  INSERT INTO public.recoleccion_historial (
    recoleccion_id, tipo_historial, estado_origen, estado_destino,
    actor_user_id, created_at, metadata
  ) VALUES (
    p_recoleccion_id, 'BORRADOR_ELIMINADO', 'BORRADOR', 'BORRADOR',
    p_actor_id, v_fecha,
    jsonb_build_object('codigo_trazabilidad', v_recoleccion.codigo_trazabilidad)
  );
  RETURN jsonb_build_object(
    'recoleccion_id', p_recoleccion_id,
    'eliminado_en', v_fecha,
    'eliminado_por_usuario_id', p_actor_id
  );
END;
$$;


-- 090 conserva la excepción temporal solo para el rechazo atómico.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.estado_registro::text IS NOT DISTINCT FROM 'RECHAZADO'
    AND (NEW.fecha >= CURRENT_DATE - 45 AND NEW.fecha <= CURRENT_DATE) IS NOT TRUE THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.estado_registro::text IS NOT DISTINCT FROM 'PENDIENTE_VALIDACION'
        AND NEW.revision_captura=OLD.revision_captura+1
        AND NEW.usuario_validacion_id IS NULL AND NEW.fecha_validacion IS NULL
        AND NEW.motivo_rechazo IS NOT NULL
        AND char_length(NEW.motivo_rechazo) BETWEEN 10 AND 500
        AND (to_jsonb(NEW) - ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo','revision_captura'])
          IS NOT DISTINCT FROM
            (to_jsonb(OLD) - ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo','revision_captura']) THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION 'Fecha fuera de rango: solo se permite rechazar una recolección pendiente sin editar su ficha.'
      USING ERRCODE = '23514', CONSTRAINT = 'chk_fecha_rango';
  END IF;
  RETURN NEW;
END;
$$;
-- Conserva el rechazo 090 y hace visible el cambio a escritores preparados.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_rechazar_validacion(
  p_recoleccion_id bigint, p_actor_id bigint, p_motivo_rechazo text
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s' SET statement_timeout = '30s' AS $$
DECLARE
  v_recoleccion record;
BEGIN
  -- Actor resuelto por el backend desde identidad verificada; no rol del body.
  -- Orden compartido con las operaciones de cuenta y 089: cuenta -> registro.
  PERFORM 1 FROM public.usuario u
  WHERE u.id = p_actor_id AND u.activo IS TRUE
    AND u.rol::text IN ('ADMIN','VALIDADOR') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Se requiere cuenta activa VALIDADOR o ADMIN.' USING ERRCODE = '42501';
  END IF;
  IF p_motivo_rechazo IS NULL OR char_length(p_motivo_rechazo) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'motivo_rechazo debe tener entre 10 y 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  SELECT r.estado_registro, r.eliminado_en, r.codigo_trazabilidad
  INTO v_recoleccion FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id FOR UPDATE;
  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_recoleccion.estado_registro::text IS DISTINCT FROM 'PENDIENTE_VALIDACION' THEN
    RAISE EXCEPTION 'Solo se puede rechazar una recolección en PENDIENTE_VALIDACION.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.recoleccion
  SET estado_registro = 'RECHAZADO', usuario_validacion_id = NULL,
    fecha_validacion = NULL, motivo_rechazo = p_motivo_rechazo, revision_captura=revision_captura+1
  WHERE id = p_recoleccion_id;
  INSERT INTO public.recoleccion_historial (
    recoleccion_id, tipo_historial, estado_origen, estado_destino,
    observaciones, actor_user_id, created_at, metadata
  ) VALUES (
    p_recoleccion_id, 'VALIDACION_RECHAZADA', 'PENDIENTE_VALIDACION', 'RECHAZADO',
    nullif(btrim(p_motivo_rechazo), ''), p_actor_id,
    (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date,
    jsonb_build_object('codigo_trazabilidad', v_recoleccion.codigo_trazabilidad,
      'motivo_rechazo', p_motivo_rechazo)
  );
END;
$$;


-- Redefinición completa de 059: conserva saldo/ledger/unidades en una transacción.
CREATE OR REPLACE FUNCTION public.fn_recoleccion_registrar_desecho(
  p_recoleccion_id      BIGINT,
  p_cantidad_desechada NUMERIC,
  p_usuario_id          BIGINT
)
RETURNS TABLE (
  recoleccion_movimiento_id BIGINT,
  recoleccion_id            BIGINT,
  cantidad_desechada        NUMERIC,
  unidad_medida             public.unidad_medida,
  saldo_antes               NUMERIC,
  saldo_despues             NUMERIC,
  estado_operativo          public.estado_operativo_recoleccion
)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_recoleccion       RECORD;
  v_saldo_antes       NUMERIC;
  v_saldo_despues     NUMERIC;
  v_movimiento_id     BIGINT;
  v_unidad            public.unidad_medida;
  v_unit_column       TEXT;
  v_unit_columns      TEXT[] := ARRAY[]::TEXT[];
  v_insert_columns    TEXT[] := ARRAY['recoleccion_id', 'tipo_movimiento', 'delta'];
  v_insert_values     TEXT[] := ARRAY['$1', '$2', '$3'];
  v_has_lote_vivero   BOOLEAN;
  v_has_created_by    BOOLEAN;
  v_has_detalle       BOOLEAN;
  v_sql               TEXT;
BEGIN
  IF p_recoleccion_id IS NULL OR p_recoleccion_id <= 0 THEN
    RAISE EXCEPTION 'p_recoleccion_id es obligatorio.';
  END IF;

  IF p_usuario_id IS NULL OR p_usuario_id <= 0 THEN
    RAISE EXCEPTION 'p_usuario_id es obligatorio.';
  END IF;

  IF p_cantidad_desechada IS NULL OR p_cantidad_desechada <= 0 THEN
    RAISE EXCEPTION 'La cantidad a desechar debe ser mayor que cero.';
  END IF;

  -- Transición T1: Vivero por establecimiento se habilita en T2.
  IF public.m1_exigir_actor(p_usuario_id,false)<>'ADMIN' THEN
    RAISE EXCEPTION 'Solo ADMIN puede registrar DESECHO en T1.' USING ERRCODE='42501';
  END IF;

  SELECT
    r.id,
    r.estado_registro,
    r.estado_operativo,
    r.saldo_actual,
    r.unidad_canonica,
    r.eliminado_en
  INTO v_recoleccion
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id
  FOR UPDATE;

  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'La recoleccion % no existe.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.estado_registro::TEXT <> 'VALIDADO' THEN
    RAISE EXCEPTION
      'Solo se puede desechar una recoleccion VALIDADO. Estado actual: %.',
      v_recoleccion.estado_registro;
  END IF;

  IF v_recoleccion.estado_operativo::TEXT <> 'ABIERTO'
     OR COALESCE(v_recoleccion.saldo_actual, 0) <= 0 THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene saldo disponible para desechar.',
      p_recoleccion_id;
  END IF;

  IF v_recoleccion.unidad_canonica IS NULL THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene unidad canonica.',
      p_recoleccion_id;
  END IF;

  v_saldo_antes := v_recoleccion.saldo_actual;
  v_unidad := v_recoleccion.unidad_canonica;

  IF p_cantidad_desechada > v_saldo_antes THEN
    RAISE EXCEPTION
      'La cantidad a desechar (%) no puede superar el saldo disponible (%).',
      p_cantidad_desechada,
      v_saldo_antes;
  END IF;

  SELECT ARRAY_AGG(column_name ORDER BY ordinal_position)
  INTO v_unit_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'recoleccion_movimiento'
    AND column_name IN (
      'unidad_operativa',
      'unidad_medida_evento',
      'unidad_medida_movimiento'
    );

  IF v_unit_columns IS NULL OR CARDINALITY(v_unit_columns) = 0 THEN
    RAISE EXCEPTION
      'recoleccion_movimiento no tiene una columna de unidad compatible.';
  END IF;

  FOREACH v_unit_column IN ARRAY v_unit_columns LOOP
    v_insert_columns := ARRAY_APPEND(v_insert_columns, quote_ident(v_unit_column));
    v_insert_values := ARRAY_APPEND(v_insert_values, '$4');
  END LOOP;

  v_insert_columns := ARRAY_APPEND(v_insert_columns, 'motivo');
  v_insert_values := ARRAY_APPEND(v_insert_values, '$5');

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'lote_vivero_id'
  )
  INTO v_has_lote_vivero;

  IF v_has_lote_vivero THEN
    v_insert_columns := ARRAY_APPEND(v_insert_columns, 'lote_vivero_id');
    v_insert_values := ARRAY_APPEND(v_insert_values, '$6');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'created_by'
  )
  INTO v_has_created_by;

  IF NOT v_has_created_by THEN
    RAISE EXCEPTION
      'recoleccion_movimiento no tiene created_by.';
  END IF;

  v_insert_columns := ARRAY_APPEND(v_insert_columns, 'created_by');
  v_insert_values := ARRAY_APPEND(v_insert_values, '$7');

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'detalle_cambios'
  )
  INTO v_has_detalle;

  IF v_has_detalle THEN
    v_insert_columns := ARRAY_APPEND(v_insert_columns, 'detalle_cambios');
    v_insert_values := ARRAY_APPEND(v_insert_values, '$8');
  END IF;

  v_sql := FORMAT(
    'INSERT INTO public.recoleccion_movimiento (%s) VALUES (%s) RETURNING id',
    ARRAY_TO_STRING(v_insert_columns, ', '),
    ARRAY_TO_STRING(v_insert_values, ', ')
  );

  EXECUTE v_sql
  INTO v_movimiento_id
  USING
    p_recoleccion_id,
    'DESECHO'::public.tipo_movimiento_recoleccion,
    -p_cantidad_desechada,
    v_unidad,
    'DESECHO_OTRO'::public.motivo_movimiento_recoleccion,
    NULL::BIGINT,
    p_usuario_id,
    JSONB_BUILD_OBJECT(
      'origen', 'fn_recoleccion_registrar_desecho',
      'sin_evidencia', TRUE
    );

  PERFORM public.fn_recoleccion_recalcular_saldo_operativo(p_recoleccion_id);

  SELECT
    r.saldo_actual,
    r.estado_operativo
  INTO v_saldo_despues, estado_operativo
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id;

  recoleccion_movimiento_id := v_movimiento_id;
  recoleccion_id := p_recoleccion_id;
  cantidad_desechada := p_cantidad_desechada;
  unidad_medida := v_unidad;
  saldo_antes := v_saldo_antes;
  saldo_despues := v_saldo_despues;

  RETURN NEXT;
END;
$$;


REVOKE ALL ON FUNCTION public.m1_exigir_actor(bigint,boolean),public.m1_recoleccion_fotos_insertar(bigint,bigint,jsonb),
  public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb),
  public.fn_recoleccion_eliminar_borrador(bigint,bigint),public.fn_recoleccion_rechazar_validacion(bigint,bigint,text),
  public.fn_recoleccion_registrar_desecho(bigint,numeric,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.m1_exigir_actor(bigint,boolean),public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb),
  public.fn_recoleccion_eliminar_borrador(bigint,bigint),public.fn_recoleccion_rechazar_validacion(bigint,bigint,text),
  public.fn_recoleccion_registrar_desecho(bigint,numeric,bigint) TO service_role;
GRANT SELECT(revision_captura),UPDATE(revision_captura) ON public.recoleccion TO service_role;
-- El ejecutor privado valida el actor activo bajo lock antes de cada mutación.
-- SQL privilegiado fuera de estas RPC sigue fuera de la garantía cooperativa.
-- REVOKE directo no elimina privilegios heredados de otro rol/default ACL.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid,p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('m1_exigir_actor','m1_recoleccion_fotos_insertar','m1_recoleccion_guardar',
      'fn_recoleccion_eliminar_borrador','fn_recoleccion_rechazar_validacion','fn_recoleccion_registrar_desecho',
      'fn_recoleccion_acotar_excepcion_fecha_rechazo') LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T1_PRIVILEGIO_FUNCION_INESPERADO: %',f.firma;
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
