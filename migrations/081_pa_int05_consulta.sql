-- PA-T-INT05: proyecciones de lectura, sin nuevas tablas ni autoridad.
-- Requiere 074–080 y PostGIS. Una llamada STABLE comparte instantánea entre
-- agregados/mapa/lista. No concede acceso raw a anon/authenticated.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF to_regprocedure('public.pa_foto_publica(bigint)') IS NULL
   OR to_regprocedure('public.pa_d_foto_legada_publica(bigint)') IS NULL
   OR to_regprocedure('public.pa_lecturas_actor(bigint,text)') IS NULL
   OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
     AND table_name='registro_plantacion' AND column_name='afiliacion_responsable_estado') THEN
   RAISE EXCEPTION 'PA_INT05_ANTECEDENTE_INCOMPLETO: requiere catálogo074–080 cotejado';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pa_i_personas(p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'nombre',nombre,'es_responsable',responsable,
   'afiliacion',jsonb_build_object('estado',estado,'tipo',tipo,'nombre',afiliacion,'organizacion_id',organizacion::text))
   ORDER BY responsable DESC,persona_id),'[]'::jsonb)
 FROM (
   SELECT r.responsable_id persona_id,r.nombre_responsable_snapshot nombre,true responsable,
     r.afiliacion_responsable_estado estado,r.afiliacion_responsable_tipo tipo,
     r.afiliacion_responsable_snapshot afiliacion,r.organizacion_responsable_id_snapshot organizacion
   FROM public.registro_plantacion r WHERE r.id=p_registro_id
   UNION ALL
   SELECT c.usuario_id,c.nombre_snapshot,false,c.afiliacion_estado,c.afiliacion_tipo,c.afiliacion_snapshot,c.organizacion_id_snapshot
   FROM public.registro_plantacion_coresponsable c JOIN public.registro_plantacion r ON r.id=c.registro_plantacion_id
   WHERE c.registro_plantacion_id=p_registro_id AND c.usuario_id<>r.responsable_id
 ) personas;
$$;

CREATE OR REPLACE FUNCTION public.pa_i_registro(p_registro_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
   'id',r.id::text,'codigo_trazabilidad',r.codigo_trazabilidad,
   'campania_id',s.campania_id::text,'subcampania_id',s.id::text,
   'campania_nombre',ca.nombre,'subcampania_nombre',coalesce(r.nombre_subcampania_snapshot,s.nombre),
   'fecha_plantacion',r.fecha_plantacion::text,'cantidad_total_plantada',r.cantidad_total_plantada,
   'es_reposicion',r.es_reposicion,'registro_plantacion_origen_id',r.registro_plantacion_origen_id::text,
   'latitud',r.latitud,'longitud',r.longitud,'gps_dentro_poligono',r.gps_dentro_poligono,
   'especies',coalesce((SELECT jsonb_agg(jsonb_build_object('planta_id',d.planta_id::text,
     'nombre',d.nombre,'cantidad',d.cantidad) ORDER BY d.planta_id)
     FROM (SELECT planta_id,max(coalesce(nombre_comercial_snapshot,nombre_cientifico_snapshot)) nombre,sum(cantidad) cantidad
       FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=r.id GROUP BY planta_id) d),'[]'::jsonb),
   'personas',public.pa_i_personas(r.id),
   'seguimiento',jsonb_build_object('bajas_reportadas',r.cantidad_muerta_acumulada,
     'reposiciones_registradas',r.cantidad_repuesta_acumulada,
     'bajas',coalesce((SELECT jsonb_agg(jsonb_build_object('evento_id',ev.id::text,
       'fecha',to_char(ev.fecha_evento AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'cantidad',ev.cantidad_muerta_delta) ORDER BY ev.fecha_evento,ev.id)
       FROM public.evento_plantacion ev WHERE ev.registro_plantacion_id=r.id
         AND ev.subcampania_id=r.subcampania_id AND ev.tipo_evento::text='MORTANDAD_REPORTADA'
         AND ev.cantidad_muerta_delta>0),'[]'::jsonb),
     'reposiciones',coalesce((SELECT jsonb_agg(jsonb_build_object('registro_id',rp.id::text,
       'fecha',rp.fecha_plantacion::text,'cantidad',rp.cantidad_total_plantada,
       'url_publica','/api/v1/impact/registros/'||rp.id) ORDER BY rp.fecha_plantacion,rp.id)
       FROM public.registro_plantacion rp WHERE rp.registro_plantacion_origen_id=r.id
         AND rp.subcampania_id=r.subcampania_id AND rp.es_reposicion),'[]'::jsonb)),
   'fotos',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'url','/api/v1/impact/imagenes/'||e.id) ORDER BY e.id)
     FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
     WHERE e.entidad_id=r.id AND e.eliminado_en IS NULL AND t.codigo='REGISTRO_PLANTACION' AND t.activo
       AND ((public.pa_foto_publica(e.id)->>'http_status')::int=200
         OR (public.pa_d_foto_legada_publica(e.id)->>'http_status')::int=200)),'[]'::jsonb),
   'organizaciones_campania',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id::text,'nombre',o.nombre) ORDER BY o.id)
     FROM public.campania_organizacion co JOIN public.organizacion o ON o.id=co.organizacion_id
     WHERE co.campania_id=s.campania_id),'[]'::jsonb),
   'url_publica','/api/v1/impact/registros/'||r.id)
 FROM public.registro_plantacion r JOIN public.subcampania s ON s.id=r.subcampania_id
 JOIN public.campania ca ON ca.id=s.campania_id AND ca.deleted_at IS NULL
 WHERE r.id=p_registro_id AND s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL');
