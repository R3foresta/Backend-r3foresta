-- PA-T-INT07: participantes históricos y lecturas efectivas, un único commit SQL.
-- Requiere084 cotejada. No habilita cantidad, reversiones ni alta de mortandad.
-- Preserva bytes OBS/PA-COMANDO/1, originales, permisos, stock y recibos anteriores.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE pa_int07_085_funciones(firma,previo,nuevo,lenguaje,volatilidad,retorno,setof,defaults,timeouts)
ON COMMIT DROP AS VALUES
 ('public.pa_p_personas(bigint)',NULL,'3db8c62a247011ecfdf1de4fdfd08088','sql','s','record',true,0,false),
 ('public.pa_p_relacion_propia(bigint,bigint)',NULL,'16a0dd4f889f8b3661915a34f98ce422','sql','s','jsonb',false,0,false),
 ('public.pa_p_participantes_snapshot(bigint)',NULL,'01a2af2a4d74e83a92bb5912581740eb','sql','s','jsonb',false,0,false),
 ('public.pa_p_participantes_originales(bigint)',NULL,'d1a233b4ec0b4c4840bf9c737c83a2ea','sql','s','jsonb',false,0,false),
 ('public.pa_correccion_ejecutar(bigint,text,text,uuid,jsonb,text)','3719568bd548d9376dc5362aa20c2529','016e6238c9b44adcfa1b70dd8d98727c','plpgsql','v','jsonb',false,0,true),
 ('public.pa_comando_recuperar(bigint,text,text,uuid)','41923c052e2ad651f954e4770a7917b0','fe6912b7fd77f3b323ed706245149026','plpgsql','v','jsonb',false,0,false),
 ('public.pa_correccion_contexto_leer(bigint,text,bigint)','3e451420f51ecc0d1e0c3d1f52d7b7d8','7418f7a6831bffe225c99820d921bcdb','plpgsql','v','jsonb',false,0,true),
 ('public.pa_correccion_historial_leer(bigint,text,bigint,bigint,integer)','c6eeefaaf6f9231505c634efb481a53c','53044e86addf1ba0b50502beefa2e9b4','plpgsql','v','jsonb',false,2,true),
 ('public.pa_i_personas(bigint)','46264c4a22f1b22a45469737c158f30c','b003b224e170fff267ab5bf636168068','sql','s','jsonb',false,0,false),
 ('public.pa_mis_registros_leer(bigint,text,bigint,integer)','522256bccc69971623751a9739a1da85','8cdc7277b69667aea742bb62c26ffe70','plpgsql','s','jsonb',false,2,true),
 ('public.pa_registro_detalle_propio_leer(bigint,text,bigint)','50b09f9f93cd7cbddd679395afcf937c','6bb823a959b605a78171f45fa8e989be','plpgsql','v','jsonb',false,0,false),
 ('public.pa_correccion_participantes_historicos_leer(bigint,text,bigint,text,text,bigint,integer)',NULL,'8689547daf48bc75e33b89ec243ffe67','plpgsql','v','jsonb',false,2,true),
 ('public.pa_p_estado_registro(bigint,bigint)',NULL,'8e34aabe14eec9d41f2efb354d6b78bd','sql','s','jsonb',false,0,false),
 ('public.pa_registro_estado_propio_leer(bigint,text,bigint)',NULL,'fbe27ce0c47f56ee4fcd92dfea737c20','plpgsql','v','jsonb',false,0,true),
 ('public.pa_registro_historial_propio_leer(bigint,text,bigint,bigint,integer)',NULL,'f36c1423a2bc33f7a942306c08828bad','plpgsql','v','jsonb',false,2,true),
 ('public.pa_mis_registros_estado_leer(bigint,text,bigint,integer)',NULL,'a8e26709acabecbc2ce84ae9a402db07','plpgsql','v','jsonb',false,2,true),
 ('public.pa_registro_estado_publico_leer(bigint)',NULL,'bb07283144e6740d5e8aec74bcc41cbe','plpgsql','s','jsonb',false,0,true);
DO $$ DECLARE r RECORD; p RECORD; rol TEXT; BEGIN
 FOR r IN SELECT * FROM pg_temp.pa_int07_085_funciones LOOP
   SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.firma);
   IF FOUND THEN
     IF (md5(p.prosrc) IS DISTINCT FROM r.previo AND md5(p.prosrc) IS DISTINCT FROM r.nuevo)
       OR p.prosecdef OR p.prokind<>'f' OR p.provolatile::text<>r.volatilidad
       OR p.prorettype<>r.retorno::regtype OR p.proretset<>r.setof
       OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
       OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=r.lenguaje)
       OR p.pronargdefaults<>r.defaults
       OR (r.defaults=2 AND pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM 'NULL::bigint, 20')
       OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
       OR p.proconfig IS DISTINCT FROM (CASE WHEN r.timeouts THEN
         ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[]
         ELSE ARRAY['search_path=pg_catalog, public']::text[] END) THEN
       RAISE EXCEPTION 'PA_INT07_PART_FUNCION_INCOMPATIBLE: %',r.firma;
     END IF;
     IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
       RAISE EXCEPTION 'PA_INT07_PART_FUNCION_PUBLICA: %',r.firma;
     END IF;
     FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
       IF has_function_privilege(rol,p.oid,'EXECUTE') THEN
         RAISE EXCEPTION 'PA_INT07_PART_FUNCION_PRIVILEGIO_PREEXISTENTE: %.%',rol,r.firma;
       END IF;
     END LOOP;
   ELSIF r.previo IS NOT NULL THEN
     RAISE EXCEPTION 'PA_INT07_PART_ANTECEDENTE_AUSENTE: %',r.firma;
   END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.registro_plantacion_participante_efectivo')
   AND relkind='r' AND relrowsecurity AND NOT relforcerowsecurity
   AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.registro_plantacion_participante_efectivo')) THEN
   RAISE EXCEPTION 'PA_INT07_PART_TABLA_INCOMPATIBLE';
 END IF;
 FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_any_column_privilege(rol,'public.registro_plantacion_participante_efectivo','SELECT,INSERT,UPDATE,REFERENCES')
     OR has_table_privilege(rol,'public.registro_plantacion_participante_efectivo','DELETE,TRUNCATE,TRIGGER') THEN
     RAISE EXCEPTION 'PA_INT07_PART_TABLA_PRIVILEGIO_PREEXISTENTE: %',rol;
   END IF;
 END LOOP;
END $$;

