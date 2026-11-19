-- Reportes administrativos de inventario vivo y mermas comprobadas en Vivero.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.reportes_vivero_leer(
  p_actor_id bigint, p_auth_id text, p_planta_id bigint, p_vivero_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  reporte jsonb;
BEGIN
  IF public.pa_lecturas_actor(p_actor_id, p_auth_id) IS DISTINCT FROM 'ADMIN' THEN
    PERFORM public.pa_r_error(403, 'CAPACIDAD_INSUFICIENTE', 'Se requiere una cuenta administradora.');
  END IF;
  IF p_planta_id <= 0 OR p_vivero_id <= 0 THEN
    PERFORM public.pa_r_error(422, 'ENTRADA_INVALIDA', 'Filtros no válidos.');
  END IF;

  WITH saldos AS (
    SELECT l.planta_id, l.vivero_id, sum(l.saldo_vivo_actual) AS plantas
    FROM public.lote_vivero l
    WHERE l.estado_lote = 'ACTIVO'
      AND l.saldo_vivo_actual > 0
      AND (p_planta_id IS NULL OR l.planta_id = p_planta_id)
      AND (p_vivero_id IS NULL OR l.vivero_id = p_vivero_id)
      AND EXISTS (
        SELECT 1 FROM public.evento_lote_vivero e
        WHERE e.lote_id = l.id AND e.tipo_evento IN ('EMBOLSADO', 'INCORPORACION')
      )
    GROUP BY l.planta_id, l.vivero_id
  ), viveros AS MATERIALIZED (
    SELECT v.id, v.nombre::text AS nombre
    FROM public.vivero v
    WHERE EXISTS (SELECT 1 FROM public.lote_vivero l WHERE l.vivero_id = v.id)
  ), especies AS MATERIALIZED (
    SELECT p.id, coalesce(nullif(btrim(p.nombre_comun_principal), ''),
      nullif(btrim(p.especie), ''), nullif(btrim(p.nombre_cientifico), ''),
      'Especie ' || p.id) AS nombre
    FROM public.planta p
    WHERE EXISTS (SELECT 1 FROM public.lote_vivero l WHERE l.planta_id = p.id)
  ), filas AS MATERIALIZED (
    SELECT s.planta_id, p.nombre AS especie, s.vivero_id, v.nombre AS vivero, s.plantas
    FROM saldos s
    JOIN especies p ON p.id = s.planta_id
    JOIN viveros v ON v.id = s.vivero_id
  ), por_vivero AS (
    SELECT vivero_id, vivero, sum(plantas) AS plantas
    FROM filas GROUP BY vivero_id, vivero
  ), resumen AS (
    SELECT coalesce(sum(plantas), 0) AS plantas,
      count(DISTINCT planta_id) AS especies, count(DISTINCT vivero_id) AS viveros
    FROM filas
  )
  SELECT jsonb_build_object(
    'observado_en', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'filtros', jsonb_build_object('planta_id', p_planta_id::text, 'vivero_id', p_vivero_id::text),
    'totales', to_jsonb(resumen),
    'filas', coalesce((
      SELECT jsonb_agg(jsonb_build_object('planta_id', f.planta_id::text, 'especie', f.especie,
        'vivero_id', f.vivero_id::text, 'vivero', f.vivero, 'plantas', f.plantas)
        ORDER BY f.plantas DESC, f.especie, f.vivero, f.planta_id, f.vivero_id)
      FROM filas f
    ), '[]'::jsonb),
    'por_vivero', coalesce((
      SELECT jsonb_agg(jsonb_build_object('vivero_id', v.vivero_id::text,
        'vivero', v.vivero, 'plantas', v.plantas) ORDER BY v.plantas DESC, v.vivero, v.vivero_id)
      FROM por_vivero v
    ), '[]'::jsonb),
    'opciones', jsonb_build_object(
      'viveros', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', v.id::text, 'nombre', v.nombre) ORDER BY v.nombre, v.id)
        FROM viveros v
      ), '[]'::jsonb),
      'especies', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', p.id::text, 'nombre', p.nombre) ORDER BY p.nombre, p.id)
        FROM especies p
      ), '[]'::jsonb)
    )
  ) INTO reporte FROM resumen;

  RETURN reporte;
END;
$$;

