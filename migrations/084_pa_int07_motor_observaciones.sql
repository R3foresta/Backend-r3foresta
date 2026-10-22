-- PA-T-INT07: motor/recuperación y corrección de observaciones.
-- Requiere 068–083 cotejadas. No habilita participantes, cantidad ni reversiones.
-- Los originales y el recibo inicial se conservan; solo avanza revision_registro.
-- No ejecutar 082 de nuevo tras este paso: sus ACL documentan el corte de solo lectura.
-- 084 es el siguiente número local en este corte; aplicación/cotejo remoto pendientes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ DECLARE firma TEXT; BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.pa_c_replay(bigint,text,text,uuid,bytea)',
    'public.pa_c_recibo(public.participacion_comando,boolean)',
    'public.pa_c_rechazar(integer,text,text)',
    'public.pa_lecturas_actor(bigint,text)',
    'public.pa_registro_detalle_propio_leer(bigint,text,bigint)',
    'public.pa_int07_persistencia_validar()',
    'public.pa_int07_persistencia_terminal()'] LOOP
    IF to_regprocedure(firma) IS NULL THEN
      RAISE EXCEPTION 'PA_INT07_MOTOR_ANTECEDENTE_INCOMPLETO: %',firma;
    END IF;
  END LOOP;
  IF to_regclass('public.registro_plantacion_correccion') IS NULL
    OR to_regclass('public.registro_plantacion_efectivo') IS NULL
    OR to_regclass('public.registro_plantacion_grupo_revision') IS NULL THEN
    RAISE EXCEPTION 'PA_INT07_MOTOR_REQUIERE_082';
  END IF;
END $$;

-- Cuerpos y metadata de las redefiniciones conocidas; los hashes se calculan
-- sobre prosrc (no sobre OID/pg_get_functiondef dependiente del servidor).
-- Acepta solo 072/081 o esta084; no repara una función expuesta o reemplazada.
DO $$ DECLARE r RECORD; p RECORD; rol TEXT; t TEXT; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.pa_correccion_ejecutar(bigint,text,text,uuid,jsonb,text)',NULL::text,'3719568bd548d9376dc5362aa20c2529',true),
    ('public.pa_correccion_contexto_leer(bigint,text,bigint)',NULL,'3e451420f51ecc0d1e0c3d1f52d7b7d8',true),
    ('public.pa_correccion_historial_leer(bigint,text,bigint,bigint,integer)',NULL,'c6eeefaaf6f9231505c634efb481a53c',true),
    ('public.pa_comando_recuperar(bigint,text,text,uuid)','1b807bf3eae44827f22273ccfa11369d','41923c052e2ad651f954e4770a7917b0',false),
    ('public.pa_registro_detalle_propio_leer(bigint,text,bigint)','36c57b6476c3f2ead58202fb4e9ab078','50b09f9f93cd7cbddd679395afcf937c',false))
    e(firma,previo,propio,nueva) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.firma);
    IF FOUND THEN
      IF md5(p.prosrc) IS DISTINCT FROM r.propio AND md5(p.prosrc) IS DISTINCT FROM r.previo
        OR p.prosecdef OR p.prokind<>'f' OR p.provolatile<>'v'
        OR p.proretset OR p.proisstrict OR p.proparallel<>'u'
        OR p.proleakproof OR p.proargmodes IS NOT NULL
        OR p.pronargdefaults<>(CASE WHEN r.firma LIKE 'public.pa_correccion_historial_leer(%' THEN 2 ELSE 0 END)
        OR (p.pronargdefaults=2 AND pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM 'NULL::bigint, 20')
        OR p.prorettype<>'jsonb'::regtype
        OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
        OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
        OR p.proconfig IS DISTINCT FROM (CASE WHEN r.nueva THEN
          ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[]
          ELSE ARRAY['search_path=pg_catalog, public']::text[] END) THEN
        RAISE EXCEPTION 'PA_INT07_MOTOR_FUNCION_INCOMPATIBLE: %',r.firma;
      END IF;
      IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
        RAISE EXCEPTION 'PA_INT07_MOTOR_FUNCION_PUBLICA: %',r.firma;
      END IF;
      FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_function_privilege(rol,p.oid,'EXECUTE') THEN
          RAISE EXCEPTION 'PA_INT07_MOTOR_FUNCION_PRIVILEGIO_PREEXISTENTE: %.%',rol,r.firma;
        END IF;
      END LOOP;
    ELSIF NOT r.nueva THEN
      RAISE EXCEPTION 'PA_INT07_MOTOR_FUNCION_AUSENTE: %',r.firma;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['registro_plantacion_correccion','registro_plantacion_efectivo',
    'registro_plantacion_grupo_revision'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t)
      AND relkind='r' AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND relrowsecurity AND NOT relforcerowsecurity)
      OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.'||t)) THEN
      RAISE EXCEPTION 'PA_INT07_MOTOR_TABLA_INCOMPATIBLE: %',t;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_any_column_privilege(rol,'public.'||t,'SELECT,INSERT,UPDATE,REFERENCES')
        OR has_table_privilege(rol,'public.'||t,'DELETE,TRUNCATE,TRIGGER') THEN
        RAISE EXCEPTION 'PA_INT07_MOTOR_TABLA_PRIVILEGIO_PREEXISTENTE: %.%',rol,t;
      END IF;
    END LOOP;
    IF current_setting('server_version_num')::integer>=170000 THEN
      FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_table_privilege(rol,'public.'||t,'MAINTAIN') THEN
          RAISE EXCEPTION 'PA_INT07_MOTOR_MAINTAIN_PREEXISTENTE: %.%',rol,t;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Coteja el CHECK conocido antes de extenderlo. Un rerun acepta su resultado
