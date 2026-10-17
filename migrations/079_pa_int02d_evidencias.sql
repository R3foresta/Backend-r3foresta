-- PA-T-INT02-D: carga interna de reposición privada, separada de inicial v1.
-- Requiere 074–078. No migra ni borra binarios/URLs históricos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.pa_d_evidencias_reposicion(
 p_actor_id BIGINT,p_subcampania_id BIGINT,p_accion TEXT,p_payload JSONB DEFAULT '{}'
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_rol TEXT; s public.subcampania%ROWTYPE; v_campania BIGINT; v_tipo BIGINT;
 f JSONB; v_id BIGINT; v_result JSONB:='[]'; v_path TEXT; e RECORD;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 v_rol:=public.pa_d_cuenta(p_actor_id);
 IF v_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RETURN public.pa_c_fuera(403,'AUTORIDAD_INSUFICIENTE','La reposición requiere autoridad interna.',NULL); END IF;
 SELECT campania_id INTO v_campania FROM public.subcampania WHERE id=p_subcampania_id;
 PERFORM 1 FROM public.campania WHERE id=v_campania AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN public.pa_c_fuera(404,'AMBITO_NO_DISPONIBLE','El ámbito no está disponible.',NULL); END IF;
 SELECT * INTO s FROM public.subcampania WHERE id=p_subcampania_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN public.pa_c_fuera(404,'AMBITO_NO_DISPONIBLE','El ámbito no está disponible.',NULL); END IF;
 -- ADMIN también pertenece al equipo en este recorrido interno.
 IF NOT EXISTS(SELECT 1 FROM public.subcampania_equipo WHERE subcampania_id=s.id AND usuario_id=p_actor_id AND rol::text IN ('COORDINADOR','OPERARIO')) THEN
   RETURN public.pa_c_fuera(403,'AUTORIDAD_INSUFICIENTE','No pertenece al equipo operativo del ámbito.',NULL);
 END IF;
 IF s.estado::text NOT IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL') THEN
   RETURN public.pa_c_fuera(409,'ESTADO_INCOMPATIBLE','El estado no admite reposición.',NULL);
 END IF;
 SELECT id INTO v_tipo FROM public.tipos_entidad_evidencia WHERE codigo='REGISTRO_PLANTACION' AND activo;
 IF v_tipo IS NULL THEN RETURN public.pa_c_fuera(409,'CONTEXTO_INCOMPLETO','Falta el tipo de evidencia.',NULL); END IF;
 IF p_accion='AUTORIZAR' THEN RETURN public.pa_cargas_respuesta(200,jsonb_build_object('subcampania_id',s.id::text)); END IF;
 IF p_accion='CREAR' THEN
   IF jsonb_typeof(p_payload->'fotos') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'fotos') NOT BETWEEN 1 AND 10 THEN
     RETURN public.pa_c_fuera(422,'EVIDENCIA_INVALIDA','Debe enviar entre 1 y 10 fotos.',NULL);
   END IF;
   -- Validar todas antes de crear alguna: rutas/tipo/tamaño/huellas fijados por servidor.
   FOR f IN SELECT value FROM jsonb_array_elements(p_payload->'fotos') LOOP
     v_path:='^reposiciones/'||p_actor_id||'/'||s.id||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original$';
     IF COALESCE(f->>'ruta_original','') !~ v_path
       OR f->>'ruta_derivada' IS DISTINCT FROM regexp_replace(f->>'ruta_original','/original$','/derivada.jpg')
       OR COALESCE(f->>'hash_original','') !~ '^[0-9a-f]{64}$' OR COALESCE(f->>'hash_derivada','') !~ '^[0-9a-f]{64}$'
       OR COALESCE(f->>'mime_original','') NOT IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')
       OR COALESCE(f->>'tamano_original','') !~ '^[0-9]{1,8}$' THEN
       RETURN public.pa_c_fuera(422,'EVIDENCIA_INVALIDA','La evidencia no es válida.',NULL);
     END IF;
     IF (f->>'tamano_original')::bigint NOT BETWEEN 1 AND 10485760 THEN RETURN public.pa_c_fuera(422,'EVIDENCIA_INVALIDA','El tamaño no es válido.',NULL); END IF;
   END LOOP;
   FOR f IN SELECT value FROM jsonb_array_elements(p_payload->'fotos') LOOP
     INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_por_usuario_id)
       VALUES(v_tipo,0,'participacion_evidencias',f->>'ruta_original','FOTO',f->>'mime_original',(f->>'tamano_original')::bigint,f->>'hash_original',f->>'titulo',f->>'descripcion',
       jsonb_build_object('origen','PLANTACION_REGISTRO_PENDIENTE','estado','PENDIENTE_VINCULACION','subcampania_id',s.id::text,'proposito','REPOSICION','ruta_derivada',f->>'ruta_derivada','hash_derivada',f->>'hash_derivada','derivada_sanitizada',true),false,jsonb_array_length(v_result),(f->>'tomado_en')::timestamptz,p_actor_id)
       RETURNING id INTO v_id;
     v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id::text));
   END LOOP;
   RETURN public.pa_cargas_respuesta(201,v_result);
 ELSIF p_accion='DESCARTAR' THEN
   IF jsonb_typeof(p_payload->'evidencia_ids') IS DISTINCT FROM 'array' THEN RETURN public.pa_c_fuera(422,'EVIDENCIA_INVALIDA','Faltan evidencias.',NULL); END IF;
   FOR e IN SELECT ev.* FROM public.evidencias_trazabilidad ev
     WHERE ev.id IN (SELECT value::text::bigint FROM jsonb_array_elements(p_payload->'evidencia_ids'))
       AND ev.creado_por_usuario_id=p_actor_id AND ev.tipo_entidad_id=v_tipo
       AND ev.bucket='participacion_evidencias' AND COALESCE(ev.entidad_id,0)=0
       AND ev.metadata->>'subcampania_id'=s.id::text AND ev.metadata->>'proposito'='REPOSICION'
       AND ev.ruta_archivo ~ ('^reposiciones/'||p_actor_id||'/'||s.id||'/[0-9a-f-]{36}/original$')
       AND ev.metadata->>'ruta_derivada'=regexp_replace(ev.ruta_archivo,'/original$','/derivada.jpg')
     ORDER BY ev.id FOR UPDATE LOOP
     UPDATE public.evidencias_trazabilidad SET eliminado_en=COALESCE(eliminado_en,clock_timestamp()),eliminado_por_usuario_id=p_actor_id,actualizado_por_usuario_id=p_actor_id,actualizado_en=clock_timestamp() WHERE id=e.id;
     v_result:=v_result||jsonb_build_array(jsonb_build_object('id',e.id::text,'ruta_original',e.ruta_archivo,'ruta_derivada',e.metadata->>'ruta_derivada'));
   END LOOP;
   RETURN public.pa_cargas_respuesta(200,v_result);
 END IF;
 RETURN public.pa_c_fuera(422,'ACCION_INVALIDA','La acción no está disponible.',NULL);
