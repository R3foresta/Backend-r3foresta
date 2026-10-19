-- SINTÉTICO_AISLADO_INT05. Solo runner local; conserva hechos/historiales anteriores.
-- Reutiliza las sesiones y los ámbitos operativos de INT04 sin editar su fixture.
\ir pa-int03a-preview-fixture.sql
UPDATE public.campania SET deleted_at=now() WHERE id=1;
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo)
VALUES(901,'a-http-901','Operario interno local INT05','interno-local','GENERAL',true);
INSERT INTO public.organizacion(id,nombre,activo) VALUES(2,'Organización segunda sintética',true);
INSERT INTO public.campania(id,nombre,deleted_at) VALUES
 (801,'Campaña segunda INT05',NULL),(802,'Campaña retirada INT05',now());
INSERT INTO public.campania_organizacion(campania_id,organizacion_id)
VALUES(800,1),(800,2),(801,1),(801,2);
INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,
 nombre_zona_snapshot,poligono_geom,meta_total_arboles,deleted_at)
SELECT id,CASE WHEN id=827 THEN 801 WHEN id=832 THEN 802 ELSE 800 END,'Ámbito INT05 '||id,estado::public.estado_subcampania,
 'INT05-SUB-'||id,800,800,1,'Zona sintética INT05',
 ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),20,
 CASE WHEN id=831 THEN now() ELSE NULL END
FROM (VALUES(826,'ACTIVA'),(827,'COMPLETADA'),(828,'BORRADOR'),(829,'CANCELADA'),(830,'PAUSADA'),(831,'ACTIVA'),(832,'ACTIVA')) scopes(id,estado);
INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by)
VALUES(820,800,'COORDINADOR',800),(820,901,'OPERARIO',800);
INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,
 cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
VALUES(82099,820,81,'REPOSICION',10,800,now()-interval '1 day',(now() AT TIME ZONE 'America/La_Paz')::date-1),
 (82600,826,81,'PLANTACION_INICIAL',25,800,now()-interval '5 days',(now() AT TIME ZONE 'America/La_Paz')::date-5),
 (82699,826,81,'REPOSICION',10,800,now()-interval '1 day',(now() AT TIME ZONE 'America/La_Paz')::date-1),
 (82700,827,83,'PLANTACION_INICIAL',20,800,now()-interval '5 days',(now() AT TIME ZONE 'America/La_Paz')::date-5);
-- 5 + 25 en campaña800, 20 en campaña801. Reposición4 y bajas11 son indicadores separados.
INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,
 cantidad_muerta_acumulada,codigo_trazabilidad,created_by,nombre_responsable_snapshot,nombre_subcampania_snapshot,nombre_zona_snapshot,
 latitud,longitud,gps_dentro_poligono,observaciones,afiliacion_responsable_estado,afiliacion_responsable_tipo,
 afiliacion_responsable_snapshot,organizacion_responsable_id_snapshot)
VALUES(820000,820,800,(now() AT TIME ZONE 'America/La_Paz')::date-2,5,5,'INT05-ORIGEN-820',800,'Admin histórico INT05','Subcampaña local INT03A 820','Zona sintética',
 -16.50,-68.10,true,'OBSERVACION_PRIVADA_820','NO_DECLARADA',NULL,NULL,NULL),
 (826000,826,801,(now() AT TIME ZONE 'America/La_Paz')::date-2,25,6,'INT05-GRUPO-25',801,'Plantador histórico INT05','Ámbito histórico INT05 826','Zona histórica INT05',
 -16.51,-68.11,true,'OBSERVACION_PRIVADA_AUTOR_INT05','DECLARADA','ORGANIZACION_REGISTRADA','Organización sintética al plantar',1),
 (827000,827,802,(now() AT TIME ZONE 'America/La_Paz')::date-1,20,0,'INT05-GRUPO-20-LEGADO',802,NULL,NULL,NULL,
 -16.52,-68.12,true,'OBSERVACION_PRIVADA_LEGADO_INT05','HISTORICA_NO_DISPONIBLE',NULL,NULL,NULL);
INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,
 cantidad_muerta_acumulada,codigo_trazabilidad,created_by,es_reposicion,registro_plantacion_origen_id,latitud,longitud,gps_dentro_poligono)
VALUES(826001,826,800,(now() AT TIME ZONE 'America/La_Paz')::date-1,4,0,'INT05-REPOSICION-4',800,true,826000,-16.51,-68.11,true);
INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,codigo_trazabilidad,
 created_by,latitud,longitud,gps_dentro_poligono,observaciones)
