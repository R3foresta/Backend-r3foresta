-- PA-T-INT02-C BE01..03. Lecturas privadas: no crean cuentas, permisos o revisiones.
-- Requiere 064/070. No depende de la RPC de escritura 072.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- lower() depende de LC_CTYPE/collation del catálogo. Un locale C no cumple
-- la comparación Unicode del nombre; no publicar una búsqueda incompatible.
DO $$ BEGIN
  IF current_setting('server_encoding')<>'UTF8' OR lower(normalize('ÁÉÑ',NFC))<>'áéñ' THEN
    RAISE EXCEPTION 'PA_INT02C_NORMALIZACION_UNICODE_INCOMPATIBLE: cotejar encoding y locale del catálogo';
  END IF;
END $$;

-- Índices no únicos: las colisiones legadas siguen siendo cuentas distintas.
-- Este btree ayuda correo/orden; no garantiza acelerar búsqueda substring.
CREATE INDEX IF NOT EXISTS usuario_correo_normalizado_pa_idx ON public.usuario(lower(btrim(correo))) WHERE activo;
CREATE INDEX IF NOT EXISTS usuario_nombre_normalizado_pa_idx ON public.usuario
  (lower(normalize(COALESCE(NULLIF(btrim(nombre),''),btrim(username)),NFC)),id) WHERE activo;