CREATE TEMP TABLE pa_int07_085_checks (
  operacion TEXT,estado TEXT,resultado JSONB,
  CONSTRAINT op_anterior CHECK (operacion IN (
    'REGISTRAR_PLANTACION_INICIAL','OTORGAR_PLANTADOR','RETIRAR_PLANTADOR',
    'DESIGNAR_ADMINISTRADOR','CAMBIAR_ADMINISTRADOR_A_PLANTADOR','RETIRAR_ADMINISTRADOR',
    'REEMPLAZAR_ADMINISTRADOR','CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA',
    'INICIALIZAR_PARTICIPACION_LEGADA','CORREGIR_OBSERVACIONES_PLANTACION')),
  CONSTRAINT op_nueva CHECK (operacion IN (
    'REGISTRAR_PLANTACION_INICIAL','OTORGAR_PLANTADOR','RETIRAR_PLANTADOR',
    'DESIGNAR_ADMINISTRADOR','CAMBIAR_ADMINISTRADOR_A_PLANTADOR','RETIRAR_ADMINISTRADOR',
    'REEMPLAZAR_ADMINISTRADOR','CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA',
    'INICIALIZAR_PARTICIPACION_LEGADA','CORREGIR_OBSERVACIONES_PLANTACION','CORREGIR_PARTICIPANTES_PLANTACION')),
  CONSTRAINT tipo_anterior CHECK (
    estado<>'CONFIRMADO' OR COALESCE(resultado->>'tipo'=CASE
      WHEN operacion='REGISTRAR_PLANTACION_INICIAL' THEN 'PLANTACION_INICIAL'
      WHEN operacion='CAMBIAR_ROL_GLOBAL' THEN 'ROL_GLOBAL'
      WHEN operacion='INACTIVAR_CUENTA' THEN 'CUENTA_INACTIVADA'
      WHEN operacion='INICIALIZAR_PARTICIPACION_LEGADA' THEN 'INICIALIZACION_PARTICIPACION_LEGADA'
      WHEN operacion='CORREGIR_OBSERVACIONES_PLANTACION' THEN 'CORRECCION_PLANTACION'
      ELSE 'ACCESO' END,false)),
  CONSTRAINT tipo_nuevo CHECK (
    estado<>'CONFIRMADO' OR COALESCE(resultado->>'tipo'=CASE
      WHEN operacion='REGISTRAR_PLANTACION_INICIAL' THEN 'PLANTACION_INICIAL'
      WHEN operacion='CAMBIAR_ROL_GLOBAL' THEN 'ROL_GLOBAL'
      WHEN operacion='INACTIVAR_CUENTA' THEN 'CUENTA_INACTIVADA'
      WHEN operacion='INICIALIZAR_PARTICIPACION_LEGADA' THEN 'INICIALIZACION_PARTICIPACION_LEGADA'
      WHEN operacion IN('CORREGIR_OBSERVACIONES_PLANTACION','CORREGIR_PARTICIPANTES_PLANTACION') THEN 'CORRECCION_PLANTACION'
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
      WHERE conrelid='pg_temp.pa_int07_085_checks'::regclass AND conname=r.previa;
    SELECT pg_get_constraintdef(oid) INTO nuevo FROM pg_constraint
      WHERE conrelid='pg_temp.pa_int07_085_checks'::regclass AND conname=r.nueva;
    IF actual IS NULL OR actual NOT IN(anterior,nuevo) THEN
      RAISE EXCEPTION 'PA_INT07_PART_CHECK_INCOMPATIBLE: %',r.nombre;
    END IF;
    IF actual<>nuevo THEN
      EXECUTE format('ALTER TABLE public.participacion_comando DROP CONSTRAINT %I',r.nombre);
      EXECUTE format('ALTER TABLE public.participacion_comando ADD CONSTRAINT %I %s',r.nombre,nuevo);
    END IF;
  END LOOP;
END $$;


CREATE OR REPLACE FUNCTION public.pa_p_personas(p_registro_id BIGINT)
RETURNS TABLE(usuario_id BIGINT,es_responsable BOOLEAN,nombre_snapshot TEXT,afiliacion_snapshot TEXT,
 afiliacion_estado TEXT,afiliacion_tipo TEXT,organizacion_id_snapshot BIGINT,
 procedencia TEXT,capturado_en TIMESTAMPTZ,nombre_capturado_correccion TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT r.responsable_id,true,r.nombre_responsable_snapshot,r.afiliacion_responsable_snapshot,
   r.afiliacion_responsable_estado,r.afiliacion_responsable_tipo,r.organizacion_responsable_id_snapshot,
   'ORIGINAL'::text,NULL::timestamptz,NULL::text
 FROM public.registro_plantacion r WHERE r.id=p_registro_id
 UNION ALL
 SELECT c.usuario_id,false,c.nombre_snapshot,c.afiliacion_snapshot,c.afiliacion_estado,c.afiliacion_tipo,
   c.organizacion_id_snapshot,'ORIGINAL'::text,NULL::timestamptz,NULL::text
 FROM public.registro_plantacion_coresponsable c JOIN public.registro_plantacion r ON r.id=c.registro_plantacion_id
 WHERE c.registro_plantacion_id=p_registro_id AND c.usuario_id<>r.responsable_id
   AND NOT EXISTS(SELECT 1 FROM public.registro_plantacion_participante_efectivo e
     WHERE e.registro_plantacion_id=c.registro_plantacion_id AND e.usuario_id=c.usuario_id)
 UNION ALL
 SELECT e.usuario_id,false,CASE WHEN e.coresponsable_original_id IS NOT NULL THEN e.nombre_snapshot ELSE NULL END,
   e.afiliacion_snapshot,e.afiliacion_estado,e.afiliacion_tipo,e.organizacion_id_snapshot,e.procedencia,
   e.snapshot_capturado_en,CASE WHEN e.coresponsable_original_id IS NULL THEN e.nombre_snapshot ELSE NULL END
 FROM public.registro_plantacion_participante_efectivo e JOIN public.registro_plantacion r ON r.id=e.registro_plantacion_id
 WHERE e.registro_plantacion_id=p_registro_id AND e.estado='PRESENTE' AND e.usuario_id<>r.responsable_id
$$;

CREATE OR REPLACE FUNCTION public.pa_p_relacion_propia(p_actor_id BIGINT,p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT CASE WHEN autor AND participante THEN '["AUTOR","PARTICIPANTE"]'::jsonb
   WHEN autor THEN '["AUTOR"]'::jsonb WHEN participante THEN '["PARTICIPANTE"]'::jsonb ELSE '[]'::jsonb END
 FROM (SELECT r.responsable_id=p_actor_id autor,
   EXISTS(SELECT 1 FROM public.registro_plantacion_participante_efectivo e
     WHERE e.registro_plantacion_id=r.id AND e.usuario_id=p_actor_id AND e.estado='PRESENTE')
   OR EXISTS(SELECT 1 FROM public.registro_plantacion_coresponsable c
     WHERE c.registro_plantacion_id=r.id AND c.usuario_id=p_actor_id
       AND NOT EXISTS(SELECT 1 FROM public.registro_plantacion_participante_efectivo e
         WHERE e.registro_plantacion_id=r.id AND e.usuario_id=c.usuario_id)) participante
   FROM public.registro_plantacion r WHERE r.id=p_registro_id) q
$$;

CREATE OR REPLACE FUNCTION public.pa_p_participantes_snapshot(p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('usuario_id',p.usuario_id::text,'es_responsable',p.es_responsable,
   'nombre_snapshot',p.nombre_snapshot,'afiliacion_snapshot',p.afiliacion_snapshot,'afiliacion_estado',p.afiliacion_estado,
   'afiliacion_tipo',p.afiliacion_tipo,'organizacion_id_snapshot',p.organizacion_id_snapshot::text,
   'procedencia',p.procedencia,'capturado_en',to_char(p.capturado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'nombre_capturado_correccion',p.nombre_capturado_correccion) ORDER BY p.es_responsable DESC,p.usuario_id),'[]'::jsonb)
 FROM public.pa_p_personas(p_registro_id) p
$$;

CREATE OR REPLACE FUNCTION public.pa_p_participantes_originales(p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(fila ORDER BY responsable DESC,usuario_id),'[]'::jsonb) FROM (
   SELECT r.responsable_id usuario_id,true responsable,jsonb_build_object('usuario_id',r.responsable_id::text,
     'nombre_snapshot',r.nombre_responsable_snapshot,'afiliacion_snapshot',r.afiliacion_responsable_snapshot,
     'afiliacion_estado',r.afiliacion_responsable_estado,'afiliacion_tipo',r.afiliacion_responsable_tipo,
     'organizacion_id_snapshot',r.organizacion_responsable_id_snapshot::text,'es_responsable',true,
     'procedencia','ORIGINAL','capturado_en',NULL,'nombre_capturado_correccion',NULL) fila
   FROM public.registro_plantacion r WHERE r.id=p_registro_id
   UNION ALL SELECT c.usuario_id,false,jsonb_build_object('usuario_id',c.usuario_id::text,'nombre_snapshot',c.nombre_snapshot,
     'afiliacion_snapshot',c.afiliacion_snapshot,'afiliacion_estado',c.afiliacion_estado,'afiliacion_tipo',c.afiliacion_tipo,
     'organizacion_id_snapshot',c.organizacion_id_snapshot::text,'es_responsable',false,
     'procedencia','ORIGINAL','capturado_en',NULL,'nombre_capturado_correccion',NULL)
   FROM public.registro_plantacion_coresponsable c JOIN public.registro_plantacion r ON r.id=c.registro_plantacion_id
   WHERE r.id=p_registro_id AND c.usuario_id<>r.responsable_id) personas
$$;

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
  v_part BOOLEAN; v_ids BIGINT[]; v_propuestos BIGINT[]; v_actuales BIGINT[];
  v_antes JSONB; v_despues JSONB; v_caso TEXT;
  v_trim TEXT:=chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||' '||chr(160)||chr(5760)
    ||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)
    ||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)
    ||chr(8239)||chr(8287)||chr(12288)||chr(65279);
BEGIN
  v_part:=p_operacion='CORREGIR_PARTICIPANTES_PLANTACION';
  v_caso:=CASE WHEN v_part THEN 'PARTICIPANTES' ELSE 'OBSERVACIONES' END;
  IF p_operacion IS NULL OR p_operacion NOT IN('CORREGIR_OBSERVACIONES_PLANTACION','CORREGIR_PARTICIPANTES_PLANTACION')
    OR p_comando_id IS NULL
    OR p_comando_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no cumple el contrato v1.',p_comando_id);
  END IF;
  IF (p_payload-(CASE WHEN v_part THEN ARRAY['registro_plantacion_id','revision_esperada','motivo','coresponsable_ids'] ELSE ARRAY['registro_plantacion_id','revision_esperada','motivo','observaciones'] END))<>'{}'::jsonb THEN
    RETURN public.pa_c_fuera(422,'CAMPO_NO_PERMITIDO','La entrada contiene campos no permitidos.',p_comando_id);
  END IF;
  IF NOT public.pa_c_decimal(p_payload->'registro_plantacion_id')
    OR NOT public.pa_c_decimal(p_payload->'revision_esperada',true)
    OR jsonb_typeof(p_payload->'motivo') IS DISTINCT FROM 'string'
    OR char_length(p_payload->>'motivo') NOT BETWEEN 3 AND 1000
    OR p_payload->>'motivo' IS DISTINCT FROM normalize(btrim(p_payload->>'motivo',v_trim),NFC)
    OR (NOT v_part AND (NOT (p_payload?'observaciones')
    OR jsonb_typeof(p_payload->'observaciones') NOT IN('null','string')
    OR (jsonb_typeof(p_payload->'observaciones')='string' AND (
      char_length(p_payload->>'observaciones') NOT BETWEEN 1 AND 2000
      OR p_payload->>'observaciones' IS DISTINCT FROM normalize(btrim(p_payload->>'observaciones',v_trim),NFC))))) THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La entrada no cumple el contrato v1.',p_comando_id);
  END IF;
  IF v_part THEN
    IF jsonb_typeof(p_payload->'coresponsable_ids') IS DISTINCT FROM 'array' THEN
      RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La lista de participantes no es válida.',p_comando_id);
    END IF;
    IF jsonb_array_length(p_payload->'coresponsable_ids')>100
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'coresponsable_ids') x WHERE NOT public.pa_c_decimal(x))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'coresponsable_ids') x GROUP BY x HAVING count(*)>1) THEN
      RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La lista de participantes no es válida.',p_comando_id);
    END IF;
    SELECT coalesce(array_agg((x#>>'{}')::bigint ORDER BY (x#>>'{}')::bigint),ARRAY[]::bigint[]) INTO v_propuestos
      FROM jsonb_array_elements(p_payload->'coresponsable_ids') x;
    IF p_payload->'coresponsable_ids' IS DISTINCT FROM to_jsonb(ARRAY(SELECT i::text FROM unnest(v_propuestos) i)) THEN
      RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','La lista debe conservar el orden numérico canónico.',p_comando_id);
    END IF;
    v_canon:='{"coresponsable_ids":['||(SELECT coalesce(string_agg(to_jsonb(i::text)::text,',' ORDER BY i),'') FROM unnest(v_propuestos) i)
      ||'],"motivo":'||(p_payload->'motivo')::text
      ||',"registro_plantacion_id":'||(p_payload->'registro_plantacion_id')::text
      ||',"revision_esperada":'||(p_payload->'revision_esperada')::text||'}';
  ELSE
  v_canon:='{"motivo":'||(p_payload->'motivo')::text
    ||',"observaciones":'||(p_payload->'observaciones')::text
    ||',"registro_plantacion_id":'||(p_payload->'registro_plantacion_id')::text
    ||',"revision_esperada":'||(p_payload->'revision_esperada')::text||'}';
  END IF;
  IF p_contenido_canonico IS DISTINCT FROM v_canon THEN
    RETURN public.pa_c_fuera(422,'ENTRADA_INVALIDA','El contenido canónico no corresponde a la intención.',p_comando_id);
  END IF;
  v_huella:=sha256(convert_to('PA-COMANDO/1'||chr(10)||p_operacion||chr(10)||v_canon,'UTF8'));
  -- El terminal propio conserva prioridad antes de consultar el objeto actual.
  v_replay:=public.pa_c_replay(p_actor_id,p_auth_id,p_operacion,p_comando_id,v_huella);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  -- Resolver sin autoridad antes del lock; no adquirir cuentas nuevas al final.
  SELECT subcampania_id,CASE WHEN es_reposicion THEN registro_plantacion_origen_id ELSE id END
    INTO v_sub_id,v_grupo_id FROM public.registro_plantacion
    WHERE id=(p_payload->>'registro_plantacion_id')::bigint;
  SELECT array_agg(DISTINCT n ORDER BY n) INTO v_ids FROM (
    SELECT p_actor_id n UNION ALL
    SELECT responsable_id FROM public.registro_plantacion WHERE id=(p_payload->>'registro_plantacion_id')::bigint AND v_part
    UNION ALL SELECT usuario_id FROM public.registro_plantacion_coresponsable
      WHERE registro_plantacion_id=(p_payload->>'registro_plantacion_id')::bigint AND v_part
    UNION ALL SELECT usuario_id FROM public.registro_plantacion_participante_efectivo
      WHERE registro_plantacion_id=(p_payload->>'registro_plantacion_id')::bigint AND v_part
    UNION ALL SELECT unnest(coalesce(v_propuestos,ARRAY[]::bigint[]))) cuentas WHERE n IS NOT NULL;
  PERFORM 1 FROM public.usuario WHERE id=ANY(v_ids) ORDER BY id FOR SHARE;
  SELECT * INTO v_actor FROM public.usuario WHERE id=p_actor_id AND auth_id=p_auth_id;
  IF NOT FOUND THEN RETURN public.pa_c_fuera(401,'SESION_INVALIDA','La sesión no es válida.',p_comando_id,'RECUPERAR_SESION'); END IF;
  IF NOT v_actor.activo THEN RETURN public.pa_c_fuera(403,'CUENTA_INACTIVA','La cuenta no está activa.',p_comando_id); END IF;
  PERFORM 1 FROM public.organizacion o WHERE v_part AND o.id IN(
    SELECT organizacion_id_snapshot FROM public.registro_plantacion_coresponsable
      WHERE registro_plantacion_id=(p_payload->>'registro_plantacion_id')::bigint
    UNION SELECT organizacion_id_snapshot FROM public.registro_plantacion_participante_efectivo
      WHERE registro_plantacion_id=(p_payload->>'registro_plantacion_id')::bigint) ORDER BY o.id FOR SHARE;
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
    IF NOT v_part AND v_actor.rol::text<>'ADMIN' THEN
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
    v_instante:=clock_timestamp();
    v_anterior:=CASE WHEN v_efectivo.registro_plantacion_id IS NULL THEN v_registro.observaciones ELSE v_efectivo.observaciones_efectivas END;
    v_nuevo:=CASE WHEN v_part THEN v_anterior ELSE p_payload->>'observaciones' END;
    IF v_part THEN
      IF v_registro.responsable_id=ANY(v_propuestos) THEN
        PERFORM public.pa_c_rechazar(422,'CASO_NO_SOPORTADO','El responsable no forma parte del conjunto editable.');
      END IF;
      IF EXISTS(SELECT 1 FROM unnest(v_propuestos) i LEFT JOIN public.usuario u ON u.id=i WHERE u.id IS NULL) THEN
        PERFORM public.pa_c_rechazar(422,'PARTICIPANTE_NO_REGISTRADO','Una persona seleccionada no está registrada.');
      END IF;
      -- La revisión se validó antes de usar la lista actual. Rechazar un escritor
      -- ajeno que alteró relaciones sin revisión, sin adquirir locks de cuenta tardíos.
      IF EXISTS(SELECT 1 FROM (
        SELECT v_registro.responsable_id id UNION SELECT usuario_id FROM public.registro_plantacion_coresponsable WHERE registro_plantacion_id=v_registro.id
        UNION SELECT usuario_id FROM public.registro_plantacion_participante_efectivo WHERE registro_plantacion_id=v_registro.id) q
        WHERE NOT(id=ANY(v_ids))) THEN
        PERFORM public.pa_c_rechazar(422,'CONTEXTO_INCOMPLETO','La participación requiere conciliación.');
      END IF;
      SELECT coalesce(array_agg(usuario_id ORDER BY usuario_id),ARRAY[]::bigint[]) INTO v_actuales
        FROM public.pa_p_personas(v_registro.id) WHERE NOT es_responsable;
      v_antes:=jsonb_build_object('participantes',public.pa_p_participantes_snapshot(v_registro.id));
      v_cambio:=v_actuales IS DISTINCT FROM v_propuestos;
      IF v_cambio THEN
        -- Materialización fiel solo al producir un cambio real. Nunca copiar la
        -- afiliación actual ni exigir actividad/permiso operativo de personas históricas.
        INSERT INTO public.registro_plantacion_participante_efectivo(registro_plantacion_id,usuario_id,
          coresponsable_original_id,procedencia,nombre_snapshot,afiliacion_snapshot,afiliacion_estado,
          afiliacion_tipo,organizacion_id_snapshot)
        SELECT c.registro_plantacion_id,c.usuario_id,c.id,'ORIGINAL',c.nombre_snapshot,c.afiliacion_snapshot,
          c.afiliacion_estado,c.afiliacion_tipo,c.organizacion_id_snapshot
        FROM public.registro_plantacion_coresponsable c WHERE c.registro_plantacion_id=v_registro.id
          AND c.usuario_id<>v_registro.responsable_id
        ON CONFLICT(registro_plantacion_id,usuario_id) DO NOTHING;
        SELECT jsonb_build_object('participantes',jsonb_agg(fila ORDER BY responsable DESC,usuario_id)) INTO v_despues FROM (
          SELECT v_registro.responsable_id usuario_id,true responsable,x fila
          FROM jsonb_array_elements(v_antes->'participantes') x WHERE (x->>'es_responsable')::boolean
          UNION ALL
          SELECT u.id,false,jsonb_build_object('usuario_id',u.id::text,'es_responsable',false,
            'nombre_snapshot',CASE WHEN p.coresponsable_original_id IS NOT NULL THEN p.nombre_snapshot ELSE NULL END,
            'afiliacion_snapshot',p.afiliacion_snapshot,'afiliacion_estado',coalesce(p.afiliacion_estado,'HISTORICA_NO_DISPONIBLE'),
            'afiliacion_tipo',p.afiliacion_tipo,'organizacion_id_snapshot',p.organizacion_id_snapshot::text,
            'procedencia',CASE WHEN p.usuario_id IS NULL THEN 'ALTA_CORRECCION' WHEN p.estado='RETIRADO' THEN 'RESTAURACION' ELSE p.procedencia END,
            'capturado_en',to_char((CASE WHEN p.usuario_id IS NULL THEN v_instante ELSE p.snapshot_capturado_en END) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'nombre_capturado_correccion',CASE WHEN p.coresponsable_original_id IS NOT NULL THEN NULL
              WHEN p.usuario_id IS NULL THEN u.nombre ELSE p.nombre_snapshot END)
          FROM unnest(v_propuestos) i JOIN public.usuario u ON u.id=i
          LEFT JOIN public.registro_plantacion_participante_efectivo p ON p.registro_plantacion_id=v_registro.id AND p.usuario_id=u.id) propuesta;
      ELSE v_despues:=v_antes;
      END IF;
    ELSE
      v_cambio:=v_anterior IS DISTINCT FROM v_nuevo;
      v_antes:=jsonb_build_object('observaciones',v_anterior); v_despues:=jsonb_build_object('observaciones',v_nuevo);
    END IF;
    v_revision_nueva:=v_registro.revision_registro+CASE WHEN v_cambio THEN 1 ELSE 0 END;
    IF v_cambio THEN
      v_correccion_id:=nextval(pg_get_serial_sequence('public.registro_plantacion_correccion','id'));
    END IF;
    v_resultado:=jsonb_build_object('tipo','CORRECCION_PLANTACION','correccion_id',v_correccion_id::text,
      'registro_plantacion_id',v_registro.id::text,'subcampania_id',v_sub_id::text,'caso',v_caso,
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
        v_caso,p_payload->>'motivo',v_antes,
        v_despues,v_registro.revision_registro,v_revision_nueva,
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
      IF v_part THEN
        UPDATE public.registro_plantacion_participante_efectivo SET estado='RETIRADO',ultima_correccion_id=v_correccion_id
          WHERE registro_plantacion_id=v_registro.id AND estado='PRESENTE' AND NOT(usuario_id=ANY(v_propuestos));
        UPDATE public.registro_plantacion_participante_efectivo SET estado='PRESENTE',procedencia='RESTAURACION',ultima_correccion_id=v_correccion_id
          WHERE registro_plantacion_id=v_registro.id AND estado='RETIRADO' AND usuario_id=ANY(v_propuestos);
        INSERT INTO public.registro_plantacion_participante_efectivo(registro_plantacion_id,usuario_id,procedencia,
          nombre_snapshot,snapshot_capturado_en,correccion_incorporacion_id,ultima_correccion_id)
        SELECT v_registro.id,u.id,'ALTA_CORRECCION',u.nombre,v_instante,v_correccion_id,v_correccion_id
          FROM unnest(v_propuestos) i JOIN public.usuario u ON u.id=i
          WHERE NOT EXISTS(SELECT 1 FROM public.registro_plantacion_participante_efectivo p
            WHERE p.registro_plantacion_id=v_registro.id AND p.usuario_id=u.id);
        IF public.pa_p_participantes_snapshot(v_registro.id) IS DISTINCT FROM v_despues->'participantes' THEN
          RAISE EXCEPTION 'PA_INT07_PARTICIPANTES_SNAPSHOT_INCONSISTENTE' USING ERRCODE='23514';
        END IF;
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
    'CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA','CORREGIR_OBSERVACIONES_PLANTACION','CORREGIR_PARTICIPANTES_PLANTACION') OR p_comando_id IS NULL
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
    'original',jsonb_build_object('observaciones',CASE WHEN v_global THEN v.observaciones ELSE NULL END,
      'participantes',public.pa_p_participantes_originales(v.id)),
    'efectivo',jsonb_build_object('observaciones',CASE WHEN v_global THEN v.observaciones_efectivas ELSE NULL END,
      'participantes',public.pa_p_participantes_snapshot(v.id)),
    'observaciones_visibles',v_global,'capacidades',jsonb_build_object('corregir_observaciones',
      v_global AND v.estado_subcampania='ACTIVA' AND v.estado_logico='VIGENTE',
      'corregir_participantes',v.estado_subcampania='ACTIVA' AND v.estado_logico='VIGENTE')),
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
    WHERE c.registro_plantacion_id=p_registro_plantacion_id AND c.caso IN('OBSERVACIONES','PARTICIPANTES')
      AND (p_antes_id IS NULL OR c.id<p_antes_id) ORDER BY c.id DESC LIMIT p_limite+1
  ), pagina AS (SELECT * FROM candidatos ORDER BY id DESC LIMIT p_limite)
  SELECT coalesce(jsonb_agg(jsonb_build_object('correccion_id',id::text,'caso',caso,
    'actor',jsonb_build_object('usuario_id',actor_id::text,'nombre_snapshot',actor_nombre_snapshot),
    'fecha',to_char(creado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'revision_anterior',revision_anterior::text,'revision_nueva',revision_nueva::text,
    'revision_grupo_anterior',revision_grupo_anterior::text,'revision_grupo_nueva',revision_grupo_nueva::text,
    'motivo',CASE WHEN v_global OR caso='PARTICIPANTES' THEN motivo ELSE NULL END,
    'efectos_consumo','[]'::jsonb) || (CASE WHEN caso='OBSERVACIONES' THEN jsonb_build_object(
      'observaciones_visibles',v_global,
      'antes',jsonb_build_object('observaciones',CASE WHEN v_global THEN anterior->>'observaciones' ELSE NULL END),
      'despues',jsonb_build_object('observaciones',CASE WHEN v_global THEN nuevo->>'observaciones' ELSE NULL END))
      ELSE jsonb_build_object('antes',anterior,'despues',nuevo) END) ORDER BY id DESC),'[]'::jsonb),
    CASE WHEN (SELECT count(*) FROM candidatos)>p_limite THEN min(id)::text ELSE NULL END
    INTO v_data,v_siguiente FROM pagina;
  RETURN jsonb_build_object('data',v_data,'siguiente_id',v_siguiente,
    'observado_en',v_contexto->>'observado_en');
END $$;

CREATE OR REPLACE FUNCTION public.pa_i_personas(p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',p.nombre_snapshot,'es_responsable',p.es_responsable,
   'afiliacion',jsonb_build_object('estado',p.afiliacion_estado,'tipo',p.afiliacion_tipo,
     'nombre',p.afiliacion_snapshot,'organizacion_id',p.organizacion_id_snapshot::text))
   ORDER BY p.es_responsable DESC,p.usuario_id),'[]'::jsonb) FROM public.pa_p_personas(p_registro_id) p
$$;

CREATE OR REPLACE FUNCTION public.pa_mis_registros_leer(
 p_actor_id BIGINT,p_auth_id TEXT,p_cursor BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v JSONB;
BEGIN
 PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
 IF p_limite NOT BETWEEN 1 AND 100 THEN PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','Límite no válido.'); END IF;
 WITH propios AS MATERIALIZED (
   SELECT r.*,r.responsable_id=p_actor_id autor,
     public.pa_p_relacion_propia(p_actor_id,r.id)?'PARTICIPANTE' participante
   FROM public.registro_plantacion r
   WHERE jsonb_array_length(coalesce(public.pa_p_relacion_propia(p_actor_id,r.id),'[]'::jsonb))>0 ), pagina AS (SELECT * FROM propios WHERE p_cursor IS NULL OR id<p_cursor ORDER BY id DESC LIMIT p_limite)
 SELECT jsonb_build_object('registros',coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,
   'subcampania_id',p.subcampania_id::text,'fecha_plantacion',p.fecha_plantacion::text,
   'codigo_trazabilidad',p.codigo_trazabilidad,'cantidad_total_plantada',p.cantidad_total_plantada,'es_reposicion',p.es_reposicion,
   'relaciones',CASE WHEN autor AND participante THEN '["AUTOR","PARTICIPANTE"]'::jsonb WHEN autor THEN '["AUTOR"]'::jsonb ELSE '["PARTICIPANTE"]'::jsonb END,
   'url_publica',CASE WHEN ca.deleted_at IS NULL AND s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL') THEN '/api/v1/impact/registros/'||p.id ELSE NULL END,
   'url_detalle_propio','/api/v1/plantaciones/'||p.id||'/detalle-propio') ORDER BY p.id DESC),'[]'::jsonb),
   'siguiente_cursor',CASE WHEN EXISTS(SELECT 1 FROM propios WHERE id<(SELECT min(id) FROM pagina)) THEN (SELECT min(id)::text FROM pagina) ELSE NULL END)
 INTO v FROM pagina p JOIN public.subcampania s ON s.id=p.subcampania_id JOIN public.campania ca ON ca.id=s.campania_id;
 RETURN jsonb_build_object('data',v);
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_detalle_propio_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v public.registro_plantacion%ROWTYPE; v_participantes JSONB; v_autor BOOLEAN; v_participante BOOLEAN;
BEGIN
  PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
  SELECT * INTO v FROM public.registro_plantacion WHERE id=p_registro_id FOR SHARE;
  v_autor:=v.responsable_id=p_actor_id;
  v_participante:=coalesce(public.pa_p_relacion_propia(p_actor_id,p_registro_id)?'PARTICIPANTE',false);
  IF v.id IS NULL OR NOT (coalesce(v_autor,false) OR v_participante) THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
  END IF;
  SELECT jsonb_agg(jsonb_build_object('usuario_id',p.usuario_id::text,'nombre_snapshot',p.nombre_snapshot,
    'afiliacion_snapshot',p.afiliacion_snapshot,'afiliacion_estado',p.afiliacion_estado,'afiliacion_tipo',p.afiliacion_tipo,
    'organizacion_id_snapshot',p.organizacion_id_snapshot::text,'es_responsable',p.es_responsable)
    ORDER BY p.es_responsable DESC,p.usuario_id) INTO v_participantes FROM public.pa_p_personas(v.id) p;
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

