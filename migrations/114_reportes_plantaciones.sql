-- Reporte administrativo de hechos de campo. Una lectura para tarjetas, gráficos y PDF.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.reportes_plantaciones_leer(
  p_actor_id bigint,
  p_auth_id text,
  p_desde date,
  p_hasta date,
  p_organizacion_id bigint,
  p_campania_id bigint,
  p_planta_id bigint
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
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta
     OR p_desde < DATE '0001-01-01' OR p_hasta > DATE '9999-12-31'
     OR p_organizacion_id <= 0 OR p_campania_id <= 0 OR p_planta_id <= 0 THEN
    PERFORM public.pa_r_error(422, 'ENTRADA_INVALIDA', 'Filtros no válidos.');
  END IF;

  WITH registros AS MATERIALIZED (
    SELECT r.id, r.fecha_plantacion, r.es_reposicion,
      coalesce(e.cantidad_efectiva, r.cantidad_total_plantada)::bigint AS cantidad
    FROM public.registro_plantacion r
    JOIN public.subcampania s ON s.id = r.subcampania_id
    LEFT JOIN public.registro_plantacion_efectivo e ON e.registro_plantacion_id = r.id
    WHERE r.fecha_plantacion BETWEEN p_desde AND p_hasta
      AND coalesce(e.estado, 'VIGENTE') = 'VIGENTE'
      AND (p_campania_id IS NULL OR s.campania_id = p_campania_id)
      AND (p_organizacion_id IS NULL OR EXISTS (
        SELECT 1
        FROM public.campania_organizacion o
        WHERE o.campania_id = s.campania_id AND o.organizacion_id = p_organizacion_id
      ))
  ), detalles AS MATERIALIZED (
    SELECT d.registro_plantacion_id AS registro_id, d.planta_id, sum(d.cantidad) AS cantidad
    FROM registros r
    JOIN public.registro_plantacion_detalle d ON d.registro_plantacion_id = r.id
    GROUP BY d.registro_plantacion_id, d.planta_id
  ), detalle_registro AS MATERIALIZED (
    SELECT registro_id, sum(cantidad) AS cantidad FROM detalles GROUP BY registro_id
  ), cantidades AS (
    SELECT r.id, r.fecha_plantacion, r.es_reposicion, d.planta_id, d.cantidad
    FROM registros r
    JOIN detalles d ON d.registro_id = r.id
    JOIN detalle_registro t ON t.registro_id = r.id
    WHERE t.cantidad <= r.cantidad
    UNION ALL
    -- El excedente de detalle invalida el desglose del registro. Mantener su
    -- cantidad física como un total sin especie. Un detalle parcial conserva
    -- las cantidades conocidas y lleva la diferencia al total sin especie.
    SELECT r.id, r.fecha_plantacion, r.es_reposicion, NULL::bigint,
      CASE WHEN t.cantidad > r.cantidad THEN r.cantidad
        ELSE r.cantidad - coalesce(t.cantidad, 0) END::bigint
    FROM registros r
    LEFT JOIN detalle_registro t ON t.registro_id = r.id
    WHERE t.cantidad IS DISTINCT FROM r.cantidad
  ), filtradas AS MATERIALIZED (
    SELECT * FROM cantidades WHERE p_planta_id IS NULL OR planta_id = p_planta_id
  ), resumen AS (
    SELECT count(DISTINCT id) AS registros,
      coalesce(sum(cantidad) FILTER (WHERE NOT es_reposicion), 0) AS iniciales,
      coalesce(sum(cantidad) FILTER (WHERE es_reposicion), 0) AS reposiciones,
      coalesce(sum(cantidad), 0) AS total
    FROM filtradas
  ), meses AS (
    SELECT to_char(fecha_plantacion, 'YYYY-MM') AS mes,
      coalesce(sum(cantidad) FILTER (WHERE NOT es_reposicion), 0) AS iniciales,
      coalesce(sum(cantidad) FILTER (WHERE es_reposicion), 0) AS reposiciones
    FROM filtradas
    GROUP BY 1
  ), especies AS (
    SELECT planta_id,
      coalesce(sum(cantidad) FILTER (WHERE NOT es_reposicion), 0) AS iniciales,
      coalesce(sum(cantidad) FILTER (WHERE es_reposicion), 0) AS reposiciones,
      sum(cantidad) AS total
    FROM filtradas
    GROUP BY planta_id
  ), opciones_campanias AS MATERIALIZED (
    SELECT c.id, c.nombre
    FROM public.campania c
    WHERE EXISTS (
      SELECT 1 FROM public.subcampania s
      JOIN public.registro_plantacion r ON r.subcampania_id = s.id
      WHERE s.campania_id = c.id
    )
  )
  SELECT jsonb_build_object(
    'observado_en', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'filtros', jsonb_build_object(
      'desde', to_char(p_desde, 'YYYY-MM-DD'),
      'hasta', to_char(p_hasta, 'YYYY-MM-DD'),
      'organizacion_id', p_organizacion_id::text,
      'campania_id', p_campania_id::text,
      'planta_id', p_planta_id::text
    ),
    'totales', to_jsonb(resumen),
    'meses', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.mes) FROM meses m), '[]'::jsonb),
    'especies', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'planta_id', e.planta_id::text,
        'nombre_comun', CASE WHEN e.planta_id IS NULL THEN 'Sin desglose de especie'
          ELSE coalesce(nullif(btrim(p.nombre_comun_principal), ''), nullif(btrim(p.especie), '')) END,
        'nombre_cientifico', nullif(btrim(p.nombre_cientifico), ''),
        'iniciales', e.iniciales,
        'reposiciones', e.reposiciones,
        'total', e.total
      ) ORDER BY e.planta_id IS NULL, e.total DESC, e.planta_id)
      FROM especies e LEFT JOIN public.planta p ON p.id = e.planta_id
    ), '[]'::jsonb),
    'opciones', jsonb_build_object(
      'organizaciones', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', o.id::text, 'nombre', o.nombre) ORDER BY o.nombre, o.id)
        FROM public.organizacion o
        WHERE EXISTS (
          SELECT 1 FROM public.campania_organizacion co
          JOIN opciones_campanias c ON c.id = co.campania_id
          WHERE co.organizacion_id = o.id
        )
      ), '[]'::jsonb),
      'campanias', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', c.id::text, 'nombre', c.nombre) ORDER BY c.nombre, c.id)
        FROM opciones_campanias c
      ), '[]'::jsonb),
      'especies', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', p.id::text, 'nombre', p.nombre) ORDER BY p.nombre, p.id)
        FROM (
          SELECT p.id, coalesce(nullif(btrim(p.nombre_comun_principal), ''),
            nullif(btrim(p.especie), ''), nullif(btrim(p.nombre_cientifico), ''), 'Especie ' || p.id) AS nombre
          FROM public.planta p
          WHERE EXISTS (
            SELECT 1 FROM public.registro_plantacion_detalle d WHERE d.planta_id = p.id
          )
        ) p
      ), '[]'::jsonb)
    )
  ) INTO reporte FROM resumen;

  RETURN reporte;
END;
$$;

COMMENT ON FUNCTION public.reportes_plantaciones_leer(bigint, text, date, date, bigint, bigint, bigint)
  IS 'Consulta administrativa de cantidades físicas registradas por fecha, campaña, organización asociada y especie.';

REVOKE ALL ON FUNCTION public.reportes_plantaciones_leer(bigint, text, date, date, bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reportes_plantaciones_leer(bigint, text, date, date, bigint, bigint, bigint)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reportes_plantaciones_leer(bigint,text,date,date,bigint,bigint,bigint)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.reportes_plantaciones_leer(bigint,text,date,date,bigint,bigint,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'REPORTES_PLANTACIONES_PRIVILEGIO_PUBLICO_HEREDADO';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