-- propio, pero no sustituye silenciosamente un catálogo de operaciones ajeno.
CREATE TEMP TABLE pa_int07_084_checks (
  operacion TEXT,estado TEXT,resultado JSONB,
  CONSTRAINT op_anterior CHECK (operacion IN (
    'REGISTRAR_PLANTACION_INICIAL','OTORGAR_PLANTADOR','RETIRAR_PLANTADOR',
    'DESIGNAR_ADMINISTRADOR','CAMBIAR_ADMINISTRADOR_A_PLANTADOR','RETIRAR_ADMINISTRADOR',
    'REEMPLAZAR_ADMINISTRADOR','CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA',
    'INICIALIZAR_PARTICIPACION_LEGADA')),
  CONSTRAINT op_nueva CHECK (operacion IN (
    'REGISTRAR_PLANTACION_INICIAL','OTORGAR_PLANTADOR','RETIRAR_PLANTADOR',
    'DESIGNAR_ADMINISTRADOR','CAMBIAR_ADMINISTRADOR_A_PLANTADOR','RETIRAR_ADMINISTRADOR',
    'REEMPLAZAR_ADMINISTRADOR','CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA',
    'INICIALIZAR_PARTICIPACION_LEGADA','CORREGIR_OBSERVACIONES_PLANTACION')),
  CONSTRAINT tipo_anterior CHECK (
    estado<>'CONFIRMADO' OR COALESCE(resultado->>'tipo'=CASE
      WHEN operacion='REGISTRAR_PLANTACION_INICIAL' THEN 'PLANTACION_INICIAL'
      WHEN operacion='CAMBIAR_ROL_GLOBAL' THEN 'ROL_GLOBAL'
      WHEN operacion='INACTIVAR_CUENTA' THEN 'CUENTA_INACTIVADA'
      WHEN operacion='INICIALIZAR_PARTICIPACION_LEGADA' THEN 'INICIALIZACION_PARTICIPACION_LEGADA'
      ELSE 'ACCESO' END,false)),
  CONSTRAINT tipo_nuevo CHECK (
    estado<>'CONFIRMADO' OR COALESCE(resultado->>'tipo'=CASE
      WHEN operacion='REGISTRAR_PLANTACION_INICIAL' THEN 'PLANTACION_INICIAL'
      WHEN operacion='CAMBIAR_ROL_GLOBAL' THEN 'ROL_GLOBAL'
      WHEN operacion='INACTIVAR_CUENTA' THEN 'CUENTA_INACTIVADA'
      WHEN operacion='INICIALIZAR_PARTICIPACION_LEGADA' THEN 'INICIALIZACION_PARTICIPACION_LEGADA'
      WHEN operacion='CORREGIR_OBSERVACIONES_PLANTACION' THEN 'CORRECCION_PLANTACION'
      ELSE 'ACCESO' END,false))
) ON COMMIT DROP;
DO $$ DECLARE r RECORD; actual TEXT; anterior TEXT; nuevo TEXT; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('participacion_comando_operacion_ck','op_anterior','op_nueva'),
    ('participacion_comando_resultado_tipo_ck','tipo_anterior','tipo_nuevo'))
    e(nombre,previa,nueva) LOOP
    SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
      WHERE conrelid='public.participacion_comando'::regclass AND conname=r.nombre AND convalidated;
    SELECT pg_get_constraintdef(oid) INTO anterior FROM pg_constraint
      WHERE conrelid='pg_temp.pa_int07_084_checks'::regclass AND conname=r.previa;
    SELECT pg_get_constraintdef(oid) INTO nuevo FROM pg_constraint
      WHERE conrelid='pg_temp.pa_int07_084_checks'::regclass AND conname=r.nueva;
    IF actual IS NULL OR actual NOT IN(anterior,nuevo) THEN
      RAISE EXCEPTION 'PA_INT07_MOTOR_CHECK_INCOMPATIBLE: %',r.nombre;
    END IF;
    IF actual<>nuevo THEN
      EXECUTE format('ALTER TABLE public.participacion_comando DROP CONSTRAINT %I',r.nombre);
      EXECUTE format('ALTER TABLE public.participacion_comando ADD CONSTRAINT %I %s',r.nombre,nuevo);
    END IF;
  END LOOP;
