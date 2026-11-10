-- Conciliación de remanentes históricos. Sin padrón inicial, backfill ni movimientos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE public.recoleccion IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE fecha_def text; fecha_esperada text;
BEGIN
  IF to_regprocedure('public.m1_recepcion_proteger_movimiento()') IS NULL
    OR to_regprocedure('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer)') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.recoleccion_movimiento'::regclass
      AND tgname='recepcion_exigida' AND tgenabled='O'
      AND tgfoid='public.m1_recepcion_proteger_movimiento()'::regprocedure)
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.recoleccion'::regclass
      AND tgname='trg_recoleccion_acotar_excepcion_fecha_rechazo' AND tgenabled='O'
      AND tgfoid='public.fn_recoleccion_acotar_excepcion_fecha_rechazo()'::regprocedure) THEN
    RAISE EXCEPTION 'CONCILIACION_CATALOGO_INCOMPATIBLE: requiere 090/093 y 096';
  END IF;
  SELECT pg_get_expr(conbin,conrelid) INTO fecha_def FROM pg_constraint
    WHERE conrelid='public.recoleccion'::regclass AND conname='chk_fecha_rango' AND contype='c';
  CREATE TEMP TABLE pg_temp._r3_097_fecha ON COMMIT DROP AS
    SELECT r.fecha,r.estado_registro FROM public.recoleccion r WITH NO DATA;
  ALTER TABLE pg_temp._r3_097_fecha ADD CONSTRAINT referencia CHECK (
    (fecha>=CURRENT_DATE-45 AND fecha<=CURRENT_DATE)
    OR coalesce(estado_registro::text='RECHAZADO',false)
  );
  SELECT pg_get_expr(conbin,conrelid) INTO fecha_esperada FROM pg_constraint
    WHERE conrelid='pg_temp._r3_097_fecha'::regclass AND conname='referencia';
  IF fecha_def IS DISTINCT FROM fecha_esperada THEN
    RAISE EXCEPTION 'CONCILIACION_CATALOGO_INCOMPATIBLE: cotejar chk_fecha_rango (%)',fecha_def;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.recoleccion_movimiento'::regclass
    AND attname='created_at' AND atttypid='date'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'CONCILIACION_CATALOGO_INCOMPATIBLE: movimiento.created_at requiere DATE (015)';
  END IF;
  PERFORM lote_vivero_id,delta,created_by FROM public.recoleccion_movimiento LIMIT 0;
  PERFORM lote_vivero_id,subcampania_id FROM public.asignacion_vivero_subcampania LIMIT 0;
END $$;

-- Cierre acotado de escritura legado antes de permitir saldos en fichas antiguas.
-- Todos los privilegios disponibles salvo SELECT, incluido MAINTAIN en PG17.
-- Compara servicio, SELECT de clientes y RLS antes/después sin conceder permisos.
-- No extiende este cierre a otras tablas ni presume un saneamiento global.
DO $$
DECLARE
  tabla text; columna record; rol text; lista text; objeto pg_catalog.pg_class;
  fase integer; antes jsonb; actual jsonb;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['recoleccion','recoleccion_movimiento'] LOOP
    SELECT * INTO objeto FROM pg_class WHERE oid=('public.'||tabla)::regclass;
    SELECT string_agg(privilege_type,',' ORDER BY privilege_type) INTO lista
      FROM aclexplode(acldefault('r',objeto.relowner)) WHERE privilege_type<>'SELECT';
    FOR fase IN 1..2 LOOP
      -- Solo catálogo: incluye permisos efectivos heredados y por columna.
      SELECT jsonb_build_object(
        'servicio_tabla',(SELECT jsonb_agg(jsonb_build_object('privilegio',a.privilege_type,
          'concedido',has_table_privilege('service_role',objeto.oid,a.privilege_type)) ORDER BY a.privilege_type)
          FROM aclexplode(acldefault('r',objeto.relowner)) a),
        'servicio_columnas',(SELECT jsonb_agg(jsonb_build_object('columna',c.attnum,'privilegio',p.privilegio,
          'concedido',has_column_privilege('service_role',objeto.oid,c.attnum,p.privilegio)) ORDER BY c.attnum,p.privilegio)
          FROM pg_attribute c CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilegio)
          WHERE c.attrelid=objeto.oid AND c.attnum>0 AND NOT c.attisdropped),
        'lectura_tabla',(SELECT jsonb_agg(jsonb_build_object('rol',r.nombre,
          'concedido',has_table_privilege(r.nombre,objeto.oid,'SELECT')) ORDER BY r.nombre)
          FROM (VALUES('anon'),('authenticated')) r(nombre)),
        'lectura_columnas',(SELECT jsonb_agg(jsonb_build_object('columna',c.attnum,'rol',r.nombre,
          'concedido',has_column_privilege(r.nombre,objeto.oid,c.attnum,'SELECT')) ORDER BY c.attnum,r.nombre)
          FROM pg_attribute c CROSS JOIN (VALUES('anon'),('authenticated')) r(nombre)
          WHERE c.attrelid=objeto.oid AND c.attnum>0 AND NOT c.attisdropped),
        'rls',(SELECT jsonb_build_array(relrowsecurity,relforcerowsecurity) FROM pg_class WHERE oid=objeto.oid)
      ) INTO actual;
      IF fase=1 THEN
        antes:=actual;
        EXECUTE format('REVOKE %s ON TABLE public.%I FROM PUBLIC,anon,authenticated',lista,tabla);
        FOR columna IN SELECT attname FROM pg_attribute
          WHERE attrelid=objeto.oid AND attnum>0 AND NOT attisdropped LOOP
          EXECUTE format('REVOKE INSERT (%I),UPDATE (%I),REFERENCES (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated',
            columna.attname,columna.attname,columna.attname,tabla);
        END LOOP;
      ELSE
        IF (actual->'servicio_tabla',actual->'servicio_columnas') IS DISTINCT FROM
          (antes->'servicio_tabla',antes->'servicio_columnas') THEN
          RAISE EXCEPTION 'CONCILIACION_PRIVILEGIO_SERVICIO_ALTERADO: %',tabla;
        END IF;
        IF (actual->'lectura_tabla',actual->'lectura_columnas',actual->'rls') IS DISTINCT FROM
          (antes->'lectura_tabla',antes->'lectura_columnas',antes->'rls') THEN
          RAISE EXCEPTION 'CONCILIACION_LECTURA_PUBLICA_ALTERADA: %',tabla;
        END IF;
        FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF has_table_privilege(rol,objeto.oid,lista)
            OR has_any_column_privilege(rol,objeto.oid,'INSERT,UPDATE,REFERENCES') THEN
            RAISE EXCEPTION 'CONCILIACION_ESCRITURA_PUBLICA_RESIDUAL: %.%',tabla,rol;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- La ventana es una regla de captura/transición. El AFTER ve la fila final
