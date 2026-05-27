-- 043_m3_subcampania_setear_poligono_rpc.sql
-- Helper RPC: setea/reemplaza el poligono de una subcampania a partir de un
-- GeoJSON Polygon. Calcula y persiste area_hectareas (usando ST_Transform 3857).
-- Solo se permite cuando estado = 'BORRADOR'. Depende de: 027 (PostGIS), 029 (subcampania).
-- Idempotente.

DO $$ BEGIN
  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta la migracion 029 primero.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_subcampania_setear_poligono(INT, JSONB, BIGINT);

CREATE FUNCTION public.fn_subcampania_setear_poligono(
  p_id INT,
  p_geojson JSONB,
  p_updated_by BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado public.estado_subcampania;
  v_area NUMERIC(12,4);
  v_geojson_text TEXT;
BEGIN
  SELECT estado INTO v_estado
  FROM public.subcampania
  WHERE id = p_id AND deleted_at IS NULL;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'SUBCAMPANIA % no existe', p_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estado <> 'BORRADOR' THEN
    RAISE EXCEPTION 'Solo se puede setear el poligono en estado BORRADOR (actual: %)', v_estado
      USING ERRCODE = 'P0001';
  END IF;

  v_geojson_text := p_geojson::TEXT;

  UPDATE public.subcampania
  SET
    poligono_geom = ST_SetSRID(ST_GeomFromGeoJSON(v_geojson_text), 4326),
    area_hectareas = ROUND(
      (ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(v_geojson_text), 4326), 3857)) / 10000)::NUMERIC,
      4
    ),
    updated_at = NOW(),
    updated_by = p_updated_by
  WHERE id = p_id
  RETURNING area_hectareas INTO v_area;

  RETURN jsonb_build_object(
    'id', p_id,
    'area_hectareas', v_area
  );
END $$;

COMMENT ON FUNCTION public.fn_subcampania_setear_poligono(INT, JSONB, BIGINT) IS
  'Setea poligono de subcampania (solo BORRADOR). Calcula area_hectareas via ST_Transform a 3857. Devuelve {id, area_hectareas}.';
