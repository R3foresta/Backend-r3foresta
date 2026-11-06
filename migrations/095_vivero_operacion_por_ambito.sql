-- T2: autorización por establecimiento en RPC reales; no registra recepción física.
-- Antecedentes completos: 018/019/021/026/046/055/077–080/083/092–094.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF to_regprocedure('public.m2_acceso_efectivo(bigint,bigint)') IS NULL
    OR to_regprocedure('public.pa_d_cuenta(bigint)') IS NULL THEN
    RAISE EXCEPTION 'T2_CATALOGO_INCOMPATIBLE: requiere 077/092–094'; END IF;
  PERFORM l.id,l.vivero_id,l.responsable_id,l.saldo_vivo_actual FROM public.lote_vivero l LIMIT 0;
  PERFORM r.vivero_id,r.eliminado_en,r.revision_captura FROM public.recoleccion r LIMIT 0;
END $$;

DO $$ DECLARE firma text; BEGIN
  FOREACH firma IN ARRAY ARRAY['public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)','public.fn_vivero_registrar_embolsado(bigint,date,bigint,integer,text,bigint[])','public.fn_vivero_registrar_adaptabilidad(bigint,date,bigint,public.subetapa_adaptabilidad,text,bigint[])','public.fn_vivero_registrar_despacho(bigint,date,bigint,integer,public.destino_tipo_vivero,text,bigint,text,bigint[])','public.fn_vivero_registrar_descarte_pre_embolsado(bigint,date,bigint,numeric,public.unidad_medida,public.causa_descarte_pre_embolsado,text,bigint[])','public.fn_vivero_registrar_merma(bigint,date,bigint,integer,public.causa_merma_vivero,text,bigint[])','public.fn_vivero_asignar_stock_subcampania(bigint,bigint,int,public.proposito_asignacion,bigint,date,bigint[],text)','public.fn_m3_devolver_asignacion_vivero(bigint,int,public.motivo_devolucion_plantacion,bigint,date,text)','public.fn_m2_m3_aplicar_devolucion_fisica(bigint,int,public.motivo_devolucion_plantacion,bigint,date,text)','public.fn_subcampania_cancelar_interna(bigint,bigint,text,jsonb)','public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb)','public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)','public.fn_recoleccion_registrar_desecho(bigint,numeric,bigint)'] LOOP
    IF to_regprocedure(firma) IS NULL THEN RAISE EXCEPTION 'T2_CATALOGO_INCOMPATIBLE: %',firma; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.m2_ambitos(p_actor_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuario%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.usuario WHERE id=p_actor_id AND activo;
  IF NOT FOUND OR u.rol::text NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('global',u.rol::text='ADMIN','viveros',coalesce((
    SELECT jsonb_agg(vivero_id::text ORDER BY vivero_id) FROM public.usuario_vivero
    WHERE usuario_id=p_actor_id AND revocado_en IS NULL),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.m2_exigir_vivero(p_actor_id bigint,p_vivero_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.m1_exigir_actor(p_actor_id,false);
  IF NOT public.m2_acceso_efectivo(p_actor_id,p_vivero_id) THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE: sin acceso al vivero.' USING ERRCODE='42501'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.m2_evidencia_contexto (
  evidencia_id bigint PRIMARY KEY REFERENCES public.evidencias_trazabilidad(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vivero_id bigint NOT NULL REFERENCES public.vivero(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  lote_id bigint REFERENCES public.lote_vivero(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  evento text NOT NULL CHECK(evento IN ('INICIO','EMBOLSADO','ADAPTABILIDAD','MERMA','DESPACHO','DESCARTE_PRE_EMBOLSADO')),
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((evento='INICIO' AND lote_id IS NULL) OR (evento<>'INICIO' AND lote_id IS NOT NULL))
);
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM (VALUES ('evidencia_id','bigint',true),('vivero_id','bigint',true),('lote_id','bigint',false),
    ('evento','text',true),('actor_id','bigint',true),('creado_en','timestamp with time zone',true)) x(col,tipo,obligatoria) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.m2_evidencia_contexto'::regclass AND attname=c.col
      AND atttypid=c.tipo::regtype AND attnotnull=c.obligatoria AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T2_CATALOGO_INCOMPATIBLE: m2_evidencia_contexto.%',c.col; END IF;
  END LOOP;
END $$;
ALTER TABLE public.m2_evidencia_contexto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.m2_evidencia_contexto FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS m2_contexto_inmutable ON public.m2_evidencia_contexto;
CREATE TRIGGER m2_contexto_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.m2_evidencia_contexto
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_subcampania_historial_prevent_mutation();

CREATE OR REPLACE FUNCTION public.m2_evidencias_preparar(
  p_actor_id bigint,p_vivero_id bigint,p_lote_id bigint,p_evento text,p_fotos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE f jsonb; tipo bigint; eid bigint; ids jsonb:='[]'; vivero bigint;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_evento IS NULL OR p_evento NOT IN ('INICIO','EMBOLSADO','ADAPTABILIDAD','MERMA','DESPACHO','DESCARTE_PRE_EMBOLSADO')
    OR (p_evento='INICIO') IS DISTINCT FROM (p_lote_id IS NULL)
    OR jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Contexto de evidencia inválido.' USING ERRCODE='22023'; END IF;
  IF p_lote_id IS NOT NULL THEN
    SELECT vivero_id INTO vivero FROM public.lote_vivero WHERE id=p_lote_id AND estado_lote='ACTIVO' FOR SHARE;
    IF NOT FOUND OR vivero IS DISTINCT FROM p_vivero_id THEN
      RAISE EXCEPTION 'Lote no disponible en el vivero.' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT id INTO STRICT tipo FROM public.tipos_entidad_evidencia WHERE upper(codigo)='EVENTO_LOTE_VIVERO' AND activo;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','') NOT LIKE 'vivero/eventos/pendientes/'||p_actor_id||'/%'
      OR coalesce(f->>'mime_type','') NOT LIKE 'image/%' OR coalesce((f->>'tamano_bytes')::bigint,0)<=0 THEN
      RAISE EXCEPTION 'Foto inválida.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_por_usuario_id)
    VALUES(tipo,0,'recoleccion_fotos',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',
      (f->>'tamano_bytes')::bigint,f->>'hash_sha256',f->>'titulo',f->>'descripcion',coalesce(f->'metadata','{}'::jsonb),
      false,jsonb_array_length(ids),(f->>'tomado_en')::timestamptz,p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.m2_evidencia_contexto(evidencia_id,vivero_id,lote_id,evento,actor_id)
      VALUES(eid,p_vivero_id,p_lote_id,p_evento,p_actor_id);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.m2_evidencias_exigir(
  p_ids bigint[],p_actor_id bigint,p_vivero_id bigint,p_lote_id bigint,p_evento text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE eid bigint;
BEGIN
  -- Caller: cuenta -> campaña/hija/asignación (si corresponde) -> lote/origen -> fotos ASC.
  FOR eid IN SELECT DISTINCT x FROM unnest(coalesce(p_ids,'{}'::bigint[])) x ORDER BY x LOOP
    PERFORM 1 FROM public.evidencias_trazabilidad e
      JOIN public.m2_evidencia_contexto c ON c.evidencia_id=e.id
      JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
      WHERE e.id=eid AND e.eliminado_en IS NULL AND coalesce(e.entidad_id,0)=0
        AND c.actor_id=p_actor_id AND e.creado_por_usuario_id=p_actor_id
        AND c.vivero_id=p_vivero_id AND c.lote_id IS NOT DISTINCT FROM p_lote_id AND c.evento=p_evento
        AND upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo AND e.bucket='recoleccion_fotos'
      FOR UPDATE OF e;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
  END LOOP;
END $$;


-- Redefinición aditiva de 018; conserva efectos/snapshots/ledger.
CREATE OR REPLACE FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(
  p_recoleccion_id BIGINT,
  p_vivero_id BIGINT,
  p_responsable_id BIGINT,
  p_fecha_inicio DATE,
  p_fecha_evento DATE,
  p_cantidad_inicial_en_proceso NUMERIC,
  p_unidad_medida_inicial public.unidad_medida,
  p_observaciones TEXT DEFAULT NULL,
  p_evidencia_ids BIGINT[] DEFAULT NULL,
  p_codigo_trazabilidad TEXT DEFAULT NULL -- parametro legacy ignorado; el codigo oficial se calcula en DB
)
RETURNS TABLE (
  lote_vivero_id BIGINT,
  evento_inicio_id BIGINT,
  recoleccion_movimiento_id BIGINT,
  codigo_trazabilidad TEXT,
  saldo_recoleccion_antes NUMERIC,
  saldo_recoleccion_despues NUMERIC,
  evidencia_inicio_ids BIGINT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_recoleccion RECORD;
  v_responsable_nombre TEXT;
  v_codigo_trazabilidad TEXT;
  v_codigo_temporal TEXT;
  v_lote_id BIGINT;
  v_evento_id BIGINT;
  v_movimiento_id BIGINT;
  v_saldo_despues NUMERIC;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas INTEGER;
  v_movimiento_columns TEXT[];
  v_movimiento_values TEXT[];
  v_has_unidad_operativa BOOLEAN;
  v_has_unidad_medida_evento BOOLEAN;
  v_has_unidad_medida_movimiento BOOLEAN;
  v_has_detalle_cambios BOOLEAN;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  IF p_recoleccion_id IS NULL THEN
    RAISE EXCEPTION 'recoleccion_id es obligatorio.';
  END IF;

  IF p_vivero_id IS NULL THEN
    RAISE EXCEPTION 'vivero_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_cantidad_inicial_en_proceso IS NULL
     OR p_cantidad_inicial_en_proceso <= 0 THEN
    RAISE EXCEPTION 'cantidad_inicial_en_proceso debe ser mayor a 0.';
  END IF;

  IF p_unidad_medida_inicial IS NULL THEN
    RAISE EXCEPTION 'unidad_medida_inicial es obligatoria.';
  END IF;

  IF p_unidad_medida_inicial = 'UNIDAD'
     AND p_cantidad_inicial_en_proceso <> TRUNC(p_cantidad_inicial_en_proceso) THEN
    RAISE EXCEPTION
      'cantidad_inicial_en_proceso debe ser entera cuando unidad_medida_inicial=UNIDAD.';
  END IF;

  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION 'INICIO requiere al menos una evidencia obligatoria.';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_inicio, NULL);
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, p_fecha_inicio);

  IF NOT EXISTS (
    SELECT 1
    FROM public.vivero
    WHERE id = p_vivero_id
  ) THEN
    RAISE EXCEPTION 'El vivero % no existe.', p_vivero_id;
  END IF;

  SELECT NULLIF(BTRIM(u.nombre), '')
  INTO v_responsable_nombre
  FROM public.usuario u
  WHERE u.id = p_responsable_id;

  IF v_responsable_nombre IS NULL THEN
    RAISE EXCEPTION 'El responsable % no existe o no tiene nombre valido.', p_responsable_id;
  END IF;

  SELECT
    r.id,
    r.codigo_trazabilidad,
    r.estado_registro,
    r.vivero_id,
    r.ubicacion_id,
    r.eliminado_en,
    r.estado_operativo,
    r.saldo_actual,
    r.unidad_canonica,
    r.planta_id,
    r.tipo_material,
    r.nombre_cientifico_snapshot,
    r.nombre_comercial_snapshot,
    r.variedad_snapshot,
    r.nombre_comunidad_snapshot
  INTO v_recoleccion
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recoleccion % no existe.', p_recoleccion_id;
  END IF;

  PERFORM public.m2_exigir_vivero(p_responsable_id,p_vivero_id);
  IF v_recoleccion.eliminado_en IS NOT NULL THEN RAISE EXCEPTION 'Recolección no disponible.' USING ERRCODE='P0002'; END IF;
  IF public.m1_exigir_actor(p_responsable_id,false)<>'ADMIN' AND v_recoleccion.vivero_id IS DISTINCT FROM p_vivero_id THEN
    RAISE EXCEPTION 'El camino ordinario requiere origen almacenado en el mismo vivero; traslados fuera de alcance.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ubicacion WHERE id=v_recoleccion.ubicacion_id
    AND latitud BETWEEN -90 AND 90 AND longitud BETWEEN -180 AND 180)
    OR (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
      WHERE e.entidad_id=p_recoleccion_id AND upper(t.codigo)='RECOLECCION' AND t.activo AND e.eliminado_en IS NULL)<2 THEN
    RAISE EXCEPTION 'Origen sin ubicación o evidencia mínima elegible.' USING ERRCODE='22023'; END IF;
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,p_vivero_id,NULL,'INICIO');
  IF p_cantidad_inicial_en_proceso::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Cantidad inválida.'; END IF;
  IF NULLIF(BTRIM(v_recoleccion.codigo_trazabilidad), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene codigo_trazabilidad.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.estado_registro IS DISTINCT FROM 'VALIDADO' THEN
    RAISE EXCEPTION 'La recoleccion % no esta validada.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.estado_operativo IS DISTINCT FROM 'ABIERTO' THEN
    RAISE EXCEPTION
      'La recoleccion % no esta abierta para consumo hacia vivero.',
      p_recoleccion_id;
  END IF;

  IF v_recoleccion.saldo_actual IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene saldo_actual materializado.', p_recoleccion_id;
  END IF;

  IF v_recoleccion.saldo_actual < p_cantidad_inicial_en_proceso THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene saldo suficiente. Disponible %, solicitado %.',
      p_recoleccion_id,
      v_recoleccion.saldo_actual,
      p_cantidad_inicial_en_proceso;
  END IF;

  IF v_recoleccion.unidad_canonica IS DISTINCT FROM p_unidad_medida_inicial THEN
    RAISE EXCEPTION
      'unidad_medida_inicial (%) debe coincidir con unidad_canonica de la recoleccion (%).',
      p_unidad_medida_inicial,
      v_recoleccion.unidad_canonica;
  END IF;

  IF v_recoleccion.tipo_material = 'ESQUEJE'
     AND p_unidad_medida_inicial <> 'UNIDAD' THEN
    RAISE EXCEPTION 'Para ESQUEJE la unidad de inicio debe ser UNIDAD.';
  END IF;

  IF v_recoleccion.planta_id IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene planta asociada.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.nombre_cientifico_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene nombre_cientifico_snapshot.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.nombre_comercial_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene nombre_comercial_snapshot.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.variedad_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene variedad_snapshot.', p_recoleccion_id;
  END IF;

  IF NULLIF(BTRIM(v_recoleccion.nombre_comunidad_snapshot), '') IS NULL THEN
    RAISE EXCEPTION 'La recoleccion % no tiene nombre_comunidad_snapshot.', p_recoleccion_id;
  END IF;

  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION
      'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de INICIO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  v_codigo_temporal := CONCAT(
    'TMP-VIV-',
    TXID_CURRENT(),
    '-',
    UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 10))
  );

  INSERT INTO public.lote_vivero (
    recoleccion_id,
    planta_id,
    vivero_id,
    responsable_id,
    nombre_cientifico_snapshot,
    nombre_comercial_snapshot,
    tipo_material_snapshot,
    variedad_snapshot,
    nombre_comunidad_origen_snapshot,
    nombre_responsable_snapshot,
    fecha_inicio,
    cantidad_inicial_en_proceso,
    unidad_medida_inicial,
    codigo_trazabilidad
  )
  VALUES (
    p_recoleccion_id,
    v_recoleccion.planta_id,
    p_vivero_id,
    p_responsable_id,
    v_recoleccion.nombre_cientifico_snapshot,
    v_recoleccion.nombre_comercial_snapshot,
    v_recoleccion.tipo_material,
    v_recoleccion.variedad_snapshot,
    v_recoleccion.nombre_comunidad_snapshot,
    v_responsable_nombre,
    p_fecha_inicio,
    p_cantidad_inicial_en_proceso,
    p_unidad_medida_inicial,
    v_codigo_temporal
  )
  RETURNING id INTO v_lote_id;

  v_codigo_trazabilidad := CONCAT(
    'VIV-',
    LPAD(v_lote_id::TEXT, 6, '0'),
    '-',
    v_recoleccion.codigo_trazabilidad
  );

  UPDATE public.lote_vivero
  SET codigo_trazabilidad = v_codigo_trazabilidad
  WHERE id = v_lote_id;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    v_lote_id,
    'INICIO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_inicial_en_proceso,
    p_unidad_medida_inicial,
    NULL,
    NULL,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  UPDATE public.evidencias_trazabilidad
  SET tipo_entidad_id = v_tipo_entidad_evento_id,
      entidad_id = v_evento_id,
      codigo_trazabilidad = v_codigo_trazabilidad,
      actualizado_en = CURRENT_DATE,
      actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_operativa'
  ) INTO v_has_unidad_operativa;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_medida_evento'
  ) INTO v_has_unidad_medida_evento;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_medida_movimiento'
  ) INTO v_has_unidad_medida_movimiento;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'detalle_cambios'
  ) INTO v_has_detalle_cambios;

  IF NOT v_has_unidad_operativa
     AND NOT v_has_unidad_medida_evento
     AND NOT v_has_unidad_medida_movimiento THEN
    RAISE EXCEPTION
      'public.recoleccion_movimiento no tiene columna de unidad compatible.';
  END IF;

  v_movimiento_columns := ARRAY[
    'recoleccion_id',
    'tipo_movimiento',
    'delta'
  ];
  v_movimiento_values := ARRAY['$1', '$2', '$3'];

  IF v_has_unidad_operativa THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'unidad_operativa');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$4');
  END IF;

  IF v_has_unidad_medida_evento THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'unidad_medida_evento');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$4');
  END IF;

  IF v_has_unidad_medida_movimiento THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'unidad_medida_movimiento');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$4');
  END IF;

  v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'motivo');
  v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$5');
  v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'lote_vivero_id');
  v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$6');
  v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'created_by');
  v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$7');

  IF v_has_detalle_cambios THEN
    v_movimiento_columns := ARRAY_APPEND(v_movimiento_columns, 'detalle_cambios');
    v_movimiento_values := ARRAY_APPEND(v_movimiento_values, '$8');
  END IF;

  EXECUTE FORMAT(
    'INSERT INTO public.recoleccion_movimiento (%s) VALUES (%s) RETURNING id',
    ARRAY_TO_STRING(v_movimiento_columns, ', '),
    ARRAY_TO_STRING(v_movimiento_values, ', ')
  )
  INTO v_movimiento_id
  USING
    p_recoleccion_id,
    'CONSUMO_A_VIVERO'::public.tipo_movimiento_recoleccion,
    -p_cantidad_inicial_en_proceso,
    p_unidad_medida_inicial,
    'CONSUMO_PARA_VIVERO'::public.motivo_movimiento_recoleccion,
    v_lote_id,
    p_responsable_id,
    JSONB_BUILD_OBJECT(
      'origen', 'fn_vivero_crear_lote_desde_recoleccion',
      'evento_lote_vivero_id', v_evento_id,
      'evidencia_ids', v_evidencia_ids,
      'cantidad_inicial_en_proceso', p_cantidad_inicial_en_proceso,
      'unidad_medida_inicial', p_unidad_medida_inicial
    );

  IF to_regprocedure('public.fn_recoleccion_recalcular_saldo_operativo(bigint)') IS NOT NULL THEN
    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(p_recoleccion_id);
  END IF;

  SELECT r.saldo_actual
  INTO v_saldo_despues
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id;

  lote_vivero_id := v_lote_id;
  evento_inicio_id := v_evento_id;
  recoleccion_movimiento_id := v_movimiento_id;
  codigo_trazabilidad := v_codigo_trazabilidad;
  saldo_recoleccion_antes := v_recoleccion.saldo_actual;
  saldo_recoleccion_despues := v_saldo_despues;
  evidencia_inicio_ids := v_evidencia_ids;

  RETURN NEXT;