-- y permite en fichas antiguas únicamente el saldo exacto derivado del ledger.
ALTER TABLE public.recoleccion DROP CONSTRAINT chk_fecha_rango;
CREATE OR REPLACE FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE saldo_calculado numeric;
BEGIN
  IF NEW.fecha BETWEEN CURRENT_DATE - 45 AND CURRENT_DATE THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.estado_registro::text='PENDIENTE_VALIDACION' AND NEW.estado_registro::text='RECHAZADO'
      AND NEW.revision_captura=OLD.revision_captura+1
      AND NEW.usuario_validacion_id IS NULL AND NEW.fecha_validacion IS NULL
      AND char_length(NEW.motivo_rechazo) BETWEEN 10 AND 500
      AND (to_jsonb(NEW)-ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo','revision_captura'])
        = (to_jsonb(OLD)-ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo','revision_captura']) THEN
      RETURN NEW;
    END IF;
    IF OLD.estado_registro::text='VALIDADO' AND OLD.fecha<CURRENT_DATE-45
      AND (to_jsonb(NEW)-ARRAY['saldo_actual','estado_operativo'])
        = (to_jsonb(OLD)-ARRAY['saldo_actual','estado_operativo']) THEN
      SELECT NEW.cantidad_inicial_canonica+coalesce(sum(m.delta),0) INTO saldo_calculado
      FROM public.recoleccion_movimiento m WHERE m.recoleccion_id=NEW.id;
      IF saldo_calculado::text NOT IN ('NaN','Infinity','-Infinity')
        AND NEW.saldo_actual=saldo_calculado
        AND NEW.estado_operativo::text=(CASE WHEN saldo_calculado>0 THEN 'ABIERTO' ELSE 'CERRADO' END) THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  RAISE EXCEPTION 'Fecha fuera de rango para captura o edición de Recolección.'
    USING ERRCODE='23514',CONSTRAINT='chk_fecha_rango';
END $$;

INSERT INTO public.tipos_entidad_evidencia(codigo,descripcion,activo)
VALUES('RECOLECCION_CONCILIACION','Comprobación física de un remanente histórico de Vivero',true)
ON CONFLICT(codigo) DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tipos_entidad_evidencia WHERE codigo='RECOLECCION_CONCILIACION' AND activo) THEN
    RAISE EXCEPTION 'CONCILIACION_CATALOGO_INCOMPATIBLE: tipo de evidencia inactivo';
  END IF;
END $$;

CREATE TABLE public.recoleccion_conciliacion_comando(
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  comando_id uuid NOT NULL,
  intencion jsonb NOT NULL CHECK(jsonb_typeof(intencion)='object'),
  http_status integer NOT NULL CHECK(http_status IN (200,403,404,409,422)),
  recibo jsonb NOT NULL CHECK(jsonb_typeof(recibo)='object'),
  PRIMARY KEY(actor_id,comando_id)
);
CREATE TABLE public.recoleccion_conciliacion_evento(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recoleccion_id bigint NOT NULL REFERENCES public.recoleccion(id) ON DELETE RESTRICT,
  vivero_id bigint NOT NULL REFERENCES public.vivero(id) ON DELETE RESTRICT,
  actor_id bigint NOT NULL,
  comando_id uuid NOT NULL,
  accion text NOT NULL,
  estado text NOT NULL,
  revision bigint NOT NULL CHECK(revision>0),
  motivo text,
  saldo_esperado numeric,
  cantidad_observada numeric,
  unidad_observada public.unidad_medida,
  fecha_comprobacion date,
  marca_movimientos text,
  ficha jsonb NOT NULL CHECK(jsonb_typeof(ficha)='object'),
  inconsistencias text[] NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(recoleccion_id,revision),
  UNIQUE(actor_id,comando_id),
  FOREIGN KEY(actor_id,comando_id) REFERENCES public.recoleccion_conciliacion_comando(actor_id,comando_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK((
    accion IN ('INCLUIR','RETIRAR')
      AND estado=CASE WHEN accion='INCLUIR' THEN 'PENDIENTE' ELSE 'RETIRADO' END
      AND char_length(motivo) BETWEEN 10 AND 500
      AND saldo_esperado IS NULL AND cantidad_observada IS NULL AND unidad_observada IS NULL
      AND fecha_comprobacion IS NULL AND marca_movimientos IS NULL
    OR accion='CONCILIAR'
      AND estado IN ('CONFORME','INCIDENCIA') AND motivo IS NULL
      AND saldo_esperado>0 AND cantidad_observada>=0 AND unidad_observada::text IN ('G','UNIDAD')
      AND fecha_comprobacion IS NOT NULL AND marca_movimientos ~ '^[0-9a-f]{64}$'
  ) IS TRUE)
);
CREATE TABLE public.recoleccion_conciliacion_evidencia_contexto(
  evidencia_id bigint PRIMARY KEY REFERENCES public.evidencias_trazabilidad(id) ON DELETE RESTRICT,
  recoleccion_id bigint NOT NULL REFERENCES public.recoleccion(id) ON DELETE RESTRICT,
  vivero_id bigint NOT NULL REFERENCES public.vivero(id) ON DELETE RESTRICT,
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT,
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.recoleccion_conciliacion_evidencia(
  evidencia_id bigint PRIMARY KEY REFERENCES public.recoleccion_conciliacion_evidencia_contexto(evidencia_id) ON DELETE RESTRICT,
  observacion_id bigint NOT NULL REFERENCES public.recoleccion_conciliacion_evento(id) ON DELETE RESTRICT
);
CREATE INDEX recoleccion_conciliacion_evidencia_evento ON public.recoleccion_conciliacion_evidencia(observacion_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recoleccion_conciliacion_comando','recoleccion_conciliacion_evento',
    'recoleccion_conciliacion_evidencia_contexto','recoleccion_conciliacion_evidencia'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    EXECUTE format('CREATE TRIGGER conciliacion_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.fn_subcampania_historial_prevent_mutation()',t);
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) rol
      WHERE has_any_column_privilege(rol,('public.'||t)::regclass,'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege(rol,('public.'||t)::regclass,'DELETE,TRUNCATE,TRIGGER')) THEN
      RAISE EXCEPTION 'CONCILIACION_PRIVILEGIO_TABLA_INESPERADO: %',t;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.m2_conciliacion_ultimo(p_origen bigint)
RETURNS public.recoleccion_conciliacion_evento LANGUAGE sql STABLE
SET search_path=pg_catalog,public AS $$
  SELECT e.* FROM public.recoleccion_conciliacion_evento e WHERE e.recoleccion_id=p_origen
  ORDER BY e.revision DESC LIMIT 1
$$;

CREATE FUNCTION public.m2_conciliacion_es_historica(r public.recoleccion)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT r.fecha < (statement_timestamp() AT TIME ZONE 'America/La_Paz')::date-45
    OR r.saldo_actual IS DISTINCT FROM r.cantidad_inicial_canonica
    OR EXISTS(SELECT 1 FROM public.recoleccion_movimiento m WHERE m.recoleccion_id=r.id)
    OR EXISTS(SELECT 1 FROM public.lote_vivero l WHERE l.recoleccion_id=r.id)
$$;

-- La conformidad inicial exige solo débitos conocidos. Cualquier corrección o
-- ajuste posterior la invalida, aunque disminuya el saldo y conserve la revisión.
CREATE FUNCTION public.m2_conciliacion_acreditada(r public.recoleccion,e public.recoleccion_conciliacion_evento)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT coalesce(e.vivero_id=r.vivero_id AND e.estado='CONFORME'
    AND r.saldo_actual<=e.saldo_esperado
    AND trim_scale(r.cantidad_inicial_canonica)::text=e.ficha->>'cantidad_inicial'
    AND r.unidad_canonica::text=e.ficha->>'unidad_canonica'
    AND r.revision_captura::text=e.ficha->>'revision_captura'
    AND NOT EXISTS(SELECT 1 FROM public.recoleccion_movimiento m WHERE m.recoleccion_id=r.id
      AND (m.tipo_movimiento IS NULL OR m.tipo_movimiento::text NOT IN ('CONSUMO_A_VIVERO','DESECHO'))),false)
$$;

CREATE FUNCTION public.m2_conciliacion_acreditada(r public.recoleccion)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT public.m2_conciliacion_acreditada(r,public.m2_conciliacion_ultimo(r.id))
$$;

-- Una autorización por origen y custodia. Un débito lícito no caduca la conformidad.
-- Una reinscripción posterior a un retiro exige una comprobación física nueva.
CREATE FUNCTION public.m2_origen_estado_habilitacion(r public.recoleccion,p_vivero_id bigint)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE e public.recoleccion_conciliacion_evento;
BEGIN
  IF r.vivero_id IS NULL OR r.vivero_id IS DISTINCT FROM p_vivero_id
    OR r.eliminado_en IS NOT NULL OR r.estado_registro::text IS DISTINCT FROM 'VALIDADO'
    OR coalesce(r.tipo_material::text,'') NOT IN ('SEMILLA','ESQUEJE')
    OR r.estado_operativo::text IS DISTINCT FROM 'ABIERTO'
    OR r.saldo_actual IS NULL OR r.saldo_actual<=0 OR r.saldo_actual::text IN ('NaN','Infinity','-Infinity') THEN
    RETURN NULL;
  END IF;
  IF EXISTS(SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id) THEN
    RETURN 'RECEPCION_CONFORME';
  END IF;
  e:=public.m2_conciliacion_ultimo(r.id);
  IF public.m2_conciliacion_acreditada(r,e) THEN RETURN 'CONCILIACION_CONFORME'; END IF;
  IF e.vivero_id=r.vivero_id AND e.estado='INCIDENCIA' THEN RETURN 'INCIDENCIA_CONCILIACION'; END IF;
  IF public.m2_conciliacion_es_historica(r) OR e.id IS NOT NULL
    OR r.fecha>(statement_timestamp() AT TIME ZONE 'America/La_Paz')::date THEN
    RETURN 'PENDIENTE_CONCILIACION';
  END IF;
  RETURN 'PENDIENTE_RECEPCION';
END $$;

CREATE FUNCTION public.m2_origen_exigir_habilitacion(r public.recoleccion,p_vivero_id bigint)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF r.vivero_id IS DISTINCT FROM p_vivero_id THEN
    RAISE EXCEPTION 'El origen debe pertenecer a la custodia del vivero.' USING ERRCODE='42501';
  END IF;
  IF coalesce(public.m2_origen_estado_habilitacion(r,p_vivero_id),'')
      NOT IN ('RECEPCION_CONFORME','CONCILIACION_CONFORME') THEN
    RAISE EXCEPTION 'RECEPCION_CONFORME_REQUERIDA' USING ERRCODE='P0001';
  END IF;
END $$;

CREATE FUNCTION public.m2_conciliacion_unidades_movimiento(m public.recoleccion_movimiento)
RETURNS text[] LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT array_remove(ARRAY[to_jsonb(m)->>'unidad_medida_movimiento',to_jsonb(m)->>'unidad_operativa',
    to_jsonb(m)->>'unidad_medida_evento'],NULL)
$$;

-- Cotejo exacto de la ecuación de saldo, unidades y vínculo consumo–lote–INICIO.
-- Las asignaciones son referencias descendentes; M3 mantiene sus propios locks/saldos.
CREATE FUNCTION public.m2_conciliacion_trazabilidad(r public.recoleccion)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  WITH movimientos AS MATERIALIZED (
    SELECT m.id,m.tipo_movimiento::text tipo,m.delta,m.lote_vivero_id,
      u.declaradas[1] unidad,u.declaradas unidades,
      to_jsonb(m)->'detalle_cambios'->>'evento_lote_vivero_id' evento_declarado,
      m.created_at fecha
    FROM public.recoleccion_movimiento m
    CROSS JOIN LATERAL (SELECT public.m2_conciliacion_unidades_movimiento(m) declaradas) u
    WHERE m.recoleccion_id=r.id
  ), lotes AS MATERIALIZED (
    SELECT l.id,l.vivero_id,l.codigo_trazabilidad,l.cantidad_inicial_en_proceso,l.unidad_medida_inicial
    FROM public.lote_vivero l WHERE l.recoleccion_id=r.id
  ), inicios AS MATERIALIZED (
    SELECT e.id,e.lote_id,e.cantidad_afectada,e.unidad_medida_evento
    FROM public.evento_lote_vivero e JOIN lotes l ON l.id=e.lote_id WHERE e.tipo_evento::text='INICIO'
  ), saldo AS (
    SELECT r.cantidad_inicial_canonica+coalesce(sum(delta),0) calculado,max(fecha) ultimo_movimiento_en
    FROM movimientos
  ), referencias AS (
    SELECT
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id::text,'tipo',m.tipo,'delta',trim_scale(m.delta)::text,
        'unidad',m.unidad,'lote_id',m.lote_vivero_id::text,'evento_id',coalesce(m.evento_declarado,
          (SELECT min(i.id)::text FROM inicios i WHERE i.lote_id=m.lote_vivero_id)),
        'fecha',m.fecha) ORDER BY m.id) FROM movimientos m),'[]'::jsonb) movimientos,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id::text,'vivero_id',l.vivero_id::text,
        'codigo_trazabilidad',l.codigo_trazabilidad,'cantidad_inicial',trim_scale(l.cantidad_inicial_en_proceso)::text,
        'unidad',l.unidad_medida_inicial,'evento_inicio_ids',coalesce((
          SELECT jsonb_agg(i.id::text ORDER BY i.id) FROM inicios i WHERE i.lote_id=l.id),'[]'::jsonb)) ORDER BY l.id) FROM lotes l),'[]'::jsonb) lotes,
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id::text,'lote_id',a.lote_vivero_id::text,
        'subcampania_id',a.subcampania_id::text) ORDER BY a.id)
        FROM public.asignacion_vivero_subcampania a JOIN lotes l ON l.id=a.lote_vivero_id),'[]'::jsonb) asignaciones,
      coalesce((SELECT jsonb_agg(jsonb_build_array(i.id::text,i.lote_id::text,trim_scale(i.cantidad_afectada)::text,
        i.unidad_medida_evento) ORDER BY i.id) FROM inicios i),'[]'::jsonb) inicios
  ), errores AS (
    SELECT array_remove(ARRAY[
      CASE WHEN s.calculado IS DISTINCT FROM r.saldo_actual OR s.calculado::text IN ('NaN','Infinity','-Infinity')
        THEN 'SALDO_LEDGER_INCONSISTENTE' END,
      CASE WHEN r.unidad_canonica::text NOT IN ('G','UNIDAD')
        OR r.tipo_material::text NOT IN ('SEMILLA','ESQUEJE')
        OR (r.tipo_material::text='ESQUEJE' AND r.unidad_canonica::text<>'UNIDAD')
        OR (r.unidad_canonica::text='UNIDAD' AND
          (r.saldo_actual<>trunc(r.saldo_actual) OR r.cantidad_inicial_canonica<>trunc(r.cantidad_inicial_canonica)))
        OR r.saldo_actual<>round(r.saldo_actual,6) OR r.cantidad_inicial_canonica<>round(r.cantidad_inicial_canonica,6)
        THEN 'UNIDAD_CANONICA_INCONSISTENTE' END,
      CASE WHEN EXISTS(SELECT 1 FROM movimientos m
        WHERE m.unidad IS NULL OR (r.unidad_canonica::text=ALL(m.unidades)) IS NOT TRUE OR m.delta>=0
          OR m.delta::text IN ('NaN','Infinity','-Infinity') OR m.delta<>round(m.delta,6)
          OR (r.unidad_canonica::text='UNIDAD' AND m.delta<>trunc(m.delta))
          OR m.tipo NOT IN ('CONSUMO_A_VIVERO','DESECHO') OR (m.tipo='DESECHO' AND m.lote_vivero_id IS NOT NULL))
        THEN 'MOVIMIENTO_INCONSISTENTE' END,
      CASE WHEN EXISTS(SELECT 1 FROM movimientos m WHERE m.tipo='CONSUMO_A_VIVERO'
        AND NOT EXISTS(SELECT 1 FROM lotes l WHERE l.id=m.lote_vivero_id
          AND l.cantidad_inicial_en_proceso=-m.delta AND l.unidad_medida_inicial::text=m.unidad
          AND (m.evento_declarado IS NULL OR EXISTS(SELECT 1 FROM inicios i WHERE i.lote_id=l.id AND i.id::text=m.evento_declarado))))
        OR EXISTS(SELECT 1 FROM lotes l
          WHERE (SELECT count(*) FROM movimientos m WHERE m.tipo='CONSUMO_A_VIVERO' AND m.lote_vivero_id=l.id)<>1
          OR (SELECT count(*) FROM inicios i WHERE i.lote_id=l.id)<>1
          OR NOT EXISTS(SELECT 1 FROM inicios i WHERE i.lote_id=l.id
            AND i.cantidad_afectada=l.cantidad_inicial_en_proceso AND i.unidad_medida_evento=l.unidad_medida_inicial))
        THEN 'VINCULO_CONSUMO_LOTE_INICIO_INCONSISTENTE' END,
      CASE WHEN r.planta_id IS NULL OR nullif(btrim(r.codigo_trazabilidad),'') IS NULL
        OR nullif(btrim(r.nombre_cientifico_snapshot),'') IS NULL OR nullif(btrim(r.nombre_comercial_snapshot),'') IS NULL
        OR nullif(btrim(r.variedad_snapshot),'') IS NULL OR nullif(btrim(r.nombre_comunidad_snapshot),'') IS NULL
        OR NOT EXISTS(SELECT 1 FROM public.ubicacion u WHERE u.id=r.ubicacion_id AND u.latitud BETWEEN -90 AND 90 AND u.longitud BETWEEN -180 AND 180)
        OR (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
          WHERE e.entidad_id=r.id AND upper(t.codigo)='RECOLECCION' AND t.activo AND e.eliminado_en IS NULL)<2
        THEN 'FICHA_ORIGEN_INCOMPLETA' END
    ],NULL) inconsistencias FROM saldo s
  )
  SELECT jsonb_build_object('cantidad_inicial',trim_scale(r.cantidad_inicial_canonica)::text,
    'saldo_actual',trim_scale(r.saldo_actual)::text,'unidad_canonica',r.unidad_canonica,
    'saldo_calculado',trim_scale(s.calculado)::text,'trazabilidad_conforme',cardinality(e.inconsistencias)=0,
    'inconsistencias',e.inconsistencias,'ultimo_movimiento_en',s.ultimo_movimiento_en,
    'marca_movimientos',encode(sha256(convert_to(jsonb_build_array(f.movimientos,f.lotes,f.inicios,f.asignaciones,
      (SELECT jsonb_agg(m.unidades ORDER BY m.id) FROM movimientos m),
      trim_scale(r.cantidad_inicial_canonica)::text,r.unidad_canonica,e.inconsistencias)::text,'UTF8')),'hex'),
    'movimientos',f.movimientos,'lotes',f.lotes,'asignaciones',f.asignaciones)
  FROM saldo s CROSS JOIN referencias f CROSS JOIN errores e
