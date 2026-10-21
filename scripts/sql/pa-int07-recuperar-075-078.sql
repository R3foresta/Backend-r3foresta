-- Recuperación acotada para desarrollo vyrjlehkhabydkhjxagx, 2026-10-20.
-- Preparado tras el catálogo aportado posterior a recuperar 074 + preservar 079.
-- 075: faltan sus ocho funciones exclusivas y el replay conserva versión anterior.
-- 078: faltan seis funciones de lifecycle; polígono conserva definición anterior.
-- Las nueve definiciones de 077 coinciden; 079 conserva las tres huellas previas.
-- EJECUTAR TODO EL ARCHIVO, sin selección parcial. Este archivo termina en COMMIT.
-- Conserva íntegros los cuerpos originales y unifica sus BEGIN/COMMIT externos.
-- Instala definiciones/ACL; no invoca RPC de negocio ni realiza backfill.
-- No repite 074/076/077/079 ni aplica 080/081/082.
-- Si hay error, la transacción se aborta: conservar el primer error y detenerse.
-- Después ejecutar el cotejador; el cierre 080 requiere revisión separada.
BEGIN;

-- FUENTE: migrations/075_pa_int03a_registro.sql
-- SHA256: be438c7b27f25f2e14f607bcfd307678cd401ac5f2d6746e29a37058ade24169
-- PA-T-INT03-A. Registro inicial participante. Requiere 068–074 y PostGIS real.
-- No llama a 061: su orden rp_seq -> ámbito pertenece al recorrido legado.
-- Corte de las entradas equivalentes/conciliación del legado: INT02-D.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis') THEN
    RAISE EXCEPTION 'PA_INT03A_POSTGIS_REQUERIDO';
  END IF;
  IF to_regclass('public.participacion_carga_generacion') IS NULL THEN
    RAISE EXCEPTION 'PA_INT03A_REQUIERE_074';
  END IF;
END $$;

-- Extensión compatible de C: PREPARADO sin huella continúa hacia los locks de
-- dominio. La cancelación es el único terminal sin huella y nunca se reabre.
CREATE OR REPLACE FUNCTION public.pa_c_replay(
  p_actor_id BIGINT,p_auth_id TEXT,p_operacion TEXT,p_comando_id UUID,p_huella BYTEA
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v public.participacion_comando%ROWTYPE; v_activo BOOLEAN;
BEGIN
  SELECT * INTO v FROM public.participacion_comando
    WHERE actor_id=p_actor_id AND operacion=p_operacion AND comando_id=p_comando_id;
  IF NOT FOUND OR v.estado='PREPARADO' THEN RETURN NULL; END IF;
  SELECT activo INTO v_activo FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id,'RECUPERAR_SESION'); END IF;
  IF NOT v_activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  IF v.operacion='REGISTRAR_PLANTACION_INICIAL' AND v.huella IS NULL
    AND v.estado='RECHAZADO' AND v.error->>'codigo'='PREPARACION_CANCELADA' THEN
    RETURN public.pa_c_recibo(v);
  END IF;
  IF v.huella IS DISTINCT FROM p_huella THEN
    RETURN public.pa_c_fuera(409,'COMANDO_REUTILIZADO','La clave ya corresponde a otro contenido.',p_comando_id,'MISMA_CLAVE');
  END IF;
  RETURN public.pa_c_recibo(v);
END $$;

CREATE OR REPLACE FUNCTION public.pa_r_error(p_http INTEGER,p_codigo TEXT,p_mensaje TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE=('PT'||p_http)::char(5),MESSAGE=p_codigo,
    DETAIL=public.pa_c_error(p_codigo,p_mensaje,'NO_APLICA')::text;
END $$;

-- Actor ya bloqueado, luego ámbito. La fila de ámbito excluye gestión de
-- permisos y plan; las lecturas no transforman equipo/historia en autoridad.
CREATE OR REPLACE FUNCTION public.pa_r_ambito_leer(p_actor_id BIGINT,p_rol TEXT,p_subcampania_id BIGINT)
RETURNS public.subcampania LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v public.subcampania%ROWTYPE;
BEGIN
  SELECT s.* INTO v FROM public.subcampania s
    WHERE s.id=p_subcampania_id AND s.deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM public.campania c WHERE c.id=s.campania_id AND c.deleted_at IS NULL)
    FOR SHARE OF s;
  IF NOT FOUND OR (p_rol<>'ADMIN' AND NOT EXISTS(SELECT 1 FROM public.subcampania_permiso
    WHERE subcampania_id=p_subcampania_id AND usuario_id=p_actor_id AND revocado_en IS NULL)) THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
  END IF;
  IF v.estado::text<>'ACTIVA' THEN
    PERFORM public.pa_r_error(409,'SUBCAMPANIA_NO_OPERATIVA','La subcampaña no está operativa.');
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_contexto_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_subcampania_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v public.subcampania%ROWTYPE; v_hoy DATE;
  v_especies JSONB; v_saldo BIGINT;