END;
$$;


-- Redefinición aditiva de 019; conserva efectos/snapshots/ledger.
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_embolsado(
  p_lote_id                 BIGINT,
  p_fecha_evento            DATE,
  p_responsable_id          BIGINT,
  p_plantas_vivas_iniciales INTEGER,
  p_observaciones           TEXT     DEFAULT NULL,
  p_evidencia_ids           BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_embolsado_id       BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad       TEXT,
  plantas_vivas_iniciales   INTEGER,
  saldo_vivo_antes          INTEGER,
  saldo_vivo_despues        INTEGER,
  evidencia_ids_vinculadas  BIGINT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_lote                    RECORD;
  v_evento_id               BIGINT;
  v_tipo_entidad_evento_id  BIGINT;
  v_evidencia_ids           BIGINT[];
  v_evidencias_solicitadas  INTEGER;
  v_evidencias_validas      INTEGER;
  v_ya_embolsado            BOOLEAN;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_plantas_vivas_iniciales IS NULL OR p_plantas_vivas_iniciales < 1 THEN
    RAISE EXCEPTION 'plantas_vivas_iniciales debe ser un entero mayor o igual a 1.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION 'EMBOLSADO requiere al menos una evidencia obligatoria (RN-VIV-26).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.plantas_vivas_iniciales,
    lv.fecha_inicio
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'EMBOLSADO');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar EMBOLSADO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que INICIO ya existe
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'INICIO'
  ) THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento INICIO registrado. EMBOLSADO requiere INICIO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Verificar que EMBOLSADO no existe ya
  -- -----------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'EMBOLSADO'
  )
  INTO v_ya_embolsado;

  IF v_ya_embolsado THEN
    RAISE EXCEPTION
      'El lote % ya tiene un evento EMBOLSADO registrado. No se puede registrar dos veces (RN-VIV-11).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_lote.fecha_inicio);

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 10. Validar que las evidencias existen, no estan eliminadas y son pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de EMBOLSADO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento EMBOLSADO
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'EMBOLSADO',
    p_fecha_evento,
    p_responsable_id,
    p_plantas_vivas_iniciales,
    'UNIDAD',
    NULL,
    p_plantas_vivas_iniciales,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar LOTE_VIVERO con el saldo vivo naciente
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    plantas_vivas_iniciales = p_plantas_vivas_iniciales,
    saldo_vivo_actual       = p_plantas_vivas_iniciales,
    updated_at              = CURRENT_DATE
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id             = v_tipo_entidad_evento_id,
    entidad_id                  = v_evento_id,
    codigo_trazabilidad         = v_lote.codigo_trazabilidad,
    actualizado_en              = CURRENT_DATE,
    actualizado_por_usuario_id  = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 14. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_embolsado_id      := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  plantas_vivas_iniciales  := p_plantas_vivas_iniciales;
  saldo_vivo_antes         := NULL;
  saldo_vivo_despues       := p_plantas_vivas_iniciales;
  evidencia_ids_vinculadas := v_evidencia_ids;

  RETURN NEXT;