$$;

CREATE FUNCTION public.m2_conciliacion_proyectar(
  p_actor bigint,r public.recoleccion,p_detalle boolean
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE e public.recoleccion_conciliacion_evento; ficha jsonb; en_padron boolean; estado_habilitacion text;
BEGIN
  e:=public.m2_conciliacion_ultimo(r.id);
  en_padron:=coalesce(e.vivero_id=r.vivero_id AND e.estado<>'RETIRADO',false);
  estado_habilitacion:=public.m2_origen_estado_habilitacion(r,r.vivero_id);
  ficha:=public.m2_conciliacion_trazabilidad(r)||jsonb_build_object(
    'recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,'codigo_trazabilidad',r.codigo_trazabilidad,
    'fecha_recoleccion',r.fecha,'revision_captura',r.revision_captura::text,'revision',coalesce(e.revision,0)::text,
    'en_padron',en_padron,'estado',CASE
      WHEN e.vivero_id IS DISTINCT FROM r.vivero_id OR e.id IS NULL THEN 'FUERA_PADRON'
      WHEN e.estado='CONFORME' AND NOT public.m2_conciliacion_acreditada(r,e) THEN 'PENDIENTE'
      ELSE e.estado END,
    'puede_conciliar',coalesce(en_padron AND r.usuario_id<>p_actor
      AND estado_habilitacion IN ('PENDIENTE_CONCILIACION','INCIDENCIA_CONCILIACION'),false));
  IF NOT p_detalle THEN RETURN ficha-ARRAY['movimientos','lotes','asignaciones']; END IF;
  RETURN ficha||jsonb_build_object('historial',coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',h.id::text,'accion',h.accion,'estado',h.estado,'actor_id',h.actor_id::text,
        'revision',h.revision::text,'motivo',h.motivo,'saldo_esperado',trim_scale(h.saldo_esperado)::text,
        'cantidad_observada',trim_scale(h.cantidad_observada)::text,'unidad_observada',h.unidad_observada,
        'fecha_comprobacion',h.fecha_comprobacion,'marca_movimientos',h.marca_movimientos,
        'inconsistencias',h.inconsistencias,'registrado_en',h.registrado_en) ORDER BY h.revision)
      FROM public.recoleccion_conciliacion_evento h WHERE h.recoleccion_id=r.id AND h.vivero_id=r.vivero_id),'[]'::jsonb),
    'evidencias',coalesce((
      SELECT jsonb_agg(jsonb_build_object('id',f.id::text,'observacion_id',v.observacion_id::text,
        'titulo',f.titulo,'mime_type',f.mime_type) ORDER BY f.id)
      FROM public.recoleccion_conciliacion_evidencia v
      JOIN public.recoleccion_conciliacion_evento h ON h.id=v.observacion_id
      JOIN public.evidencias_trazabilidad f ON f.id=v.evidencia_id
      WHERE h.recoleccion_id=r.id AND h.vivero_id=r.vivero_id AND f.eliminado_en IS NULL),'[]'::jsonb));
