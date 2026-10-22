-- SINTETICO_AISLADO_INT07. Se instala sobre el fixture real D/INT05 y 082/084.
-- Sin .env, cuentas externas ni escrituras sobre otro clúster.
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo)
SELECT n,'a-http-'||n,'ADMIN sintético INT07 '||n,'int07-'||n,'ADMIN',true
FROM generate_series(9200,9219) n;
INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,
 created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles,total_plantado_inicial)
SELECT n,800,'Ámbito sintético INT07 '||n,'ACTIVA','INT07-SUB-'||n,800,800,1,'Zona sintética INT07',
 ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),10,5
FROM generate_series(910,929) n;
INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,
 cantidad_total_plantada,codigo_trazabilidad,created_by,nombre_responsable_snapshot,
 nombre_subcampania_snapshot,nombre_zona_snapshot,latitud,longitud,gps_dentro_poligono,observaciones)
SELECT n*1000,n,801,(now() AT TIME ZONE 'America/La_Paz')::date-1,5,'INT07-REG-'||n,801,
 'Autor sintético INT07','Ámbito sintético INT07 '||n,'Zona sintética INT07',-16.5,-68.1,true,
 'ORIGINAL_PRIVADO_INT07_'||n FROM generate_series(910,929)n;
INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,
 cantidad_asignada,cantidad_consumida,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
SELECT n*100,n,81,'PLANTACION_INICIAL',10,5,800,now()-interval '5 days',
 (now() AT TIME ZONE 'America/La_Paz')::date-5 FROM generate_series(910,929)n;
INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,
 planta_id,cantidad,nombre_comercial_snapshot,nombre_cientifico_snapshot)
SELECT n*1000,n*100,81,8,5,'Tara sintética INT07','Caesalpinia spinosa'
FROM generate_series(910,929)n;
DO $$ DECLARE p JSONB; r JSONB; BEGIN
 p:=jsonb_build_object('usuario_destino_id','802','ambitos',jsonb_build_array(
   jsonb_build_object('subcampania_id','910','revision_esperada','0')));
 r:=public.pa_acceso_ejecutar(800,'a-http-800','DESIGNAR_ADMINISTRADOR',gen_random_uuid(),p,p::text);
 IF r->'body'->>'estado' IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'INT07 permiso fixture: %',r; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.pa_a_http_transport(p_sql TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE r JSONB; c TEXT; m TEXT; d TEXT;
BEGIN EXECUTE p_sql INTO r;
 RETURN jsonb_build_object('data',r,'error',NULL);
EXCEPTION WHEN OTHERS THEN
 GET STACKED DIAGNOSTICS c=RETURNED_SQLSTATE,m=MESSAGE_TEXT,d=PG_EXCEPTION_DETAIL;
 RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',c,'message',m,'details',d));
END $$;
REVOKE ALL ON FUNCTION public.pa_a_http_transport(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_a_http_transport(TEXT) TO service_role;
