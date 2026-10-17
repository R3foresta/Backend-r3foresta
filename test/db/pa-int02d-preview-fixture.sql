-- SINTÉTICO_AISLADO_INT02D_PREVIEW: nunca aplicar a Supabase/usuarios reales.
-- Incluye el antecedente de INT04 sin editar la evidencia/fixture histórico A.
\ir pa-int03a-preview-fixture.sql
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo)
VALUES(901,'a-http-901','Operario interno local INT02D','interno-local','GENERAL',true);
INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by)
VALUES(820,800,'COORDINADOR',800),(820,901,'OPERARIO',800);
INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,
 cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
VALUES(82099,820,81,'REPOSICION',10,800,now()-interval '1 day',(now() AT TIME ZONE 'America/La_Paz')::date-1);
-- Un origen propio y uno ajeno para FE07. Los IDs son parte del fixture, no IDs reales.
INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,
 cantidad_total_plantada,cantidad_muerta_acumulada,codigo_trazabilidad,created_by,
 nombre_responsable_snapshot,nombre_subcampania_snapshot,nombre_zona_snapshot)
VALUES(820000,820,800,(now() AT TIME ZONE 'America/La_Paz')::date-2,5,5,'PREVIEW-D-ORIGEN-820',800,
 'Admin local INT03A','Subcampaña local INT03A 820','Zona sintética'),
 (821000,821,800,(now() AT TIME ZONE 'America/La_Paz')::date-2,1,1,'PREVIEW-D-AJENO-821',800,
 'Admin local INT03A','Subcampaña local INT03A 821','Zona sintética');
INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,planta_id,cantidad)
VALUES(820000,82000,81,8,5),(821000,82100,81,8,1);
UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=5 WHERE id=82000;
UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=1 WHERE id=82100;
UPDATE public.subcampania SET total_plantado_inicial=5,total_muerto_acumulado=5 WHERE id=820;
UPDATE public.subcampania SET total_plantado_inicial=1,total_muerto_acumulado=1 WHERE id=821;
SELECT setval(pg_get_serial_sequence('public.registro_plantacion','id'),
 (SELECT max(id) FROM public.registro_plantacion),true);