END $$;

CREATE FUNCTION public.m2_conciliacion_leer(
  p_actor_id bigint,p_recoleccion_id bigint DEFAULT NULL,p_antes_de_id bigint DEFAULT NULL,
  p_limite integer DEFAULT 20,p_vivero_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE rol text; r public.recoleccion; filas jsonb; siguiente bigint;
BEGIN
  rol:=public.m1_exigir_actor(p_actor_id,false);
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023';
  END IF;
  IF p_recoleccion_id IS NOT NULL THEN
    SELECT * INTO r FROM public.recoleccion WHERE id=p_recoleccion_id AND eliminado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORIGEN_NO_DISPONIBLE' USING ERRCODE='P0002'; END IF;
    PERFORM public.m2_exigir_vivero(p_actor_id,r.vivero_id);
    IF rol<>'ADMIN' AND NOT EXISTS(SELECT 1 FROM public.recoleccion_conciliacion_evento h
      WHERE h.recoleccion_id=r.id AND h.vivero_id=r.vivero_id) THEN
      RAISE EXCEPTION 'ORIGEN_NO_DISPONIBLE' USING ERRCODE='P0002';
    END IF;
    RETURN public.m2_conciliacion_proyectar(p_actor_id,r,true);
  END IF;
  IF rol<>'ADMIN' THEN RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(public.m2_conciliacion_proyectar(p_actor_id,x.origen,false) ORDER BY x.id DESC),'[]'::jsonb),
    CASE WHEN count(*)=p_limite THEN min(x.id) END INTO filas,siguiente
  FROM (SELECT candidato.id,candidato AS origen FROM public.recoleccion candidato
    WHERE (p_antes_de_id IS NULL OR candidato.id<p_antes_de_id) AND (p_vivero_id IS NULL OR candidato.vivero_id=p_vivero_id)
      AND candidato.eliminado_en IS NULL AND (EXISTS(SELECT 1 FROM public.recoleccion_conciliacion_evento h
          WHERE h.recoleccion_id=candidato.id AND h.vivero_id=candidato.vivero_id)
        OR (candidato.fecha<=(statement_timestamp() AT TIME ZONE 'America/La_Paz')::date
          AND public.m2_origen_estado_habilitacion(candidato,candidato.vivero_id)='PENDIENTE_CONCILIACION'
          AND public.m2_conciliacion_es_historica(candidato)))
    ORDER BY candidato.id DESC LIMIT p_limite) x;
  RETURN jsonb_build_object('data',filas,'siguiente_antes_de_id',siguiente::text);
