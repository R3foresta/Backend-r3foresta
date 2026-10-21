-- SINTETICO_AISLADO_INT07_PERSISTENCIA. Nunca ejecutar en Supabase.
-- Antecedente estructural focal024/030/031/068 + columnas074 necesarias.
-- No reconstruye001–081, no ejecuta RPC075–081 ni acredita PostGIS/Storage/API.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;

CREATE TABLE public.organizacion(id BIGINT PRIMARY KEY,nombre TEXT NOT NULL);
CREATE TABLE public.usuario(
 id BIGINT PRIMARY KEY,auth_id TEXT NOT NULL UNIQUE,
 nombre TEXT,apellido TEXT,rol TEXT NOT NULL,activo BOOLEAN NOT NULL);
CREATE TABLE public.subcampania(
 id BIGINT PRIMARY KEY,estado TEXT NOT NULL,total_plantado_inicial INT NOT NULL,
 total_repuesto INT NOT NULL,total_muerto_acumulado INT NOT NULL);
CREATE TABLE public.planta(id BIGINT PRIMARY KEY,especie TEXT NOT NULL);
CREATE TABLE public.lote_vivero(
 id BIGINT PRIMARY KEY,planta_id BIGINT NOT NULL REFERENCES public.planta(id),
 saldo_vivo_actual INT NOT NULL);
CREATE TABLE public.evento_lote_vivero(id BIGINT PRIMARY KEY);

\ir ../../migrations/024_vivero_asignacion_subcampania.sql
ALTER TABLE public.asignacion_vivero_subcampania
 ADD COLUMN fecha_entrega_operativa DATE,
 ADD CONSTRAINT fixture_int07_asignacion_subcampania_fk FOREIGN KEY(subcampania_id)
 REFERENCES public.subcampania(id);
\ir ../../migrations/030_m3_registro_plantacion.sql

-- Mismos valores de027 para las tres categorías usadas por031; sin PostGIS.
CREATE TYPE public.tipo_evento_plantacion AS ENUM(
 'ASIGNACION_VIVERO','DEVOLUCION_A_VIVERO','MORTANDAD_REPORTADA');
CREATE TYPE public.causa_mortandad_plantacion AS ENUM(
 'SEQUIA','EXCESO_AGUA','HELADA','GRANIZO','PLAGA','ENFERMEDAD',
 'SUELO_INADECUADO','FALTA_MANTENIMIENTO','DANO_MECANICO','PASTOREO',
 'VANDALISMO','INCENDIO','COMPETENCIA_MALEZA','TRASPLANTE_DEFICIENTE',
 'DESCONOCIDA','OTRO');
CREATE TYPE public.motivo_devolucion_plantacion AS ENUM(
 'SOBRANTE_OPERATIVO','ERROR_PLANIFICACION','CAMBIO_SUBCAMPANIA',
 'CIERRE_SUBCAMPANIA','PROBLEMAS_CALIDAD_LOTE','CONDICIONES_CAMPO_NO_APTAS',
 'ACCESO_RESTRINGIDO','CANCELACION_ACTIVIDAD','REASIGNACION_PRIORIDAD','OTRO');
\ir ../../migrations/031_m3_evento_plantacion.sql

ALTER TABLE public.registro_plantacion
 ADD COLUMN revision_registro BIGINT NOT NULL DEFAULT 0 CHECK(revision_registro>=0),
 ADD COLUMN afiliacion_responsable_snapshot TEXT,
 ADD COLUMN afiliacion_responsable_estado TEXT NOT NULL DEFAULT 'HISTORICA_NO_DISPONIBLE',
 ADD COLUMN afiliacion_responsable_tipo TEXT,
 ADD COLUMN organizacion_responsable_id_snapshot BIGINT REFERENCES public.organizacion(id);
ALTER TABLE public.registro_plantacion_coresponsable
 ADD COLUMN nombre_snapshot TEXT,ADD COLUMN afiliacion_snapshot TEXT,
 ADD COLUMN afiliacion_estado TEXT NOT NULL DEFAULT 'HISTORICA_NO_DISPONIBLE',
 ADD COLUMN afiliacion_tipo TEXT,
 ADD COLUMN organizacion_id_snapshot BIGINT REFERENCES public.organizacion(id);
\ir ../../migrations/068_pa_participacion_comando.sql