END $$;

-- Única puerta anónima de foto: solo devuelve la ruta del JPEG sanitizado.
CREATE OR REPLACE FUNCTION public.pa_foto_publica(p_evidencia_id BIGINT) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_bucket TEXT; v_derivada TEXT;
BEGIN
 SELECT x.bucket,x.ruta_derivada INTO v_bucket,v_derivada FROM public.participacion_carga x
 JOIN public.evidencias_trazabilidad e ON e.id=x.evidencia_id AND e.creado_por_usuario_id=x.actor_id AND e.tipo_entidad_id=x.tipo_entidad_id
   AND e.bucket=x.bucket AND e.ruta_archivo=x.ruta_original AND e.hash_sha256=encode(x.hash_original_sha256,'hex')
 JOIN public.registro_plantacion r ON r.id=e.entidad_id AND r.subcampania_id=x.subcampania_id
 JOIN public.subcampania s ON s.id=r.subcampania_id
 JOIN public.campania ca ON ca.id=s.campania_id AND ca.deleted_at IS NULL
 JOIN public.participacion_comando c ON c.id=x.comando_interno_id AND c.estado='CONFIRMADO' AND c.registro_plantacion_id=r.id
 WHERE x.evidencia_id=p_evidencia_id AND x.estado='VINCULADA' AND x.objetos_verificados_en IS NOT NULL
   AND e.eliminado_en IS NULL AND s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL');
 IF NOT FOUND THEN
   SELECT e.bucket,e.metadata->>'ruta_derivada' INTO v_bucket,v_derivada FROM public.evidencias_trazabilidad e
   JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id AND t.codigo='REGISTRO_PLANTACION' AND t.activo
   JOIN public.registro_plantacion r ON r.id=e.entidad_id AND r.es_reposicion
   JOIN public.subcampania s ON s.id=r.subcampania_id AND s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL')
   JOIN public.campania ca ON ca.id=s.campania_id AND ca.deleted_at IS NULL
   WHERE e.id=p_evidencia_id AND e.eliminado_en IS NULL AND e.bucket='participacion_evidencias'
     AND e.metadata->>'subcampania_id'=s.id::text AND e.metadata->>'proposito'='REPOSICION'
     AND e.metadata->>'derivada_sanitizada'='true' AND COALESCE(e.metadata->>'hash_derivada','') ~ '^[0-9a-f]{64}$'
     AND e.ruta_archivo ~ ('^reposiciones/'||e.creado_por_usuario_id||'/'||s.id||'/[0-9a-f-]{36}/original$')
     AND e.metadata->>'ruta_derivada'=regexp_replace(e.ruta_archivo,'/original$','/derivada.jpg');
 END IF;
 IF NOT FOUND THEN RETURN public.pa_c_fuera(404,'IMAGEN_NO_ENCONTRADA','La imagen no está disponible.',NULL); END IF;
 RETURN public.pa_cargas_respuesta(200,jsonb_build_object('bucket',v_bucket,'ruta_derivada',v_derivada));