END $$;

-- Observaciones son una intención plana: exige exactamente los bytes compactos
-- del canonicalizador TS. No altera PA-COMANDO/1 ni bytes de operaciones previas.
CREATE OR REPLACE FUNCTION public.pa_correccion_ejecutar(
  p_actor_id BIGINT,p_auth_id TEXT,p_operacion TEXT,p_comando_id UUID,
  p_payload JSONB,p_contenido_canonico TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE
  v_actor public.usuario%ROWTYPE; v_registro public.registro_plantacion%ROWTYPE;
  v_sub public.subcampania%ROWTYPE; v_efectivo public.registro_plantacion_efectivo%ROWTYPE;
  v_comando public.participacion_comando%ROWTYPE;
  v_sub_id BIGINT; v_grupo_id BIGINT; v_id BIGINT; v_correccion_id BIGINT;
  v_revision_grupo BIGINT; v_revision_nueva BIGINT;
  v_huella BYTEA; v_replay JSONB; v_resultado JSONB; v_error JSONB; v_detalle TEXT;
  v_canon TEXT; v_anterior TEXT; v_nuevo TEXT; v_cambio BOOLEAN; v_contextual BOOLEAN;
  v_instante TIMESTAMPTZ; v_http INTEGER;
  v_trim TEXT:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' '||chr(160)||chr(5760)
    ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)
    ||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)
    ||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
  IF p_operacion IS DISTINCT FROM 'CORREGIR_OBSERVACIONES_PLANTACION'
    OR p_comando_id IS NULL
    OR p_comando_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no cumple el contrato v1.',p_comando_id);
  END IF;
  IF (p_payload-ARRAY['registro_plantacion_id','revision_esperada','motivo','observaciones'])<>'{}'::jsonb THEN
    RETURN public.pa_c_fuera(422,'CAMPO_NO_PERMITIDO','La entrada contiene campos no permitidos.',p_comando_id);
  END IF;
  IF NOT public.pa_c_decimal(p_payload->'registro_plantacion_id')
    OR NOT public.pa_c_decimal(p_payload->'revision_esperada',true)
    OR jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string'
    OR char_length(p_payload->>'motivo') NOT BETWEEN 3 AND 1000
    OR p_payload->>'motivo' IS DISTINCT FROM normalize(btrim(p_payload->>'motivo',v_trim),NFC)
    OR NOT (p_payload?'observaciones')
    OR jsonb_typeof(p_payload->'observaciones') NOT IN('null','string')
    OR (jsonb_typeof(p_payload->'observaciones')='string' AND (
      char_length(p_payload->>'observaciones') NOT BETWEEN 1 AND 2000
      OR p_payload->>'observaciones' IS DISTINCT FROM normalize(btrim(p_payload->>'observaciones',v_trim),NFC))) THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no cumple el contrato v1.',p_comando_id);
  END IF;
  v_canon:='{"motivo":'||(p_payload->'motivo')::text
    ||',"observaciones":'||(p_payload->'observaciones')::text
    ||',"registro_plantacion_id":'||(p_payload->'registro_plantacion_id')::text
    ||',"revision_esperada":'||(p_payload->'revision_esperada')::text||'}';
  IF p_contenido_canonico IS DISTINCT FROM v_canon THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','El contenido canónico no corresponde a la intención.',p_comando_id);
  END IF;
  v_huella:=sha256(convert_to('PA-COMANDO/1'||chr(10)||p_operacion||chr(10)||v_canon,'UTF8'));
  -- El terminal propio conserva prioridad antes de consultar el objeto actual.
  v_replay:=public.pa_c_replay(p_actor_id,p_auth_id,p_operacion,p_comando_id,v_huella);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_actor FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id,'RECUPERAR_SESION'); END IF;
  IF NOT v_actor.activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  -- Localización previa sin autoridad; el scope y el grupo se releen bajo lock.
  SELECT subcampania_id,CASE WHEN es_reposicion THEN registro_plantacion_origen_id ELSE id END
    INTO v_sub_id,v_grupo_id FROM public.registro_plantacion
    WHERE id=(p_payload->>'registro_plantacion_id')::bigint;
  SELECT * INTO v_sub FROM public.subcampania WHERE id=v_sub_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('pa:comando:'||p_actor_id||':'||p_operacion||':'||p_comando_id,0));
  SELECT * INTO v_comando FROM public.participacion_comando
    WHERE actor_id=p_actor_id AND operacion=p_operacion AND comando_id=p_comando_id FOR UPDATE;
  IF FOUND THEN
    IF v_comando.huella IS DISTINCT FROM v_huella THEN
      RETURN public.pa_c_fuera(409,'COMANDO_REUTILIZADO','La clave ya corresponde a otro contenido.',p_comando_id,'MISMA_CLAVE');
    END IF;
    RETURN public.pa_c_recibo(v_comando);
  END IF;
  PERFORM 1 FROM public.subcampania_permiso_revision
    WHERE subcampania_id=v_sub_id AND usuario_id=p_actor_id FOR SHARE;
  PERFORM 1 FROM public.subcampania_permiso
    WHERE subcampania_id=v_sub_id AND usuario_id=p_actor_id ORDER BY id FOR SHARE;
  v_contextual:=EXISTS(SELECT 1 FROM public.subcampania_permiso
    WHERE subcampania_id=v_sub_id AND usuario_id=p_actor_id AND revocado_en IS NULL
      AND rol_contextual::text='ADMINISTRADOR_SUBCAMPANIA');
  -- Todas las filas originales afectadas por ID estable, antes del overlay.
  PERFORM 1 FROM public.registro_plantacion
    WHERE id IN((p_payload->>'registro_plantacion_id')::bigint,v_grupo_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_registro FROM public.registro_plantacion
    WHERE id=(p_payload->>'registro_plantacion_id')::bigint;
  SELECT * INTO v_efectivo FROM public.registro_plantacion_efectivo WHERE registro_plantacion_id=v_registro.id FOR UPDATE;
  SELECT revision_grupo INTO v_revision_grupo FROM public.registro_plantacion_grupo_revision
    WHERE grupo_registro_id=v_grupo_id;
  v_revision_grupo:=coalesce(v_revision_grupo,0);
  BEGIN
    IF v_registro.id IS NULL OR v_sub.id IS NULL OR v_sub.deleted_at IS NOT NULL
      OR v_registro.subcampania_id IS DISTINCT FROM v_sub_id
      OR (CASE WHEN v_registro.es_reposicion THEN v_registro.registro_plantacion_origen_id ELSE v_registro.id END) IS DISTINCT FROM v_grupo_id
      OR NOT EXISTS(SELECT 1 FROM public.campania WHERE id=v_sub.campania_id AND deleted_at IS NULL)
      OR (v_actor.rol::text<>'ADMIN' AND NOT v_contextual) THEN
      PERFORM public.pa_c_rechazar(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
    END IF;
    IF v_actor.rol::text<>'ADMIN' THEN
      PERFORM public.pa_c_rechazar(403,'CAPACIDAD_INSUFICIENTE','No dispone de esta capacidad.');
    END IF;
    IF v_sub.estado::text<>'ACTIVA' THEN
      PERFORM public.pa_c_rechazar(409,'SUBCAMPANIA_NO_OPERATIVA','La subcampaña no está operativa.');
    END IF;
    IF v_efectivo.estado='REVERTIDO' THEN
      PERFORM public.pa_c_rechazar(409,'OBJETO_YA_REVERTIDO','El objeto ya fue revertido.');
    END IF;
    IF v_registro.revision_registro<>(p_payload->>'revision_esperada')::bigint THEN
      PERFORM public.pa_c_rechazar(409,'REVISION_OBSOLETA','La revisión cambió; vuelva a leer el contexto.');
    END IF;
    v_anterior:=CASE WHEN v_efectivo.registro_plantacion_id IS NULL THEN v_registro.observaciones ELSE v_efectivo.observaciones_efectivas END;
    v_nuevo:=p_payload->>'observaciones';
    v_cambio:=v_anterior IS DISTINCT FROM v_nuevo;
    v_revision_nueva:=v_registro.revision_registro+CASE WHEN v_cambio THEN 1 ELSE 0 END;
    v_instante:=clock_timestamp();
    IF v_cambio THEN
      v_correccion_id:=nextval(pg_get_serial_sequence('public.registro_plantacion_correccion','id'));
    END IF;
    v_resultado:=jsonb_build_object('tipo','CORRECCION_PLANTACION','correccion_id',v_correccion_id::text,
      'registro_plantacion_id',v_registro.id::text,'subcampania_id',v_sub_id::text,'caso','OBSERVACIONES',
      'revision_anterior',v_registro.revision_registro::text,'revision_nueva',v_revision_nueva::text,
      'revision_grupo_anterior',v_revision_grupo::text,'revision_grupo_nueva',v_revision_grupo::text,
      'cambio',CASE WHEN v_cambio THEN 'CAMBIO_APLICADO' ELSE 'SIN_CAMBIOS' END,
      'estado_logico','VIGENTE','registro_vigente_id',NULL);
    INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,resultado,http_terminal,creado_en,finalizado_en)
      VALUES(p_actor_id,p_operacion,p_comando_id,v_huella,'CONFIRMADO',v_resultado,200,v_instante,v_instante)
      RETURNING * INTO v_comando;
    IF v_cambio THEN
      INSERT INTO public.registro_plantacion_correccion(id,comando_interno_id,actor_id,actor_nombre_snapshot,
        subcampania_id,grupo_registro_id,registro_plantacion_id,caso,motivo,anterior,nuevo,
        revision_anterior,revision_nueva,revision_grupo_anterior,revision_grupo_nueva,creado_en)
      VALUES(v_correccion_id,v_comando.id,p_actor_id,v_actor.nombre,v_sub_id,v_grupo_id,v_registro.id,
        'OBSERVACIONES',p_payload->>'motivo',jsonb_build_object('observaciones',v_anterior),
        jsonb_build_object('observaciones',v_nuevo),v_registro.revision_registro,v_revision_nueva,
        v_revision_grupo,v_revision_grupo,v_instante);
      UPDATE public.registro_plantacion SET revision_registro=v_revision_nueva WHERE id=v_registro.id;
      IF v_efectivo.registro_plantacion_id IS NULL THEN
        INSERT INTO public.registro_plantacion_efectivo(registro_plantacion_id,subcampania_id,cantidad_efectiva,
          observaciones_efectivas,ultima_correccion_id)
        VALUES(v_registro.id,v_sub_id,v_registro.cantidad_total_plantada,v_nuevo,v_correccion_id);
      ELSE
        UPDATE public.registro_plantacion_efectivo SET observaciones_efectivas=v_nuevo,ultima_correccion_id=v_correccion_id
          WHERE registro_plantacion_id=v_registro.id;
      END IF;
    END IF;
  EXCEPTION WHEN SQLSTATE 'PZ001' THEN
    GET STACKED DIAGNOSTICS v_detalle=PG_EXCEPTION_DETAIL;
    v_error:=v_detalle::jsonb; v_http:=(v_error->>'http_status')::integer;
    -- Solo los rechazos explícitos de negocio son durables. Locks, restricciones
    -- inesperadas y fallos de infraestructura revierten todo y conservan incertidumbre.
    v_instante:=clock_timestamp();
    INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,error,http_terminal,creado_en,finalizado_en)
      VALUES(p_actor_id,p_operacion,p_comando_id,v_huella,'RECHAZADO',v_error->'error',v_http,v_instante,v_instante)
      RETURNING * INTO v_comando;
  END;
  RETURN public.pa_c_recibo(v_comando);
