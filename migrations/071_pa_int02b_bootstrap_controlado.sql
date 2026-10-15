-- PA-T-INT02-B / BE06. Solo infraestructura: instalar NO ejecuta el bootstrap.
-- Operacion de mantenimiento revisada, sin endpoint HTTP ni motor provisional.
-- El manifest real y cada persona/ambito requieren decision concreta de Pablo.
-- Ejecutar en una ventana coordinada antes del corte; continuidad ordinaria C/D.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.pa_inicializar_participacion_legada(
  p_actor_id BIGINT, p_comando_id UUID, p_manifest JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE
  v_ambito JSONB; v_persona JSONB; v_manifest JSONB; v_huella BYTEA;
  v_actor public.usuario%ROWTYPE; v_sub public.subcampania%ROWTYPE;
  v_comando public.participacion_comando%ROWTYPE;
  v_id BIGINT; v_usuario_id BIGINT; v_vigencia_id BIGINT; v_fecha TIMESTAMPTZ;
  v_resultado JSONB; v_resultados JSONB := '[]'; v_anterior JSONB; v_nuevo JSONB;
BEGIN
  IF p_actor_id IS NULL OR p_comando_id IS NULL OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
     OR p_manifest->'version' IS DISTINCT FROM '1'::jsonb
     OR jsonb_typeof(p_manifest->'ambitos') IS DISTINCT FROM 'array'
     OR (p_manifest - ARRAY['version','ambitos']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'PA_MANIFEST_INVALIDO' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_manifest->'ambitos') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'PA_MANIFEST_AMBITOS_INVALIDOS' USING ERRCODE='22023';
  END IF;
  FOR v_ambito IN SELECT value FROM jsonb_array_elements(p_manifest->'ambitos') LOOP
    IF jsonb_typeof(v_ambito) IS DISTINCT FROM 'object'
       OR (v_ambito - ARRAY['subcampania_id','estado_esperado','correspondencias']) <> '{}'::jsonb
       OR jsonb_typeof(v_ambito->'subcampania_id') IS DISTINCT FROM 'string'
       OR COALESCE(v_ambito->>'subcampania_id','') !~ '^[1-9][0-9]*$'
       OR COALESCE(v_ambito->>'estado_esperado','') NOT IN ('BORRADOR','ACTIVA','COMPLETADA','FINALIZADA_PARCIAL','CANCELADA')
       OR jsonb_typeof(v_ambito->'correspondencias') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'PA_MANIFEST_AMBITO_INVALIDO' USING ERRCODE='22023';
    END IF;
    v_id := (v_ambito->>'subcampania_id')::bigint;
    IF jsonb_array_length(v_ambito->'correspondencias') NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'PA_MANIFEST_PERSONAS_INVALIDAS' USING ERRCODE='22023';
    END IF;
    FOR v_persona IN SELECT value FROM jsonb_array_elements(v_ambito->'correspondencias') LOOP
      IF jsonb_typeof(v_persona) IS DISTINCT FROM 'object'
         OR (v_persona - ARRAY['usuario_id','permiso_propuesto','justificacion','fuente_legada','decision_revisor','revision_esperada']) <> '{}'::jsonb
         OR jsonb_typeof(v_persona->'usuario_id') IS DISTINCT FROM 'string'
         OR COALESCE(v_persona->>'usuario_id','') !~ '^[1-9][0-9]*$'
         OR COALESCE(v_persona->>'permiso_propuesto','') NOT IN ('PLANTADOR','ADMINISTRADOR_SUBCAMPANIA')
         OR jsonb_typeof(v_persona->'justificacion') IS DISTINCT FROM 'string'
         OR length(btrim(COALESCE(v_persona->>'justificacion',''))) NOT BETWEEN 3 AND 1000
         OR jsonb_typeof(v_persona->'fuente_legada') IS DISTINCT FROM 'string'
         OR length(btrim(COALESCE(v_persona->>'fuente_legada',''))) NOT BETWEEN 3 AND 1000
         OR v_persona->'revision_esperada' IS DISTINCT FROM '"0"'::jsonb
         OR jsonb_typeof(v_persona->'decision_revisor') IS DISTINCT FROM 'object'
         OR ((v_persona->'decision_revisor') - ARRAY['estado','revisor','referencia']) <> '{}'::jsonb
         OR v_persona->'decision_revisor'->>'estado' IS DISTINCT FROM 'APROBADA'
         OR v_persona->'decision_revisor'->>'revisor' IS DISTINCT FROM 'Pablo'
         OR jsonb_typeof(v_persona->'decision_revisor'->'referencia') IS DISTINCT FROM 'string'
         OR length(btrim(COALESCE(v_persona->'decision_revisor'->>'referencia',''))) NOT BETWEEN 3 AND 1000 THEN
        RAISE EXCEPTION 'PA_MANIFEST_CORRESPONDENCIA_NO_REVISADA_O_INVALIDA' USING ERRCODE='22023';
      END IF;
      v_usuario_id := (v_persona->>'usuario_id')::bigint;
      IF v_ambito->>'estado_esperado' IN ('COMPLETADA','FINALIZADA_PARCIAL','CANCELADA')
         AND v_persona->>'permiso_propuesto' <> 'ADMINISTRADOR_SUBCAMPANIA' THEN
        RAISE EXCEPTION 'PA_BOOTSTRAP_CERRADO_NO_ADMITE_PLANTADORES' USING ERRCODE='23514';
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_ambito->'correspondencias') p
               GROUP BY p->>'usuario_id' HAVING count(*)>1) THEN
      RAISE EXCEPTION 'PA_MANIFEST_PERSONA_DUPLICADA' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_ambito->'correspondencias') p
                   WHERE p->>'permiso_propuesto'='ADMINISTRADOR_SUBCAMPANIA') THEN
      RAISE EXCEPTION 'PA_BOOTSTRAP_REQUIERE_ADMINISTRADOR_CONTEXTUAL' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_manifest->'ambitos') a
             GROUP BY a->>'subcampania_id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'PA_MANIFEST_AMBITO_DUPLICADO' USING ERRCODE='23514';
  END IF;

  -- Huella operacional propia. No sustituye el canonicalizador HTTP PA-COMANDO/1.
  SELECT jsonb_build_object('version',1,'ambitos',jsonb_agg(
    (a - 'correspondencias') || jsonb_build_object('correspondencias',
      (SELECT jsonb_agg(p ORDER BY (p->>'usuario_id')::bigint)
       FROM jsonb_array_elements(a->'correspondencias') p))
    ORDER BY (a->>'subcampania_id')::bigint)) INTO v_manifest
  FROM jsonb_array_elements(p_manifest->'ambitos') a;
  v_huella := sha256(convert_to('PA-BOOTSTRAP/1' || chr(10) || v_manifest::text,'UTF8'));

  -- Mutex autoridad -> todas las cuentas ASC -> todos los ambitos ASC -> comando.
  PERFORM pg_advisory_xact_lock(hashtextextended('pa:autoridad_global:v1',0));
  FOR v_usuario_id IN
    SELECT id FROM (SELECT p_actor_id AS id UNION SELECT (p->>'usuario_id')::bigint
      FROM jsonb_array_elements(v_manifest->'ambitos') a
      CROSS JOIN LATERAL jsonb_array_elements(a->'correspondencias') p) ids ORDER BY id
  LOOP
    PERFORM 1 FROM public.usuario WHERE id=v_usuario_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PA_BOOTSTRAP_USUARIO_INEXISTENTE' USING ERRCODE='23503'; END IF;
  END LOOP;
  SELECT * INTO STRICT v_actor FROM public.usuario WHERE id=p_actor_id;
  IF v_actor.activo IS NOT TRUE THEN
    RAISE EXCEPTION 'PA_BOOTSTRAP_ACTOR_INACTIVO' USING ERRCODE='42501';
  END IF;
  FOR v_id IN SELECT (a->>'subcampania_id')::bigint FROM jsonb_array_elements(v_manifest->'ambitos') a ORDER BY 1 LOOP
    PERFORM 1 FROM public.subcampania WHERE id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PA_BOOTSTRAP_AMBITO_INEXISTENTE' USING ERRCODE='23503'; END IF;
  END LOOP;
  SELECT * INTO v_comando FROM public.participacion_comando
    WHERE actor_id=p_actor_id AND operacion='INICIALIZAR_PARTICIPACION_LEGADA' AND comando_id=p_comando_id FOR UPDATE;
  IF FOUND THEN
    IF v_comando.huella IS DISTINCT FROM v_huella THEN
      RAISE EXCEPTION 'PA_BOOTSTRAP_COMANDO_REUTILIZADO' USING ERRCODE='23514';
    END IF;
    IF v_comando.estado <> 'CONFIRMADO' THEN
      RAISE EXCEPTION 'PA_BOOTSTRAP_COMANDO_INCOMPATIBLE' USING ERRCODE='23514';
    END IF;
    RETURN v_comando.resultado; -- Historia/retirada posterior no se vuelve a aplicar.
  END IF;
  IF v_actor.rol::text <> 'ADMIN' THEN
    RAISE EXCEPTION 'PA_BOOTSTRAP_REQUIERE_ADMIN_GLOBAL' USING ERRCODE='42501';
  END IF;
  -- Validar TODO el conjunto antes de escribir; no sustituir ningun destino.
  FOR v_ambito IN SELECT value FROM jsonb_array_elements(v_manifest->'ambitos') LOOP
    v_id := (v_ambito->>'subcampania_id')::bigint;
    SELECT * INTO STRICT v_sub FROM public.subcampania WHERE id=v_id;
    IF v_sub.deleted_at IS NOT NULL OR v_sub.estado::text <> v_ambito->>'estado_esperado' THEN
      RAISE EXCEPTION 'PA_BOOTSTRAP_ESTADO_AMBITO_CAMBIADO' USING ERRCODE='23514';
    END IF;
    IF v_sub.participacion_inicializada_en IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.subcampania_permiso_revision WHERE subcampania_id=v_id)
       OR EXISTS (SELECT 1 FROM public.subcampania_permiso WHERE subcampania_id=v_id) THEN
      RAISE EXCEPTION 'PA_BOOTSTRAP_AMBITO_YA_INICIALIZADO_O_CON_HISTORIA' USING ERRCODE='23514';
    END IF;
    FOR v_persona IN SELECT value FROM jsonb_array_elements(v_ambito->'correspondencias') LOOP
      IF NOT EXISTS (SELECT 1 FROM public.usuario WHERE id=(v_persona->>'usuario_id')::bigint AND activo) THEN
        RAISE EXCEPTION 'PA_BOOTSTRAP_DESTINO_INACTIVO' USING ERRCODE='23514';
      END IF;
      IF EXISTS (SELECT 1 FROM public.usuario WHERE id=(v_persona->>'usuario_id')::bigint AND rol::text='ADMIN') THEN
        RAISE EXCEPTION 'PA_BOOTSTRAP_ADMIN_GLOBAL_ES_DERIVADO' USING ERRCODE='23514';
      END IF;
    END LOOP;
    v_resultados := v_resultados || jsonb_build_array(jsonb_build_object(
      'subcampania_id',v_id::text,'usuarios',
      (SELECT jsonb_agg(jsonb_build_object('usuario_id',p->>'usuario_id',
        'permiso',p->>'permiso_propuesto','revision','1') ORDER BY (p->>'usuario_id')::bigint)
       FROM jsonb_array_elements(v_ambito->'correspondencias') p)));
  END LOOP;
  v_fecha := clock_timestamp();
  v_resultado := jsonb_build_object('tipo','INICIALIZACION_PARTICIPACION_LEGADA','ambitos',v_resultados);
  INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,resultado,http_terminal,creado_en,finalizado_en)
  VALUES(p_actor_id,'INICIALIZAR_PARTICIPACION_LEGADA',p_comando_id,v_huella,'CONFIRMADO',v_resultado,200,v_fecha,v_fecha)
  RETURNING * INTO v_comando;
  FOR v_ambito IN SELECT value FROM jsonb_array_elements(v_manifest->'ambitos') LOOP
    v_id := (v_ambito->>'subcampania_id')::bigint;
    SELECT * INTO STRICT v_sub FROM public.subcampania WHERE id=v_id;
    v_anterior := '[]'; v_nuevo := '[]';
    FOR v_persona IN SELECT value FROM jsonb_array_elements(v_ambito->'correspondencias') LOOP
      v_usuario_id := (v_persona->>'usuario_id')::bigint;
      INSERT INTO public.subcampania_permiso_revision(subcampania_id,usuario_id,revision,actualizado_en,actualizado_por)
      VALUES(v_id,v_usuario_id,1,v_fecha,p_actor_id);
      INSERT INTO public.subcampania_permiso(subcampania_id,usuario_id,rol_contextual,otorgado_en,otorgado_por,comando_otorgamiento_id)
      VALUES(v_id,v_usuario_id,v_persona->>'permiso_propuesto',v_fecha,p_actor_id,v_comando.id) RETURNING id INTO v_vigencia_id;
      v_anterior := v_anterior || jsonb_build_array(jsonb_build_object('usuario_id',v_usuario_id::text,
        'permiso',NULL,'vigencia_id',NULL,'revision','0'));
      v_nuevo := v_nuevo || jsonb_build_array(jsonb_build_object('usuario_id',v_usuario_id::text,
        'permiso',v_persona->>'permiso_propuesto','vigencia_id',v_vigencia_id::text,'revision','1'));
    END LOOP;
    UPDATE public.subcampania SET participacion_inicializada_en=v_fecha,participacion_inicializada_por=p_actor_id WHERE id=v_id;
    INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,estado_origen,estado_destino,
      metadata,actor_user_id,created_at,participacion_comando_id)
    VALUES(v_id,'PERMISO_OTORGADO',v_sub.estado,v_sub.estado,
      jsonb_build_object('origen','INICIALIZACION_LEGADA_REVISADA','version_manifest',1,
        'correspondencias_revisadas',v_ambito->'correspondencias','anterior',v_anterior,'nuevo',v_nuevo),
      p_actor_id,v_fecha,v_comando.id);
  END LOOP;
  RETURN v_resultado;
END $$;

DO $$ DECLARE v_funcion RECORD; v_rol TEXT; BEGIN
  -- Cerrar tambien una sobrecarga preexistente; solo esta firma es entrypoint.
  FOR v_funcion IN SELECT p.oid::regprocedure AS firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='pa_inicializar_participacion_legada' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',v_funcion.firma);
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.pa_inicializar_participacion_legada(BIGINT,UUID,JSONB) TO service_role;
  FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='pa_inicializar_participacion_legada'
        AND has_function_privilege(v_rol,p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'PA_BOOTSTRAP_EXECUTE_HEREDADO: %',v_rol;
    END IF;
  END LOOP;
END $$;
COMMENT ON FUNCTION public.pa_inicializar_participacion_legada(BIGINT,UUID,JSONB) IS
  'Bootstrap operacional acotado a IDs revisados. Instalar no asigna permisos. No es designacion ordinaria ni motor HTTP. Repetir misma clave/manifest recupera sin ampliar ni reactivar.';
NOTIFY pgrst,'reload schema';
COMMIT;