END;
$$;


-- Redefinición aditiva de 021; conserva efectos/snapshots/ledger.
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_adaptabilidad(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_subetapa_destino public.subetapa_adaptabilidad,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_adaptabilidad_id  BIGINT,
  lote_vivero_id           BIGINT,
  codigo_trazabilidad      TEXT,
  subetapa_destino         public.subetapa_adaptabilidad,
  saldo_vivo_actual        INTEGER,
  evidencia_ids_vinculadas BIGINT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_subetapa_destino IS NULL THEN
    RAISE EXCEPTION 'subetapa_destino es obligatoria.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias (son opcionales)
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL THEN
    v_evidencia_ids := ARRAY[]::BIGINT[];
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.subetapa_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote (RN-VIV-25)
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'ADAPTABILIDAD');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar ADAPTABILIDAD.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que EMBOLSADO ya existe y obtener su fecha (RN-VIV-10)
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento EMBOLSADO registrado. ADAPTABILIDAD requiere EMBOLSADO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Validar que el saldo vivo esta materializado (debe existir tras EMBOLSADO)
  -- -----------------------------------------------------------------------
  IF v_lote.saldo_vivo_actual IS NULL THEN
    RAISE EXCEPTION
      'El lote % tiene EMBOLSADO, pero saldo_vivo_actual esta NULL. No se puede registrar ADAPTABILIDAD.',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO (solo si hay evidencias)
  -- -----------------------------------------------------------------------
  IF v_evidencias_solicitadas > 0 THEN
    SELECT te.id
    INTO v_tipo_entidad_evento_id
    FROM public.tipos_entidad_evidencia te
    WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
      AND te.activo = TRUE
    LIMIT 1;

    IF v_tipo_entidad_evento_id IS NULL THEN
      RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
    END IF;

    -- -----------------------------------------------------------------------
    -- 10. Validar que las evidencias existen, no estan eliminadas y son pendientes
    -- -----------------------------------------------------------------------
    WITH locked_evidencias AS (
      SELECT ev.id, ev.eliminado_en, ev.entidad_id
      FROM public.evidencias_trazabilidad ev
      WHERE ev.id = ANY(v_evidencia_ids)
      FOR UPDATE
    )
    SELECT COUNT(*)
    INTO v_evidencias_validas
    FROM locked_evidencias ev
    WHERE ev.eliminado_en IS NULL
      AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

    IF v_evidencias_validas <> v_evidencias_solicitadas THEN
      RAISE EXCEPTION
        'Todas las evidencias de ADAPTABILIDAD deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento ADAPTABILIDAD
  -- ADAPTABILIDAD no modifica saldo vivo: saldo_vivo_antes = saldo_vivo_despues = saldo_vivo_actual
  -- created_at usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    created_at,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    subetapa_destino,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'ADAPTABILIDAD',
    p_fecha_evento,
    CURRENT_DATE,
    p_responsable_id,
    v_lote.saldo_vivo_actual,
    'UNIDAD',
    p_subetapa_destino,
    v_lote.saldo_vivo_actual,
    v_lote.saldo_vivo_actual,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar subetapa_actual en LOTE_VIVERO
  -- updated_at usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    subetapa_actual = p_subetapa_destino,
    updated_at      = CURRENT_DATE
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento (solo si se enviaron)
  -- actualizado_en usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  IF v_evidencias_solicitadas > 0 THEN
    UPDATE public.evidencias_trazabilidad
    SET
      tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = CURRENT_DATE,
      actualizado_por_usuario_id = p_responsable_id
    WHERE id = ANY(v_evidencia_ids);
  END IF;

  -- -----------------------------------------------------------------------
  -- 14. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_adaptabilidad_id  := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  subetapa_destino         := p_subetapa_destino;
  saldo_vivo_actual        := v_lote.saldo_vivo_actual;
  evidencia_ids_vinculadas := v_evidencia_ids;

  RETURN NEXT;
END;
$$;