END $$;

CREATE FUNCTION public.m2_conciliacion_exigir_recuento(
  p_actor bigint,r public.recoleccion,e public.recoleccion_conciliacion_evento
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor,r.vivero_id);
  IF r.usuario_id=p_actor THEN RAISE EXCEPTION 'AUTOCONCILIACION_PROHIBIDA' USING ERRCODE='42501'; END IF;
  IF e.vivero_id IS DISTINCT FROM r.vivero_id OR e.estado='RETIRADO' THEN
    RAISE EXCEPTION 'FUERA_PADRON' USING ERRCODE='P0001';
  END IF;
  IF coalesce(public.m2_origen_estado_habilitacion(r,r.vivero_id),'')
      NOT IN ('PENDIENTE_CONCILIACION','INCIDENCIA_CONCILIACION')
    OR r.fecha>(statement_timestamp() AT TIME ZONE 'America/La_Paz')::date THEN
    RAISE EXCEPTION 'ESTADO_NO_CONCILIABLE' USING ERRCODE='P0001';
  END IF;
END $$;

CREATE FUNCTION public.m2_conciliacion_evidencias_preparar(p_actor_id bigint,p_recoleccion_id bigint,p_fotos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; f jsonb; tipo bigint; eid bigint; ids jsonb:='[]';
BEGIN
  r:=public.m1_recepcion_exigir_objeto(p_actor_id,p_recoleccion_id);
  PERFORM public.m2_conciliacion_exigir_recuento(p_actor_id,r,public.m2_conciliacion_ultimo(r.id));
  IF jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023';
  END IF;
  SELECT id INTO STRICT tipo FROM public.tipos_entidad_evidencia WHERE codigo='RECOLECCION_CONCILIACION' AND activo;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','') !~ ('^conciliacion/pendientes/'||p_actor_id||'/'||r.id||'/[a-zA-Z0-9.-]+$')
      OR coalesce(f->>'mime_type','') NOT LIKE 'image/%' OR coalesce((f->>'tamano_bytes')::bigint,0)<=0 THEN
      RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,metadata,es_principal,orden,creado_por_usuario_id)
    VALUES(tipo,0,'r3foresta-conciliacion',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,
      'FOTO',f->>'mime_type',(f->>'tamano_bytes')::bigint,f->>'hash_sha256','Comprobación física de remanente',
      jsonb_build_object('origen','CONCILIACION_HISTORICA'),false,jsonb_array_length(ids),p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.recoleccion_conciliacion_evidencia_contexto(evidencia_id,recoleccion_id,vivero_id,actor_id)
      VALUES(eid,r.id,r.vivero_id,p_actor_id);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;

CREATE FUNCTION public.m2_conciliacion_ejecutar(p_actor_id bigint,p_auth_id text,p_comando_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  rol text; previo public.recoleccion_conciliacion_comando; r public.recoleccion; ultimo public.recoleccion_conciliacion_evento;
  accion text; origen bigint; rev bigint; motivo text; saldo numeric; cantidad numeric; unidad text; fecha date;
  marca text; ficha jsonb; inconsistencias text[]:='{}'; ids bigint[]; distintos integer; eid bigint; evento_id bigint;
  estado_evento text; estado_recibo text; codigo text; estado_error text; resultado jsonb; recibo jsonb; status integer:=200;
  dia date:=(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  -- Mismo orden que 094/096: cuenta SHARE → comando → origen UPDATE → fotos ASC.
  SELECT u.rol::text INTO rol FROM public.usuario u
    WHERE u.id=p_actor_id AND u.auth_id=p_auth_id AND u.activo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_DISPONIBLE' USING ERRCODE='42501'; END IF;
  IF p_comando_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('M2_CONCILIACION:'||p_actor_id||':'||p_comando_id,0));
  SELECT * INTO previo FROM public.recoleccion_conciliacion_comando WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  IF FOUND THEN
    IF previo.intencion IS DISTINCT FROM p_payload THEN
      RETURN jsonb_build_object('http_status',409,'body',jsonb_build_object('comando_id',p_comando_id,
        'estado','CONFLICTO_CLAVE','resultado',NULL,'error',jsonb_build_object('codigo','CLAVE_REUTILIZADA'),'finalizado_en',NULL));
    END IF;
    RETURN jsonb_build_object('http_status',previo.http_status,'body',previo.recibo);
  END IF;
  BEGIN
    accion:=p_payload->>'accion';
    IF accion IS NULL OR accion NOT IN ('INCLUIR','RETIRAR','CONCILIAR')
      OR jsonb_typeof(p_payload->'recoleccion_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_payload->'revision_esperada') IS DISTINCT FROM 'string'
      OR coalesce(p_payload->>'recoleccion_id','') !~ '^[1-9][0-9]{0,18}$'
      OR coalesce(p_payload->>'revision_esperada','') !~ '^(0|[1-9][0-9]{0,18})$' THEN
      RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023';
    END IF;
    IF rol NOT IN ('ADMIN','GENERAL','VALIDADOR') OR (accion<>'CONCILIAR' AND rol<>'ADMIN') THEN
      RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501';
    END IF;
    origen:=(p_payload->>'recoleccion_id')::bigint;
    rev:=(p_payload->>'revision_esperada')::bigint;
    r:=public.m1_recepcion_exigir_objeto(p_actor_id,origen);
    ultimo:=public.m2_conciliacion_ultimo(r.id);
    IF rev<>coalesce(ultimo.revision,0) OR rev=9223372036854775807 THEN
      RAISE EXCEPTION 'REVISION_OBSOLETA' USING ERRCODE='P0001';
    END IF;
    ficha:=public.m2_conciliacion_trazabilidad(r);
    IF accion IN ('INCLUIR','RETIRAR') THEN
      motivo:=btrim(p_payload->>'motivo');
      IF (p_payload-ARRAY['accion','recoleccion_id','revision_esperada','motivo'])<>'{}'::jsonb
        OR jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string'
        OR coalesce(char_length(motivo),0) NOT BETWEEN 10 AND 500 THEN
        RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023';
      END IF;
      IF accion='INCLUIR' THEN
        IF ultimo.vivero_id=r.vivero_id AND ultimo.estado<>'RETIRADO' THEN
          RAISE EXCEPTION 'ORIGEN_YA_EN_PADRON' USING ERRCODE='P0001';
        END IF;
        IF coalesce(public.m2_origen_estado_habilitacion(r,r.vivero_id),'')<>'PENDIENTE_CONCILIACION'
          OR public.m2_conciliacion_es_historica(r) IS NOT TRUE OR r.fecha>dia THEN
          RAISE EXCEPTION 'ESTADO_NO_CONCILIABLE' USING ERRCODE='P0001';
        END IF;
        estado_evento:='PENDIENTE';
      ELSE
        IF ultimo.vivero_id IS DISTINCT FROM r.vivero_id OR ultimo.estado='RETIRADO' THEN
          RAISE EXCEPTION 'FUERA_PADRON' USING ERRCODE='P0001';
        END IF;
        estado_evento:='RETIRADO';
      END IF;
      SELECT ARRAY(SELECT jsonb_array_elements_text(ficha->'inconsistencias')) INTO inconsistencias;
    ELSE
      PERFORM public.m2_conciliacion_exigir_recuento(p_actor_id,r,ultimo);
      IF (p_payload-ARRAY['accion','recoleccion_id','revision_esperada','revision_captura_esperada','marca_movimientos',
        'saldo_esperado','cantidad_observada','unidad_observada','fecha_comprobacion','evidencia_ids'])<>'{}'::jsonb
        OR EXISTS(SELECT 1 FROM unnest(ARRAY['revision_captura_esperada','marca_movimientos','saldo_esperado',
          'cantidad_observada','unidad_observada','fecha_comprobacion']) k
          WHERE jsonb_typeof(p_payload->k) IS DISTINCT FROM 'string')
        OR (p_payload->>'revision_captura_esperada') !~ '^(0|[1-9][0-9]{0,18})$'
        OR (p_payload->>'marca_movimientos') !~ '^[0-9a-f]{64}$'
        OR (p_payload->>'saldo_esperado') !~ '^(0|[1-9][0-9]{0,23})([.][0-9]{1,6})?$'
        OR (p_payload->>'cantidad_observada') !~ '^(0|[1-9][0-9]{0,23})([.][0-9]{1,6})?$'
        OR (p_payload->>'unidad_observada') NOT IN ('G','UNIDAD')
        OR (p_payload->>'fecha_comprobacion') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023';
      END IF;
      saldo:=(p_payload->>'saldo_esperado')::numeric; cantidad:=(p_payload->>'cantidad_observada')::numeric;
      unidad:=p_payload->>'unidad_observada'; marca:=p_payload->>'marca_movimientos';
      IF (p_payload->>'revision_captura_esperada')::bigint IS DISTINCT FROM r.revision_captura
        OR saldo IS DISTINCT FROM r.saldo_actual OR marca IS DISTINCT FROM ficha->>'marca_movimientos' THEN
        RAISE EXCEPTION 'RECUENTO_OBSOLETO' USING ERRCODE='P0001';
      END IF;
      IF unidad='UNIDAD' AND cantidad<>trunc(cantidad) THEN
        RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='22023';
      END IF;
      fecha:=(p_payload->>'fecha_comprobacion')::date;
      IF fecha<r.fecha OR fecha>dia OR fecha<(ultimo.registrado_en AT TIME ZONE 'America/La_Paz')::date
        OR fecha<(ficha->>'ultimo_movimiento_en')::date THEN
        RAISE EXCEPTION 'FECHA_COMPROBACION_INVALIDA' USING ERRCODE='22023';
      END IF;
      IF jsonb_typeof(p_payload->'evidencia_ids') IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_payload->'evidencia_ids') NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023';
      END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'evidencia_ids') v
        WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR (v#>>'{}') !~ '^[1-9][0-9]{0,18}$') THEN
        RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023';
      END IF;
      SELECT array_agg(x::bigint ORDER BY x::bigint),count(DISTINCT x) INTO ids,distintos
        FROM jsonb_array_elements_text(p_payload->'evidencia_ids') x;
      IF distintos<>cardinality(ids) THEN RAISE EXCEPTION 'EVIDENCIA_INVALIDA' USING ERRCODE='22023'; END IF;
      FOREACH eid IN ARRAY ids LOOP
        PERFORM 1 FROM public.evidencias_trazabilidad f
        JOIN public.recoleccion_conciliacion_evidencia_contexto c ON c.evidencia_id=f.id
        JOIN public.tipos_entidad_evidencia t ON t.id=f.tipo_entidad_id
        WHERE f.id=eid AND f.entidad_id=0 AND f.eliminado_en IS NULL AND f.creado_por_usuario_id=p_actor_id
          AND c.actor_id=p_actor_id AND c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id AND c.registrado_en>=ultimo.registrado_en
          AND f.bucket='r3foresta-conciliacion' AND t.activo AND t.codigo='RECOLECCION_CONCILIACION'
          AND NOT EXISTS(SELECT 1 FROM public.recoleccion_conciliacion_evidencia v WHERE v.evidencia_id=f.id)
        FOR UPDATE OF f;
        IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
      END LOOP;
      SELECT ARRAY(SELECT jsonb_array_elements_text(ficha->'inconsistencias')) INTO inconsistencias;
      IF cantidad<>saldo THEN inconsistencias:=array_append(inconsistencias,'DIFERENCIA_FISICA'); END IF;
      IF unidad IS DISTINCT FROM r.unidad_canonica::text THEN
        inconsistencias:=array_append(inconsistencias,'UNIDAD_OBSERVADA_DISTINTA');
      END IF;
      estado_evento:=CASE WHEN cardinality(inconsistencias)=0 THEN 'CONFORME' ELSE 'INCIDENCIA' END;
    END IF;
    INSERT INTO public.recoleccion_conciliacion_evento(recoleccion_id,vivero_id,actor_id,comando_id,accion,estado,revision,
      motivo,saldo_esperado,cantidad_observada,unidad_observada,fecha_comprobacion,marca_movimientos,ficha,inconsistencias)
    VALUES(r.id,r.vivero_id,p_actor_id,p_comando_id,accion,estado_evento,rev+1,motivo,saldo,cantidad,unidad::public.unidad_medida,
      fecha,marca,ficha||jsonb_build_object('revision_captura',r.revision_captura::text),inconsistencias)
    RETURNING id INTO evento_id;
    IF accion='CONCILIAR' THEN
      INSERT INTO public.recoleccion_conciliacion_evidencia(evidencia_id,observacion_id) SELECT unnest(ids),evento_id;
      UPDATE public.evidencias_trazabilidad SET entidad_id=evento_id,codigo_trazabilidad=r.codigo_trazabilidad WHERE id=ANY(ids);
    END IF;
    estado_recibo:=CASE WHEN estado_evento='INCIDENCIA' THEN 'INCIDENCIA' ELSE 'CONFIRMADO' END;
    resultado:=jsonb_build_object('accion',accion,'estado',estado_evento,'recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,
      'evento_id',evento_id::text,'actor_id',p_actor_id::text,'revision_anterior',rev::text,'revision_nueva',(rev+1)::text,
      'inconsistencias',inconsistencias);
  EXCEPTION WHEN insufficient_privilege OR no_data_found OR raise_exception OR invalid_parameter_value
    OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
    GET STACKED DIAGNOSTICS codigo=MESSAGE_TEXT,estado_error=RETURNED_SQLSTATE;
    IF estado_error='42501' AND codigo IN ('Se requiere cuenta interna activa con acceso M1.','CAPACIDAD_INSUFICIENTE: sin acceso al vivero.') THEN
      codigo:='CAPACIDAD_INSUFICIENTE';
    END IF;
    IF estado_error IN ('22P02','22003','22008','22007') THEN codigo:='ENTRADA_INVALIDA'; END IF;
    IF codigo NOT IN ('CAPACIDAD_INSUFICIENTE','AUTOCONCILIACION_PROHIBIDA','ORIGEN_NO_DISPONIBLE',
      'FUERA_PADRON','ORIGEN_YA_EN_PADRON','ESTADO_NO_CONCILIABLE','REVISION_OBSOLETA','RECUENTO_OBSOLETO',
      'EVIDENCIA_FUERA_DE_AMBITO','EVIDENCIA_INVALIDA','FECHA_COMPROBACION_INVALIDA','ENTRADA_INVALIDA') THEN RAISE; END IF;
    status:=CASE estado_error WHEN '42501' THEN 403 WHEN 'P0002' THEN 404 WHEN 'P0001' THEN 409 ELSE 422 END;
    estado_recibo:='RECHAZADO'; resultado:=NULL;
  END;
  recibo:=jsonb_build_object('comando_id',p_comando_id,'estado',estado_recibo,'resultado',resultado,
    'error',CASE WHEN estado_recibo='RECHAZADO' THEN jsonb_build_object('codigo',codigo) ELSE NULL END,'finalizado_en',clock_timestamp());
  INSERT INTO public.recoleccion_conciliacion_comando(actor_id,comando_id,intencion,http_status,recibo)
    VALUES(p_actor_id,p_comando_id,p_payload,status,recibo);
  RETURN jsonb_build_object('http_status',status,'body',recibo);
END $$;

CREATE FUNCTION public.m2_conciliacion_recuperar(p_actor_id bigint,p_auth_id text,p_comando_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE recibo jsonb;
BEGIN
  PERFORM 1 FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUENTA_NO_DISPONIBLE' USING ERRCODE='42501'; END IF;
  SELECT c.recibo INTO recibo FROM public.recoleccion_conciliacion_comando c WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  RETURN jsonb_build_object('http_status',CASE WHEN recibo IS NULL THEN 202 ELSE 200 END,
    'body',coalesce(recibo,jsonb_build_object('comando_id',p_comando_id,'estado','SIN_RESULTADO','resultado',NULL,'error',NULL,'finalizado_en',NULL)));
END $$;

-- Barrera común para INICIO, DESECHO y otros escritores del ledger.
CREATE OR REPLACE FUNCTION public.m1_recepcion_proteger_movimiento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE r public.recoleccion; l public.lote_vivero; estado text; unidades text[];
BEGIN
  IF NEW.tipo_movimiento::text IN ('CONSUMO_A_VIVERO','DESECHO') THEN
    r:=public.m1_recepcion_exigir_objeto(NEW.created_by,NEW.recoleccion_id);
    PERFORM public.m2_origen_exigir_habilitacion(r,r.vivero_id);
    unidades:=public.m2_conciliacion_unidades_movimiento(NEW);
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
        OR NOT EXISTS(SELECT 1 FROM public.evento_lote_vivero e WHERE e.lote_id=l.id
          AND e.tipo_evento::text='INICIO' AND e.cantidad_afectada=-NEW.delta AND e.unidad_medida_evento=r.unidad_canonica)
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

-- El RPC legado conserva firma, forma de respuesta y su transacción de 095.
-- Su implementación queda privada, incluso para service_role directo.
ALTER FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)
  RENAME TO m2_inicio_lote_impl;
CREATE FUNCTION public.fn_vivero_crear_lote_desde_recoleccion(
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
  RETURN QUERY SELECT * FROM public.m2_inicio_lote_impl(p_recoleccion_id,p_vivero_id,p_responsable_id,p_fecha_inicio,
    p_fecha_evento,p_cantidad_inicial_en_proceso,p_unidad_medida_inicial,p_observaciones,p_evidencia_ids,p_codigo_trazabilidad);
END $$;

CREATE FUNCTION public.m2_inicio_lote_exacto(
  p_recoleccion_id bigint,p_vivero_id bigint,p_responsable_id bigint,p_fecha_inicio date,p_fecha_evento date,
  p_cantidad_inicial_en_proceso numeric,p_unidad_medida_inicial public.unidad_medida,
  p_observaciones text DEFAULT NULL,p_evidencia_ids bigint[] DEFAULT NULL,p_codigo_trazabilidad text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
  SELECT jsonb_build_object('lote_vivero_id',l.lote_vivero_id::text,'evento_inicio_id',l.evento_inicio_id::text,
    'recoleccion_movimiento_id',l.recoleccion_movimiento_id::text,'codigo_trazabilidad',l.codigo_trazabilidad,
    'saldo_recoleccion_antes',l.saldo_recoleccion_antes,'saldo_recoleccion_despues',l.saldo_recoleccion_despues,
    'evidencia_inicio_ids',to_jsonb(l.evidencia_inicio_ids::text[]))
  FROM public.fn_vivero_crear_lote_desde_recoleccion(p_recoleccion_id,p_vivero_id,p_responsable_id,p_fecha_inicio,
    p_fecha_evento,p_cantidad_inicial_en_proceso,p_unidad_medida_inicial,p_observaciones,p_evidencia_ids,p_codigo_trazabilidad) l
$$;

CREATE FUNCTION public.m2_estado_habilitacion(public.recoleccion)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT public.m2_origen_estado_habilitacion($1,($1).vivero_id)
$$;

CREATE FUNCTION public.m2_origenes_leer(
  p_actor_id bigint,p_vivero_id bigint,p_recoleccion_id bigint,p_pagina integer,p_limite integer,p_incluir_pendientes boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE filas jsonb; total bigint; rol text;
BEGIN
  rol:=public.m1_exigir_actor(p_actor_id,false);
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 1000000 OR p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paginación inválida.' USING ERRCODE='22023';
  END IF;
  WITH estados AS MATERIALIZED (
    SELECT r.*,public.m2_origen_estado_habilitacion(r,p_vivero_id) estado_habilitacion
    FROM public.recoleccion r
    WHERE r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL AND r.estado_registro='VALIDADO'
      AND r.estado_operativo='ABIERTO' AND r.saldo_actual>0
      AND (p_recoleccion_id IS NULL OR r.id=p_recoleccion_id)
  ), disponibles AS MATERIALIZED (
    SELECT e.* FROM estados e WHERE e.estado_habilitacion IN ('RECEPCION_CONFORME','CONCILIACION_CONFORME')
      OR (p_incluir_pendientes AND e.estado_habilitacion IS NOT NULL)
  ), pagina AS (
    SELECT r.id,jsonb_build_object('recoleccion_id',r.id::text,'vivero_almacenamiento_id',r.vivero_id::text,
      'recolector_id',r.usuario_id::text,'codigo_trazabilidad',r.codigo_trazabilidad,'fecha',r.fecha,'planta_id',r.planta_id::text,
      'tipo_material',r.tipo_material,'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,
      'nombre_comercial_snapshot',r.nombre_comercial_snapshot,'variedad_snapshot',r.variedad_snapshot,'estado_registro',r.estado_registro,
      'estado_operativo',r.estado_operativo,'saldo_actual',r.saldo_actual,'unidad_canonica',r.unidad_canonica)
      ||CASE WHEN p_incluir_pendientes THEN jsonb_build_object('estado_habilitacion',r.estado_habilitacion,
        'puede_consultar_conciliacion',r.estado_habilitacion IN ('CONCILIACION_CONFORME','PENDIENTE_CONCILIACION','INCIDENCIA_CONCILIACION')
          AND (rol='ADMIN' OR EXISTS(SELECT 1 FROM public.recoleccion_conciliacion_evento h
            WHERE h.recoleccion_id=r.id AND h.vivero_id=r.vivero_id))) ELSE '{}'::jsonb END fila
    FROM disponibles r ORDER BY r.id DESC OFFSET (p_pagina-1)*p_limite LIMIT p_limite
  )
  SELECT (SELECT count(*) FROM disponibles),coalesce((SELECT jsonb_agg(p.fila ORDER BY p.id DESC) FROM pagina p),'[]'::jsonb)
    INTO total,filas;
  IF p_recoleccion_id IS NOT NULL AND total=0 AND NOT EXISTS(
    SELECT 1 FROM public.recoleccion r
    WHERE r.id=p_recoleccion_id AND r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL
      AND r.estado_registro='VALIDADO'
      AND (p_incluir_pendientes OR public.m2_conciliacion_acreditada(r)
        OR EXISTS(SELECT 1 FROM public.recoleccion_recepcion c WHERE c.recoleccion_id=r.id AND c.vivero_id=r.vivero_id))
  ) THEN
    RAISE EXCEPTION 'Origen sin recepción conforme disponible.' USING ERRCODE='P0002';
  END IF;
  RETURN jsonb_build_object('success',true,'data',filas,'pagination',jsonb_build_object('page',p_pagina,'limit',p_limite,'total',total));
END $$;

CREATE OR REPLACE FUNCTION public.m2_origenes_leer(
  p_actor_id bigint,p_vivero_id bigint,p_recoleccion_id bigint DEFAULT NULL,p_pagina integer DEFAULT 1,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
  SELECT public.m2_origenes_leer(p_actor_id,p_vivero_id,p_recoleccion_id,p_pagina,p_limite,false)
$$;

-- T4 conserva sus contratos de lectura y excluye remanentes ya conciliados.
CREATE OR REPLACE FUNCTION public.m1_recepcion_proyectar(p_actor bigint,p_origen bigint,p_detalle boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.recoleccion; recepcion jsonb; incidencia jsonb; bloqueado boolean; conciliado boolean; fila jsonb;
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
  conciliado:=public.m2_conciliacion_acreditada(r);
  fila:=jsonb_build_object('recoleccion_id',r.id::text,'vivero_id',r.vivero_id::text,'recolector_id',r.usuario_id::text,
    'codigo_trazabilidad',r.codigo_trazabilidad,'fecha_recoleccion',r.fecha,'tipo_material',r.tipo_material,
    'nombre_cientifico_snapshot',r.nombre_cientifico_snapshot,'nombre_comercial_snapshot',r.nombre_comercial_snapshot,
    'nombre_recolector_snapshot',r.nombre_recolector_snapshot,'cantidad_declarada',r.cantidad_inicial_canonica,
    'unidad_declarada',r.unidad_canonica,'saldo_actual',r.saldo_actual,'revision',r.revision_captura::text,
    'estado_registro',r.estado_registro,'recepcion',recepcion,'incidencia',incidencia,
    'requiere_conciliacion',bloqueado AND recepcion IS NULL AND NOT conciliado,
    'puede_recibir_validar',r.usuario_id<>p_actor AND recepcion IS NULL AND NOT bloqueado AND NOT conciliado AND r.estado_registro::text IN ('PENDIENTE_VALIDACION','VALIDADO'));
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
      AND NOT public.m2_conciliacion_acreditada(q)
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
      AND NOT public.m2_conciliacion_acreditada(r)
      AND (p_antes_de_id IS NULL OR r.id<p_antes_de_id) ORDER BY r.id DESC LIMIT p_limite) r;
  RETURN filas;
END $$;

REVOKE ALL ON SEQUENCE public.recoleccion_conciliacion_evento_id_seq FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid,p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'm2_conciliacion_%' OR p.proname IN (
      'm2_origen_estado_habilitacion','m2_origen_exigir_habilitacion','m2_estado_habilitacion','m2_origenes_leer',
      'm2_inicio_lote_impl','m2_inicio_lote_exacto','fn_vivero_crear_lote_desde_recoleccion',
      'fn_recoleccion_acotar_excepcion_fecha_rechazo','m1_recepcion_proteger_movimiento','m1_recepcion_proyectar',
      'm1_recepcion_leer','m1_recepcion_diagnostico')) LOOP
    EXECUTE format('ALTER FUNCTION %s SET lock_timeout TO %L',f.firma,'5s');
    EXECUTE format('ALTER FUNCTION %s SET statement_timeout TO %L',f.firma,'30s');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE')
      OR has_function_privilege('service_role',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'CONCILIACION_PRIVILEGIO_FUNCION_INESPERADO: %',f.firma;
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION
  public.m2_conciliacion_leer(bigint,bigint,bigint,integer,bigint),
  public.m2_conciliacion_ejecutar(bigint,text,uuid,jsonb),public.m2_conciliacion_recuperar(bigint,text,uuid),
  public.m2_conciliacion_evidencias_preparar(bigint,bigint,jsonb),public.m2_estado_habilitacion(public.recoleccion),
  public.m2_origenes_leer(bigint,bigint,bigint,integer,integer),public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean),
  public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text),
  public.m2_inicio_lote_exacto(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text),
  public.m1_recepcion_leer(bigint,bigint,bigint,integer),public.m1_recepcion_diagnostico(bigint,bigint,integer)
TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
