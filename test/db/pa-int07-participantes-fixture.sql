-- SINTÉTICO_AISLADO_INT07_PARTICIPANTES. Sin cuentas ni servicios externos.
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo,organizacion_id) VALUES
 (50,'a-http-50','Cuenta baja de orden INT07','part-orden-50','VOLUNTARIO',true,2),
 (9300,'a-http-9300','ADMIN participantes INT07','part-admin-9300','ADMIN',true,NULL),
 (9301,'a-http-9301','Administrador contextual INT07','part-contextual-9301','VOLUNTARIO',true,NULL),
 (9302,'a-http-9302','Segundo administrador INT07','part-contextual-9302','VOLUNTARIO',true,NULL),
 (9303,'a-http-9303','Cuenta sin autoridad INT07','part-ajeno-9303','VOLUNTARIO',true,NULL),
 (9310,'a-http-9310','Perfil actual original INT07','part-original-9310','VOLUNTARIO',true,2),
 (9311,'a-http-9311','Perfil inactivo original INT07','part-inactivo-9311','VOLUNTARIO',false,2),
 (9312,'a-http-9312','Alta actual INT07','part-alta-9312','VOLUNTARIO',true,2),
 (9313,'a-http-9313','Alta inactiva INT07','part-inactiva-9313','VOLUNTARIO',false,2),
 (9314,'a-http-9314','Alta carrera INT07','part-carrera-9314','VOLUNTARIO',true,2),
 (9315,'a-http-9315','Perfil carrera INT07','part-perfil-9315','VOLUNTARIO',true,NULL);
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo)
SELECT n,'a-http-'||n,'Ejecutor carrera INT07 '||n,'part-ejecutor-'||n,'ADMIN',true
FROM generate_series(9320,9329)n;
INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,
 created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles,total_plantado_inicial)
SELECT n,800,'Ámbito participantes INT07 '||n,'ACTIVA','INT07-PART-'||n,800,800,1,'Zona sintética INT07',
 ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),10,5
FROM generate_series(940,969)n;
INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,
 cantidad_total_plantada,codigo_trazabilidad,created_by,nombre_responsable_snapshot,
 nombre_subcampania_snapshot,nombre_zona_snapshot,latitud,longitud,gps_dentro_poligono,observaciones)
SELECT n*1000,n,801,(now() AT TIME ZONE 'America/La_Paz')::date-1,5,'INT07-PART-REG-'||n,801,
 'Autor histórico INT07','Ámbito participantes INT07 '||n,'Zona sintética INT07',-16.5,-68.1,true,
 'OBSERVACION_PRIVADA_PART_'||n FROM generate_series(940,969)n;
INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,
 cantidad_asignada,cantidad_consumida,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
SELECT n*100,n,81,'PLANTACION_INICIAL',10,5,800,now()-interval '5 days',
 (now() AT TIME ZONE 'America/La_Paz')::date-5 FROM generate_series(940,969)n;
INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,
 planta_id,cantidad,nombre_comercial_snapshot,nombre_cientifico_snapshot)
SELECT n*1000,n*100,81,8,5,'Tara sintética INT07','Caesalpinia spinosa'
FROM generate_series(940,969)n;
INSERT INTO public.registro_plantacion_coresponsable(registro_plantacion_id,usuario_id,
 nombre_snapshot,afiliacion_estado,afiliacion_tipo,afiliacion_snapshot,organizacion_id_snapshot)
SELECT n*1000,9310,'Nombre histórico original INT07','DECLARADA','ORGANIZACION_REGISTRADA',
 'Organización histórica original INT07',1 FROM generate_series(940,969)n;
INSERT INTO public.registro_plantacion_coresponsable(registro_plantacion_id,usuario_id,
 nombre_snapshot,afiliacion_estado)
SELECT n*1000,9311,'Nombre histórico inactivo INT07','NO_DECLARADA' FROM generate_series(940,969)n;
-- Legado permitido: autor también participante. Se deduplica la persona y la
-- edición del set nunca cambia al responsable ni retira su lectura por autoría.
INSERT INTO public.registro_plantacion_coresponsable(registro_plantacion_id,usuario_id,
 nombre_snapshot,afiliacion_estado) VALUES(940000,801,'Autor histórico INT07','NO_DECLARADA');
DO $$ DECLARE s BIGINT; u BIGINT; p JSONB; r JSONB; BEGIN
 FOR s IN 940..969 LOOP FOR u IN 9301..9302 LOOP
  p:=jsonb_build_object('usuario_destino_id',u::text,'ambitos',jsonb_build_array(
    jsonb_build_object('subcampania_id',s::text,'revision_esperada','0')));
  r:=public.pa_acceso_ejecutar(800,'a-http-800','DESIGNAR_ADMINISTRADOR',gen_random_uuid(),p,p::text);
  IF r->'body'->>'estado' IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'INT07-PART permiso fixture: %',r; END IF;
 END LOOP; END LOOP;
END $$;
SELECT setval(pg_get_serial_sequence('public.registro_plantacion','id'),(SELECT max(id) FROM public.registro_plantacion),true);
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
