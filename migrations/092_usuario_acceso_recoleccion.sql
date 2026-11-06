-- T1: acceso explícito M1. Sin backfill ni cambios a rol/equipo/Plantación.
-- Requiere 064/070/072/073/091 cotejadas; no ejecutar en destino sin preflight.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$ BEGIN
  PERFORM u.id,u.auth_id,u.rol,u.activo,u.revision_autoridad FROM public.usuario u LIMIT 0;
  IF to_regprocedure('public.pa_c_fuera(integer,text,text,uuid,text)') IS NULL
    OR to_regprocedure('public.pa_c_rechazar(integer,text,text)') IS NULL
    OR to_regprocedure('public.fn_subcampania_historial_prevent_mutation()') IS NULL THEN
    RAISE EXCEPTION 'T1_CATALOGO_INCOMPATIBLE: cotejar antecedentes 064/070/072';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.recoleccion_acceso_comando (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  comando_id uuid NOT NULL,
  operacion text NOT NULL CHECK (operacion IN ('OTORGAR_ACCESO_RECOLECCION','RETIRAR_ACCESO_RECOLECCION')),
  intencion jsonb NOT NULL CHECK (jsonb_typeof(intencion)='object'),
  estado text NOT NULL CHECK (estado IN ('CONFIRMADO','RECHAZADO')),
  resultado jsonb,
  error jsonb,
  http_terminal integer NOT NULL,
  finalizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor_id,comando_id),
  UNIQUE (id,actor_id),
  CHECK ((estado='CONFIRMADO' AND resultado IS NOT NULL AND error IS NULL AND http_terminal=200)
    OR (estado='RECHAZADO' AND resultado IS NULL AND error IS NOT NULL AND http_terminal IN (403,404,409)))
);
CREATE TABLE IF NOT EXISTS public.usuario_acceso_recoleccion_revision (
  usuario_id bigint PRIMARY KEY REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revision bigint NOT NULL CHECK (revision>=1)
);
CREATE TABLE IF NOT EXISTS public.usuario_acceso_recoleccion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  otorgado_en timestamptz NOT NULL,
  otorgado_por bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  comando_otorgamiento_id bigint NOT NULL,
  revocado_en timestamptz,
  revocado_por bigint REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  comando_retiro_id bigint,
  FOREIGN KEY (comando_otorgamiento_id,otorgado_por) REFERENCES public.recoleccion_acceso_comando(id,actor_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  FOREIGN KEY (comando_retiro_id,revocado_por) REFERENCES public.recoleccion_acceso_comando(id,actor_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ((revocado_en IS NULL AND revocado_por IS NULL AND comando_retiro_id IS NULL)
    OR (revocado_en IS NOT NULL AND revocado_por IS NOT NULL AND comando_retiro_id IS NOT NULL AND revocado_en>=otorgado_en))
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_acceso_recoleccion_un_vigente_idx
  ON public.usuario_acceso_recoleccion(usuario_id) WHERE revocado_en IS NULL;
CREATE INDEX IF NOT EXISTS usuario_acceso_recoleccion_historia_idx
  ON public.usuario_acceso_recoleccion(usuario_id,id DESC);
CREATE TABLE IF NOT EXISTS public.usuario_acceso_recoleccion_historial (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id bigint NOT NULL REFERENCES public.usuario(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  comando_id bigint NOT NULL UNIQUE,
  acceso_id bigint NOT NULL REFERENCES public.usuario_acceso_recoleccion(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  evento text NOT NULL CHECK (evento IN ('ACCESO_OTORGADO','ACCESO_RETIRADO')),
  revision_anterior bigint NOT NULL CHECK (revision_anterior>=0),
  revision_nueva bigint NOT NULL CHECK (revision_nueva=revision_anterior+1),
  motivo text NOT NULL CHECK (char_length(motivo) BETWEEN 3 AND 1000 AND motivo=normalize(btrim(motivo),NFC)),
  creado_en timestamptz NOT NULL,
  FOREIGN KEY (comando_id,actor_id) REFERENCES public.recoleccion_acceso_comando(id,actor_id) ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- No aceptar una tabla previa incompatible por el IF NOT EXISTS.
DO $$ DECLARE v record; BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('recoleccion_acceso_comando','id','bigint',true),('recoleccion_acceso_comando','actor_id','bigint',true),
    ('recoleccion_acceso_comando','comando_id','uuid',true),('recoleccion_acceso_comando','operacion','text',true),
    ('recoleccion_acceso_comando','intencion','jsonb',true),('recoleccion_acceso_comando','estado','text',true),
    ('recoleccion_acceso_comando','resultado','jsonb',false),('recoleccion_acceso_comando','error','jsonb',false),
    ('recoleccion_acceso_comando','http_terminal','integer',true),('recoleccion_acceso_comando','finalizado_en','timestamp with time zone',true),
    ('usuario_acceso_recoleccion_revision','usuario_id','bigint',true),('usuario_acceso_recoleccion_revision','revision','bigint',true),
    ('usuario_acceso_recoleccion','id','bigint',true),('usuario_acceso_recoleccion','usuario_id','bigint',true),
    ('usuario_acceso_recoleccion','otorgado_en','timestamp with time zone',true),('usuario_acceso_recoleccion','otorgado_por','bigint',true),
    ('usuario_acceso_recoleccion','comando_otorgamiento_id','bigint',true),('usuario_acceso_recoleccion','revocado_en','timestamp with time zone',false),
    ('usuario_acceso_recoleccion','revocado_por','bigint',false),('usuario_acceso_recoleccion','comando_retiro_id','bigint',false),
    ('usuario_acceso_recoleccion_historial','id','bigint',true),('usuario_acceso_recoleccion_historial','usuario_id','bigint',true),
    ('usuario_acceso_recoleccion_historial','actor_id','bigint',true),('usuario_acceso_recoleccion_historial','comando_id','bigint',true),
    ('usuario_acceso_recoleccion_historial','acceso_id','bigint',true),('usuario_acceso_recoleccion_historial','evento','text',true),
    ('usuario_acceso_recoleccion_historial','revision_anterior','bigint',true),('usuario_acceso_recoleccion_historial','revision_nueva','bigint',true),
    ('usuario_acceso_recoleccion_historial','motivo','text',true),('usuario_acceso_recoleccion_historial','creado_en','timestamp with time zone',true)
  ) esperado(tabla,columna,tipo,obligatoria) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||v.tabla)::regclass
      AND attname=v.columna AND atttypid=v.tipo::regtype AND attnotnull=v.obligatoria AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T1_CATALOGO_INCOMPATIBLE: %.%',v.tabla,v.columna;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indexrelid='public.usuario_acceso_recoleccion_un_vigente_idx'::regclass
    AND i.indisunique AND i.indisvalid AND i.indisready AND pg_get_expr(i.indpred,i.indrelid)='(revocado_en IS NULL)'
    AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(n,ord)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n)=ARRAY['usuario_id']::name[]) THEN
    RAISE EXCEPTION 'T1_CATALOGO_INCOMPATIBLE: índice de vigencia';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.m1_acceso_efectivo(p_usuario_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario u WHERE u.id=p_usuario_id AND u.activo
    AND (u.rol::text='ADMIN' OR (u.rol::text IN ('GENERAL','VALIDADOR')
      AND EXISTS (SELECT 1 FROM public.usuario_acceso_recoleccion a WHERE a.usuario_id=u.id AND a.revocado_en IS NULL))))
$$;
CREATE OR REPLACE FUNCTION public.m1_acceso_recibo(p_c public.recoleccion_acceso_comando,p_recuperar boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('http_status',CASE WHEN p_recuperar THEN 200 ELSE p_c.http_terminal END,
    'body',jsonb_build_object('comando_id',p_c.comando_id,'operacion',p_c.operacion,'estado',p_c.estado,
      'resultado',p_c.resultado,'error',p_c.error,
      'finalizado_en',to_char(p_c.finalizado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
$$;

CREATE OR REPLACE FUNCTION public.m1_acceso_leer(
  p_actor_id bigint,p_auth_id text,p_usuario_id bigint,p_antes_de_id bigint DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.usuario%ROWTYPE; u public.usuario%ROWTYPE; n bigint; filas jsonb; vigente jsonb;
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
  SELECT jsonb_build_object('id',v.id::text,'otorgado_en',v.otorgado_en,'otorgado_por',v.otorgado_por::text)
    INTO vigente FROM public.usuario_acceso_recoleccion v WHERE v.usuario_id=u.id AND v.revocado_en IS NULL;
  SELECT coalesce(jsonb_agg(fila ORDER BY id DESC),'[]'::jsonb) INTO filas FROM (
    SELECT h.id,jsonb_build_object('id',h.id::text,'evento',h.evento,'acceso_id',h.acceso_id::text,
      'actor_id',h.actor_id::text,'revision_anterior',h.revision_anterior::text,'revision_nueva',h.revision_nueva::text,
      'motivo',h.motivo,'creado_en',h.creado_en,'comando_id',c.comando_id,
      'otorgado_en',v.otorgado_en,'revocado_en',v.revocado_en) fila
    FROM public.usuario_acceso_recoleccion_historial h
    JOIN public.recoleccion_acceso_comando c ON c.id=h.comando_id
    JOIN public.usuario_acceso_recoleccion v ON v.id=h.acceso_id
    WHERE h.usuario_id=u.id AND (p_antes_de_id IS NULL OR h.id<p_antes_de_id)
    ORDER BY h.id DESC LIMIT p_limite+1
  ) t;
  RETURN jsonb_build_object('http_status',200,'body',jsonb_build_object('data',jsonb_build_object(
    'usuario_id',u.id::text,'rol_global',u.rol::text,'activo',u.activo,
    'revision_acceso',coalesce((SELECT revision FROM public.usuario_acceso_recoleccion_revision WHERE usuario_id=u.id),0)::text,
    'revision_autoridad',u.revision_autoridad::text,
    'acceso_explicito',vigente IS NOT NULL,'acceso_efectivo',public.m1_acceso_efectivo(u.id),
    'origen',CASE WHEN u.activo AND u.rol::text='ADMIN' THEN 'ADMIN' WHEN public.m1_acceso_efectivo(u.id) THEN 'EXPLICITO' ELSE 'SIN_ACCESO' END,
    'capacidades',jsonb_build_object('crear',public.m1_acceso_efectivo(u.id),'mantener_propias',public.m1_acceso_efectivo(u.id),
      'confirmar_propias',false,'desechar',u.activo AND u.rol::text='ADMIN'),
    'vigencia_actual',vigente,'historial',CASE WHEN jsonb_array_length(filas)>p_limite THEN filas-p_limite ELSE filas END,
    'siguiente_antes_de_id',CASE WHEN jsonb_array_length(filas)>p_limite THEN filas->(p_limite-1)->>'id' ELSE NULL END),
    'observado_en',clock_timestamp()));
END $$;

CREATE OR REPLACE FUNCTION public.m1_acceso_ejecutar(
  p_actor_id bigint,p_auth_id text,p_operacion text,p_comando_id uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.usuario%ROWTYPE; u public.usuario%ROWTYPE; c public.recoleccion_acceso_comando%ROWTYPE;
  n bigint; destino bigint; rev bigint; anterior boolean; nuevo boolean; cambio boolean; acceso bigint;
  intencion jsonb; resultado jsonb; err jsonb; detalle text; fecha timestamptz; http integer;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  IF p_operacion IS NULL OR p_operacion NOT IN ('OTORGAR_ACCESO_RECOLECCION','RETIRAR_ACCESO_RECOLECCION')
    OR p_comando_id IS NULL OR p_comando_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no es válida.',p_comando_id);
  END IF;
  IF (p_payload-ARRAY['usuario_destino_id','revision_esperada','motivo'])<>'{}'::jsonb THEN
    RETURN public.pa_c_fuera(422,'CAMPO_NO_PERMITIDO','Hay campos no permitidos.',p_comando_id);
  END IF;
  IF NOT public.pa_c_decimal(p_payload->'usuario_destino_id') OR NOT public.pa_c_decimal(p_payload->'revision_esperada',true)
    OR jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string'
    OR char_length(normalize(btrim(p_payload->>'motivo'),NFC)) NOT BETWEEN 3 AND 1000 THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no es válida.',p_comando_id);
  END IF;
  intencion:=p_payload||jsonb_build_object('motivo',normalize(btrim(p_payload->>'motivo'),NFC));
  destino:=(intencion->>'usuario_destino_id')::bigint;
  -- Cuentas ASC, destino UPDATE: mismo protocolo de 072 para rol/baja.
  -- Toda escritura M1 adquiere SHARE del actor antes de bloquear la ficha.
  FOR n IN SELECT DISTINCT x FROM unnest(ARRAY[p_actor_id,destino]) x ORDER BY x LOOP
    IF n=destino THEN PERFORM 1 FROM public.usuario WHERE id=n FOR UPDATE;
    ELSE PERFORM 1 FROM public.usuario WHERE id=n FOR SHARE; END IF;
  END LOOP;
  SELECT * INTO a FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id); END IF;
  IF NOT a.activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('m1:acceso:'||p_actor_id||':'||p_comando_id,0));
  SELECT * INTO c FROM public.recoleccion_acceso_comando WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  IF FOUND THEN
    IF c.operacion<>p_operacion OR c.intencion<>intencion THEN
      RETURN public.pa_c_fuera(409,'COMANDO_REUTILIZADO','La clave corresponde a otra intención.',p_comando_id,'MISMA_CLAVE');
    END IF;
    RETURN public.m1_acceso_recibo(c);
  END IF;
  BEGIN
    IF a.rol::text<>'ADMIN' THEN PERFORM public.pa_c_rechazar(403,'CAPACIDAD_INSUFICIENTE','Solo ADMIN administra M1.'); END IF;
    SELECT * INTO u FROM public.usuario WHERE id=destino;
    IF NOT FOUND THEN PERFORM public.pa_c_rechazar(404,'RECURSO_NO_VISIBLE','La cuenta no está disponible.'); END IF;
    rev:=coalesce((SELECT revision FROM public.usuario_acceso_recoleccion_revision WHERE usuario_id=destino),0);
    IF rev<>(intencion->>'revision_esperada')::bigint THEN
      PERFORM public.pa_c_rechazar(409,'REVISION_OBSOLETA','Cambió el acceso; consulte y confirme otra intención.');
    END IF;
    IF p_operacion='OTORGAR_ACCESO_RECOLECCION' AND (NOT u.activo OR u.rol::text NOT IN ('GENERAL','VALIDADOR')) THEN
      PERFORM public.pa_c_rechazar(409,'DESTINO_NO_ELEGIBLE','Se requiere cuenta activa GENERAL o VALIDADOR; ADMIN tiene acceso derivado.');
    END IF;
    SELECT id INTO acceso FROM public.usuario_acceso_recoleccion WHERE usuario_id=destino AND revocado_en IS NULL;
    anterior:=acceso IS NOT NULL; nuevo:=p_operacion='OTORGAR_ACCESO_RECOLECCION'; cambio:=anterior<>nuevo;
    IF cambio AND rev=9223372036854775807 THEN PERFORM public.pa_c_rechazar(409,'REVISION_OBSOLETA','La revisión no admite más cambios.'); END IF;
    resultado:=jsonb_build_object('tipo','ACCESO_RECOLECCION','usuario_id',destino::text,
      'acceso_explicito_anterior',anterior,'acceso_explicito_nuevo',nuevo,
      'revision_anterior',rev::text,'revision_nueva',(rev+CASE WHEN cambio THEN 1 ELSE 0 END)::text,
      'cambio',CASE WHEN cambio THEN 'CAMBIO_APLICADO' ELSE 'SIN_CAMBIOS' END);
    fecha:=clock_timestamp();
    INSERT INTO public.recoleccion_acceso_comando(actor_id,comando_id,operacion,intencion,estado,resultado,http_terminal,finalizado_en)
      VALUES(p_actor_id,p_comando_id,p_operacion,intencion,'CONFIRMADO',resultado,200,fecha) RETURNING * INTO c;
    IF cambio THEN
      IF nuevo THEN
        INSERT INTO public.usuario_acceso_recoleccion(usuario_id,otorgado_en,otorgado_por,comando_otorgamiento_id)
          VALUES(destino,fecha,p_actor_id,c.id) RETURNING id INTO acceso;
      ELSE
        UPDATE public.usuario_acceso_recoleccion SET revocado_en=fecha,revocado_por=p_actor_id,comando_retiro_id=c.id WHERE id=acceso;
      END IF;
      INSERT INTO public.usuario_acceso_recoleccion_revision(usuario_id,revision) VALUES(destino,rev+1)
        ON CONFLICT(usuario_id) DO UPDATE SET revision=excluded.revision;
      INSERT INTO public.usuario_acceso_recoleccion_historial(usuario_id,actor_id,comando_id,acceso_id,evento,revision_anterior,revision_nueva,motivo,creado_en)
        VALUES(destino,p_actor_id,c.id,acceso,CASE WHEN nuevo THEN 'ACCESO_OTORGADO' ELSE 'ACCESO_RETIRADO' END,rev,rev+1,intencion->>'motivo',fecha);
    END IF;
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    GET STACKED DIAGNOSTICS detalle=PG_EXCEPTION_DETAIL;
    err:=detalle::jsonb; http:=(err->>'http_status')::integer;
    INSERT INTO public.recoleccion_acceso_comando(actor_id,comando_id,operacion,intencion,estado,error,http_terminal)
      VALUES(p_actor_id,p_comando_id,p_operacion,intencion,'RECHAZADO',err->'error',http) RETURNING * INTO c;
  END;
  RETURN public.m1_acceso_recibo(c);
END $$;

CREATE OR REPLACE FUNCTION public.m1_acceso_recuperar(p_actor_id bigint,p_auth_id text,p_comando_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.usuario%ROWTYPE; c public.recoleccion_acceso_comando%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id); END IF;
  IF NOT a.activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  SELECT * INTO c FROM public.recoleccion_acceso_comando WHERE actor_id=p_actor_id AND comando_id=p_comando_id;
  IF FOUND THEN RETURN public.m1_acceso_recibo(c,true); END IF;
  RETURN jsonb_build_object('http_status',202,'body',jsonb_build_object('comando_id',p_comando_id,'estado','SIN_RESULTADO',
    'resultado',NULL,'error',NULL,'finalizado_en',NULL));
END $$;

CREATE OR REPLACE FUNCTION public.m1_vigencia_proteger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Las vigencias M1 no se borran.'; END IF;
  IF OLD.revocado_en IS NOT NULL OR NEW.revocado_en IS NULL
    OR (to_jsonb(NEW)-ARRAY['revocado_en','revocado_por','comando_retiro_id'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revocado_en','revocado_por','comando_retiro_id']) THEN
    RAISE EXCEPTION 'Solo se permite cerrar una vigencia M1 abierta.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS m1_vigencia_inmutable ON public.usuario_acceso_recoleccion;
CREATE TRIGGER m1_vigencia_inmutable BEFORE UPDATE OR DELETE ON public.usuario_acceso_recoleccion
  FOR EACH ROW EXECUTE FUNCTION public.m1_vigencia_proteger();
DROP TRIGGER IF EXISTS m1_vigencia_no_truncate ON public.usuario_acceso_recoleccion;
CREATE TRIGGER m1_vigencia_no_truncate BEFORE TRUNCATE ON public.usuario_acceso_recoleccion
  EXECUTE FUNCTION public.fn_subcampania_historial_prevent_mutation();
DO $$ DECLARE t text; f record; col record; seq text; BEGIN
  FOREACH t IN ARRAY ARRAY['recoleccion_acceso_comando','usuario_acceso_recoleccion_revision','usuario_acceso_recoleccion','usuario_acceso_recoleccion_historial'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',col.attname,t);
    END LOOP;
    seq:=NULL;
    IF t<>'usuario_acceso_recoleccion_revision' THEN seq:=pg_get_serial_sequence('public.'||t,'id'); END IF;
    IF seq IS NOT NULL THEN EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated,service_role',seq); END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['recoleccion_acceso_comando','usuario_acceso_recoleccion_historial'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS m1_terminal_inmutable ON public.%I',t);
    EXECUTE format('CREATE TRIGGER m1_terminal_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.fn_subcampania_historial_prevent_mutation()',t);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('m1_acceso_efectivo','m1_acceso_recibo','m1_acceso_leer','m1_acceso_ejecutar','m1_acceso_recuperar','m1_vigencia_proteger') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.m1_acceso_efectivo(bigint),public.m1_acceso_leer(bigint,text,bigint,bigint,integer),
  public.m1_acceso_ejecutar(bigint,text,text,uuid,jsonb),public.m1_acceso_recuperar(bigint,text,uuid) TO service_role;
DO $$ DECLARE t text; r text; f record; BEGIN
  FOREACH t IN ARRAY ARRAY['recoleccion_acceso_comando','usuario_acceso_recoleccion_revision','usuario_acceso_recoleccion','usuario_acceso_recoleccion_historial'] LOOP
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_any_column_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') OR
        has_table_privilege(r,'public.'||t,'DELETE,TRUNCATE,TRIGGER') THEN
        RAISE EXCEPTION 'T1_PRIVILEGIO_TABLA_INESPERADO: % %',r,t;
      END IF;
    END LOOP;
  END LOOP;
  FOR f IN SELECT p.oid,p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('m1_acceso_efectivo','m1_acceso_recibo','m1_acceso_leer','m1_acceso_ejecutar','m1_acceso_recuperar','m1_vigencia_proteger') LOOP
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'T1_PRIVILEGIO_FUNCION_INESPERADO: %',f.firma;
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
