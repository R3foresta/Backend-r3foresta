-- Solo para --postgis: extensión real y antecedente focal M3 de reposición.
-- No fabrica recepción ni una nueva inicial; el grupo origen es fixture histórico.
CREATE EXTENSION postgis;
ALTER TABLE public.subcampania ADD COLUMN poligono_geom geometry(Polygon,4326),ADD COLUMN tolerancia_gps_metros integer NOT NULL DEFAULT 50;
UPDATE public.subcampania SET poligono_geom=ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326);
ALTER TABLE public.registro_plantacion ADD COLUMN es_reposicion boolean NOT NULL DEFAULT false,
 ADD COLUMN registro_plantacion_origen_id bigint REFERENCES public.registro_plantacion,
 ADD COLUMN latitud numeric(9,6),ADD COLUMN longitud numeric(9,6),ADD COLUMN gps_dentro_poligono boolean,
 ADD COLUMN gps_distancia_a_poligono_m numeric(10,2),ADD COLUMN cantidad_muerta_acumulada integer NOT NULL DEFAULT 0,
 ADD COLUMN cantidad_repuesta_acumulada integer NOT NULL DEFAULT 0,ADD COLUMN nombre_subcampania_snapshot text,
 ADD COLUMN nombre_zona_snapshot text,ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),ADD COLUMN metadata_blockchain jsonb;
DROP TABLE public.registro_plantacion_coresponsable;
\ir ../../migrations/030_m3_registro_plantacion.sql
\ir ../../migrations/032_m3_gps_funcion.sql
INSERT INTO public.tipos_entidad_evidencia VALUES(4,'REGISTRO_PLANTACION',true);
GRANT ALL ON public.registro_plantacion,public.registro_plantacion_detalle,public.registro_plantacion_coresponsable TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