CREATE OR REPLACE FUNCTION public.pa_lecturas_actor(p_actor_id BIGINT,p_auth_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_activo BOOLEAN;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  SELECT rol::text,activo INTO v_rol,v_activo FROM public.usuario
    WHERE id=p_actor_id AND auth_id=p_auth_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESION_INVALIDA' USING ERRCODE='PT401', DETAIL='{"codigo":"SESION_INVALIDA","mensaje":"La sesión no es válida.","campos":[],"ambitos":[],"reintento":"RECUPERAR_SESION"}'; END IF;
  IF NOT v_activo THEN RAISE EXCEPTION 'CUENTA_INACTIVA' USING ERRCODE='PT403', DETAIL='{"codigo":"CUENTA_INACTIVA","mensaje":"La cuenta está inactiva.","campos":[],"ambitos":[],"reintento":"RECUPERAR_SESION"}'; END IF;
  RETURN v_rol;
END $$;

CREATE OR REPLACE FUNCTION public.pa_lecturas_ambitos_validar(
  p_actor_id BIGINT,p_rol TEXT,p_ids BIGINT[],p_accion TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_id BIGINT; v_estado TEXT; v_cantidad INTEGER:=0;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM unnest(p_ids) i WHERE i IS NULL OR i<=0)
    OR (SELECT count(DISTINCT i) FROM unnest(p_ids) i)<>cardinality(p_ids)
    OR p_accion IS NULL OR p_accion NOT IN('GESTIONAR','OTORGAR_PLANTADOR','DESIGNAR_ADMINISTRADOR','REEMPLAZAR_ADMINISTRADOR') THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"La entrada no cumple el contrato v1.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
  END IF;
  -- Actor antes de ámbitos; ámbitos siempre ASC. No revela IDs ajenos/inexistentes.
  FOR v_id,v_estado IN
    SELECT s.id,s.estado::text FROM public.subcampania s JOIN public.campania c ON c.id=s.campania_id
      WHERE s.id=ANY(p_ids) AND s.deleted_at IS NULL AND c.deleted_at IS NULL ORDER BY s.id FOR SHARE OF s
  LOOP
    v_cantidad:=v_cantidad+1;
    IF p_rol<>'ADMIN' AND (p_accion IN('DESIGNAR_ADMINISTRADOR','REEMPLAZAR_ADMINISTRADOR')
      OR NOT EXISTS(SELECT 1 FROM public.subcampania_permiso p
        WHERE p.subcampania_id=v_id AND p.usuario_id=p_actor_id AND p.revocado_en IS NULL
          AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA')) THEN
      RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='PT403', DETAIL='{"codigo":"CAPACIDAD_INSUFICIENTE","mensaje":"No tiene capacidad para esta operación.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
    END IF;
  END LOOP;
  IF v_cantidad<>cardinality(p_ids) THEN RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='PT403', DETAIL='{"codigo":"CAPACIDAD_INSUFICIENTE","mensaje":"No tiene capacidad para esta operación.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  -- La selección completa se autoriza antes de informar incompatibilidad de estado.
  IF p_accion IN('OTORGAR_PLANTADOR','DESIGNAR_ADMINISTRADOR') AND
    EXISTS(SELECT 1 FROM public.subcampania WHERE id=ANY(p_ids) AND estado::text NOT IN('BORRADOR','ACTIVA')) THEN
    RAISE EXCEPTION 'ESTADO_NO_ADMITE_ACCESO' USING ERRCODE='PT409', DETAIL='{"codigo":"ESTADO_NO_ADMITE_ACCESO","mensaje":"El estado no admite la operación.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
  END IF;
  IF p_accion='REEMPLAZAR_ADMINISTRADOR' AND
    EXISTS(SELECT 1 FROM public.subcampania WHERE id=ANY(p_ids) AND estado::text NOT IN('BORRADOR','ACTIVA','COMPLETADA','FINALIZADA_PARCIAL','CANCELADA')) THEN
    RAISE EXCEPTION 'ESTADO_NO_ADMITE_ACCESO' USING ERRCODE='PT409', DETAIL='{"codigo":"ESTADO_NO_ADMITE_ACCESO","mensaje":"El estado no admite la operación.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pa_capacidades_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_campania_id BIGINT,p_despues_id BIGINT,p_limite INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_rows JSONB; v_observado TEXT;
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 101 OR p_campania_id<=0 OR p_despues_id<=0 THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"La entrada no cumple el contrato v1.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  v_observado:=to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'campania_id',q.campania_id::text,'campania_nombre',q.campania_nombre,'subcampania_id',q.id::text,
    'nombre',q.nombre,'estado',q.estado,'permiso_contextual',q.rol_contextual,
    'revision_permiso',COALESCE(q.revision,0)::text,'fuente_autoridad',CASE WHEN v_rol='ADMIN' THEN 'GLOBAL' ELSE 'CONTEXTUAL' END,
    'acciones',jsonb_build_object(
      'preparar_registro',q.estado='ACTIVA','registrar_inicial',q.estado='ACTIVA',
      'incorporar_plantador',(v_rol='ADMIN' OR q.rol_contextual='ADMINISTRADOR_SUBCAMPANIA') AND q.estado IN('BORRADOR','ACTIVA'),
      'retirar_plantador',(v_rol='ADMIN' OR q.rol_contextual='ADMINISTRADOR_SUBCAMPANIA') AND q.estado IN('BORRADOR','ACTIVA','COMPLETADA','FINALIZADA_PARCIAL','CANCELADA'),
      'designar_administrador',v_rol='ADMIN' AND q.estado IN('BORRADOR','ACTIVA'),
      'cambiar_administrador',v_rol='ADMIN' AND q.estado IN('BORRADOR','ACTIVA','COMPLETADA','FINALIZADA_PARCIAL','CANCELADA'),
      'retirar_administrador',v_rol='ADMIN' AND q.estado IN('BORRADOR','ACTIVA','COMPLETADA','FINALIZADA_PARCIAL','CANCELADA'),
      'reemplazar_administrador',v_rol='ADMIN' AND q.estado IN('BORRADOR','ACTIVA','COMPLETADA','FINALIZADA_PARCIAL','CANCELADA'))
    ) ORDER BY q.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT s.id,s.campania_id,c.nombre campania_nombre,s.nombre,s.estado::text estado,p.rol_contextual,r.revision
    FROM public.subcampania s JOIN public.campania c ON c.id=s.campania_id
    LEFT JOIN public.subcampania_permiso p ON p.subcampania_id=s.id AND p.usuario_id=p_actor_id AND p.revocado_en IS NULL
    LEFT JOIN public.subcampania_permiso_revision r ON r.subcampania_id=s.id AND r.usuario_id=p_actor_id
    WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL AND (v_rol='ADMIN' OR p.id IS NOT NULL)
      AND (p_campania_id IS NULL OR s.campania_id=p_campania_id)
      AND (p_despues_id IS NULL OR s.id>p_despues_id)
    ORDER BY s.id LIMIT p_limite
  ) q;
  RETURN jsonb_build_object('data',jsonb_build_object('actor',jsonb_build_object('usuario_id',p_actor_id::text,'rol_global',v_rol),
    'capacidades_globales',jsonb_build_object('asignar_roles',v_rol='ADMIN','designar_administradores',v_rol='ADMIN','leer_plan',true),
    'subcampanias',v_rows),'observado_en',v_observado);
END $$;

CREATE OR REPLACE FUNCTION public.pa_miembros_participacion_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_subcampania_id BIGINT,p_despues_id BIGINT,p_limite INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_rows JSONB; v_nombre TEXT;
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 101 OR p_despues_id<=0 THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"La entrada no cumple el contrato v1.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  PERFORM public.pa_lecturas_ambitos_validar(p_actor_id,v_rol,ARRAY[p_subcampania_id],'GESTIONAR');
  IF p_despues_id IS NOT NULL THEN
    SELECT lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)) INTO v_nombre
      FROM public.usuario u WHERE u.id=p_despues_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"El cursor no es válido.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(q.fila ORDER BY q.nombre_orden,q.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT u.id,lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)) nombre_orden,
      jsonb_build_object('usuario_id',u.id::text,'nombre',COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),
        'organizacion',CASE WHEN u.organizacion_id IS NOT NULL THEN o.nombre ELSE NULLIF(btrim(u.organizacion),'') END,
        'permiso_contextual',p.rol_contextual,'revision_permiso',COALESCE(r.revision,0)::text,
        'acceso_global',u.activo AND u.rol::text='ADMIN','etiqueta_acceso_global',CASE WHEN u.activo AND u.rol::text='ADMIN' THEN 'Administrador · Acceso global' ELSE NULL END,
        'responsabilidad_logistica',e.rol::text) fila
    FROM public.usuario u LEFT JOIN public.organizacion o ON o.id=u.organizacion_id
    LEFT JOIN public.subcampania_permiso p ON p.usuario_id=u.id AND p.subcampania_id=p_subcampania_id AND p.revocado_en IS NULL
    LEFT JOIN public.subcampania_permiso_revision r ON r.usuario_id=u.id AND r.subcampania_id=p_subcampania_id
    LEFT JOIN public.subcampania_equipo e ON e.usuario_id=u.id AND e.subcampania_id=p_subcampania_id
    WHERE ((u.activo AND u.rol::text='ADMIN') OR p.id IS NOT NULL OR e.id IS NOT NULL)
      AND (p_despues_id IS NULL OR (lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)),u.id)>(v_nombre,p_despues_id))
    ORDER BY nombre_orden,u.id LIMIT p_limite
  ) q;
  RETURN jsonb_build_object('data',v_rows,'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_personas_buscar(
  p_actor_id BIGINT,p_auth_id TEXT,p_modo TEXT,p_consulta TEXT,p_accion TEXT,
  p_subcampania_ids BIGINT[],p_despues_id BIGINT,p_limite INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_rows JSONB; v_nombre TEXT; v_consulta TEXT;
BEGIN
  v_consulta:=CASE WHEN p_modo='NOMBRE' THEN normalize(btrim(p_consulta),NFC) ELSE btrim(p_consulta) END;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 21 OR p_despues_id<=0 OR p_modo IS NULL OR p_modo NOT IN('NOMBRE','CORREO_EXACTO')
    OR v_consulta IS NULL OR (p_modo='NOMBRE' AND char_length(v_consulta) NOT BETWEEN 2 AND 100)
    OR (p_modo='CORREO_EXACTO' AND char_length(v_consulta) NOT BETWEEN 1 AND 254)
    OR p_accion IS NULL OR p_accion NOT IN('OTORGAR_PLANTADOR','DESIGNAR_ADMINISTRADOR','REEMPLAZAR_ADMINISTRADOR') THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"La entrada no cumple el contrato v1.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  PERFORM public.pa_lecturas_ambitos_validar(p_actor_id,v_rol,p_subcampania_ids,p_accion);
  IF p_despues_id IS NOT NULL THEN
    SELECT lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)) INTO v_nombre
      FROM public.usuario u WHERE u.id=p_despues_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"El cursor no es válido.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(q.fila ORDER BY q.nombre_orden,q.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT u.id,lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)) nombre_orden,
      jsonb_build_object('usuario_id',u.id::text,'nombre',COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),
        'organizacion',CASE WHEN u.organizacion_id IS NOT NULL THEN o.nombre ELSE NULLIF(btrim(u.organizacion),'') END) fila
    FROM public.usuario u LEFT JOIN public.organizacion o ON o.id=u.organizacion_id
    WHERE u.activo AND CASE WHEN p_modo='NOMBRE' THEN
      strpos(lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)),lower(v_consulta))>0
      ELSE lower(btrim(u.correo))=lower(v_consulta) END
      AND (p_despues_id IS NULL OR (lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)),u.id)>(v_nombre,p_despues_id))
    ORDER BY nombre_orden,u.id LIMIT p_limite
  ) q;
  RETURN jsonb_build_object('data',v_rows,'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;

CREATE OR REPLACE FUNCTION public.pa_accesos_revisar(
  p_actor_id BIGINT,p_auth_id TEXT,p_usuario_destino_id BIGINT,p_subcampania_ids BIGINT[])
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_usuario JSONB; v_global BOOLEAN; v_ambitos JSONB;
BEGIN
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  PERFORM public.pa_lecturas_ambitos_validar(p_actor_id,v_rol,p_subcampania_ids,'GESTIONAR');
  SELECT jsonb_build_object('usuario_id',u.id::text,'nombre',COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),
      'organizacion',CASE WHEN u.organizacion_id IS NOT NULL THEN o.nombre ELSE NULLIF(btrim(u.organizacion),'') END),
      u.activo AND u.rol::text='ADMIN' INTO v_usuario,v_global
    FROM public.usuario u LEFT JOIN public.organizacion o ON o.id=u.organizacion_id
    WHERE u.id=p_usuario_destino_id AND (u.activo OR EXISTS(SELECT 1 FROM public.subcampania_permiso p
      WHERE p.usuario_id=u.id AND p.subcampania_id=ANY(p_subcampania_ids)));
  IF NOT FOUND THEN RAISE EXCEPTION 'RECURSO_NO_VISIBLE' USING ERRCODE='PT404', DETAIL='{"codigo":"RECURSO_NO_VISIBLE","mensaje":"El recurso no está disponible.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  SELECT jsonb_agg(jsonb_build_object('subcampania_id',i::text,'permiso_contextual',p.rol_contextual,
    'revision_permiso',COALESCE(r.revision,0)::text,'acceso_global',v_global) ORDER BY i) INTO v_ambitos
    FROM unnest(p_subcampania_ids) i
    LEFT JOIN public.subcampania_permiso p ON p.subcampania_id=i AND p.usuario_id=p_usuario_destino_id AND p.revocado_en IS NULL
    LEFT JOIN public.subcampania_permiso_revision r ON r.subcampania_id=i AND r.usuario_id=p_usuario_destino_id;
  RETURN jsonb_build_object('data',jsonb_build_object('usuario',v_usuario,'ambitos',v_ambitos),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;

-- Se revisan todas las sobrecargas con estos nombres, incluidos helpers.
DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('pa_lecturas_actor','pa_lecturas_ambitos_validar',
      'pa_capacidades_leer','pa_miembros_participacion_leer','pa_personas_buscar','pa_accesos_revisar') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.pa_lecturas_actor(BIGINT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_lecturas_ambitos_validar(BIGINT,TEXT,BIGINT[],TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_capacidades_leer(BIGINT,TEXT,BIGINT,BIGINT,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_miembros_participacion_leer(BIGINT,TEXT,BIGINT,BIGINT,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_personas_buscar(BIGINT,TEXT,TEXT,TEXT,TEXT,BIGINT[],BIGINT,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.pa_accesos_revisar(BIGINT,TEXT,BIGINT,BIGINT[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
