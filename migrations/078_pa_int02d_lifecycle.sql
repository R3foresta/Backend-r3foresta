-- PA-T-INT02-D: ciclo de vida y logística bajo la misma exclusión de ámbito.
-- Aditiva; requiere 077 (pa_d_cuenta). No ejecutar contra datos reales como fixture.
-- Los snapshots se leen con cuentas -> organizaciones -> subcampaña. Si cambia
-- el conjunto descubierto antes del lock del ámbito, 40001 exige releer/reintentar.
BEGIN;
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