CREATE OR REPLACE FUNCTION public.reportes_mermas_leer(
  p_actor_id bigint, p_auth_id text, p_desde date, p_hasta date,
  p_planta_id bigint, p_vivero_id bigint, p_pagina integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  reporte jsonb;
  tamano_pagina constant integer := 25;
BEGIN
  IF public.pa_lecturas_actor(p_actor_id, p_auth_id) IS DISTINCT FROM 'ADMIN' THEN
    PERFORM public.pa_r_error(403, 'CAPACIDAD_INSUFICIENTE', 'Se requiere una cuenta administradora.');
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta
     OR p_desde < DATE '0001-01-01' OR p_hasta > DATE '9999-12-31'
     OR p_planta_id <= 0 OR p_vivero_id <= 0
     OR p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 1000000 THEN
    PERFORM public.pa_r_error(422, 'ENTRADA_INVALIDA', 'Filtros no válidos.');
  END IF;

  WITH eventos AS MATERIALIZED (
    SELECT e.id, e.fecha_evento, e.lote_id, e.causa_merma::text AS causa,
      CASE WHEN e.unidad_medida_evento = 'UNIDAD'
        AND e.cantidad_afectada BETWEEN 1 AND 2147483647
        AND trunc(e.cantidad_afectada) = e.cantidad_afectada
        THEN e.cantidad_afectada::integer END AS cantidad
    FROM public.evento_lote_vivero e
    JOIN public.lote_vivero l ON l.id = e.lote_id
    WHERE e.tipo_evento = 'MERMA' AND e.fecha_evento BETWEEN p_desde AND p_hasta
      AND (p_planta_id IS NULL OR l.planta_id = p_planta_id)
      AND (p_vivero_id IS NULL OR l.vivero_id = p_vivero_id)
  ), resumen AS (
    SELECT coalesce(sum(cantidad), 0) AS plantas, count(*) AS eventos,
      count(*) FILTER (WHERE cantidad IS NULL) AS eventos_sin_cantidad
    FROM eventos
  ), por_causa AS (
    SELECT causa, coalesce(sum(cantidad), 0) AS plantas, count(*) AS eventos
    FROM eventos GROUP BY causa
  ), meses AS (
    SELECT to_char(fecha_evento, 'YYYY-MM') AS mes, coalesce(sum(cantidad), 0) AS plantas
    FROM eventos GROUP BY 1
  ), pagina AS (
    SELECT * FROM eventos ORDER BY fecha_evento DESC, id DESC
    LIMIT tamano_pagina OFFSET ((p_pagina - 1) * tamano_pagina)
  ), viveros AS MATERIALIZED (
    SELECT v.id, v.nombre::text AS nombre
    FROM public.vivero v
    WHERE EXISTS (SELECT 1 FROM public.lote_vivero l WHERE l.vivero_id = v.id)
  ), especies AS MATERIALIZED (
    SELECT p.id, coalesce(nullif(btrim(p.nombre_comun_principal), ''),
      nullif(btrim(p.especie), ''), nullif(btrim(p.nombre_cientifico), ''),
      'Especie ' || p.id) AS nombre
    FROM public.planta p
    WHERE EXISTS (SELECT 1 FROM public.lote_vivero l WHERE l.planta_id = p.id)
  )
  SELECT jsonb_build_object(
    'observado_en', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'filtros', jsonb_build_object('desde', to_char(p_desde, 'YYYY-MM-DD'),
      'hasta', to_char(p_hasta, 'YYYY-MM-DD'), 'planta_id', p_planta_id::text,
      'vivero_id', p_vivero_id::text, 'pagina', p_pagina),
    'totales', to_jsonb(resumen),
    'por_causa', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.plantas DESC, c.causa NULLS LAST) FROM por_causa c
    ), '[]'::jsonb),
    'meses', coalesce((
      SELECT jsonb_agg(to_jsonb(m) ORDER BY m.mes) FROM meses m
    ), '[]'::jsonb),
    'tamano_pagina', tamano_pagina,
    'detalle', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', e.id::text, 'fecha', to_char(e.fecha_evento, 'YYYY-MM-DD'),
        'lote_id', e.lote_id::text, 'codigo_lote', l.codigo_trazabilidad, 'planta_id', l.planta_id::text,
        'especie', coalesce(nullif(btrim(l.nombre_comercial_snapshot), ''), p.nombre),
        'vivero_id', l.vivero_id::text, 'vivero', v.nombre, 'causa', e.causa, 'cantidad', e.cantidad)
        ORDER BY e.fecha_evento DESC, e.id DESC)
      FROM pagina e
      JOIN public.lote_vivero l ON l.id = e.lote_id
      JOIN especies p ON p.id = l.planta_id
      JOIN viveros v ON v.id = l.vivero_id
    ), '[]'::jsonb),
    'opciones', jsonb_build_object(
      'viveros', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', v.id::text, 'nombre', v.nombre) ORDER BY v.nombre, v.id)
        FROM viveros v
      ), '[]'::jsonb),
      'especies', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', p.id::text, 'nombre', p.nombre) ORDER BY p.nombre, p.id)
        FROM especies p
      ), '[]'::jsonb)
    )
  ) INTO reporte FROM resumen;

  RETURN reporte;
END;
$$;

COMMENT ON FUNCTION public.reportes_vivero_leer(bigint, text, bigint, bigint)
  IS 'Saldo físico actual agrupado por especie y vivero para ADMIN.';
COMMENT ON FUNCTION public.reportes_mermas_leer(bigint, text, date, date, bigint, bigint, integer)
  IS 'Mermas registradas en Vivero con agregados completos y detalle paginado para ADMIN.';

REVOKE ALL ON FUNCTION public.reportes_vivero_leer(bigint, text, bigint, bigint),
  public.reportes_mermas_leer(bigint, text, date, date, bigint, bigint, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reportes_vivero_leer(bigint, text, bigint, bigint),
  public.reportes_mermas_leer(bigint, text, date, date, bigint, bigint, integer)
  TO service_role;

DO $$
DECLARE
  firma regprocedure;
BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.reportes_vivero_leer(bigint,text,bigint,bigint)'::regprocedure,
    'public.reportes_mermas_leer(bigint,text,date,date,bigint,bigint,integer)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', firma, 'EXECUTE')
      OR has_function_privilege('authenticated', firma, 'EXECUTE') THEN
      RAISE EXCEPTION 'REPORTES_VIVERO_PRIVILEGIO_PUBLICO_HEREDADO';
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