$$;

CREATE OR REPLACE FUNCTION public.pa_impacto_leer(
 p_campania_id BIGINT DEFAULT NULL,p_subcampania_id BIGINT DEFAULT NULL,p_registro_id BIGINT DEFAULT NULL,
 p_organizacion_id BIGINT DEFAULT NULL,p_planta_id BIGINT DEFAULT NULL,p_desde DATE DEFAULT NULL,p_hasta DATE DEFAULT NULL,
 p_cursor BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v JSONB;
BEGIN
 IF p_limite NOT BETWEEN 1 AND 100 OR (p_desde IS NOT NULL AND p_hasta IS NOT NULL AND p_desde>p_hasta) THEN
   PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','Filtros no válidos.');
 END IF;
 -- La existencia de ámbitos internos nunca se confirma por un enlace público.
 IF (p_campania_id IS NOT NULL OR p_subcampania_id IS NOT NULL OR p_registro_id IS NOT NULL) AND NOT EXISTS(
   SELECT 1 FROM public.subcampania s JOIN public.campania c ON c.id=s.campania_id AND c.deleted_at IS NULL
   WHERE s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL')
     AND (p_campania_id IS NULL OR c.id=p_campania_id) AND (p_subcampania_id IS NULL OR s.id=p_subcampania_id)
     AND (p_registro_id IS NULL OR EXISTS(SELECT 1 FROM public.registro_plantacion r WHERE r.id=p_registro_id AND r.subcampania_id=s.id))) THEN
   PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
 END IF;
 IF p_registro_id IS NOT NULL THEN
   RETURN jsonb_build_object('data',public.pa_i_registro(p_registro_id));
 END IF;
 WITH ambitos AS MATERIALIZED (
   SELECT s.* FROM public.subcampania s JOIN public.campania ca ON ca.id=s.campania_id AND ca.deleted_at IS NULL
   WHERE s.deleted_at IS NULL AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL')
     AND (p_campania_id IS NULL OR s.campania_id=p_campania_id)
     AND (p_subcampania_id IS NULL OR s.id=p_subcampania_id)
     AND (p_organizacion_id IS NULL OR EXISTS(SELECT 1 FROM public.campania_organizacion co WHERE co.campania_id=s.campania_id AND co.organizacion_id=p_organizacion_id))
 ), hechos AS MATERIALIZED (
   SELECT r.* FROM public.registro_plantacion r JOIN ambitos s ON s.id=r.subcampania_id
   WHERE (p_desde IS NULL OR r.fecha_plantacion>=p_desde) AND (p_hasta IS NULL OR r.fecha_plantacion<=p_hasta)
     AND (p_planta_id IS NULL OR EXISTS(SELECT 1 FROM public.registro_plantacion_detalle d WHERE d.registro_plantacion_id=r.id AND d.planta_id=p_planta_id))
 ), por_ambito AS (
   SELECT s.id,s.campania_id,s.nombre,s.estado,s.nombre_zona_snapshot,s.meta_total_arboles,s.poligono_geom,
     coalesce(sum(r.cantidad_total_plantada) FILTER(WHERE NOT r.es_reposicion),0) inicial,
     coalesce(sum(r.cantidad_total_plantada) FILTER(WHERE r.es_reposicion),0) reposiciones,
     coalesce(sum(r.cantidad_muerta_acumulada) FILTER(WHERE NOT r.es_reposicion),0) bajas,
     count(r.id) registros FROM ambitos s LEFT JOIN hechos r ON r.subcampania_id=s.id GROUP BY s.id,s.campania_id,s.nombre,s.estado,s.nombre_zona_snapshot,s.meta_total_arboles,s.poligono_geom
 ), pagina AS MATERIALIZED (
   SELECT id FROM hechos WHERE p_cursor IS NULL OR id<p_cursor ORDER BY id DESC LIMIT p_limite
 )
 SELECT jsonb_build_object(
   'indicadores',jsonb_build_object('plantacion_inicial',coalesce(sum(inicial),0),'reposiciones',coalesce(sum(reposiciones),0),
     'bajas_reportadas',coalesce(sum(bajas),0),'registros',coalesce(sum(registros),0)),
   'campanias',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id::text,'nombre',c.nombre,
     'plantacion_inicial',c.inicial,'url_publica','/api/v1/impact/campanias/'||c.id) ORDER BY c.id)
     FROM (SELECT ca.id,ca.nombre,sum(a.inicial) inicial FROM por_ambito a JOIN public.campania ca ON ca.id=a.campania_id GROUP BY ca.id,ca.nombre)c),'[]'::jsonb),
   'subcampanias',coalesce(jsonb_agg(jsonb_build_object('id',id::text,'campania_id',campania_id::text,'nombre',nombre,
     'estado',estado,'zona',nombre_zona_snapshot,'poligono',ST_AsGeoJSON(poligono_geom)::jsonb,
     'meta_inicial',meta_total_arboles,'plantacion_inicial',inicial,
     'faltantes',greatest(meta_total_arboles-inicial,0),
     'avance_porcentaje',CASE WHEN meta_total_arboles>0 THEN round(100.0*inicial/meta_total_arboles,2) ELSE NULL END,
     'reposiciones',reposiciones,'bajas_reportadas',bajas,'registros',registros,
     'url_publica','/api/v1/impact/subcampanias/'||id) ORDER BY id),'[]'::jsonb),
   'mapa',coalesce((SELECT jsonb_agg(jsonb_build_object('registro_id',id::text,'subcampania_id',subcampania_id::text,
     'latitud',latitud,'longitud',longitud,'cantidad_total_plantada',cantidad_total_plantada,'es_reposicion',es_reposicion,
     'url_publica','/api/v1/impact/registros/'||id) ORDER BY id DESC) FROM hechos),'[]'::jsonb),
   'registros',coalesce((SELECT jsonb_agg(public.pa_i_registro(id) ORDER BY id DESC) FROM pagina),'[]'::jsonb),
   'siguiente_cursor',CASE WHEN EXISTS(SELECT 1 FROM hechos WHERE id<(SELECT min(id) FROM pagina)) THEN (SELECT min(id)::text FROM pagina) ELSE NULL END)
 INTO v FROM por_ambito;
 RETURN jsonb_build_object('data',v);