INSERT INTO public.organizacion VALUES(1,'Organización sintética INT07');
INSERT INTO public.usuario VALUES
 (1,'00000000-0000-4000-8000-000000000001','Administrador sintético',NULL,'ADMIN',true),
 (2,'00000000-0000-4000-8000-000000000002','Responsable sintético',NULL,'GENERAL',true),
 (3,'00000000-0000-4000-8000-000000000003','Participante histórico sintético',NULL,'VOLUNTARIO',false);
INSERT INTO public.subcampania VALUES(100,'ACTIVA',6,2,3),(200,'ACTIVA',1,0,0);
INSERT INTO public.planta VALUES(8,'Especie sintética INT07'),(9,'Otra especie sintética INT07');
INSERT INTO public.lote_vivero VALUES(80,8,100),(90,9,100);
INSERT INTO public.asignacion_vivero_subcampania(
 id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,cantidad_consumida,
 usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
 VALUES(500,100,80,'PLANTACION_INICIAL',10,6,1,'2026-10-10T12:00:00Z','2026-10-10'),
 (501,100,80,'REPOSICION',5,2,1,'2026-10-10T12:00:00Z','2026-10-10'),
 (600,200,90,'PLANTACION_INICIAL',5,1,1,'2026-10-10T12:00:00Z','2026-10-10');
INSERT INTO public.registro_plantacion(
 id,subcampania_id,es_reposicion,registro_plantacion_origen_id,fecha_plantacion,
 responsable_id,latitud,longitud,gps_dentro_poligono,cantidad_total_plantada,
 cantidad_muerta_acumulada,cantidad_repuesta_acumulada,nombre_responsable_snapshot,
 observaciones,codigo_trazabilidad,created_by)
 VALUES(1000,100,false,NULL,'2026-10-12',2,-16.5,-68.1,true,6,3,2,
 'Responsable del hecho sintético','Observación original INT07','PLT-INT07-1000',2),
 (1001,100,true,1000,'2026-10-13',2,-16.5,-68.1,true,2,0,0,
 'Responsable del hecho sintético',NULL,'PLT-INT07-1001',2),
 (2000,200,false,NULL,'2026-10-12',2,-16.5,-68.1,true,1,0,0,
 'Responsable del hecho sintético',NULL,'PLT-INT07-2000',2);
--030 admite texto legado largo/NFD/con espacios; materializarlo no es corregirlo.
UPDATE public.registro_plantacion
 SET observaciones='  '||repeat(U&'\0065\0301',1001)||'  ' WHERE id=2000;
INSERT INTO public.registro_plantacion_detalle(
 id,registro_plantacion_id,asignacion_id,lote_vivero_id,planta_id,cantidad)
 VALUES(8000,1000,500,80,8,6),(8001,1001,501,80,8,2),(8002,2000,600,90,9,1);
INSERT INTO public.registro_plantacion_coresponsable(
 id,registro_plantacion_id,usuario_id,nombre_snapshot)
 VALUES(8100,1000,3,'Nombre histórico original INT07');
-- Baja sembrada para probar estructura/preservación. NO es un alta operativa.
INSERT INTO public.evento_plantacion(
 id,tipo_evento,subcampania_id,registro_plantacion_id,fecha_evento,
 responsable_id,cantidad_muerta_delta,causa_mortandad,latitud,longitud,created_by)
 VALUES(9000,'MORTANDAD_REPORTADA',100,1000,'2026-10-13T12:00:00Z',2,3,'SEQUIA',-16.5,-68.1,2);
INSERT INTO public.participacion_comando(
 id,actor_id,operacion,comando_id,huella,estado,resultado,http_terminal,finalizado_en)
 VALUES(7001,1,'CAMBIAR_ROL_GLOBAL','00000000-0000-4000-8000-000000007001',
 decode(repeat('01',32),'hex'),'CONFIRMADO',
 '{"tipo":"ROL_GLOBAL","usuario_id":"2","rol_anterior":"VOLUNTARIO","rol_nuevo":"GENERAL","revision_anterior":"0","revision_nueva":"1","cambio":"CAMBIO_APLICADO"}',
 200,clock_timestamp());

-- Probe existente de lectura para comprobar conservación de funciones/vistas.
CREATE FUNCTION public.pa_int07_antecedente_leer() RETURNS bigint LANGUAGE sql
 STABLE SECURITY INVOKER AS $$ SELECT sum(cantidad_consumida) FROM public.asignacion_vivero_subcampania $$;
REVOKE ALL ON FUNCTION public.pa_int07_antecedente_leer() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_int07_antecedente_leer() TO service_role;
CREATE VIEW public.pa_int07_antecedente_vista AS SELECT id,cantidad_total_plantada FROM public.registro_plantacion;