BEGIN
  PERFORM set_config('TimeZone','America/La_Paz',true);
  v_hoy:=(transaction_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  v:=public.pa_r_ambito_leer(p_actor_id,v_rol,p_subcampania_id);
  IF v.poligono_geom IS NULL OR ST_IsEmpty(v.poligono_geom) OR NOT ST_IsValid(v.poligono_geom)
    OR NOT EXISTS(SELECT 1 FROM public.subcampania_meta_especie WHERE subcampania_id=v.id)
    OR EXISTS(SELECT 1 FROM public.asignacion_vivero_subcampania a
      WHERE a.subcampania_id=v.id AND a.estado::text='ACTIVA' AND a.proposito::text='PLANTACION_INICIAL'
        AND a.saldo_asignado_disponible>0 AND a.fecha_entrega_operativa IS NULL) THEN
    PERFORM public.pa_r_error(422,'CONTEXTO_INCOMPLETO','El plan, polígono o día de entrega requiere conciliación.');
  END IF;
  SELECT jsonb_agg(jsonb_build_object('planta_id',m.planta_id::text,
    'nombre',coalesce(nullif(p.especie,''),p.nombre_cientifico),
    'porcentaje_objetivo',m.porcentaje_objetivo,'cantidad_objetivo',m.cantidad_objetivo,
    'saldo_elegible',coalesce(x.saldo,0)) ORDER BY m.planta_id),coalesce(sum(x.saldo),0)
    INTO v_especies,v_saldo
  FROM public.subcampania_meta_especie m JOIN public.planta p ON p.id=m.planta_id
  LEFT JOIN LATERAL(SELECT sum(a.saldo_asignado_disponible) saldo
    FROM public.asignacion_vivero_subcampania a JOIN public.lote_vivero l ON l.id=a.lote_vivero_id
    WHERE a.subcampania_id=v.id AND l.planta_id=m.planta_id AND a.estado::text='ACTIVA'
      AND a.proposito::text='PLANTACION_INICIAL' AND a.saldo_asignado_disponible>0
      AND a.fecha_entrega_operativa<=v_hoy) x ON true
  WHERE m.subcampania_id=v.id;
  RETURN jsonb_build_object('data',jsonb_build_object(
    'subcampania',jsonb_build_object('id',v.id::text,'campania_id',v.campania_id::text,
      'nombre',v.nombre,'campania_nombre',(SELECT nombre FROM public.campania WHERE id=v.campania_id),
      'estado','ACTIVA','plan_revision',v.plan_revision::text,'meta_total_arboles',v.meta_total_arboles,
      'poligono',ST_AsGeoJSON(v.poligono_geom)::jsonb),
    'actor',jsonb_build_object('usuario_id',p_actor_id::text,'fuente_autoridad',CASE WHEN v_rol='ADMIN' THEN 'GLOBAL' ELSE 'CONTEXTUAL' END),
    'disponibilidad',CASE WHEN v_saldo>0 THEN 'DISPONIBLE' ELSE 'SIN_STOCK' END,'especies',v_especies,
    'reglas',jsonb_build_object('hoy_operativo',v_hoy::text,'fecha_minima_ventana',(v_hoy-10)::text,
      'fecha_maxima',v_hoy::text,'zona_horaria','America/La_Paz','ventana_retroactiva_dias',10,
      'fotos_min',1,'fotos_max',10,'exterior_permitido',true)),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_participantes_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_subcampania_id BIGINT,p_consulta TEXT,p_despues_id BIGINT,p_limite INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_rows JSONB;
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 21 OR p_despues_id<=0
    OR (p_consulta IS NOT NULL AND char_length(normalize(btrim(p_consulta),NFC)) NOT BETWEEN 1 AND 100) THEN
    PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','La consulta no es válida.');
  END IF;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  PERFORM public.pa_r_ambito_leer(p_actor_id,v_rol,p_subcampania_id);
  SELECT coalesce(jsonb_agg(q.fila ORDER BY q.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT u.id,
      jsonb_build_object('usuario_id',u.id::text,'nombre',coalesce(nullif(btrim(u.nombre),''),btrim(u.username)),
        'organizacion',CASE WHEN u.organizacion_id IS NOT NULL THEN o.nombre ELSE nullif(btrim(u.organizacion),'') END) fila
    FROM public.usuario u LEFT JOIN public.organizacion o ON o.id=u.organizacion_id
    WHERE u.id<>p_actor_id AND u.activo AND (u.rol::text='ADMIN' OR EXISTS(
      SELECT 1 FROM public.subcampania_permiso a WHERE a.subcampania_id=p_subcampania_id
        AND a.usuario_id=u.id AND a.revocado_en IS NULL))
      AND (p_consulta IS NULL OR strpos(lower(normalize(coalesce(nullif(btrim(u.nombre),''),btrim(u.username)),NFC)),
        lower(normalize(btrim(p_consulta),NFC)))>0)
      AND (p_despues_id IS NULL OR u.id>p_despues_id)
    ORDER BY u.id LIMIT p_limite
  ) q;
  RETURN jsonb_build_object('data',v_rows,'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

-- Validación privada adicional: los fallos de forma no reclaman una clave.
-- El servidor canónico sigue siendo TypeScript; aquí solo se coteja su intención.
CREATE OR REPLACE FUNCTION public.pa_r_payload_valido(p JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_elemento JSONB; a JSONB; v_total NUMERIC:=0; v_fecha DATE;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR
    (p-ARRAY['subcampania_id','plan_revision_esperada','fecha_plantacion','latitud','longitud','especies','coresponsable_ids','evidencia_ids','observaciones','afiliaciones_declaradas'])<>'{}'::jsonb
    OR NOT public.pa_c_decimal(p->'subcampania_id') OR NOT public.pa_c_decimal(p->'plan_revision_esperada',true)
    OR jsonb_typeof(p->'fecha_plantacion') IS DISTINCT FROM 'string'
    OR (p->>'fecha_plantacion') !~ '^\d{4}-\d{2}-\d{2}$'
    OR jsonb_typeof(p->'latitud') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'longitud') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p->'especies') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'coresponsable_ids') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'evidencia_ids') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p->'afiliaciones_declaradas') IS DISTINCT FROM 'array'
    OR NOT (p ? 'observaciones') THEN RETURN false; END IF;
  BEGIN v_fecha:=(p->>'fecha_plantacion')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false; END;
  IF to_char(v_fecha,'YYYY-MM-DD')<>p->>'fecha_plantacion'
    OR (p->>'latitud')::numeric NOT BETWEEN -90 AND 90 OR (p->>'longitud')::numeric NOT BETWEEN -180 AND 180
    OR (p->>'latitud')::numeric<>round((p->>'latitud')::numeric,6)
    OR (p->>'longitud')::numeric<>round((p->>'longitud')::numeric,6)
    OR jsonb_array_length(p->'especies') NOT BETWEEN 1 AND 100
    OR jsonb_array_length(p->'coresponsable_ids')>100
    OR jsonb_array_length(p->'evidencia_ids') NOT BETWEEN 1 AND 10
    OR jsonb_array_length(p->'afiliaciones_declaradas')>101 THEN RETURN false; END IF;
  IF p->'observaciones'<>'null'::jsonb AND (jsonb_typeof(p->'observaciones') IS DISTINCT FROM 'string'
    OR char_length(p->>'observaciones') NOT BETWEEN 1 AND 2000
    OR p->>'observaciones'<>normalize(btrim(p->>'observaciones'),NFC)) THEN RETURN false; END IF;
  FOR v_elemento IN SELECT value FROM jsonb_array_elements(p->'especies') LOOP
    IF jsonb_typeof(v_elemento) IS DISTINCT FROM 'object' OR (v_elemento-ARRAY['planta_id','cantidad'])<>'{}'::jsonb
      OR NOT public.pa_c_decimal(v_elemento->'planta_id') OR jsonb_typeof(v_elemento->'cantidad') IS DISTINCT FROM 'number'
      OR (v_elemento->>'cantidad') !~ '^[1-9][0-9]*$' THEN RETURN false; END IF;
    v_total:=v_total+(v_elemento->>'cantidad')::numeric;
  END LOOP;
  IF v_total>2147483647 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'especies') x GROUP BY x->>'planta_id' HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'coresponsable_ids') x WHERE NOT public.pa_c_decimal(x))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'evidencia_ids') x WHERE NOT public.pa_c_decimal(x))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'coresponsable_ids') x GROUP BY x HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'evidencia_ids') x GROUP BY x HAVING count(*)>1) THEN RETURN false; END IF;
  FOR v_elemento IN SELECT value FROM jsonb_array_elements(p->'afiliaciones_declaradas') LOOP
    IF jsonb_typeof(v_elemento) IS DISTINCT FROM 'object' OR (v_elemento-ARRAY['usuario_id','afiliacion'])<>'{}'::jsonb
      OR NOT public.pa_c_decimal(v_elemento->'usuario_id') OR NOT (v_elemento ? 'afiliacion') THEN RETURN false; END IF;
    a:=v_elemento->'afiliacion';
    IF a<>'null'::jsonb THEN
      IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR coalesce(a->>'tipo','') NOT IN('OTRA','ORGANIZACION_REGISTRADA') THEN RETURN false; END IF;
      IF a->>'tipo'='OTRA' THEN
        IF (a-ARRAY['tipo','nombre'])<>'{}'::jsonb OR jsonb_typeof(a->'nombre') IS DISTINCT FROM 'string'
          OR char_length(a->>'nombre') NOT BETWEEN 1 AND 150 OR a->>'nombre'<>normalize(btrim(a->>'nombre'),NFC) THEN RETURN false; END IF;
      ELSIF (a-ARRAY['tipo','organizacion_id'])<>'{}'::jsonb OR NOT public.pa_c_decimal(a->'organizacion_id') THEN RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'afiliaciones_declaradas') x GROUP BY x->>'usuario_id' HAVING count(*)>1);
END $$;