END $$;

CREATE OR REPLACE FUNCTION public.pa_comando_recuperar(
  p_actor_id BIGINT,p_auth_id TEXT,p_operacion TEXT,p_comando_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v public.participacion_comando%ROWTYPE; v_activo BOOLEAN;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  IF p_operacion IS NULL OR p_operacion NOT IN ('REGISTRAR_PLANTACION_INICIAL',
    'OTORGAR_PLANTADOR','RETIRAR_PLANTADOR','DESIGNAR_ADMINISTRADOR',
    'CAMBIAR_ADMINISTRADOR_A_PLANTADOR','RETIRAR_ADMINISTRADOR','REEMPLAZAR_ADMINISTRADOR',
    'CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA','CORREGIR_OBSERVACIONES_PLANTACION') OR p_comando_id IS NULL
    OR p_comando_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no es válida.',p_comando_id);
  END IF;
  SELECT activo INTO v_activo FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id,'RECUPERAR_SESION'); END IF;
  IF NOT v_activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  SELECT * INTO v FROM public.participacion_comando
    WHERE actor_id=p_actor_id AND operacion=p_operacion AND comando_id=p_comando_id;
  IF NOT FOUND THEN
    RETURN public.pa_c_fuera(404,'COMANDO_NO_CONFIRMADO','No hay un resultado confirmado para esta clave.',p_comando_id,'MISMA_CLAVE');
  END IF;
  IF v.estado='PREPARADO' THEN
    RETURN jsonb_build_object('http_status',202,'body',jsonb_build_object(
      'comando_id',p_comando_id,'operacion',p_operacion,'estado','SIN_RESULTADO',
      'resultado',NULL,'error',NULL,'finalizado_en',NULL));
  END IF;
  RETURN public.pa_c_recibo(v,true);