END $$;

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
     EXISTS(SELECT 1 FROM public.registro_plantacion_coresponsable c WHERE c.registro_plantacion_id=r.id AND c.usuario_id=p_actor_id) participante
   FROM public.registro_plantacion r WHERE r.responsable_id=p_actor_id OR EXISTS(
     SELECT 1 FROM public.registro_plantacion_coresponsable c WHERE c.registro_plantacion_id=r.id AND c.usuario_id=p_actor_id)
 ), pagina AS (SELECT * FROM propios WHERE p_cursor IS NULL OR id<p_cursor ORDER BY id DESC LIMIT p_limite)
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

-- El legado puede vincular al responsable también como participante.
-- Conservar ambas relaciones, con una única persona y sin ampliar observaciones.
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
    'observaciones_autor',CASE WHEN v_autor THEN v.observaciones ELSE NULL END),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

DO $$ DECLARE f RECORD; v_rol TEXT; BEGIN
 FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('pa_i_personas','pa_i_registro','pa_impacto_leer','pa_mis_registros_leer','pa_registro_detalle_propio_leer') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.firma);
   FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_function_privilege(v_rol,f.firma,'EXECUTE') THEN
       RAISE EXCEPTION 'PA_INT05_PRIVILEGIO_PUBLICO_HEREDADO: %',v_rol;
     END IF;
   END LOOP;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