-- Recibe las cuentas y organizaciones ya bloqueadas. No adquiere etapas previas.
CREATE OR REPLACE FUNCTION public.pa_r_snapshot(p_usuario_id BIGINT,p_fecha DATE,p_hoy DATE,p_declaraciones JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuario%ROWTYPE; a JSONB; v_declarada BOOLEAN; v_org BIGINT;
  v_texto TEXT; v_tipo TEXT; v_estado TEXT;
BEGIN
  SELECT * INTO STRICT u FROM public.usuario WHERE id=p_usuario_id;
  IF coalesce(nullif(btrim(u.nombre),''),nullif(btrim(u.username),'')) IS NULL THEN
    PERFORM public.pa_c_rechazar(422,'CONTEXTO_INCOMPLETO','Una persona requiere un nombre identificable.');
  END IF;
  SELECT x->'afiliacion',true INTO a,v_declarada FROM jsonb_array_elements(p_declaraciones) x
    WHERE x->>'usuario_id'=p_usuario_id::text;
  IF coalesce(v_declarada,false) THEN
    IF a='null'::jsonb THEN v_estado:='NO_DECLARADA';
    ELSE
      v_estado:='DECLARADA'; v_tipo:=a->>'tipo';
      IF v_tipo='ORGANIZACION_REGISTRADA' THEN
        v_org:=(a->>'organizacion_id')::bigint;
        SELECT nombre INTO v_texto FROM public.organizacion WHERE id=v_org AND activo;
        IF NOT FOUND THEN PERFORM public.pa_c_rechazar(422,'ORGANIZACION_NO_SELECCIONABLE','La organización no está disponible para una nueva selección.'); END IF;
      ELSE v_texto:=a->>'nombre'; END IF;
    END IF;
  ELSIF p_fecha<p_hoy THEN v_estado:='HISTORICA_NO_DISPONIBLE';
  ELSIF u.organizacion_id IS NOT NULL THEN
    v_org:=u.organizacion_id; v_tipo:='ORGANIZACION_REGISTRADA'; v_estado:='DECLARADA';
    SELECT nombre INTO STRICT v_texto FROM public.organizacion WHERE id=v_org;
  ELSIF nullif(btrim(u.organizacion),'') IS NOT NULL THEN
    v_texto:=u.organizacion; v_tipo:='OTRA'; v_estado:='DECLARADA';
  ELSE v_estado:='NO_DECLARADA'; END IF;
  RETURN jsonb_build_object('usuario_id',p_usuario_id::text,
    'nombre_snapshot',coalesce(nullif(btrim(u.nombre),''),btrim(u.username)),
    'afiliacion_snapshot',v_texto,'afiliacion_estado',v_estado,
    'afiliacion_tipo',v_tipo,'organizacion_id_snapshot',v_org::text);
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_inicial_ejecutar(
  p_actor_id BIGINT,p_auth_id TEXT,p_comando_id UUID,p_payload JSONB,p_contenido_canonico TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor public.usuario%ROWTYPE; v_sub public.subcampania%ROWTYPE;
  v_comando public.participacion_comando%ROWTYPE; v_asig RECORD;
  v_huella BYTEA; v_replay JSONB; v_canon JSONB; v_resultado JSONB; v_error JSONB; v_detalle TEXT;
  v_id BIGINT; v_sub_id BIGINT; v_registro_id BIGINT; v_seq BIGINT; v_tipo_id BIGINT;
  v_ids BIGINT[]; v_evidencias BIGINT[]; v_fecha DATE; v_hoy DATE; v_instante TIMESTAMPTZ;
  v_especie JSONB; v_snapshot JSONB; v_snapshots JSONB:='[]'; v_detalles JSONB:='[]';
  v_restante INTEGER; v_tomar INTEGER; v_total INTEGER; v_codigo TEXT; v_http INTEGER;
  v_dentro BOOLEAN; v_distancia NUMERIC; v_comando_existia BOOLEAN;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('TimeZone','America/La_Paz',true);
  v_hoy:=(transaction_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  IF p_comando_id IS NULL OR p_comando_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR NOT public.pa_r_payload_valido(p_payload) THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no cumple el contrato v1.',p_comando_id);
  END IF;
  -- Set-semántica, coordenadas exactas de seis posiciones; no usa stock/perfiles.
  v_canon:=p_payload||jsonb_build_object(
    'latitud',to_char((p_payload->>'latitud')::numeric,'FM990.000000'),
    'longitud',to_char((p_payload->>'longitud')::numeric,'FM990.000000'),
    'especies',(SELECT jsonb_agg(x ORDER BY (x->>'planta_id')::bigint) FROM jsonb_array_elements(p_payload->'especies') x),
    'coresponsable_ids',coalesce((SELECT jsonb_agg(x ORDER BY (x#>>'{}')::bigint) FROM jsonb_array_elements(p_payload->'coresponsable_ids') x),'[]'::jsonb),
    'evidencia_ids',(SELECT jsonb_agg(x ORDER BY (x#>>'{}')::bigint) FROM jsonb_array_elements(p_payload->'evidencia_ids') x),
    'afiliaciones_declaradas',coalesce((SELECT jsonb_agg(x ORDER BY (x->>'usuario_id')::bigint) FROM jsonb_array_elements(p_payload->'afiliaciones_declaradas') x),'[]'::jsonb));
  IF NOT public.pa_c_canon_coincide(p_contenido_canonico,v_canon) THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','El contenido canónico no corresponde a la intención.',p_comando_id);
  END IF;
  v_huella:=sha256(convert_to('PA-COMANDO/1'||chr(10)||'REGISTRAR_PLANTACION_INICIAL'||chr(10)||p_contenido_canonico,'UTF8'));
  v_replay:=public.pa_c_replay(p_actor_id,p_auth_id,'REGISTRAR_PLANTACION_INICIAL',p_comando_id,v_huella);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_sub_id:=(p_payload->>'subcampania_id')::bigint;
  v_fecha:=(p_payload->>'fecha_plantacion')::date;
  SELECT array_agg(n ORDER BY n) INTO v_ids FROM(SELECT DISTINCT n FROM(
    SELECT p_actor_id n UNION ALL SELECT (x#>>'{}')::bigint FROM jsonb_array_elements(p_payload->'coresponsable_ids') x) a) b;
  SELECT array_agg((x#>>'{}')::bigint ORDER BY (x#>>'{}')::bigint) INTO v_evidencias FROM jsonb_array_elements(p_payload->'evidencia_ids') x;
  -- Etapa 2 completa: cuentas ASC; luego todas las organizaciones ASC.
  PERFORM 1 FROM public.usuario WHERE id=ANY(v_ids) ORDER BY id FOR SHARE;
  SELECT * INTO v_actor FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id,'RECUPERAR_SESION'); END IF;
  IF NOT v_actor.activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  PERFORM 1 FROM public.organizacion o WHERE o.id IN(
    SELECT organizacion_id FROM public.usuario WHERE id=ANY(v_ids) AND organizacion_id IS NOT NULL
    UNION SELECT (x->'afiliacion'->>'organizacion_id')::bigint FROM jsonb_array_elements(p_payload->'afiliaciones_declaradas') x
      WHERE x->'afiliacion'->>'tipo'='ORGANIZACION_REGISTRADA') ORDER BY o.id FOR SHARE;
  SELECT * INTO v_sub FROM public.subcampania WHERE id=v_sub_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('rp_seq:'||v_sub_id,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('pa:comando:'||p_actor_id||':REGISTRAR_PLANTACION_INICIAL:'||p_comando_id,0));
  SELECT * INTO v_comando FROM public.participacion_comando WHERE actor_id=p_actor_id
    AND operacion='REGISTRAR_PLANTACION_INICIAL' AND comando_id=p_comando_id FOR UPDATE;
  v_comando_existia:=FOUND;
  IF v_comando_existia AND v_comando.estado<>'PREPARADO' THEN
    IF v_comando.huella IS NULL AND v_comando.error->>'codigo'='PREPARACION_CANCELADA' THEN RETURN public.pa_c_recibo(v_comando); END IF;
    IF v_comando.huella IS DISTINCT FROM v_huella THEN
      RETURN public.pa_c_fuera(409,'COMANDO_REUTILIZADO','La clave ya corresponde a otro contenido.',p_comando_id,'MISMA_CLAVE');
    END IF;
    RETURN public.pa_c_recibo(v_comando);
  END IF;
  IF v_comando_existia AND v_comando.subcampania_preparacion_id<>v_sub_id THEN
    RETURN public.pa_c_fuera(409,'COMANDO_REUTILIZADO','La clave corresponde a otro ámbito.',p_comando_id,'MISMA_CLAVE');
  END IF;
  -- El barrido es recuperable, pero una preparación vencida tampoco puede
  -- confirmar entre el vencimiento y la próxima pasada del worker.
  IF v_comando_existia AND (v_comando.creado_en<=clock_timestamp()-interval '30 days'
    OR EXISTS(SELECT 1 FROM public.participacion_carga WHERE comando_interno_id=v_comando.id
      AND estado IN('RESERVADA','DISPONIBLE') AND expira_en<=clock_timestamp())) THEN
    PERFORM 1 FROM public.participacion_carga WHERE comando_interno_id=v_comando.id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.participacion_carga_generacion WHERE carga_interna_id IN(
      SELECT id FROM public.participacion_carga WHERE comando_interno_id=v_comando.id)
      ORDER BY carga_interna_id,generacion FOR UPDATE;
    UPDATE public.participacion_comando SET estado='RECHAZADO',
      error=public.pa_c_error('PREPARACION_CANCELADA','La preparación expiró.','NO_APLICA'),
      http_terminal=409,finalizado_en=clock_timestamp() WHERE id=v_comando.id RETURNING * INTO v_comando;
    UPDATE public.participacion_carga_generacion SET estado='OBSOLETA',limpieza_estado='PENDIENTE',
      proximo_intento_en=clock_timestamp(),borrado_verificado_en=NULL WHERE carga_interna_id IN(
        SELECT id FROM public.participacion_carga WHERE comando_interno_id=v_comando.id AND estado<>'VINCULADA');
    UPDATE public.participacion_carga SET estado='DESCARTE_PENDIENTE',lease_token=NULL,lease_hasta=NULL,
      actualizado_en=clock_timestamp() WHERE comando_interno_id=v_comando.id AND estado NOT IN('VINCULADA','DESCARTADA');
    RETURN public.pa_c_recibo(v_comando);
  END IF;
  -- Locks de autoridad, conservados en el bloque exterior al rechazo de negocio.
  PERFORM 1 FROM public.subcampania_permiso_revision WHERE subcampania_id=v_sub_id AND usuario_id=ANY(v_ids)
    ORDER BY subcampania_id,usuario_id FOR SHARE;
  PERFORM 1 FROM public.subcampania_permiso WHERE subcampania_id=v_sub_id AND usuario_id=ANY(v_ids)
    ORDER BY subcampania_id,usuario_id,id FOR SHARE;
  BEGIN
    IF v_sub.id IS NULL OR v_sub.deleted_at IS NOT NULL OR NOT EXISTS(
      SELECT 1 FROM public.campania WHERE id=v_sub.campania_id AND deleted_at IS NULL) THEN
      PERFORM public.pa_c_rechazar(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
    END IF;
    IF v_actor.rol::text<>'ADMIN' AND NOT EXISTS(SELECT 1 FROM public.subcampania_permiso
      WHERE subcampania_id=v_sub_id AND usuario_id=p_actor_id AND revocado_en IS NULL) THEN
      PERFORM public.pa_c_rechazar(403,'CAPACIDAD_INSUFICIENTE','No dispone de esta capacidad.');
    END IF;
    IF v_sub.estado::text<>'ACTIVA' THEN PERFORM public.pa_c_rechazar(409,'SUBCAMPANIA_NO_OPERATIVA','La subcampaña no está operativa.'); END IF;
    IF v_sub.plan_revision<>(p_payload->>'plan_revision_esperada')::bigint THEN
      PERFORM public.pa_c_rechazar(409,'PLAN_MODIFICADO','El plan cambió; revise las cantidades antes de confirmar.');
    END IF;
    IF v_sub.poligono_geom IS NULL OR ST_IsEmpty(v_sub.poligono_geom) OR NOT ST_IsValid(v_sub.poligono_geom)
      OR NOT EXISTS(SELECT 1 FROM public.subcampania_meta_especie WHERE subcampania_id=v_sub_id) THEN
      PERFORM public.pa_c_rechazar(422,'CONTEXTO_INCOMPLETO','El plan o polígono requiere conciliación.');
    END IF;
    IF v_fecha NOT BETWEEN v_hoy-10 AND v_hoy THEN PERFORM public.pa_c_rechazar(422,'FECHA_NO_ADMITIDA','La fecha está fuera de la ventana operativa.'); END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'coresponsable_ids') x WHERE (x#>>'{}')::bigint=p_actor_id)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'afiliaciones_declaradas') x
        WHERE NOT ((x->>'usuario_id')::bigint=ANY(v_ids))) THEN
      PERFORM public.pa_c_rechazar(422,'ENTRADA_INVALIDA','La selección de personas o declaraciones no es válida.');
    END IF;
    IF EXISTS(SELECT 1 FROM unnest(v_ids) n LEFT JOIN public.usuario u ON u.id=n
      WHERE u.id IS NULL OR NOT u.activo OR (u.id<>p_actor_id AND u.rol::text<>'ADMIN' AND NOT EXISTS(
        SELECT 1 FROM public.subcampania_permiso p WHERE p.subcampania_id=v_sub_id AND p.usuario_id=n AND p.revocado_en IS NULL))) THEN
      PERFORM public.pa_c_rechazar(409,'PARTICIPANTE_NO_ELEGIBLE','Una persona seleccionada ya no es elegible.');
    END IF;
    FOR v_id IN SELECT unnest(v_ids) LOOP
      v_snapshots:=v_snapshots||jsonb_build_array(public.pa_r_snapshot(v_id,v_fecha,v_hoy,p_payload->'afiliaciones_declaradas'));
    END LOOP;
    SELECT dentro,distancia_m INTO v_dentro,v_distancia FROM public.gps_dentro_poligono_con_tolerancia(
      v_sub_id,(p_payload->>'latitud')::numeric,(p_payload->>'longitud')::numeric);
    IF NOT FOUND OR v_dentro IS NULL OR v_distancia IS NULL THEN
      PERFORM public.pa_c_rechazar(503,'EVALUADOR_NO_DISPONIBLE','No fue posible evaluar el punto geográfico.');
    END IF;
    -- Misma precisión que NUMERIC(10,2) del hecho, también en su recibo.
    v_distancia:=round(v_distancia,2);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'especies') x WHERE NOT EXISTS(
      SELECT 1 FROM public.subcampania_meta_especie m WHERE m.subcampania_id=v_sub_id AND m.planta_id=(x->>'planta_id')::bigint)) THEN
      PERFORM public.pa_c_rechazar(422,'ESPECIE_FUERA_DEL_PLAN','La selección contiene una especie fuera del plan.');
    END IF;
    -- Etapa 8: locks de asignaciones ASC; el reparto posterior sigue LIFO.
    PERFORM 1 FROM public.asignacion_vivero_subcampania a WHERE a.subcampania_id=v_sub_id
      AND a.proposito::text='PLANTACION_INICIAL' ORDER BY a.id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.asignacion_vivero_subcampania a WHERE a.subcampania_id=v_sub_id
      AND a.proposito::text='PLANTACION_INICIAL' AND a.estado::text='ACTIVA'
      AND a.saldo_asignado_disponible>0 AND a.fecha_entrega_operativa IS NULL) THEN
      PERFORM public.pa_c_rechazar(422,'CONTEXTO_INCOMPLETO','El día de entrega del stock requiere conciliación.');
    END IF;
    FOR v_especie IN SELECT value FROM jsonb_array_elements(p_payload->'especies') ORDER BY (value->>'planta_id')::bigint LOOP
      v_restante:=(v_especie->>'cantidad')::integer;
      FOR v_asig IN SELECT a.*,l.planta_id FROM public.asignacion_vivero_subcampania a JOIN public.lote_vivero l ON l.id=a.lote_vivero_id
        WHERE a.subcampania_id=v_sub_id AND a.proposito::text='PLANTACION_INICIAL' AND a.estado::text='ACTIVA'
          AND a.saldo_asignado_disponible>0 AND l.planta_id=(v_especie->>'planta_id')::bigint
          AND a.fecha_entrega_operativa<=v_fecha ORDER BY a.fecha_asignacion DESC,a.id DESC LOOP
        EXIT WHEN v_restante=0;
        v_tomar:=least(v_restante,v_asig.saldo_asignado_disponible);
        v_detalles:=v_detalles||jsonb_build_array(jsonb_build_object('asignacion_id',v_asig.id::text,
          'lote_vivero_id',v_asig.lote_vivero_id::text,'planta_id',v_asig.planta_id::text,'cantidad',v_tomar));
        v_restante:=v_restante-v_tomar;
      END LOOP;
      IF v_restante>0 THEN PERFORM public.pa_c_rechazar(409,'STOCK_INSUFICIENTE','El stock elegible no cubre las cantidades confirmadas.'); END IF;
    END LOOP;
    IF NOT v_comando_existia THEN PERFORM public.pa_c_rechazar(409,'EVIDENCIA_NO_DISPONIBLE','Las fotos no están disponibles en esta preparación.'); END IF;
    -- Todas las cargas, generaciones y evidencias; no solo la selección.
    PERFORM 1 FROM public.participacion_carga WHERE comando_interno_id=v_comando.id ORDER BY id FOR UPDATE;
    PERFORM 1 FROM public.participacion_carga_generacion g WHERE g.carga_interna_id IN(
      SELECT id FROM public.participacion_carga WHERE comando_interno_id=v_comando.id)
      ORDER BY g.carga_interna_id,g.generacion FOR UPDATE;
    PERFORM 1 FROM public.evidencias_trazabilidad e WHERE e.id=ANY(v_evidencias) OR e.id IN(
      SELECT evidencia_id FROM public.participacion_carga WHERE comando_interno_id=v_comando.id)
      ORDER BY e.id FOR UPDATE;
    SELECT id INTO v_tipo_id FROM public.tipos_entidad_evidencia WHERE upper(codigo)='REGISTRO_PLANTACION' AND activo;
    IF v_tipo_id IS NULL OR EXISTS(SELECT 1 FROM unnest(v_evidencias) n
      LEFT JOIN public.participacion_carga c ON c.evidencia_id=n
      LEFT JOIN public.evidencias_trazabilidad e ON e.id=n
      LEFT JOIN public.participacion_carga_generacion g ON g.carga_interna_id=c.id AND g.generacion=c.generacion
      WHERE c.id IS NULL OR c.actor_id<>p_actor_id OR c.comando_interno_id<>v_comando.id OR c.subcampania_id<>v_sub_id
        OR c.tipo_entidad_id<>v_tipo_id OR c.estado<>'DISPONIBLE' OR c.objetos_verificados_en IS NULL
        OR c.hash_derivada_sha256 IS NULL OR c.tamano_derivada_bytes IS NULL OR g.estado IS DISTINCT FROM 'VALIDA'
        OR g.bucket IS DISTINCT FROM c.bucket OR g.ruta_original IS DISTINCT FROM c.ruta_original
        OR g.ruta_derivada IS DISTINCT FROM c.ruta_derivada OR g.limpieza_estado IS DISTINCT FROM 'NO_REQUERIDA'
        OR e.id IS NULL OR e.creado_por_usuario_id<>p_actor_id OR e.tipo_entidad_id<>v_tipo_id
        OR e.bucket IS DISTINCT FROM c.bucket OR e.ruta_archivo IS DISTINCT FROM c.ruta_original
        OR e.hash_sha256 IS DISTINCT FROM encode(c.hash_original_sha256,'hex')
        OR e.eliminado_en IS NOT NULL OR coalesce(e.entidad_id,0)<>0) THEN
      PERFORM public.pa_c_rechazar(409,'EVIDENCIA_NO_DISPONIBLE','Las fotos no están disponibles en esta preparación.');
    END IF;
    -- La secuencia local de código usa cantidad de hechos, como el recorrido M3.
    SELECT count(*)+1 INTO v_seq FROM public.registro_plantacion WHERE subcampania_id=v_sub_id;
    v_codigo:='PLT-'||lpad(v_seq::text,greatest(3,length(v_seq::text)),'0')||'-'||v_sub.codigo_trazabilidad;
    SELECT sum((x->>'cantidad')::integer)::integer INTO v_total FROM jsonb_array_elements(p_payload->'especies') x;
    SELECT x INTO STRICT v_snapshot FROM jsonb_array_elements(v_snapshots) x WHERE x->>'usuario_id'=p_actor_id::text;
    INSERT INTO public.registro_plantacion(subcampania_id,es_reposicion,fecha_plantacion,responsable_id,
      latitud,longitud,gps_dentro_poligono,gps_distancia_a_poligono_m,cantidad_total_plantada,
      nombre_subcampania_snapshot,nombre_zona_snapshot,nombre_responsable_snapshot,observaciones,codigo_trazabilidad,created_by,
      afiliacion_responsable_snapshot,afiliacion_responsable_estado,afiliacion_responsable_tipo,organizacion_responsable_id_snapshot,revision_registro)
    VALUES(v_sub_id,false,v_fecha,p_actor_id,(p_payload->>'latitud')::numeric,(p_payload->>'longitud')::numeric,v_dentro,v_distancia,v_total,
      v_sub.nombre,coalesce(v_sub.nombre_zona_snapshot,(SELECT nombre FROM public.division_administrativa WHERE id=v_sub.zona_id)),
      v_snapshot->>'nombre_snapshot',p_payload->>'observaciones',v_codigo,p_actor_id,
      v_snapshot->>'afiliacion_snapshot',v_snapshot->>'afiliacion_estado',v_snapshot->>'afiliacion_tipo',(v_snapshot->>'organizacion_id_snapshot')::bigint,0)
      RETURNING id INTO v_registro_id;
    INSERT INTO public.registro_plantacion_coresponsable(registro_plantacion_id,usuario_id,nombre_snapshot,
      afiliacion_snapshot,afiliacion_estado,afiliacion_tipo,organizacion_id_snapshot)
    SELECT v_registro_id,(x->>'usuario_id')::bigint,x->>'nombre_snapshot',x->>'afiliacion_snapshot',x->>'afiliacion_estado',
      x->>'afiliacion_tipo',(x->>'organizacion_id_snapshot')::bigint FROM jsonb_array_elements(v_snapshots) x WHERE x->>'usuario_id'<>p_actor_id::text;
    INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,planta_id,cantidad,
      nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,evento_lote_vivero_despacho_id)
    SELECT v_registro_id,(d->>'asignacion_id')::bigint,l.id,p.id,(d->>'cantidad')::integer,
      l.nombre_cientifico_snapshot,l.nombre_comercial_snapshot,p.variedad,NULL
    FROM jsonb_array_elements(v_detalles) d JOIN public.lote_vivero l ON l.id=(d->>'lote_vivero_id')::bigint
      JOIN public.planta p ON p.id=(d->>'planta_id')::bigint;
    UPDATE public.asignacion_vivero_subcampania a SET cantidad_consumida=a.cantidad_consumida+(d->>'cantidad')::integer
      FROM jsonb_array_elements(v_detalles) d WHERE a.id=(d->>'asignacion_id')::bigint;
    UPDATE public.subcampania SET total_plantado_inicial=total_plantado_inicial+v_total,updated_at=clock_timestamp(),updated_by=p_actor_id WHERE id=v_sub_id;
    UPDATE public.evidencias_trazabilidad SET entidad_id=v_registro_id,codigo_trazabilidad=v_codigo,
      actualizado_en=clock_timestamp(),actualizado_por_usuario_id=p_actor_id WHERE id=ANY(v_evidencias);
    UPDATE public.participacion_carga SET estado='VINCULADA',expira_en=NULL,lease_token=NULL,lease_hasta=NULL,
      actualizado_en=clock_timestamp() WHERE comando_interno_id=v_comando.id AND evidencia_id=ANY(v_evidencias);
    UPDATE public.participacion_carga_generacion g SET estado='OBSOLETA',limpieza_estado='PENDIENTE',
      proximo_intento_en=clock_timestamp(),borrado_verificado_en=NULL WHERE g.carga_interna_id IN(
        SELECT id FROM public.participacion_carga WHERE comando_interno_id=v_comando.id AND estado<>'VINCULADA');
    UPDATE public.participacion_carga SET estado='DESCARTE_PENDIENTE',lease_token=NULL,lease_hasta=NULL,actualizado_en=clock_timestamp()
      WHERE comando_interno_id=v_comando.id AND estado NOT IN('VINCULADA','DESCARTADA');
    IF (SELECT sum(cantidad) FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=v_registro_id)<>v_total THEN
      RAISE EXCEPTION 'PA_INT03A_CONSERVACION_DETALLES' USING ERRCODE='23514';
    END IF;
    v_resultado:=jsonb_build_object('tipo','PLANTACION_INICIAL','registro_plantacion_id',v_registro_id::text,
      'codigo_trazabilidad',v_codigo,'subcampania_id',v_sub_id::text,'responsable_id',p_actor_id::text,
      'fecha_plantacion',v_fecha::text,'cantidad_total_plantada',v_total,'especies',v_canon->'especies',
      'gps_dentro_poligono',v_dentro,'gps_distancia_a_poligono_m',v_distancia,'revision_inicial','0');
    UPDATE public.participacion_comando SET huella=v_huella,estado='CONFIRMADO',registro_plantacion_id=v_registro_id,
      resultado=v_resultado,http_terminal=200,finalizado_en=clock_timestamp() WHERE id=v_comando.id RETURNING * INTO v_comando;
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    GET STACKED DIAGNOSTICS v_detalle=PG_EXCEPTION_DETAIL;
    v_error:=v_detalle::jsonb; v_http:=(v_error->>'http_status')::integer;
    -- PL/pgSQL no revierte variables junto a tablas: descartar efectos locales.
    v_resultado:=NULL; v_registro_id:=NULL; v_detalles:='[]'; v_snapshots:='[]'; v_total:=NULL;
    v_instante:=clock_timestamp();
    IF v_comando_existia THEN
      UPDATE public.participacion_comando SET huella=v_huella,estado='RECHAZADO',resultado=NULL,error=v_error->'error',
        http_terminal=v_http,finalizado_en=v_instante WHERE id=v_comando.id RETURNING * INTO v_comando;
    ELSE
      INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,error,http_terminal,creado_en,finalizado_en)
      VALUES(p_actor_id,'REGISTRAR_PLANTACION_INICIAL',p_comando_id,v_huella,'RECHAZADO',v_error->'error',v_http,v_instante,v_instante)
      RETURNING * INTO v_comando;
    END IF;
  END;
  RETURN public.pa_c_recibo(v_comando);
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_detalle_propio_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v public.registro_plantacion%ROWTYPE; v_participantes JSONB; v_autor BOOLEAN; v_participante BOOLEAN;
BEGIN
  PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
  SELECT * INTO v FROM public.registro_plantacion WHERE id=p_registro_id FOR SHARE;
  v_autor:=v.responsable_id=p_actor_id;
  v_participante:=EXISTS(SELECT 1 FROM public.registro_plantacion_coresponsable WHERE registro_plantacion_id=p_registro_id AND usuario_id=p_actor_id);
  IF v.id IS NULL OR NOT (coalesce(v_autor,false) OR v_participante) THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
  END IF;
  SELECT jsonb_agg(fila ORDER BY es_responsable DESC,usuario_id) INTO v_participantes FROM (
    SELECT v.responsable_id usuario_id,true es_responsable,jsonb_build_object('usuario_id',v.responsable_id::text,
      'nombre_snapshot',v.nombre_responsable_snapshot,'afiliacion_snapshot',v.afiliacion_responsable_snapshot,
      'afiliacion_estado',v.afiliacion_responsable_estado,'afiliacion_tipo',v.afiliacion_responsable_tipo,
      'organizacion_id_snapshot',v.organizacion_responsable_id_snapshot::text,'es_responsable',true) fila
    UNION ALL SELECT c.usuario_id,false,jsonb_build_object('usuario_id',c.usuario_id::text,'nombre_snapshot',c.nombre_snapshot,
      'afiliacion_snapshot',c.afiliacion_snapshot,'afiliacion_estado',c.afiliacion_estado,'afiliacion_tipo',c.afiliacion_tipo,
      'organizacion_id_snapshot',c.organizacion_id_snapshot::text,'es_responsable',false)
      FROM public.registro_plantacion_coresponsable c WHERE c.registro_plantacion_id=p_registro_id
  ) personas;
  RETURN jsonb_build_object('data',jsonb_build_object('registro_plantacion_id',v.id::text,'codigo_trazabilidad',v.codigo_trazabilidad,
    'subcampania_id',v.subcampania_id::text,'fecha_plantacion',v.fecha_plantacion::text,'revision_registro',v.revision_registro::text,
    'relaciones',CASE WHEN v_autor AND v_participante THEN '["AUTOR","PARTICIPANTE"]'::jsonb WHEN v_autor THEN '["AUTOR"]'::jsonb ELSE '["PARTICIPANTE"]'::jsonb END,
    'cantidad_total_plantada',v.cantidad_total_plantada,'especies',coalesce((SELECT jsonb_agg(jsonb_build_object('planta_id',planta_id::text,'cantidad',cantidad) ORDER BY planta_id)
      FROM(SELECT planta_id,sum(cantidad)::integer cantidad FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=v.id GROUP BY planta_id) e),'[]'::jsonb),
    'latitud',v.latitud,'longitud',v.longitud,'gps_dentro_poligono',v.gps_dentro_poligono,'participantes',v_participantes,
    'evidencia_ids',coalesce((SELECT jsonb_agg(e.id::text ORDER BY e.id) FROM public.evidencias_trazabilidad e
      WHERE e.entidad_id=v.id AND e.eliminado_en IS NULL
        AND e.tipo_entidad_id IN(SELECT id FROM public.tipos_entidad_evidencia WHERE upper(codigo)='REGISTRO_PLANTACION')),'[]'::jsonb),
    'observaciones_autor',CASE WHEN v_autor THEN v.observaciones ELSE NULL END),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

DO $$ DECLARE f RECORD; v_rol TEXT; BEGIN
  FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (left(p.proname,5)='pa_r_' OR p.proname IN('pa_registro_contexto_leer',
      'pa_registro_participantes_leer','pa_registro_inicial_ejecutar','pa_registro_detalle_propio_leer','pa_c_replay')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.firma);
  END LOOP;
  FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND (left(p.proname,5)='pa_r_' OR p.proname IN('pa_registro_contexto_leer',
        'pa_registro_participantes_leer','pa_registro_inicial_ejecutar','pa_registro_detalle_propio_leer','pa_c_replay'))
      AND has_function_privilege(v_rol,p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'PA_INT03A_REGISTRO_PRIVILEGIO_PUBLICO_HEREDADO: %',v_rol;
    END IF;
  END LOOP;
END $$;
COMMENT ON FUNCTION public.pa_registro_inicial_ejecutar(BIGINT,TEXT,UUID,JSONB,TEXT) IS
  'PA-COMANDO/1 inicial: cuentas/organizaciones -> subcampaña -> rp_seq -> comando -> permisos -> asignaciones -> cargas/generaciones/evidencias. LIFO fecha_asignacion DESC,id DESC; nunca debita M2. Solo PZ001 produce rechazo durable; errores desconocidos revierten todo. statement_timeout 30s se fija antes de llamar en sesión/PostgREST.';
NOTIFY pgrst,'reload schema';

-- FUENTE: migrations/078_pa_int02d_lifecycle.sql
-- SHA256: bfe78a412ef71d795eff20167e1f73f02a7b6091779f2808e0f6e10ccde6aa0f
-- PA-T-INT02-D: ciclo de vida y logística bajo la misma exclusión de ámbito.
-- Aditiva; requiere 077 (pa_d_cuenta). No ejecutar contra datos reales como fixture.
-- Los snapshots se leen con cuentas -> organizaciones -> subcampaña. Si cambia
-- el conjunto descubierto antes del lock del ámbito, 40001 exige releer/reintentar.
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.pa_d_subcampania_activar(p_id BIGINT,p_actor_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE s public.subcampania%ROWTYPE; v_coord BIGINT; v_coord_actual BIGINT;
 v_orgs BIGINT[]; v_orgs_actual BIGINT[]; v_nombres TEXT[]; v_nombre TEXT;
 v_zona TEXT; v_plan_n INT; v_porcentaje NUMERIC; v_cantidad BIGINT;
 v_composicion JSONB; v_result JSONB;
BEGIN
 SELECT usuario_id INTO v_coord FROM public.subcampania_equipo
  WHERE subcampania_id=p_id AND rol::TEXT='COORDINADOR';
 SELECT COALESCE(array_agg(o.organizacion_id ORDER BY o.organizacion_id),'{}'::BIGINT[])
 INTO v_orgs FROM public.campania_organizacion o JOIN public.subcampania x ON x.campania_id=o.campania_id WHERE x.id=p_id;
 PERFORM 1 FROM public.usuario WHERE id=ANY(ARRAY[p_actor_id,v_coord]) ORDER BY id FOR SHARE;
 IF public.pa_d_cuenta(p_actor_id)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede activar subcampañas' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizacion WHERE id=ANY(v_orgs) ORDER BY id FOR SHARE;
 SELECT * INTO s FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 SELECT usuario_id INTO v_coord_actual FROM public.subcampania_equipo WHERE subcampania_id=p_id AND rol::TEXT='COORDINADOR';
 SELECT COALESCE(array_agg(o.organizacion_id ORDER BY o.organizacion_id),'{}'::BIGINT[]) INTO v_orgs_actual
 FROM public.campania_organizacion o WHERE o.campania_id=s.campania_id;
 IF v_coord_actual IS DISTINCT FROM v_coord OR v_orgs_actual IS DISTINCT FROM v_orgs THEN
  RAISE EXCEPTION 'Cambió el equipo o las organizaciones; repetir la activación' USING ERRCODE='40001'; END IF;
 IF s.estado::TEXT<>'BORRADOR' THEN RAISE EXCEPTION 'Solo se puede activar una subcampaña en estado BORRADOR' USING ERRCODE='P0001'; END IF;
 IF s.poligono_geom IS NULL THEN RAISE EXCEPTION 'La subcampaña no tiene polígono definido' USING ERRCODE='P0001'; END IF;
 IF v_coord IS NULL THEN RAISE EXCEPTION 'La subcampaña no tiene un COORDINADOR asignado al equipo' USING ERRCODE='P0001'; END IF;
 IF s.meta_total_arboles IS NULL OR s.meta_total_arboles<=0 THEN RAISE EXCEPTION 'meta_total_arboles debe ser mayor a 0 para activar' USING ERRCODE='P0001'; END IF;
 SELECT count(*),COALESCE(sum(porcentaje_objetivo),0),COALESCE(sum(cantidad_objetivo),0)
 INTO v_plan_n,v_porcentaje,v_cantidad FROM public.subcampania_meta_especie WHERE subcampania_id=p_id;
 IF v_plan_n=0 THEN RAISE EXCEPTION 'El plan de metas por especie es obligatorio' USING ERRCODE='P0001'; END IF;
 IF abs(v_porcentaje-100)>0.01 THEN RAISE EXCEPTION 'El plan por especie debe sumar 100%%' USING ERRCODE='P0001'; END IF;
 IF v_cantidad<>s.meta_total_arboles THEN RAISE EXCEPTION 'La suma de cantidad_objetivo del plan no coincide con meta_total_arboles' USING ERRCODE='P0001'; END IF;
 SELECT nombre INTO v_nombre FROM public.usuario WHERE id=v_coord;
 SELECT nombre INTO v_zona FROM public.division_administrativa WHERE id=s.zona_id;
 SELECT COALESCE(array_agg(nombre ORDER BY id) FILTER(WHERE nombre IS NOT NULL),'{}'::TEXT[]) INTO v_nombres
 FROM public.organizacion WHERE id=ANY(v_orgs);
 SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.planta_id),'[]'::JSONB) INTO v_composicion FROM (
  SELECT l.planta_id,p.especie,p.nombre_cientifico,sum(a.saldo_asignado_disponible) AS saldo_asignado_disponible
  FROM public.asignacion_vivero_subcampania a JOIN public.lote_vivero l ON l.id=a.lote_vivero_id
  JOIN public.planta p ON p.id=l.planta_id WHERE a.subcampania_id=p_id AND a.estado::TEXT='ACTIVA'
  GROUP BY l.planta_id,p.especie,p.nombre_cientifico HAVING sum(a.saldo_asignado_disponible)>0
 ) x;
 UPDATE public.subcampania SET estado='ACTIVA',nombre_zona_snapshot=v_zona,nombre_coordinador_snapshot=v_nombre,
  nombres_organizaciones_snapshot=v_nombres,updated_by=p_actor_id,updated_at=now() WHERE id=p_id;
 INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,actor_user_id,estado_origen,estado_destino,metadata)
 VALUES(p_id,'SUBCAMPANIA_ACTIVADA',p_actor_id,s.estado,'ACTIVA',jsonb_build_object('nombre_zona_snapshot',v_zona,
 'nombre_coordinador_snapshot',v_nombre,'nombres_organizaciones_snapshot',to_jsonb(v_nombres),'meta_total_arboles',s.meta_total_arboles,
 'total_asignado_al_activar',(SELECT COALESCE(sum((e->>'saldo_asignado_disponible')::BIGINT),0) FROM jsonb_array_elements(v_composicion)e),
 'especies_planificadas',v_plan_n));
 SELECT jsonb_build_object('id',id,'estado',estado,'nombre_zona_snapshot',nombre_zona_snapshot,
 'nombre_coordinador_snapshot',nombre_coordinador_snapshot,'nombres_organizaciones_snapshot',nombres_organizaciones_snapshot,
 'updated_at',updated_at,'composicion_asignada',v_composicion) INTO v_result FROM public.subcampania WHERE id=p_id;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.pa_d_subcampania_cerrar(p_id BIGINT,p_actor_id BIGINT,p_datos JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE s public.subcampania%ROWTYPE; v_final TEXT:=p_datos->>'estado_final'; v_result JSONB;
 v_fecha TIMESTAMPTZ; v_fin DATE; v_motivo TEXT:=p_datos->>'motivo_cierre_parcial';
BEGIN
 IF public.pa_d_cuenta(p_actor_id)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede cerrar subcampañas' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 IF s.estado::TEXT<>'ACTIVA' OR v_final IS NULL OR v_final NOT IN('COMPLETADA','FINALIZADA_PARCIAL') THEN
  RAISE EXCEPTION 'Transición de cierre inválida' USING ERRCODE='P0001'; END IF;
 v_fecha:=(p_datos->>'fecha_cierre_operativo')::TIMESTAMPTZ; v_fin:=(p_datos->>'fecha_fin_mantenimiento')::DATE;
 IF v_fecha IS NULL OR v_fin IS NULL OR (v_fin::TIMESTAMP AT TIME ZONE 'UTC')<v_fecha THEN
  RAISE EXCEPTION 'Las fechas de cierre son requeridas y mantenimiento no puede terminar antes del cierre operativo' USING ERRCODE='P0001'; END IF;
 IF v_final='FINALIZADA_PARCIAL' AND (v_motivo IS NULL OR v_motivo NOT IN('FALTA_STOCK','PROBLEMAS_CLIMATICOS','CANCELACION_CONVENIO',
  'CONFLICTO_SOCIAL','ACCESO_RESTRINGIDO','CAMBIO_PRIORIDAD_INSTITUCIONAL','RIESGO_OPERATIVO','META_REDEFINIDA','CIERRE_ADMINISTRATIVO','OTRO')) THEN
  RAISE EXCEPTION 'motivo_cierre_parcial requerido o inválido' USING ERRCODE='P0001'; END IF;
 UPDATE public.subcampania SET estado=v_final::public.estado_subcampania,fase_mantenimiento='MANTENIMIENTO_ACTIVO',
 fecha_cierre_operativo=v_fecha,fecha_fin_mantenimiento=v_fin,
 motivo_cierre_parcial=CASE WHEN v_final='FINALIZADA_PARCIAL' THEN v_motivo::public.motivo_cierre_parcial ELSE NULL END,
 observaciones_cierre=p_datos->>'observaciones_cierre',updated_by=p_actor_id,updated_at=now() WHERE id=p_id;
 INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,actor_user_id,estado_origen,estado_destino,metadata)
 VALUES(p_id,(CASE WHEN v_final='COMPLETADA' THEN 'SUBCAMPANIA_COMPLETADA' ELSE 'SUBCAMPANIA_FINALIZADA_PARCIAL' END)::public.tipo_historial_subcampania,
 p_actor_id,s.estado,v_final::public.estado_subcampania,jsonb_build_object('fecha_cierre_operativo',v_fecha,
 'fecha_fin_mantenimiento',v_fin,'motivo_cierre_parcial',CASE WHEN v_final='FINALIZADA_PARCIAL' THEN v_motivo ELSE NULL END));
 SELECT jsonb_build_object('id',id,'estado',estado,'fase_mantenimiento',fase_mantenimiento,'fecha_cierre_operativo',fecha_cierre_operativo,
 'fecha_fin_mantenimiento',fecha_fin_mantenimiento,'motivo_cierre_parcial',motivo_cierre_parcial,'observaciones_cierre',observaciones_cierre,
 'updated_at',updated_at) INTO v_result FROM public.subcampania WHERE id=p_id;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.pa_d_equipo_agregar(p_id BIGINT,p_actor_id BIGINT,p_miembros JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE s public.subcampania%ROWTYPE; v_ids BIGINT[]; v_result JSONB; v_n INT;
BEGIN
 IF jsonb_typeof(p_miembros) IS DISTINCT FROM 'array' OR jsonb_array_length(p_miembros)=0 THEN
  RAISE EXCEPTION 'Debe enviar al menos un miembro' USING ERRCODE='22023'; END IF;
 SELECT array_agg((e->>'usuario_id')::BIGINT),count(DISTINCT (e->>'usuario_id')::BIGINT) INTO v_ids,v_n FROM jsonb_array_elements(p_miembros)e;
 IF v_n<>jsonb_array_length(p_miembros) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_miembros)e
  WHERE (e->>'rol') IS NULL OR (e->>'rol') NOT IN('COORDINADOR','OPERARIO')) THEN
  RAISE EXCEPTION 'Usuarios duplicados o rol logístico inválido' USING ERRCODE='P0001'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_miembros)e WHERE e->>'rol'='COORDINADOR')>1 THEN
  RAISE EXCEPTION 'Solo se permite un COORDINADOR por subcampaña' USING ERRCODE='P0001'; END IF;
 PERFORM 1 FROM public.usuario WHERE id=ANY(array_append(v_ids,p_actor_id)) ORDER BY id FOR SHARE;
 IF public.pa_d_cuenta(p_actor_id)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede administrar el equipo' USING ERRCODE='42501'; END IF;
 -- RF-PLA-12 / RN-PLA-35: el permiso contextual no convierte al
 -- participante VOLUNTARIO en miembro del equipo logístico.
 IF (SELECT count(*) FROM public.usuario WHERE id=ANY(v_ids) AND activo AND rol::TEXT IN('ADMIN','GENERAL','VALIDADOR'))<>v_n THEN
  RAISE EXCEPTION 'Uno o más usuarios no existen, están inactivos o no tienen rol global compatible' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 IF EXISTS(SELECT 1 FROM public.subcampania_equipo WHERE subcampania_id=p_id AND usuario_id=ANY(v_ids)) THEN
  RAISE EXCEPTION 'Uno o más usuarios ya pertenecen al equipo de esta subcampaña' USING ERRCODE='P0001'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_miembros)e WHERE e->>'rol'='COORDINADOR')
  AND EXISTS(SELECT 1 FROM public.subcampania_equipo WHERE subcampania_id=p_id AND rol::TEXT='COORDINADOR') THEN
  RAISE EXCEPTION 'Ya existe un coordinador en esta subcampaña' USING ERRCODE='P0001'; END IF;
 INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by)
 SELECT p_id,(e->>'usuario_id')::BIGINT,(e->>'rol')::public.rol_en_subcampania,p_actor_id FROM jsonb_array_elements(p_miembros)e;
 INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,actor_user_id,estado_origen,estado_destino,metadata)
 VALUES(p_id,'EQUIPO_AMPLIADO',p_actor_id,s.estado,s.estado,jsonb_build_object('miembros',p_miembros));
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'usuario_id',e.usuario_id,'rol',e.rol,'agregado_at',e.agregado_at,
 'nombre_usuario',u.nombre,'foto_perfil_url',u.foto_perfil_url) ORDER BY e.agregado_at,e.id),'[]'::JSONB) INTO v_result
 FROM public.subcampania_equipo e JOIN public.usuario u ON u.id=e.usuario_id WHERE e.subcampania_id=p_id AND e.usuario_id=ANY(v_ids);
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.pa_d_equipo_quitar(p_id BIGINT,p_actor_id BIGINT,p_usuario_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE s public.subcampania%ROWTYPE; v_rol TEXT;
BEGIN
 PERFORM 1 FROM public.usuario WHERE id=ANY(ARRAY[p_actor_id,p_usuario_id]) ORDER BY id FOR SHARE;
 IF public.pa_d_cuenta(p_actor_id)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede administrar el equipo' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 SELECT rol::TEXT INTO v_rol FROM public.subcampania_equipo WHERE subcampania_id=p_id AND usuario_id=p_usuario_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no pertenece al equipo de la subcampaña' USING ERRCODE='P0002'; END IF;
 IF v_rol='COORDINADOR' AND s.estado::TEXT='ACTIVA' THEN
  RAISE EXCEPTION 'No se puede quitar al coordinador mientras la subcampaña está activa' USING ERRCODE='P0001'; END IF;
 DELETE FROM public.subcampania_equipo WHERE subcampania_id=p_id AND usuario_id=p_usuario_id;
 INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,actor_user_id,estado_origen,estado_destino,metadata)
 VALUES(p_id,'EQUIPO_REDUCIDO',p_actor_id,s.estado,s.estado,jsonb_build_object('usuario_id',p_usuario_id,'rol',v_rol));
 RETURN jsonb_build_object('message','Miembro quitado correctamente.');