SELECT id*1000,id,801,(now() AT TIME ZONE 'America/La_Paz')::date-1,55,'INT05-OCULTO-'||id,801,-16.5,-68.1,true,'PRIVADO_OCULTO_INT05'
FROM public.subcampania WHERE id BETWEEN 828 AND 832;
INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,planta_id,cantidad,nombre_comercial_snapshot,nombre_cientifico_snapshot)
VALUES(820000,82000,81,8,5,'Tara histórica','Caesalpinia spinosa'),
 (826000,82600,81,8,25,'Tara histórica','Caesalpinia spinosa'),
 (826001,82699,81,8,4,'Tara histórica','Caesalpinia spinosa'),
 (827000,82700,83,9,20,'Molle histórico','Schinus molle');
-- Los hechos propios ocultos también conservan detalle válido para su autor.
INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,
 cantidad_consumida,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
SELECT id*100,id,81,'PLANTACION_INICIAL',55,55,800,now()-interval '5 days',(now() AT TIME ZONE 'America/La_Paz')::date-5
FROM public.subcampania WHERE id BETWEEN 828 AND 832;
INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,planta_id,cantidad)
SELECT id*1000,id*100,81,8,55 FROM public.subcampania WHERE id BETWEEN 828 AND 832;
INSERT INTO public.registro_plantacion_coresponsable(registro_plantacion_id,usuario_id,nombre_snapshot,
 afiliacion_estado,afiliacion_tipo,afiliacion_snapshot,organizacion_id_snapshot)
VALUES(826000,801,'Plantador histórico INT05','DECLARADA','ORGANIZACION_REGISTRADA','Organización sintética al plantar',1),
 (826000,800,'Admin histórico INT05','DECLARADA','ORGANIZACION_REGISTRADA','Organización segunda al plantar',2),
 (826000,802,'Participante histórico INT05','NO_DECLARADA',NULL,NULL,NULL),
 (827000,801,NULL,'HISTORICA_NO_DISPONIBLE',NULL,NULL,NULL);
UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=CASE id WHEN 82000 THEN 5 WHEN 82600 THEN 25 WHEN 82699 THEN 4 ELSE 20 END
WHERE id IN(82000,82600,82699,82700);
UPDATE public.subcampania SET total_plantado_inicial=5,total_muerto_acumulado=5 WHERE id=820;
UPDATE public.subcampania SET total_plantado_inicial=25,total_muerto_acumulado=6,total_repuesto=4 WHERE id=826;
UPDATE public.subcampania SET total_plantado_inicial=20 WHERE id=827;
UPDATE public.registro_plantacion SET cantidad_repuesta_acumulada=4 WHERE id=826000;
INSERT INTO public.evento_plantacion(id,subcampania_id,responsable_id,tipo_evento,fecha_evento,cantidad_muerta_delta,registro_plantacion_id,created_by)
VALUES(900060,826,801,'MORTANDAD_REPORTADA',date_trunc('day',now())-interval '1 day',6,826000,801);
-- Retiro real del permiso826: el hecho mantiene autoría/participación histórica.
DO $$ DECLARE p JSONB; r JSONB; BEGIN
 p:=jsonb_build_object('usuario_destino_id','801','ambitos',jsonb_build_array(jsonb_build_object('subcampania_id','826','revision_esperada','0')));
 r:=public.pa_acceso_ejecutar(800,'a-http-800','OTORGAR_PLANTADOR',gen_random_uuid(),p,p::text);
 IF r->'body'->>'estado' IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'Grant fixture no confirmado: %',r; END IF;
 p:=jsonb_set(p,'{ambitos,0,revision_esperada}','"1"');
 r:=public.pa_acceso_ejecutar(800,'a-http-800','RETIRAR_PLANTADOR',gen_random_uuid(),p,p::text);
 IF r->'body'->>'estado' IS DISTINCT FROM 'CONFIRMADO' THEN RAISE EXCEPTION 'Retiro fixture no confirmado: %',r; END IF;
END $$;
UPDATE public.usuario SET nombre='Perfil actual cambiado INT05',organizacion_id=2,contacto='CONTACTO_PRIVADO_INT05',correo='privado-int05@example.invalid' WHERE id=801;
SELECT setval(pg_get_serial_sequence('public.registro_plantacion','id'),(SELECT max(id) FROM public.registro_plantacion),true);
-- Fotos: los bytes originales se siembran solo en Storage de disco del harness.
INSERT INTO public.evidencias_trazabilidad(id,tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,creado_por_usuario_id)
VALUES(900050,1,826000,'recoleccion_fotos','int05/elegible-original.png','FOTO',801),
 (900051,1,0,'recoleccion_fotos','int05/pendiente-original.png','FOTO',801);
SELECT setval(pg_get_serial_sequence('public.evidencias_trazabilidad','id'),(SELECT max(id) FROM public.evidencias_trazabilidad),true);