END $$;
-- Proyección interna para sanitizar al vuelo fotografías históricas elegibles.
-- La API pública nunca recibe este objeto; solo el servidor descarga sus bytes.
CREATE OR REPLACE FUNCTION public.pa_d_foto_legada_publica(p_evidencia_id BIGINT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE e RECORD;
BEGIN
 SELECT ev.bucket,ev.ruta_archivo INTO e FROM public.evidencias_trazabilidad ev
 JOIN public.tipos_entidad_evidencia t ON t.id=ev.tipo_entidad_id AND t.codigo='REGISTRO_PLANTACION' AND t.activo
 JOIN public.registro_plantacion r ON r.id=ev.entidad_id
 JOIN public.subcampania s ON s.id=r.subcampania_id AND s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL')
 JOIN public.campania c ON c.id=s.campania_id AND c.deleted_at IS NULL
 WHERE ev.id=p_evidencia_id AND ev.eliminado_en IS NULL AND ev.bucket='recoleccion_fotos'
   AND ev.tipo_archivo='FOTO' AND ev.entidad_id>0;
 IF NOT FOUND THEN RETURN public.pa_c_fuera(404,'IMAGEN_NO_ENCONTRADA','La imagen no está disponible.',NULL); END IF;
 RETURN public.pa_cargas_respuesta(200,jsonb_build_object('bucket',e.bucket,'ruta_original',e.ruta_archivo));
END $$;
REVOKE ALL ON FUNCTION public.pa_d_foto_legada_publica(BIGINT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pa_d_foto_legada_publica(BIGINT) TO service_role;
REVOKE ALL ON FUNCTION public.pa_d_evidencias_reposicion(BIGINT,BIGINT,TEXT,JSONB),public.pa_foto_publica(BIGINT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pa_d_evidencias_reposicion(BIGINT,BIGINT,TEXT,JSONB),public.pa_foto_publica(BIGINT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