-- Redefinición aditiva de 026; conserva efectos/snapshots/ledger.
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_despacho(
  p_lote_id              BIGINT,
  p_fecha_evento         DATE,
  p_responsable_id       BIGINT,
  p_cantidad_despachada  INTEGER,
  p_destino_tipo         public.destino_tipo_vivero,
  p_destino_referencia   TEXT,
  p_comunidad_destino_id BIGINT   DEFAULT NULL,
  p_observaciones        TEXT     DEFAULT NULL,
  p_evidencia_ids        BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_despacho_id        BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad       TEXT,
  cantidad_despachada       INTEGER,
  destino_tipo              public.destino_tipo_vivero,
  destino_referencia        TEXT,
  comunidad_destino_id      BIGINT,
  saldo_vivo_antes          INTEGER,
  saldo_vivo_despues        INTEGER,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
  v_saldo_antes            INTEGER;
  v_saldo_despues          INTEGER;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_destino_referencia     TEXT;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_cantidad_despachada IS NULL OR p_cantidad_despachada < 1 THEN
    RAISE EXCEPTION 'cantidad_despachada debe ser un entero mayor o igual a 1.';
  END IF;

  IF p_destino_tipo IS NULL THEN
    RAISE EXCEPTION 'destino_tipo es obligatorio.';
  END IF;

  -- Bloqueo explicito: PLANTACION_CAMPANIA esta reservado para despachos automaticos
  -- generados desde el Modulo 3. Casteo a TEXT para evitar la dependencia con el
  -- valor de enum recien agregado (mismo workaround que en migracion 023).
  IF p_destino_tipo::TEXT = 'PLANTACION_CAMPANIA' THEN
    RAISE EXCEPTION
      'destino_tipo PLANTACION_CAMPANIA esta reservado para despachos automaticos generados desde Modulo 3. Use el endpoint correspondiente.';
  END IF;

  v_destino_referencia := NULLIF(BTRIM(COALESCE(p_destino_referencia, '')), '');
  IF v_destino_referencia IS NULL THEN
    RAISE EXCEPTION 'destino_referencia es obligatorio y no puede ser vacio.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Validar comunidad_destino_id (si fue enviado, debe existir)
  -- -----------------------------------------------------------------------
  IF p_comunidad_destino_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.division_administrativa
      WHERE id = p_comunidad_destino_id
    ) THEN
      RAISE EXCEPTION
        'comunidad_destino_id % no existe en division_administrativa.',
        p_comunidad_destino_id;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 4. Normalizar y deduplicar evidencias (obligatorio para DESPACHO MANUAL)
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'DESPACHO requiere al menos una evidencia obligatoria (RN-VIV-23).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 5. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.fecha_inicio,
    lv.motivo_cierre
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Validar estado del lote
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'DESPACHO');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar DESPACHO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Verificar que EMBOLSADO ya existe y obtener su fecha (RN-VIV-10)
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento EMBOLSADO registrado. DESPACHO requiere EMBOLSADO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 9. Validar saldo vivo disponible
  -- -----------------------------------------------------------------------
  v_saldo_antes := v_lote.saldo_vivo_actual;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo materializado. Verifique que EMBOLSADO fue registrado correctamente.',
      p_lote_id;
  END IF;

  IF p_cantidad_despachada > v_saldo_antes THEN
    RAISE EXCEPTION
      'El despacho (%) no puede exceder el saldo vivo disponible (%) del lote %.',
      p_cantidad_despachada,
      v_saldo_antes,
      p_lote_id;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_despachada;

  -- -----------------------------------------------------------------------
  -- 10. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Validar que las evidencias existen, no estan eliminadas y son pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de DESPACHO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 12. Insertar evento DESPACHO MANUAL
  --     origen_despacho = 'MANUAL' explicito (la 025 quito el default).
  --     subcampania_id / campania_id / registro_plantacion_id quedan NULL
  --     (CHECK constraint evento_lote_vivero_origen_despacho_consistency_chk).
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    destino_tipo,
    destino_referencia,
    comunidad_destino_id,
    origen_despacho,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'DESPACHO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_despachada,
    'UNIDAD',
    p_destino_tipo,
    v_destino_referencia,
    p_comunidad_destino_id,
    'MANUAL'::public.origen_despacho_vivero,
    v_saldo_antes,
    v_saldo_despues,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 13. Actualizar saldo_vivo_actual en LOTE_VIVERO
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    saldo_vivo_actual = v_saldo_despues,
    updated_at        = NOW()
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 14. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 15. Activar cierre automatico si el saldo llego a 0
  -- -----------------------------------------------------------------------
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------------
  -- 16. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_despacho_id       := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  cantidad_despachada      := p_cantidad_despachada;
  destino_tipo             := p_destino_tipo;
  destino_referencia       := v_destino_referencia;
  comunidad_destino_id     := p_comunidad_destino_id;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;


-- Redefinición aditiva de 046; conserva efectos/snapshots/ledger.
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_descarte_pre_embolsado(
  p_lote_id                         BIGINT,
  p_fecha_evento                    DATE,
  p_responsable_id                  BIGINT,
  p_cantidad_material_afectado      NUMERIC,
  p_unidad_medida_evento            public.unidad_medida,
  p_causa_descarte_pre_embolsado    public.causa_descarte_pre_embolsado,
  p_observaciones                   TEXT     DEFAULT NULL,
  p_evidencia_ids                   BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_descarte_pre_embolsado_id  BIGINT,
  evento_cierre_id                  BIGINT,
  lote_vivero_id                    BIGINT,
  codigo_trazabilidad               TEXT,
  cantidad_material_afectado        NUMERIC,
  unidad_medida_evento              public.unidad_medida,
  causa_descarte_pre_embolsado      public.causa_descarte_pre_embolsado,
  evidencia_ids_vinculadas          BIGINT[],
  lote_finalizado                   BOOLEAN,
  motivo_cierre                     public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_lote                    RECORD;
  v_evento_descarte_id      BIGINT;
  v_evento_cierre_id        BIGINT;
  v_tipo_entidad_evento_id  BIGINT;
  v_evidencia_ids           BIGINT[];
  v_evidencias_solicitadas  INTEGER;
  v_evidencias_validas      INTEGER;
  v_ya_embolsado            BOOLEAN;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_cantidad_material_afectado IS NULL OR p_cantidad_material_afectado <= 0 THEN
    RAISE EXCEPTION 'cantidad_material_afectado debe ser mayor a 0.';
  END IF;

  IF p_unidad_medida_evento IS NULL THEN
    RAISE EXCEPTION 'unidad_medida_evento es obligatoria.';
  END IF;

  IF p_causa_descarte_pre_embolsado IS NULL THEN
    RAISE EXCEPTION 'causa_descarte_pre_embolsado es obligatoria.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar responsable
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION 'DESCARTE_PRE_EMBOLSADO requiere al menos una evidencia obligatoria.';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.fecha_inicio,
    lv.cantidad_inicial_en_proceso,
    lv.unidad_medida_inicial,
    lv.plantas_vivas_iniciales,
    lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'DESCARTE_PRE_EMBOLSADO');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar DESCARTE_PRE_EMBOLSADO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento::text = 'INICIO'
  ) THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento INICIO registrado. DESCARTE_PRE_EMBOLSADO requiere INICIO previo.',
      p_lote_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento::text = 'EMBOLSADO'
  )
  INTO v_ya_embolsado;

  IF v_ya_embolsado THEN
    RAISE EXCEPTION
      'El lote % ya tiene EMBOLSADO. Use MERMA total sobre saldo_vivo_actual; DESCARTE_PRE_EMBOLSADO solo aplica antes de EMBOLSADO.',
      p_lote_id;
  END IF;

  IF p_unidad_medida_evento IS DISTINCT FROM v_lote.unidad_medida_inicial THEN
    RAISE EXCEPTION
      'unidad_medida_evento (%) debe coincidir con unidad_medida_inicial (%) del lote %.',
      p_unidad_medida_evento,
      v_lote.unidad_medida_inicial,
      p_lote_id;
  END IF;

  IF p_cantidad_material_afectado <> v_lote.cantidad_inicial_en_proceso THEN
    RAISE EXCEPTION
      'DESCARTE_PRE_EMBOLSADO es total: cantidad_material_afectado (%) debe coincidir con cantidad_inicial_en_proceso (%) del lote %.',
      p_cantidad_material_afectado,
      v_lote.cantidad_inicial_en_proceso,
      p_lote_id;
  END IF;

  IF v_lote.plantas_vivas_iniciales IS NOT NULL OR v_lote.saldo_vivo_actual IS NOT NULL THEN
    RAISE EXCEPTION
      'El lote % ya tiene datos de saldo vivo. DESCARTE_PRE_EMBOLSADO solo aplica antes de que exista saldo vivo.',
      p_lote_id;
  END IF;

  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_lote.fecha_inicio);

  -- -----------------------------------------------------------------------
  -- 5. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Validar evidencias pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de DESCARTE_PRE_EMBOLSADO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Insertar evento DESCARTE_PRE_EMBOLSADO
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    causa_descarte_pre_embolsado,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'DESCARTE_PRE_EMBOLSADO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_material_afectado,
    p_unidad_medida_evento,
    p_causa_descarte_pre_embolsado,
    NULL,
    NULL,
    p_observaciones
  )
  RETURNING id INTO v_evento_descarte_id;

  -- -----------------------------------------------------------------------
  -- 8. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_descarte_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 9. Cerrar lote sin materializar saldo vivo
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    estado_lote   = 'FINALIZADO',
    motivo_cierre = 'DESCARTE_PRE_EMBOLSADO',
    updated_at    = NOW()
  WHERE id = p_lote_id;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    motivo_cierre_calculado,
    ref_evento_trigger_id,
    observaciones
  )
  VALUES (
    p_lote_id,
    'CIERRE_AUTOMATICO',
    p_fecha_evento,
    p_responsable_id,
    'DESCARTE_PRE_EMBOLSADO',
    v_evento_descarte_id,
    'Cierre automatico por descarte pre-embolsado'
  )
  RETURNING id INTO v_evento_cierre_id;

  -- -----------------------------------------------------------------------
  -- 10. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_descarte_pre_embolsado_id := v_evento_descarte_id;
  evento_cierre_id                 := v_evento_cierre_id;
  lote_vivero_id                   := p_lote_id;
  codigo_trazabilidad              := v_lote.codigo_trazabilidad;
  cantidad_material_afectado       := p_cantidad_material_afectado;
  unidad_medida_evento             := p_unidad_medida_evento;
  causa_descarte_pre_embolsado     := p_causa_descarte_pre_embolsado;
  evidencia_ids_vinculadas         := v_evidencia_ids;
  lote_finalizado                  := TRUE;
  motivo_cierre                    := 'DESCARTE_PRE_EMBOLSADO';

  RETURN NEXT;
