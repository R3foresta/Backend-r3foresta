-- Solo fixture sintético autorizado para localhost, sin personas ni stock real.
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo,organizacion_id) VALUES
 (800,'a-http-800','Admin local INT03A','admin-local','ADMIN',true,NULL),
 (801,'a-http-801','Plantador local INT03A','plantador-local','VOLUNTARIO',true,1),
 (802,'a-http-802','Participante local INT03A','participante-local','VOLUNTARIO',true,NULL),
 (803,'a-http-803','Otro ADMIN local INT03A','admin-otro-local','ADMIN',true,NULL),
 (804,'a-http-804','Sin permiso local INT03A','sin-permiso-local','VOLUNTARIO',true,NULL),
 (805,'a-http-805','Inactivo local INT03A','inactivo-local','ADMIN',false,NULL);
INSERT INTO public.campania VALUES(800,'Campaña local INT03A',NULL);
INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles)
SELECT n,800,'Subcampaña local INT03A '||n,'ACTIVA','LOCAL-INT03A-'||n,800,800,1,'Zona sintética',
 ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),5
FROM generate_series(820,825) n;
INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo)
SELECT n,8,100,5 FROM generate_series(820,825) n;
INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
SELECT n*100,n,81,'PLANTACION_INICIAL',20,800,now()-interval '10 days',(now() AT TIME ZONE 'America/La_Paz')::date-10 FROM generate_series(820,824) n;
DO $$ DECLARE s BIGINT; u BIGINT; p JSONB; r JSONB; BEGIN
 FOR s IN 820..825 LOOP FOR u IN 801..802 LOOP
  p:=jsonb_build_object('usuario_destino_id',u::text,'ambitos',jsonb_build_array(jsonb_build_object('subcampania_id',s::text,'revision_esperada','0')));
  r:=public.pa_acceso_ejecutar(800,'a-http-800','OTORGAR_PLANTADOR',gen_random_uuid(),p,p::text);
  IF r->'body'->>'estado' IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'Fixture permiso no confirmado: %',r; END IF;
 END LOOP; END LOOP;
END $$;