END $$;

CREATE OR REPLACE FUNCTION public.pa_correccion_contexto_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_plantacion_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_rol TEXT; v RECORD; v_global BOOLEAN;
BEGIN
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id); v_global:=v_rol='ADMIN';
  SELECT r.*,s.campania_id,s.estado::text estado_subcampania,
    coalesce(e.estado,'VIGENTE') estado_logico,
    CASE WHEN e.registro_plantacion_id IS NULL THEN r.observaciones ELSE e.observaciones_efectivas END observaciones_efectivas,
    coalesce(g.revision_grupo,0) revision_grupo
    INTO v FROM public.registro_plantacion r JOIN public.subcampania s ON s.id=r.subcampania_id AND s.deleted_at IS NULL
    JOIN public.campania c ON c.id=s.campania_id AND c.deleted_at IS NULL
    LEFT JOIN public.registro_plantacion_efectivo e ON e.registro_plantacion_id=r.id
    LEFT JOIN public.registro_plantacion_grupo_revision g ON g.grupo_registro_id=CASE WHEN r.es_reposicion THEN r.registro_plantacion_origen_id ELSE r.id END
    WHERE r.id=p_registro_plantacion_id AND (v_global OR EXISTS(
      SELECT 1 FROM public.subcampania_permiso p WHERE p.subcampania_id=s.id AND p.usuario_id=p_actor_id
        AND p.revocado_en IS NULL AND p.rol_contextual::text='ADMINISTRADOR_SUBCAMPANIA'));
  IF NOT FOUND THEN PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.'); END IF;
  RETURN jsonb_build_object('data',jsonb_build_object('registro_plantacion_id',v.id::text,
    'subcampania_id',v.subcampania_id::text,'campania_id',v.campania_id::text,
    'estado_subcampania',v.estado_subcampania,'es_reposicion',v.es_reposicion,'estado_logico',v.estado_logico,
    'revision_registro',v.revision_registro::text,'revision_grupo',v.revision_grupo::text,
    'original',jsonb_build_object('observaciones',CASE WHEN v_global THEN v.observaciones ELSE NULL END),
    'efectivo',jsonb_build_object('observaciones',CASE WHEN v_global THEN v.observaciones_efectivas ELSE NULL END),
    'observaciones_visibles',v_global,'capacidades',jsonb_build_object('corregir_observaciones',
      v_global AND v.estado_subcampania='ACTIVA' AND v.estado_logico='VIGENTE')),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_correccion_historial_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_plantacion_id BIGINT,
  p_antes_id BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_contexto JSONB; v_global BOOLEAN; v_data JSONB; v_siguiente TEXT;
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 OR p_antes_id<=0 THEN
    PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','La paginación no es válida.');
  END IF;
  v_contexto:=public.pa_correccion_contexto_leer(p_actor_id,p_auth_id,p_registro_plantacion_id);
  v_global:=(v_contexto->'data'->>'observaciones_visibles')::boolean;
  WITH candidatos AS MATERIALIZED (
    SELECT c.* FROM public.registro_plantacion_correccion c
    WHERE c.registro_plantacion_id=p_registro_plantacion_id AND c.caso='OBSERVACIONES'
      AND (p_antes_id IS NULL OR c.id<p_antes_id) ORDER BY c.id DESC LIMIT p_limite+1
  ), pagina AS (SELECT * FROM candidatos ORDER BY id DESC LIMIT p_limite)
  SELECT coalesce(jsonb_agg(jsonb_build_object('correccion_id',id::text,'caso',caso,
    'actor',jsonb_build_object('usuario_id',actor_id::text,'nombre_snapshot',actor_nombre_snapshot),
    'fecha',to_char(creado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'revision_anterior',revision_anterior::text,'revision_nueva',revision_nueva::text,
    'revision_grupo_anterior',revision_grupo_anterior::text,'revision_grupo_nueva',revision_grupo_nueva::text,
    'motivo',CASE WHEN v_global THEN motivo ELSE NULL END,'observaciones_visibles',v_global,
    'antes',jsonb_build_object('observaciones',CASE WHEN v_global THEN anterior->>'observaciones' ELSE NULL END),
    'despues',jsonb_build_object('observaciones',CASE WHEN v_global THEN nuevo->>'observaciones' ELSE NULL END),
    'efectos_consumo','[]'::jsonb) ORDER BY id DESC),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM candidatos)>p_limite THEN min(id)::text ELSE NULL END
    INTO v_data,v_siguiente FROM pagina;
  RETURN jsonb_build_object('data',v_data,'siguiente_id',v_siguiente,
    'observado_en',v_contexto->>'observado_en');
END $$;

-- Conserva la forma exacta081. El original confirmado se lee en el recibo;
-- observaciones_autor posteriores exponen el overlay efectivo, incluido NULL.
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
      FROM public.registro_plantacion_coresponsable c WHERE c.registro_plantacion_id=p_registro_id AND c.usuario_id<>v.responsable_id
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
    'observaciones_autor',CASE WHEN v_autor THEN (
      SELECT CASE WHEN e.registro_plantacion_id IS NULL THEN v.observaciones ELSE e.observaciones_efectivas END
      FROM (SELECT 1) q LEFT JOIN public.registro_plantacion_efectivo e ON e.registro_plantacion_id=v.id
    ) ELSE NULL END),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

-- SECURITY INVOKER: DML acotado a historia/overlay y revisión, nunca DELETE.
-- service_role usa getAdminClient(); PUBLIC/anon/authenticated no obtienen acceso.
GRANT INSERT(id,comando_interno_id,actor_id,actor_nombre_snapshot,subcampania_id,
  grupo_registro_id,registro_plantacion_id,caso,motivo,anterior,nuevo,
  revision_anterior,revision_nueva,revision_grupo_anterior,revision_grupo_nueva,creado_en)
  ON public.registro_plantacion_correccion TO service_role;
GRANT INSERT(registro_plantacion_id,subcampania_id,cantidad_efectiva,observaciones_efectivas,ultima_correccion_id),
  UPDATE(observaciones_efectivas,ultima_correccion_id)
  ON public.registro_plantacion_efectivo TO service_role;
GRANT UPDATE(revision_registro) ON public.registro_plantacion TO service_role;
GRANT USAGE ON SEQUENCE public.registro_plantacion_correccion_id_seq TO service_role;
DO $$ DECLARE f RECORD; firma TEXT; rol TEXT; BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.pa_correccion_ejecutar(bigint,text,text,uuid,jsonb,text)',
    'public.pa_correccion_contexto_leer(bigint,text,bigint)',
    'public.pa_correccion_historial_leer(bigint,text,bigint,bigint,integer)',
    'public.pa_comando_recuperar(bigint,text,text,uuid)',
    'public.pa_registro_detalle_propio_leer(bigint,text,bigint)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',firma);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(rol,firma,'EXECUTE') THEN
        RAISE EXCEPTION 'PA_INT07_MOTOR_PRIVILEGIO_HEREDADO: %.%',rol,firma;
      END IF;
    END LOOP;
  END LOOP;
  -- No aceptar overloads ajenos como una segunda entrada inadvertida.
  FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('pa_correccion_ejecutar','pa_correccion_contexto_leer',
      'pa_correccion_historial_leer','pa_comando_recuperar','pa_registro_detalle_propio_leer')
      AND p.oid NOT IN('public.pa_correccion_ejecutar(bigint,text,text,uuid,jsonb,text)'::regprocedure,
        'public.pa_correccion_contexto_leer(bigint,text,bigint)'::regprocedure,
        'public.pa_correccion_historial_leer(bigint,text,bigint,bigint,integer)'::regprocedure,
        'public.pa_comando_recuperar(bigint,text,text,uuid)'::regprocedure,
        'public.pa_registro_detalle_propio_leer(bigint,text,bigint)'::regprocedure) LOOP
    RAISE EXCEPTION 'PA_INT07_MOTOR_OVERLOAD_INCOMPATIBLE: %',f.firma;
  END LOOP;
  FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(rol,'public.registro_plantacion_correccion','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(rol,'public.registro_plantacion_correccion','DELETE,TRUNCATE,TRIGGER')
      OR has_any_column_privilege(rol,'public.registro_plantacion_efectivo','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(rol,'public.registro_plantacion_efectivo','DELETE,TRUNCATE,TRIGGER')
      OR has_sequence_privilege(rol,'public.registro_plantacion_correccion_id_seq','SELECT,UPDATE,USAGE') THEN
      RAISE EXCEPTION 'PA_INT07_MOTOR_TABLA_PRIVILEGIO_HEREDADO: %',rol;
    END IF;
  END LOOP;
  IF has_table_privilege('service_role','public.registro_plantacion_correccion','UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_any_column_privilege('service_role','public.registro_plantacion_correccion','UPDATE,REFERENCES')
    OR has_table_privilege('service_role','public.registro_plantacion_efectivo','DELETE,TRUNCATE,TRIGGER,REFERENCES')
    OR has_any_column_privilege('service_role','public.registro_plantacion_efectivo','REFERENCES')
    OR has_sequence_privilege('service_role','public.registro_plantacion_correccion_id_seq','SELECT,UPDATE') THEN
    RAISE EXCEPTION 'PA_INT07_MOTOR_SERVICIO_PRIVILEGIO_EXCESIVO';
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