END;
$$;


-- Redefinición aditiva de 055; conserva efectos/snapshots/ledger.
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_merma(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_cantidad_perdida INTEGER,
  p_causa_merma      public.causa_merma_vivero,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_merma_id          BIGINT,
  lote_vivero_id           BIGINT,
  codigo_trazabilidad      TEXT,
  cantidad_perdida         INTEGER,
  causa_merma              public.causa_merma_vivero,
  saldo_vivo_antes         INTEGER,
  saldo_vivo_despues       INTEGER,
  evidencia_ids_vinculadas BIGINT[],
  lote_finalizado          BOOLEAN,
  motivo_cierre            public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
  v_saldo_antes            INTEGER;
  v_saldo_despues          INTEGER;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_cantidad_perdida IS NULL OR p_cantidad_perdida < 1 THEN
    RAISE EXCEPTION 'cantidad_perdida debe ser un entero mayor o igual a 1.';
  END IF;

  IF p_causa_merma IS NULL THEN
    RAISE EXCEPTION 'causa_merma es obligatoria.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION 'MERMA requiere al menos una evidencia obligatoria (RF-VIV-03).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.fecha_inicio,
    lv.motivo_cierre
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'MERMA');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar MERMA.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que EMBOLSADO ya existe y obtener su fecha
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene un evento EMBOLSADO registrado. MERMA requiere EMBOLSADO previo (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 8. Validar contra el saldo vivo FISICO del lote.
  --    El stock asignado a subcampanias ya salio del vivero: la merma del
  --    lote NUNCA lee ni modifica asignaciones (contrato 8.1).
  -- -----------------------------------------------------------------------
  v_saldo_antes := v_lote.saldo_vivo_actual;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo materializado. Verifique que EMBOLSADO fue registrado correctamente.',
      p_lote_id;
  END IF;

  IF p_cantidad_perdida > v_saldo_antes THEN
    RAISE EXCEPTION
      'La merma (%) no puede exceder el saldo vivo fisico (%) del lote %.',
      p_cantidad_perdida,
      v_saldo_antes,
      p_lote_id;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_perdida;

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 10. Validar que las evidencias existen, no estan eliminadas y son pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de MERMA deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento MERMA (sin metadata de afectacion de asignaciones)
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    causa_merma,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'MERMA',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_perdida,
    'UNIDAD',
    p_causa_merma,
    v_saldo_antes,
    v_saldo_despues,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar saldo_vivo_actual en LOTE_VIVERO
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    saldo_vivo_actual = v_saldo_despues,
    updated_at        = NOW()
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 14. Activar cierre automatico si el saldo llego a 0
  -- -----------------------------------------------------------------------
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------------
  -- 15. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_merma_id          := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  cantidad_perdida         := p_cantidad_perdida;
  causa_merma              := p_causa_merma;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;


-- Conserva el orden compartido y las devoluciones administrativas 077.
CREATE OR REPLACE FUNCTION public.fn_vivero_asignar_stock_subcampania(
  p_lote_vivero_id        BIGINT,
  p_subcampania_id        BIGINT,
  p_cantidad_asignada     INT,
  p_proposito             public.proposito_asignacion,
  p_usuario_asignacion_id BIGINT,
  p_fecha_asignacion      DATE,
  p_evidencia_ids         BIGINT[],
  p_observaciones         TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad_lote  TEXT,
  subcampania_id            BIGINT,
  campania_id               BIGINT,
  proposito                 public.proposito_asignacion,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_asignada         INT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_lote                   RECORD;
  v_subcampania            RECORD;
  v_usuario_rol            TEXT;
  v_es_coordinador         BOOLEAN;
  v_fecha_embolsado        DATE;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_tipo_entidad_evento_id BIGINT;
  v_asignacion_id          BIGINT;
  v_evento_id              BIGINT;
  v_evento_plantacion_id   BIGINT;
  v_saldo_antes            INT;
  v_saldo_despues          INT;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_destino_referencia     TEXT;
  v_observaciones          TEXT;
  v_campania_id            BIGINT;
BEGIN
  v_usuario_rol:=public.pa_d_cuenta(p_usuario_asignacion_id);
  IF v_usuario_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RAISE EXCEPTION 'AUTORIDAD_INTERNA_REQUERIDA' USING ERRCODE='PT403'; END IF;
  -- -----------------------------------------------------------------
  -- 1. Guards de parametros
  -- -----------------------------------------------------------------
  IF p_lote_vivero_id IS NULL THEN
    RAISE EXCEPTION 'lote_vivero_id es obligatorio.';
  END IF;

  IF p_subcampania_id IS NULL THEN
    RAISE EXCEPTION 'subcampania_id es obligatorio.';
  END IF;

  IF p_cantidad_asignada IS NULL OR p_cantidad_asignada <= 0 THEN
    RAISE EXCEPTION 'cantidad_asignada debe ser un entero mayor a 0.';
  END IF;

  IF p_proposito IS NULL THEN
    RAISE EXCEPTION 'proposito es obligatorio (PLANTACION_INICIAL | REPOSICION).';
  END IF;

  IF p_usuario_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_asignacion_id es obligatorio.';
  END IF;

  IF p_fecha_asignacion IS NULL THEN
    RAISE EXCEPTION 'fecha_asignacion es obligatoria.';
  END IF;

  v_observaciones := NULLIF(BTRIM(COALESCE(p_observaciones, '')), '');

  -- Evidencia de entrega obligatoria (RN-VIV-54).
  SELECT ARRAY_AGG(DISTINCT eid ORDER BY eid)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS eid
  WHERE eid IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'La asignacion fisica requiere al menos una evidencia de entrega/salida (RN-VIV-54).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------
  -- 2. Campaña antes de subcampaña. La FK de evento_lote_vivero toma
  -- KEY SHARE sobre campaña al insertar; tomarlo tarde invertiría el orden
  -- frente a desactivación masiva (campaña UPDATE -> subcampañas UPDATE).
  -- Cuenta -> campaña -> subcampaña -> asignaciones -> lote -> evidencias.
  -- -----------------------------------------------------------------
  SELECT s.campania_id INTO v_campania_id FROM public.subcampania s
  WHERE s.id=p_subcampania_id AND s.deleted_at IS NULL;
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  SELECT s.id, s.estado, s.zona_id, s.campania_id, s.codigo_trazabilidad
  INTO v_subcampania
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada o eliminada.', p_subcampania_id;
  END IF;
  IF v_subcampania.campania_id IS DISTINCT FROM v_campania_id THEN
    RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409';
  END IF;

  IF v_subcampania.estado IN ('BORRADOR', 'CANCELADA') THEN
    RAISE EXCEPTION
      'No se puede asignar a una subcampania en estado %.',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'PLANTACION_INICIAL' AND v_subcampania.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION
      'PLANTACION_INICIAL solo se permite con la subcampania ACTIVA (estado actual: %).',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'REPOSICION'
     AND v_subcampania.estado NOT IN ('ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL') THEN
    RAISE EXCEPTION
      'REPOSICION solo se permite con la subcampania en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: %).',
      v_subcampania.estado;
  END IF;

  -- -----------------------------------------------------------------
  -- 3. Leer y bloquear el lote (el lock serializa asignaciones concurrentes)
  -- -----------------------------------------------------------------
  PERFORM 1 FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id=p_subcampania_id AND av.lote_vivero_id=p_lote_vivero_id
    ORDER BY av.id FOR UPDATE;
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.planta_id,
    lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', p_lote_vivero_id;
  END IF;

  PERFORM public.m2_exigir_vivero(p_usuario_asignacion_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_usuario_asignacion_id,v_lote.vivero_id,p_lote_vivero_id,'DESPACHO');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'No se puede asignar desde un lote en estado %. Solo lotes ACTIVOS (RN-VIV-61).',
      v_lote.estado_lote;
  END IF;

  -- EMBOLSADO previo obligatorio (RN-VIV-61).
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_vivero_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene EMBOLSADO registrado. Antes de EMBOLSADO solo existe material en proceso, no plantas entregables (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  IF v_lote.saldo_vivo_actual IS NULL OR v_lote.saldo_vivo_actual <= 0 THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo fisico disponible (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  -- Validacion FISICA: contra el saldo del lote, sin restar asignaciones
  -- previas (ya descontaron el saldo al entregarse — RN-VIV-47/57).
  IF p_cantidad_asignada > v_lote.saldo_vivo_actual THEN
    RAISE EXCEPTION
      'La cantidad a asignar (%) excede el saldo vivo fisico del lote % (%).',
      p_cantidad_asignada,
      p_lote_vivero_id,
      v_lote.saldo_vivo_actual;
  END IF;

  -- Fecha operativa coherente con la vida del lote.
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_asignacion, v_fecha_embolsado);

  -- -----------------------------------------------------------------
  -- 4. Permisos: ADMIN global o COORDINADOR de la subcampania
  -- -----------------------------------------------------------------
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_asignacion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_asignacion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = p_subcampania_id
      AND se.usuario_id = p_usuario_asignacion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR operario del vivero pueden registrar la asignacion fisica.' USING ERRCODE='42501';
  END IF;

  -- Guard de plan antes de cualquier entrega fisica. La subcampania ya
  -- esta bloqueada: usa el mismo plan y especie que validara la plantacion
  -- inicial (053). REPOSICION conserva su contrato de grupo origen.
  IF p_proposito = 'PLANTACION_INICIAL' AND NOT EXISTS (
    SELECT 1
    FROM public.subcampania_meta_especie sme
    WHERE sme.subcampania_id = p_subcampania_id
      AND sme.planta_id = v_lote.planta_id
  ) THEN
    RAISE EXCEPTION
      'La especie del lote (planta_id %) no esta en el plan de especies de la subcampania %. No se puede asignar para PLANTACION_INICIAL.',
      v_lote.planta_id,
      p_subcampania_id;
  END IF;

  -- -----------------------------------------------------------------
  -- 5. Validar evidencias (existen, no eliminadas, pendientes)
  -- -----------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id, ev.creado_por_usuario_id, ev.tipo_entidad_id, ev.bucket
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0)
    AND ev.creado_por_usuario_id=p_usuario_asignacion_id
    AND ev.tipo_entidad_id=v_tipo_entidad_evento_id
    AND ev.bucket<>'participacion_evidencias';

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de la asignacion deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------
  -- 6. Efectos atomicos
  -- -----------------------------------------------------------------
  v_saldo_antes   := v_lote.saldo_vivo_actual;
  v_saldo_despues := v_saldo_antes - p_cantidad_asignada;

  -- 6.1 Asignacion (entrega fisica).
  INSERT INTO public.asignacion_vivero_subcampania (
    lote_vivero_id,
    subcampania_id,
    cantidad_asignada,
    proposito,
    usuario_asignacion_id,
    fecha_asignacion,
    fecha_entrega_operativa
  )
  VALUES (
    p_lote_vivero_id,
    p_subcampania_id,
    p_cantidad_asignada,
    p_proposito,
    p_usuario_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_fecha_asignacion
  )
  RETURNING id INTO v_asignacion_id;

  v_destino_referencia :=
    'ASG-' || v_asignacion_id::TEXT || '-' || v_subcampania.codigo_trazabilidad;

  -- 6.2 Evento M2 de salida fisica por asignacion (RN-VIV-47/54).
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    destino_tipo,
    destino_referencia,
    comunidad_destino_id,
    origen_despacho,
    subcampania_id,
    campania_id,
    registro_plantacion_id,
    asignacion_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_vivero_id,
    'DESPACHO',
    p_fecha_asignacion,
    p_usuario_asignacion_id,
    p_cantidad_asignada,
    'UNIDAD',
    'PLANTACION_CAMPANIA'::public.destino_tipo_vivero,
    v_destino_referencia,
    v_subcampania.zona_id,
    'ASIGNACION_SUBCAMPANIA'::public.origen_despacho_vivero,
    p_subcampania_id,
    v_subcampania.campania_id,
    NULL,
    v_asignacion_id,
    v_saldo_antes,
    v_saldo_despues,
    v_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- 6.3 Descuento fisico del saldo del lote.
  UPDATE public.lote_vivero
  SET saldo_vivo_actual = v_saldo_despues,
      updated_at        = NOW()
  WHERE id = p_lote_vivero_id;

  -- 6.4 Vincular evidencias al evento M2.
  UPDATE public.evidencias_trazabilidad
  SET tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = NOW(),
      actualizado_por_usuario_id = p_usuario_asignacion_id
  WHERE id = ANY(v_evidencia_ids);

  -- 6.5 Evento M3 para la linea de tiempo de la subcampania.
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_asignada_evento,
    created_by
  )
  VALUES (
    'ASIGNACION_VIVERO'::public.tipo_evento_plantacion,
    p_subcampania_id,
    v_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_usuario_asignacion_id,
    v_observaciones,
    p_cantidad_asignada,
    p_usuario_asignacion_id
  )
  RETURNING id INTO v_evento_plantacion_id;

  -- 6.6 Cierre automatico si el saldo fisico llego a 0.
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_vivero_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_vivero_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------
  -- 7. Resultado
  -- -----------------------------------------------------------------
  asignacion_id            := v_asignacion_id;
  evento_lote_vivero_id    := v_evento_id;
  evento_plantacion_id     := v_evento_plantacion_id;
  lote_vivero_id           := p_lote_vivero_id;
  codigo_trazabilidad_lote := v_lote.codigo_trazabilidad;
  subcampania_id           := p_subcampania_id;
  campania_id              := v_subcampania.campania_id;
  proposito                := p_proposito;
  estado_asignacion        := 'ACTIVA'::public.estado_asignacion_vivero;
  cantidad_asignada        := p_cantidad_asignada;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;


-- Conserva el orden compartido y las devoluciones administrativas 077.
CREATE OR REPLACE FUNCTION public.fn_m3_devolver_asignacion_vivero(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_devuelta_delta   INT,
  cantidad_devuelta_total   INT,
  saldo_asignado_disponible INT,
  lote_vivero_id            BIGINT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  lote_reabierto            BOOLEAN,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_asignacion    RECORD;
  v_usuario_rol   TEXT;
  v_es_coordinador BOOLEAN;
  v_resultado     RECORD;
  v_final         RECORD;
  v_sub_id BIGINT;
  v_campania_id BIGINT;
  v_campania_actual BIGINT;
BEGIN
  v_usuario_rol:=public.pa_d_cuenta(p_usuario_devolucion_id);
  IF v_usuario_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RAISE EXCEPTION 'AUTORIDAD_INTERNA_REQUERIDA' USING ERRCODE='PT403'; END IF;
  SELECT av.subcampania_id,s.campania_id INTO v_sub_id,v_campania_id
  FROM public.asignacion_vivero_subcampania av JOIN public.subcampania s ON s.id=av.subcampania_id
  WHERE av.id=p_asignacion_id;
  IF v_sub_id IS NULL THEN RAISE EXCEPTION 'Asignacion no encontrada.' USING ERRCODE='PT404'; END IF;
  -- También la devolución inserta un evento con FK hacia campaña.
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  SELECT s.campania_id INTO v_campania_actual FROM public.subcampania s WHERE s.id=v_sub_id FOR UPDATE;
  IF v_campania_actual IS DISTINCT FROM v_campania_id THEN RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409'; END IF;
  IF p_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'asignacion_id es obligatorio.';
  END IF;

  IF p_motivo_devolucion IS NULL THEN
    RAISE EXCEPTION 'motivo_devolucion es obligatorio.';
  END IF;

  IF p_usuario_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_devolucion_id es obligatorio.';
  END IF;

  IF p_fecha_devolucion IS NULL THEN
    RAISE EXCEPTION 'fecha_devolucion es obligatoria.';
  END IF;

  -- Asignación después de cuenta, campaña y subcampaña.
  SELECT av.id, av.subcampania_id, av.fecha_asignacion
  INTO v_asignacion
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignacion % no encontrada.', p_asignacion_id;
  END IF;
  IF v_asignacion.subcampania_id IS DISTINCT FROM v_sub_id THEN RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409'; END IF;

  -- Fecha coherente: no antes de la entrega, no futura, max 10 dias atras.
  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_devolucion, v_asignacion.fecha_asignacion::DATE
  );

  -- Permisos: ADMIN global o COORDINADOR de la subcampania.
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_devolucion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_devolucion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = v_asignacion.subcampania_id
      AND se.usuario_id = p_usuario_devolucion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR operario del vivero pueden registrar la devolucion fisica.' USING ERRCODE='42501';
  END IF;

  -- Aplicar la devolucion (valida cantidad y estado, mueve saldos, eventos).
  SELECT *
  INTO v_resultado
  FROM public.fn_m2_m3_aplicar_devolucion_fisica(
    p_asignacion_id,
    p_cantidad_devuelta,
    p_motivo_devolucion,
    p_usuario_devolucion_id,
    p_fecha_devolucion,
    p_observaciones
  );

  SELECT av.estado, av.cantidad_devuelta, av.saldo_asignado_disponible
  INTO v_final
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id;

  asignacion_id             := p_asignacion_id;
  estado_asignacion         := v_final.estado;
  cantidad_devuelta_delta   := p_cantidad_devuelta;
  cantidad_devuelta_total   := v_final.cantidad_devuelta;
  saldo_asignado_disponible := v_final.saldo_asignado_disponible;
  lote_vivero_id            := v_resultado.lote_vivero_id;
  saldo_vivo_antes          := v_resultado.saldo_vivo_antes;
  saldo_vivo_despues        := v_resultado.saldo_vivo_despues;
  lote_reabierto            := v_resultado.lote_reabierto;
  evento_lote_vivero_id     := v_resultado.evento_lote_vivero_id;
  evento_plantacion_id      := v_resultado.evento_plantacion_id;

  RETURN NEXT;
END;
$$;


-- Conserva el orden compartido y las devoluciones administrativas 077.
CREATE OR REPLACE FUNCTION public.fn_m2_m3_aplicar_devolucion_fisica(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT
)
RETURNS TABLE (
  evento_lote_vivero_id BIGINT,
  evento_plantacion_id  BIGINT,
  lote_vivero_id        BIGINT,
  saldo_vivo_antes      INT,
  saldo_vivo_despues    INT,
  lote_reabierto        BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_asignacion       RECORD;
  v_lote             RECORD;
  v_saldo_antes      INT;
  v_saldo_despues    INT;
  v_lote_reabierto   BOOLEAN := FALSE;
  v_evento_m2_id     BIGINT;
  v_evento_m3_id     BIGINT;
  v_campania_id      BIGINT;
  v_sub_id bigint; v_campania_actual bigint; v_rol text;
BEGIN
  v_rol:=public.m1_exigir_actor(p_usuario_devolucion_id,false);
  SELECT av.subcampania_id,s.campania_id INTO v_sub_id,v_campania_id
    FROM public.asignacion_vivero_subcampania av JOIN public.subcampania s ON s.id=av.subcampania_id WHERE av.id=p_asignacion_id;
  PERFORM 1 FROM public.campania WHERE id=v_campania_id FOR SHARE;
  SELECT campania_id INTO v_campania_actual FROM public.subcampania WHERE id=v_sub_id FOR UPDATE;
  IF v_campania_actual IS DISTINCT FROM v_campania_id THEN RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409'; END IF;
  IF v_rol<>'ADMIN' AND NOT EXISTS(SELECT 1 FROM public.subcampania_equipo WHERE subcampania_id=v_sub_id
    AND usuario_id=p_usuario_devolucion_id AND rol='COORDINADOR') THEN
    RAISE EXCEPTION 'Se requiere coordinación y acceso al vivero.' USING ERRCODE='42501'; END IF;
  -- La asignacion debe venir bloqueada por el caller; se relee por seguridad.
  SELECT av.id, av.lote_vivero_id, av.subcampania_id, av.estado,
         av.saldo_asignado_disponible
  INTO v_asignacion
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignacion % no encontrada.', p_asignacion_id;
  END IF;

  IF p_cantidad_devuelta IS NULL OR p_cantidad_devuelta <= 0 THEN
    RAISE EXCEPTION 'cantidad_devuelta debe ser un entero mayor a 0.';
  END IF;

  IF v_asignacion.estado = 'DEVUELTA'::public.estado_asignacion_vivero THEN
    RAISE EXCEPTION 'La asignacion % ya esta DEVUELTA.', p_asignacion_id;
  END IF;

  IF p_cantidad_devuelta > COALESCE(v_asignacion.saldo_asignado_disponible, 0) THEN
    RAISE EXCEPTION
      'La devolucion (%) excede el saldo asignado disponible (%) de la asignacion %.',
      p_cantidad_devuelta,
      COALESCE(v_asignacion.saldo_asignado_disponible, 0),
      p_asignacion_id;
  END IF;

  -- Lock del lote (despues de la asignacion: orden estable anti-deadlock).
  SELECT lv.id, lv.vivero_id, lv.codigo_trazabilidad, lv.estado_lote, lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = v_asignacion.lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', v_asignacion.lote_vivero_id;
  END IF;

  IF v_asignacion.subcampania_id IS DISTINCT FROM v_sub_id THEN RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409'; END IF;
  PERFORM public.m2_exigir_vivero(p_usuario_devolucion_id,v_lote.vivero_id);
  v_saldo_antes   := COALESCE(v_lote.saldo_vivo_actual, 0);
  v_saldo_despues := v_saldo_antes + p_cantidad_devuelta;

  SELECT s.campania_id INTO v_campania_id
  FROM public.subcampania s
  WHERE s.id = v_asignacion.subcampania_id;

  -- 1. Aumentar cantidad_devuelta (el trigger de estado transiciona la fila).
  UPDATE public.asignacion_vivero_subcampania
  SET cantidad_devuelta = cantidad_devuelta + p_cantidad_devuelta
  WHERE id = p_asignacion_id;

  -- 2. Retorno fisico al lote (RN-VIV-48). Reabre el lote si estaba FINALIZADO.
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        estado_lote       = 'ACTIVO',
        motivo_cierre     = NULL,
        updated_at        = NOW()
    WHERE id = v_lote.id;
    v_lote_reabierto := TRUE;
  ELSE
    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        updated_at        = NOW()
    WHERE id = v_lote.id;
  END IF;

  -- 3. Evento M2 de entrada fisica (explica el aumento de saldo en el lote).
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    asignacion_id,
    subcampania_id,
    campania_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    v_lote.id,
    'DEVOLUCION_PLANTACION'::public.tipo_evento_vivero,
    p_fecha_devolucion,
    p_usuario_devolucion_id,
    p_cantidad_devuelta,
    'UNIDAD',
    p_asignacion_id,
    v_asignacion.subcampania_id,
    v_campania_id,
    v_saldo_antes,
    v_saldo_despues,
    NULLIF(BTRIM(COALESCE(p_observaciones, '')), '')
  )
  RETURNING id INTO v_evento_m2_id;

  -- 4. Evento M3 (linea de tiempo de la subcampania).
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_devuelta,
    motivo_devolucion,
    created_by
  )
  VALUES (
    'DEVOLUCION_A_VIVERO'::public.tipo_evento_plantacion,
    v_asignacion.subcampania_id,
    p_asignacion_id,
    p_fecha_devolucion::TIMESTAMPTZ,
    p_usuario_devolucion_id,
    NULLIF(BTRIM(COALESCE(p_observaciones, '')), ''),
    p_cantidad_devuelta,
    p_motivo_devolucion,
    p_usuario_devolucion_id
  )
  RETURNING id INTO v_evento_m3_id;

  evento_lote_vivero_id := v_evento_m2_id;
  evento_plantacion_id  := v_evento_m3_id;
  lote_vivero_id        := v_lote.id;
  saldo_vivo_antes      := v_saldo_antes;
  saldo_vivo_despues    := v_saldo_despues;
  lote_reabierto        := v_lote_reabierto;

  RETURN NEXT;