END $$;

CREATE OR REPLACE FUNCTION public.pa_d_subcampania_editar(p_id BIGINT,p_actor_id BIGINT,p_datos JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE s public.subcampania%ROWTYPE; v_campos TEXT[]; v_permitidos TEXT[]; v_result JSONB;
BEGIN
 IF public.pa_d_cuenta(p_actor_id)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede editar subcampañas' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Datos de edición inválidos' USING ERRCODE='22023'; END IF;
 v_campos:=ARRAY(SELECT jsonb_object_keys(p_datos));
 v_permitidos:=CASE s.estado::TEXT
 WHEN 'BORRADOR' THEN ARRAY['nombre','descripcion','zona_id','fecha_estimada_inicio','fecha_estimada_fin','tolerancia_gps_metros']
 WHEN 'ACTIVA' THEN ARRAY['descripcion','fecha_estimada_fin','tolerancia_gps_metros']
 WHEN 'COMPLETADA' THEN ARRAY['observaciones_cierre'] WHEN 'FINALIZADA_PARCIAL' THEN ARRAY['observaciones_cierre'] ELSE '{}'::TEXT[] END;
 IF NOT(v_campos<@v_permitidos) THEN RAISE EXCEPTION 'Los campos no son editables en estado %',s.estado USING ERRCODE='P0001'; END IF;
 -- Conserva la regla previa cuando se envían ambas fechas; las columnas DATE
 -- mantienen el contrato existente para patches parciales.
 IF p_datos->>'fecha_estimada_inicio' IS NOT NULL AND p_datos->>'fecha_estimada_fin' IS NOT NULL
  AND (p_datos->>'fecha_estimada_fin')::DATE<(p_datos->>'fecha_estimada_inicio')::DATE THEN
  RAISE EXCEPTION 'fecha_estimada_fin no puede ser anterior a fecha_estimada_inicio' USING ERRCODE='22023'; END IF;
 UPDATE public.subcampania SET nombre=CASE WHEN p_datos?'nombre' THEN p_datos->>'nombre' ELSE nombre END,
 descripcion=CASE WHEN p_datos?'descripcion' THEN p_datos->>'descripcion' ELSE descripcion END,
 zona_id=CASE WHEN p_datos?'zona_id' THEN (p_datos->>'zona_id')::BIGINT ELSE zona_id END,
 fecha_estimada_inicio=CASE WHEN p_datos?'fecha_estimada_inicio' THEN (p_datos->>'fecha_estimada_inicio')::DATE ELSE fecha_estimada_inicio END,
 fecha_estimada_fin=CASE WHEN p_datos?'fecha_estimada_fin' THEN (p_datos->>'fecha_estimada_fin')::DATE ELSE fecha_estimada_fin END,
 tolerancia_gps_metros=CASE WHEN p_datos?'tolerancia_gps_metros' THEN (p_datos->>'tolerancia_gps_metros')::INT ELSE tolerancia_gps_metros END,
 observaciones_cierre=CASE WHEN p_datos?'observaciones_cierre' THEN p_datos->>'observaciones_cierre' ELSE observaciones_cierre END,
 updated_by=p_actor_id,updated_at=now() WHERE id=p_id;
 SELECT jsonb_build_object('id',id,'nombre',nombre,'descripcion',descripcion,'tipo',tipo,'estado',estado,'zona_id',zona_id,
 'meta_total_arboles',meta_total_arboles,'fecha_estimada_inicio',fecha_estimada_inicio,'fecha_estimada_fin',fecha_estimada_fin,
 'tolerancia_gps_metros',tolerancia_gps_metros,'observaciones_cierre',observaciones_cierre,'updated_at',updated_at)
 INTO v_result FROM public.subcampania WHERE id=p_id;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.pa_d_subcampania_borrar(p_id BIGINT,p_actor_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_estado TEXT;
BEGIN
 IF public.pa_d_cuenta(p_actor_id)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede eliminar subcampañas' USING ERRCODE='42501'; END IF;
 SELECT estado::TEXT INTO v_estado FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 IF v_estado<>'BORRADOR' THEN RAISE EXCEPTION 'Solo se pueden eliminar subcampañas en estado BORRADOR' USING ERRCODE='P0001'; END IF;
 UPDATE public.subcampania SET deleted_at=now(),deleted_by=p_actor_id WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'message','Subcampaña eliminada correctamente.');
END $$;

CREATE OR REPLACE FUNCTION public.fn_subcampania_setear_poligono(p_id INT,p_geojson JSONB,p_updated_by BIGINT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_estado TEXT; v_area NUMERIC(12,4); v_geom geometry;
BEGIN
 IF public.pa_d_cuenta(p_updated_by)<>'ADMIN' THEN RAISE EXCEPTION 'Solo ADMIN puede setear el polígono' USING ERRCODE='42501'; END IF;
 SELECT estado::TEXT INTO v_estado FROM public.subcampania WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subcampaña no encontrada' USING ERRCODE='P0002'; END IF;
 IF v_estado<>'BORRADOR' THEN RAISE EXCEPTION 'Solo se puede setear el polígono en estado BORRADOR' USING ERRCODE='P0001'; END IF;
 v_geom:=ST_SetSRID(ST_GeomFromGeoJSON(p_geojson::TEXT),4326);
 IF GeometryType(v_geom)<>'POLYGON' OR NOT ST_IsValid(v_geom) OR ST_IsEmpty(v_geom) THEN
  RAISE EXCEPTION 'Polígono inválido' USING ERRCODE='22023'; END IF;
 v_area:=round((ST_Area(ST_Transform(v_geom,3857))/10000)::NUMERIC,4);
 UPDATE public.subcampania SET poligono_geom=v_geom,area_hectareas=v_area,updated_at=now(),updated_by=p_updated_by WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'area_hectareas',v_area);
END $$;

-- Cerrar todas las sobrecargas públicas. Solo la firma vigente se reabre a
-- service_role; una sobrecarga legada desconocida no conserva autorización.
DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('pa_d_subcampania_activar','pa_d_subcampania_cerrar','pa_d_equipo_agregar',
 'pa_d_equipo_quitar','pa_d_subcampania_editar','pa_d_subcampania_borrar','fn_subcampania_setear_poligono') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.pa_d_subcampania_activar(BIGINT,BIGINT),public.pa_d_subcampania_cerrar(BIGINT,BIGINT,JSONB),
 public.pa_d_equipo_agregar(BIGINT,BIGINT,JSONB),public.pa_d_equipo_quitar(BIGINT,BIGINT,BIGINT),
 public.pa_d_subcampania_editar(BIGINT,BIGINT,JSONB),public.pa_d_subcampania_borrar(BIGINT,BIGINT),
 public.fn_subcampania_setear_poligono(INT,JSONB,BIGINT) TO service_role;

COMMIT;