CREATE OR REPLACE FUNCTION public.pa_correccion_participantes_historicos_leer(
 p_actor_id BIGINT,p_auth_id TEXT,p_registro_plantacion_id BIGINT,p_modo TEXT,p_consulta TEXT,
 p_despues_id BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_contexto JSONB; v_data JSONB; v_siguiente TEXT; v_responsable BIGINT;
BEGIN
 v_contexto:=public.pa_correccion_contexto_leer(p_actor_id,p_auth_id,p_registro_plantacion_id);
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 OR p_despues_id<=0
   OR p_modo IS NULL OR p_modo NOT IN('ID','NOMBRE') OR p_consulta IS NULL
   OR p_consulta IS DISTINCT FROM normalize(btrim(p_consulta),NFC)
   OR (p_modo='ID' AND NOT public.pa_c_decimal(to_jsonb(p_consulta)))
   OR (p_modo='NOMBRE' AND (char_length(p_consulta) NOT BETWEEN 3 AND 100 OR p_consulta ~ '^[0-9]+$')) THEN
   PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','La búsqueda no cumple el contrato histórico.');
 END IF;
 SELECT responsable_id INTO v_responsable FROM public.registro_plantacion WHERE id=p_registro_plantacion_id;
 WITH candidatos AS MATERIALIZED (
   SELECT u.id,u.nombre,u.activo,
     CASE WHEN EXISTS(SELECT 1 FROM public.pa_p_personas(p_registro_plantacion_id) p WHERE p.usuario_id=u.id AND NOT p.es_responsable) THEN 'PRESENTE'
       WHEN EXISTS(SELECT 1 FROM public.registro_plantacion_participante_efectivo e
         WHERE e.registro_plantacion_id=p_registro_plantacion_id AND e.usuario_id=u.id AND e.estado='RETIRADO') THEN 'RETIRADO'
       ELSE 'SIN_RELACION' END relacion
   FROM public.usuario u WHERE u.id<>v_responsable AND (p_despues_id IS NULL OR u.id>p_despues_id)
     AND (CASE WHEN p_modo='ID' THEN u.id=p_consulta::bigint
       ELSE strpos(lower(normalize(coalesce(u.nombre,''),NFC)),lower(p_consulta))>0 END)
   ORDER BY u.id LIMIT p_limite+1
 ), pagina AS (SELECT * FROM candidatos ORDER BY id LIMIT p_limite)
 SELECT coalesce(jsonb_agg(jsonb_build_object('usuario_id',id::text,'nombre_actual',nombre,'activo',activo,
     'relacion_historica',relacion) ORDER BY id),'[]'::jsonb),
   CASE WHEN (SELECT count(*) FROM candidatos)>p_limite THEN max(id)::text ELSE NULL END
 INTO v_data,v_siguiente FROM pagina;
 RETURN jsonb_build_object('data',v_data,'siguiente_id',v_siguiente,
   'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_p_estado_registro(p_actor_id BIGINT,p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('registro_plantacion_id',r.id::text,'codigo_trazabilidad',r.codigo_trazabilidad,
   'subcampania_id',r.subcampania_id::text,'es_reposicion',r.es_reposicion,'registro_plantacion_origen_id',r.registro_plantacion_origen_id::text,
   'estado_logico',coalesce(e.estado,'VIGENTE'),'tiene_correcciones',EXISTS(
     SELECT 1 FROM public.registro_plantacion_correccion c WHERE c.registro_plantacion_id=r.id),
   'revision_registro',r.revision_registro::text,'revision_grupo',coalesce(g.revision_grupo,0)::text,
   'relaciones',coalesce(public.pa_p_relacion_propia(p_actor_id,r.id),'[]'::jsonb),
   'cantidad_original',r.cantidad_total_plantada,'cantidad_efectiva',coalesce(e.cantidad_efectiva,r.cantidad_total_plantada),
   'especies_originales',coalesce((SELECT jsonb_agg(jsonb_build_object('planta_id',d.planta_id::text,'cantidad',d.cantidad) ORDER BY d.planta_id)
     FROM (SELECT planta_id,sum(cantidad)::int cantidad FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=r.id GROUP BY planta_id) d),'[]'::jsonb),
   'especies_efectivas',coalesce((SELECT jsonb_agg(jsonb_build_object('planta_id',d.planta_id::text,'cantidad',d.cantidad) ORDER BY d.planta_id)
     FROM (SELECT planta_id,sum(cantidad)::int cantidad FROM (
       SELECT planta_id,cantidad FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=r.id
       UNION ALL SELECT planta_id,cantidad FROM public.registro_plantacion_consumo_credito WHERE registro_plantacion_id=r.id AND correccion_id IS NOT NULL
       UNION ALL SELECT cr.planta_id,-co.cantidad FROM public.registro_plantacion_consumo_compensacion co
         JOIN public.registro_plantacion_consumo_credito cr ON cr.id=co.credito_id WHERE cr.registro_plantacion_id=r.id) lineas GROUP BY planta_id) d),'[]'::jsonb),
   'participantes',public.pa_p_participantes_snapshot(r.id),
   'registro_vigente_id',c.referencia_registro_vigente_id::text,
   'url_detalle_efectivo',CASE WHEN coalesce(e.estado,'VIGENTE')='VIGENTE' THEN '/api/v1/plantaciones/'||r.id||'/detalle-propio' ELSE NULL END)
 FROM public.registro_plantacion r
 LEFT JOIN public.registro_plantacion_efectivo e ON e.registro_plantacion_id=r.id
 LEFT JOIN public.registro_plantacion_correccion c ON c.id=e.ultima_correccion_id AND c.caso='DUPLICADO'
 LEFT JOIN public.registro_plantacion_grupo_revision g ON g.grupo_registro_id=CASE WHEN r.es_reposicion THEN r.registro_plantacion_origen_id ELSE r.id END
 WHERE r.id=p_registro_id
$$;

CREATE OR REPLACE FUNCTION public.pa_registro_estado_propio_leer(
 p_actor_id BIGINT,p_auth_id TEXT,p_registro_plantacion_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v JSONB;
BEGIN
 PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
 PERFORM 1 FROM public.registro_plantacion WHERE id=p_registro_plantacion_id FOR SHARE;
 IF jsonb_array_length(coalesce(public.pa_p_relacion_propia(p_actor_id,p_registro_plantacion_id),'[]'::jsonb))=0 THEN
   PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
 END IF;
 v:=public.pa_p_estado_registro(p_actor_id,p_registro_plantacion_id);
 RETURN jsonb_build_object('data',v,'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_historial_propio_leer(
 p_actor_id BIGINT,p_auth_id TEXT,p_registro_plantacion_id BIGINT,
 p_antes_id BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_contexto JSONB; v_data JSONB; v_siguiente TEXT;
BEGIN
 v_contexto:=public.pa_registro_estado_propio_leer(p_actor_id,p_auth_id,p_registro_plantacion_id);
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 OR p_antes_id<=0 THEN
   PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','La paginación no es válida.');
 END IF;
 WITH candidatos AS MATERIALIZED (
   SELECT c.* FROM public.registro_plantacion_correccion c WHERE c.registro_plantacion_id=p_registro_plantacion_id
     AND (p_antes_id IS NULL OR c.id<p_antes_id) ORDER BY c.id DESC LIMIT p_limite+1
 ), pagina AS (SELECT * FROM candidatos ORDER BY id DESC LIMIT p_limite)
 SELECT coalesce(jsonb_agg(jsonb_build_object('correccion_id',id::text,'caso',caso,
   'actor',jsonb_build_object('usuario_id',actor_id::text,'nombre_snapshot',actor_nombre_snapshot),
   'fecha',to_char(creado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'revision_anterior',revision_anterior::text,'revision_nueva',revision_nueva::text) ORDER BY id DESC),'[]'::jsonb),
   CASE WHEN (SELECT count(*) FROM candidatos)>p_limite THEN min(id)::text ELSE NULL END
 INTO v_data,v_siguiente FROM pagina;
 RETURN jsonb_build_object('data',v_data,'siguiente_id',v_siguiente,
   'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_mis_registros_estado_leer(
 p_actor_id BIGINT,p_auth_id TEXT,p_antes_id BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_data JSONB; v_siguiente TEXT;
BEGIN
 PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
 IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 50 OR p_antes_id<=0 THEN
   PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','La paginación no es válida.');
 END IF;
 WITH candidatos AS MATERIALIZED (
   SELECT r.id FROM public.registro_plantacion r
   WHERE jsonb_array_length(coalesce(public.pa_p_relacion_propia(p_actor_id,r.id),'[]'::jsonb))>0
     AND (p_antes_id IS NULL OR r.id<p_antes_id) ORDER BY r.id DESC LIMIT p_limite+1
 ), pagina AS (SELECT * FROM candidatos ORDER BY id DESC LIMIT p_limite)
 SELECT coalesce(jsonb_agg(public.pa_p_estado_registro(p_actor_id,id) ORDER BY id DESC),'[]'::jsonb),
   CASE WHEN (SELECT count(*) FROM candidatos)>p_limite THEN min(id)::text ELSE NULL END
 INTO v_data,v_siguiente FROM pagina;
 RETURN jsonb_build_object('data',v_data,'siguiente_id',v_siguiente,
   'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_registro_estado_publico_leer(p_registro_plantacion_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v RECORD; v_referencia JSONB;
BEGIN
 SELECT r.id,coalesce(e.estado,'VIGENTE') estado,e.ultima_correccion_id,c.caso,c.referencia_registro_vigente_id
 INTO v FROM public.registro_plantacion r JOIN public.subcampania s ON s.id=r.subcampania_id
 JOIN public.campania ca ON ca.id=s.campania_id AND ca.deleted_at IS NULL
 LEFT JOIN public.registro_plantacion_efectivo e ON e.registro_plantacion_id=r.id
 LEFT JOIN public.registro_plantacion_correccion c ON c.id=e.ultima_correccion_id
 WHERE r.id=p_registro_plantacion_id AND s.deleted_at IS NULL AND s.estado::text IN('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL');
 IF NOT FOUND THEN PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.'); END IF;
 IF v.estado='REVERTIDO' AND v.caso='DUPLICADO' AND EXISTS(
   SELECT 1 FROM public.registro_plantacion ref JOIN public.subcampania s ON s.id=ref.subcampania_id
   JOIN public.campania ca ON ca.id=s.campania_id AND ca.deleted_at IS NULL
   LEFT JOIN public.registro_plantacion_efectivo e ON e.registro_plantacion_id=ref.id
   WHERE ref.id=v.referencia_registro_vigente_id AND s.deleted_at IS NULL
     AND s.estado::text IN('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL') AND coalesce(e.estado,'VIGENTE')='VIGENTE') THEN
   v_referencia:=jsonb_build_object('registro_plantacion_id',v.referencia_registro_vigente_id::text,
     'url_publica','/api/v1/impact/registros/'||v.referencia_registro_vigente_id);
 END IF;
 RETURN jsonb_build_object('data',jsonb_build_object('registro_plantacion_id',v.id::text,
   'estado_logico',v.estado,'tiene_correcciones',EXISTS(SELECT 1 FROM public.registro_plantacion_correccion c WHERE c.registro_plantacion_id=v.id),
   'url_detalle_efectivo',CASE WHEN v.estado='VIGENTE' THEN '/api/v1/impact/registros/'||v.id ELSE NULL END,
   'registro_vigente',v_referencia),'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

-- Permisos privados por columna. No escribir ni borrar snapshots originales.
GRANT INSERT(registro_plantacion_id,usuario_id,coresponsable_original_id,procedencia,nombre_snapshot,
  afiliacion_snapshot,afiliacion_estado,afiliacion_tipo,organizacion_id_snapshot,snapshot_capturado_en,
  correccion_incorporacion_id,ultima_correccion_id),UPDATE(estado,procedencia,ultima_correccion_id)
  ON public.registro_plantacion_participante_efectivo TO service_role;
DO $$ DECLARE r RECORD; rol TEXT; BEGIN
 FOR r IN SELECT * FROM pg_temp.pa_int07_085_funciones LOOP
   IF md5((SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure(r.firma))) IS DISTINCT FROM r.nuevo THEN
     RAISE EXCEPTION 'PA_INT07_PART_CUERPO_INSTALADO_INCOMPATIBLE: %',r.firma;
   END IF;
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.firma);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.firma);
   FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_function_privilege(rol,r.firma,'EXECUTE') THEN
       RAISE EXCEPTION 'PA_INT07_PART_FUNCION_PRIVILEGIO_HEREDADO: %.%',rol,r.firma;
     END IF;
   END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN(SELECT split_part(split_part(firma,'(',1),'.',2) FROM pg_temp.pa_int07_085_funciones)
     AND NOT EXISTS(SELECT 1 FROM pg_temp.pa_int07_085_funciones f WHERE to_regprocedure(f.firma)=p.oid)) THEN
   RAISE EXCEPTION 'PA_INT07_PART_OVERLOAD_INCOMPATIBLE';
 END IF;
 FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_any_column_privilege(rol,'public.registro_plantacion_participante_efectivo','SELECT,INSERT,UPDATE,REFERENCES')
     OR has_table_privilege(rol,'public.registro_plantacion_participante_efectivo','DELETE,TRUNCATE,TRIGGER') THEN
     RAISE EXCEPTION 'PA_INT07_PART_TABLA_PRIVILEGIO_HEREDADO: %',rol;
   END IF;
 END LOOP;
 IF has_table_privilege('service_role','public.registro_plantacion_participante_efectivo','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
   OR has_any_column_privilege('service_role','public.registro_plantacion_participante_efectivo','REFERENCES')
   OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.registro_plantacion_participante_efectivo'::regclass
     AND a.attnum>0 AND NOT a.attisdropped AND a.attname NOT IN('estado','procedencia','ultima_correccion_id')
     AND has_column_privilege('service_role',a.attrelid,a.attnum,'UPDATE')) THEN
   RAISE EXCEPTION 'PA_INT07_PART_SERVICIO_PRIVILEGIO_EXCESIVO';
 END IF;
 IF current_setting('server_version_num')::integer>=170000 THEN
   FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
     IF has_table_privilege(rol,'public.registro_plantacion_participante_efectivo','MAINTAIN') THEN
       RAISE EXCEPTION 'PA_INT07_PART_MAINTAIN_INESPERADO: %',rol;
     END IF;
   END LOOP;
 END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