END;
$$;


-- Conserva el orden compartido y las devoluciones administrativas 077.
CREATE OR REPLACE FUNCTION public.fn_subcampania_cancelar_interna(
  p_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT,
  p_contexto JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s'
AS $$
DECLARE
  v_sub public.subcampania%ROWTYPE;
  v_estado_origen public.estado_subcampania;
  v_asig RECORD;
  v_asignaciones_devueltas INT := 0;
  v_unidades_devueltas INT := 0;
  v_contexto JSONB := COALESCE(p_contexto, '{}'::JSONB);
  v_campania_id BIGINT;
BEGIN
  IF public.m1_exigir_actor(p_actor_user_id,false)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN cancela.' USING ERRCODE='42501'; END IF;
  IF p_motivo IS NULL
     OR LENGTH(BTRIM(p_motivo)) < 3
     OR LENGTH(BTRIM(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'El motivo de cancelacion debe tener entre 3 y 1000 caracteres.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor_user_id es obligatorio.'
      USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_contexto) <> 'object' THEN
    RAISE EXCEPTION 'El contexto de cancelacion debe ser un objeto JSON.'
      USING ERRCODE = 'P0001';
  END IF;

  -- La cancelación individual también inserta eventos con FK hacia campaña.
  -- En el caller masivo ambos locks son reentrantes y ya están adquiridos.
  SELECT s.campania_id INTO v_campania_id FROM public.subcampania s
  WHERE s.id=p_id AND s.deleted_at IS NULL;
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  -- El caller masivo ya bloqueo todas las subcampanias en orden estable.
  -- El lock se repite para que el helper tambien sea seguro desde la RPC
  -- individual.
  SELECT *
  INTO v_sub
  FROM public.subcampania
  WHERE id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada.', p_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_sub.campania_id IS DISTINCT FROM v_campania_id THEN
    RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409';
  END IF;

  v_estado_origen := v_sub.estado;

  IF v_sub.estado NOT IN ('BORRADOR', 'ACTIVA') THEN
    RAISE EXCEPTION
      'Solo se puede cancelar una subcampania en BORRADOR o ACTIVA (estado actual: %).',
      v_sub.estado
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_sub.total_plantado_inicial, 0) > 0 THEN
    RAISE EXCEPTION
      'La subcampania ya tiene plantaciones registradas (total_plantado_inicial = %). Usar cierre FINALIZADA_PARCIAL.',
      v_sub.total_plantado_inicial
      USING ERRCODE = 'P0001';
  END IF;

  -- Prelock de todas las asignaciones y despues de todos sus lotes, ambos en
  -- orden global estable. En la operacion de campaña estos locks ya fueron
  -- adquiridos para todas las hijas y las lecturas siguientes son reentrantes.
  PERFORM 1
  FROM public.asignacion_vivero_subcampania av
  WHERE av.subcampania_id = p_id
    AND av.estado = 'ACTIVA'
    AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ORDER BY av.id ASC
  FOR UPDATE;

  PERFORM 1
  FROM public.lote_vivero lv
  JOIN (
    SELECT DISTINCT av.lote_vivero_id
    FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id = p_id
      AND av.estado = 'ACTIVA'
      AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ) lotes ON lotes.lote_vivero_id = lv.id
  ORDER BY lv.id ASC
  FOR UPDATE OF lv;

  -- Devolucion fisica de asignaciones activas con saldo disponible. El helper
  -- de M2/M3 registra DEVOLUCION_PLANTACION y DEVOLUCION_A_VIVERO.
  FOR v_asig IN
    SELECT av.id, av.saldo_asignado_disponible
    FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id = p_id
      AND av.estado = 'ACTIVA'
    ORDER BY av.id ASC
    FOR UPDATE
  LOOP
    IF COALESCE(v_asig.saldo_asignado_disponible, 0) > 0 THEN
      PERFORM public.fn_m2_m3_aplicar_devolucion_fisica(
        v_asig.id,
        v_asig.saldo_asignado_disponible,
        'CIERRE_SUBCAMPANIA'::public.motivo_devolucion_plantacion,
        p_actor_user_id,
        CURRENT_DATE,
        'Devolucion fisica automatica por cancelacion de subcampania. Motivo: '
          || BTRIM(p_motivo)
      );

      v_asignaciones_devueltas := v_asignaciones_devueltas + 1;
      v_unidades_devueltas :=
        v_unidades_devueltas + v_asig.saldo_asignado_disponible;
    END IF;
  END LOOP;

  UPDATE public.subcampania
  SET estado = 'CANCELADA',
      deleted_at = NOW(),
      deleted_by = p_actor_user_id,
      updated_at = NOW(),
      updated_by = p_actor_user_id
  WHERE id = p_id
  RETURNING * INTO v_sub;

  INSERT INTO public.subcampania_historial (
    subcampania_id,
    tipo_historial,
    estado_origen,
    estado_destino,
    observaciones,
    metadata,
    actor_user_id
  )
  VALUES (
    p_id,
    'SUBCAMPANIA_CANCELADA',
    v_estado_origen,
    'CANCELADA',
    BTRIM(p_motivo),
    jsonb_build_object(
      'asignaciones_devueltas', v_asignaciones_devueltas,
      'unidades_devueltas', v_unidades_devueltas,
      'motivo_devolucion', 'CIERRE_SUBCAMPANIA',
      'devolucion_fisica', TRUE
    ) || v_contexto,
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'subcampania_id', v_sub.id,
    'asignaciones_devueltas', v_asignaciones_devueltas,
    'unidades_devueltas', v_unidades_devueltas
  );
END;
$$;

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
      PERFORM public.m2_exigir_vivero(p_actor_id,r.vivero_id);
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

CREATE OR REPLACE FUNCTION public.fn_recoleccion_rechazar_validacion(
  p_recoleccion_id bigint, p_actor_id bigint, p_motivo_rechazo text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
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
  SELECT r.vivero_id,r.estado_registro, r.eliminado_en, r.codigo_trazabilidad
  INTO v_recoleccion FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id FOR UPDATE;
  IF NOT FOUND OR v_recoleccion.eliminado_en IS NOT NULL THEN
    RAISE EXCEPTION 'Recolección no encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.m2_exigir_vivero(p_actor_id,v_recoleccion.vivero_id);
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
LANGUAGE plpgsql SECURITY DEFINER
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

  PERFORM public.m1_exigir_actor(p_usuario_id,false);
  SELECT
    r.id,
    r.vivero_id,
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

  PERFORM public.m2_exigir_vivero(p_usuario_id,v_recoleccion.vivero_id);
  IF p_cantidad_desechada::text IN ('NaN','Infinity','-Infinity') OR (v_recoleccion.unidad_canonica='UNIDAD' AND p_cantidad_desechada<>trunc(p_cantidad_desechada)) THEN RAISE EXCEPTION 'Cantidad/unidad inválida.' USING ERRCODE='22023'; END IF;
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


CREATE OR REPLACE FUNCTION public.m2_origenes_leer(
  p_actor_id bigint,p_vivero_id bigint,p_recoleccion_id bigint DEFAULT NULL,p_pagina integer DEFAULT 1,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE filas jsonb; total bigint;
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 1000000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paginación inválida.' USING ERRCODE='22023'; END IF;
  IF p_recoleccion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.recoleccion WHERE id=p_recoleccion_id
    AND vivero_id=p_vivero_id AND eliminado_en IS NULL AND estado_registro='VALIDADO') THEN
    RAISE EXCEPTION 'Origen no disponible.' USING ERRCODE='P0002'; END IF;
  SELECT count(*) INTO total FROM public.recoleccion r WHERE r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL
    AND r.estado_registro='VALIDADO' AND r.estado_operativo='ABIERTO' AND r.saldo_actual>0
    AND (p_recoleccion_id IS NULL OR r.id=p_recoleccion_id);
  SELECT coalesce(jsonb_agg(fila ORDER BY id DESC),'[]'::jsonb) INTO filas FROM (
    SELECT r.id,jsonb_build_object('recoleccion_id',r.id::text,'vivero_almacenamiento_id',r.vivero_id::text,
      'recolector_id',r.usuario_id::text,'codigo_trazabilidad',r.codigo_trazabilidad,
      'fecha',r.fecha,'planta_id',r.planta_id::text,'tipo_material',r.tipo_material,
      'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,'nombre_comercial_snapshot',r.nombre_comercial_snapshot,
      'variedad_snapshot',r.variedad_snapshot,'estado_registro',r.estado_registro,'estado_operativo',r.estado_operativo,
      'saldo_actual',r.saldo_actual,'unidad_canonica',r.unidad_canonica) fila
    FROM public.recoleccion r WHERE r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL
      AND r.estado_registro='VALIDADO' AND r.estado_operativo='ABIERTO' AND r.saldo_actual>0
      AND (p_recoleccion_id IS NULL OR r.id=p_recoleccion_id)
    ORDER BY r.id DESC OFFSET (p_pagina-1)*p_limite LIMIT p_limite
  ) x;
  RETURN jsonb_build_object('success',true,'data',filas,'pagination',jsonb_build_object('page',p_pagina,'limit',p_limite,'total',total));
END $$;
REVOKE ALL ON FUNCTION public.m2_origenes_leer(bigint,bigint,bigint,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.m2_origenes_leer(bigint,bigint,bigint,integer,integer) TO service_role;

DO $$ DECLARE f record; col record; BEGIN
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid='public.m2_evidencia_contexto'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.m2_evidencia_contexto FROM PUBLIC,anon,authenticated,service_role',col.attname);
  END LOOP;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) rol WHERE has_any_column_privilege(rol,'public.m2_evidencia_contexto','SELECT,INSERT,UPDATE,REFERENCES') OR has_table_privilege(rol,'public.m2_evidencia_contexto','DELETE,TRUNCATE,TRIGGER')) THEN
    RAISE EXCEPTION 'T2_PRIVILEGIO_CONTEXTO_INESPERADO'; END IF;
  FOR f IN SELECT p.oid,p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('fn_vivero_crear_lote_desde_recoleccion','fn_vivero_registrar_embolsado','fn_vivero_registrar_adaptabilidad','fn_vivero_registrar_despacho','fn_vivero_registrar_descarte_pre_embolsado','fn_vivero_registrar_merma','fn_vivero_asignar_stock_subcampania','fn_m3_devolver_asignacion_vivero','fn_m2_m3_aplicar_devolucion_fisica','fn_subcampania_cancelar_interna','m1_recoleccion_guardar','fn_recoleccion_rechazar_validacion','fn_recoleccion_registrar_desecho','m2_ambitos','m2_exigir_vivero','m2_evidencias_preparar','m2_evidencias_exigir','m2_origenes_leer','fn_subcampania_cancelar','fn_campania_desactivar_sin_plantaciones','fn_vivero_cerrar_lote_si_corresponde') LOOP
    EXECUTE format('ALTER FUNCTION %s SET lock_timeout TO %L',f.firma,'5s');
    EXECUTE format('ALTER FUNCTION %s SET statement_timeout TO %L',f.firma,'30s');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T2_PRIVILEGIO_FUNCION_INESPERADO: %',f.firma; END IF;

  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.m2_ambitos(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.m2_evidencias_preparar(bigint,bigint,bigint,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_embolsado(bigint,date,bigint,integer,text,bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_adaptabilidad(bigint,date,bigint,public.subetapa_adaptabilidad,text,bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_despacho(bigint,date,bigint,integer,public.destino_tipo_vivero,text,bigint,text,bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_descarte_pre_embolsado(bigint,date,bigint,numeric,public.unidad_medida,public.causa_descarte_pre_embolsado,text,bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_merma(bigint,date,bigint,integer,public.causa_merma_vivero,text,bigint[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_vivero_asignar_stock_subcampania(bigint,bigint,int,public.proposito_asignacion,bigint,date,bigint[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_m3_devolver_asignacion_vivero(bigint,int,public.motivo_devolucion_plantacion,bigint,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_recoleccion_rechazar_validacion(bigint,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_recoleccion_registrar_desecho(bigint,numeric,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.m2_origenes_leer(bigint,bigint,bigint,integer,integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.fn_subcampania_cancelar(bigint,bigint,text),public.fn_campania_desactivar_sin_plantaciones(bigint,bigint,text) TO service_role;
ALTER FUNCTION public.fn_subcampania_cancelar(bigint,bigint,text) SECURITY DEFINER;
ALTER FUNCTION public.fn_subcampania_cancelar(bigint,bigint,text) SET search_path=pg_catalog,public;
ALTER FUNCTION public.fn_campania_desactivar_sin_plantaciones(bigint,bigint,text) SECURITY DEFINER;
ALTER FUNCTION public.fn_campania_desactivar_sin_plantaciones(bigint,bigint,text) SET search_path=pg_catalog,public;
REVOKE ALL ON FUNCTION public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
-- La reserva lógica se retiró en 052. Si reapareció, abortar ante ese drift.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='fn_vivero_reservar_stock_lote') THEN
  RAISE EXCEPTION 'T2_CATALOGO_INCOMPATIBLE: reserva lógica retirada en 052'; END IF; END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
