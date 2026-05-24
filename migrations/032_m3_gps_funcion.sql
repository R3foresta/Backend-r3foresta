-- 032_m3_gps_funcion.sql
-- Modulo 3 (Plantacion) — base 6/6: funcion auxiliar para validar GPS contra
-- el poligono de una subcampania, aplicando su tolerancia en metros.
-- Origen: tareas/modulo-2-integracion-modulo-3/11_db_modelado_m3_base.md (seccion 2.8).
-- Depende de: 027 (postgis), 029 (subcampania).
-- Idempotente.
--
-- Uso (tarea 03, handler atomico de REGISTRO_PLANTACION):
--   SELECT dentro, distancia_m
--   FROM gps_dentro_poligono_con_tolerancia($1, $2, $3);

CREATE OR REPLACE FUNCTION public.gps_dentro_poligono_con_tolerancia(
  p_subcampania_id BIGINT,
  p_lat            NUMERIC,
  p_lng            NUMERIC
)
RETURNS TABLE (
  dentro      BOOLEAN,
  distancia_m NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ST_DWithin(
      s.poligono_geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      s.tolerancia_gps_metros
    ) AS dentro,
    ST_Distance(
      s.poligono_geom::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
    )::NUMERIC AS distancia_m
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id;
$$;

COMMENT ON FUNCTION public.gps_dentro_poligono_con_tolerancia(BIGINT, NUMERIC, NUMERIC) IS
  'Valida si (lat, lng) cae dentro del poligono de la subcampana aplicando tolerancia_gps_metros. Devuelve dentro y distancia_m al poligono.';
