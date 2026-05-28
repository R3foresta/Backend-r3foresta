-- 042_m3_subcampania_poligono_geojson_rpc.sql
-- Helper RPC: devuelve el poligono de una subcampania serializado como GeoJSON.
-- Depende de: 027 (PostGIS), 029 (subcampania).
-- Idempotente.

DO $$ BEGIN
  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta la migracion 029 primero.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_subcampania_poligono_geojson(INT);

CREATE FUNCTION public.fn_subcampania_poligono_geojson(p_id INT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN poligono_geom IS NULL THEN NULL
    ELSE ST_AsGeoJSON(poligono_geom)::jsonb
  END
  FROM public.subcampania
  WHERE id = p_id AND deleted_at IS NULL
$$;

COMMENT ON FUNCTION public.fn_subcampania_poligono_geojson(INT) IS
  'Helper para que el backend obtenga el poligono de una subcampania como JSON GeoJSON (PostgREST no serializa geometry nativamente).';
