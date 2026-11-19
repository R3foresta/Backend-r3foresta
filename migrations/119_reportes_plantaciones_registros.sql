-- La misma atribución por registro alimenta el resumen y la consulta paginada de una especie.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.reportes_plantaciones_leer_corte(
  p_actor_id bigint,
  p_auth_id text,
  p_desde date,
  p_hasta date,
  p_organizacion_id bigint,
  p_campania_id bigint,
  p_planta_id bigint,
  p_especie text,
  p_version_detalle text,
  p_pagina integer
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
     OR p_organizacion_id <= 0 OR p_campania_id <= 0 OR p_planta_id <= 0 THEN
    PERFORM public.pa_r_error(422, 'ENTRADA_INVALIDA', 'Filtros no válidos.');
  END IF;

  IF p_especie IS NULL THEN
    IF p_version_detalle IS NOT NULL OR p_pagina IS NOT NULL THEN
      PERFORM public.pa_r_error(422, 'ENTRADA_INVALIDA', 'El detalle requiere especie.');
    END IF;
  ELSIF p_version_detalle IS NULL OR p_version_detalle !~ '^[0-9a-f]{64}$'
     OR p_pagina IS NULL OR p_pagina NOT BETWEEN 1 AND 1000000
     OR (p_planta_id IS NOT NULL AND p_especie <> p_planta_id::text)
     OR (p_especie <> 'sin_desglose' AND (p_especie !~ '^[1-9][0-9]{0,18}$'
       OR (length(p_especie) = 19 AND p_especie COLLATE "C" > '9223372036854775807'))) THEN
    PERFORM public.pa_r_error(422, 'ENTRADA_INVALIDA', 'Filtros de detalle no válidos.');
  END IF;

  WITH registros AS MATERIALIZED (
    SELECT r.id, r.fecha_plantacion, r.es_reposicion, r.codigo_trazabilidad, s.id AS subcampania_id,
      coalesce(nullif(btrim(r.nombre_subcampania_snapshot), ''), s.nombre) AS subcampania,
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
  ), cantidades AS MATERIALIZED (
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
  ), desglose AS (
    SELECT c.id, jsonb_agg(jsonb_build_object(
      'planta_id', c.planta_id::text,
      'nombre', CASE WHEN c.planta_id IS NULL THEN 'Sin desglose de especie' ELSE
        coalesce(nullif(btrim(p.nombre_comun_principal), ''), nullif(btrim(p.especie), ''),
          nullif(btrim(p.nombre_cientifico), ''), 'Especie ' || c.planta_id) END,
      'cantidad', c.cantidad
    ) ORDER BY c.planta_id NULLS LAST) AS especies
    FROM cantidades c LEFT JOIN public.planta p ON p.id = c.planta_id
    GROUP BY c.id
  ), fichas AS (
    SELECT r.id, jsonb_build_object(
      'registro_id', r.id::text, 'codigo_trazabilidad', r.codigo_trazabilidad,
      'fecha', to_char(r.fecha_plantacion, 'YYYY-MM-DD'), 'es_reposicion', r.es_reposicion,
      'subcampania_id', r.subcampania_id::text, 'subcampania', r.subcampania,
      'cantidad_total', r.cantidad, 'especies', d.especies
    ) AS ficha
    FROM registros r JOIN desglose d USING (id)
  ), fichas_versionadas AS MATERIALIZED (
    -- Calcular una sola huella de la jornada, incluyendo el reparto completo.
    SELECT id, ficha, encode(sha256(convert_to(ficha::text, 'UTF8')), 'hex') AS version_ficha FROM fichas
  ), filtradas AS MATERIALIZED (
    SELECT c.*, f.version_ficha
    FROM cantidades c JOIN fichas_versionadas f USING (id)
    WHERE (p_planta_id IS NULL OR c.planta_id = p_planta_id)
      AND (p_especie IS NULL OR coalesce(c.planta_id::text, 'sin_desglose') = p_especie)
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
  ), especies AS MATERIALIZED (
    SELECT planta_id,
      encode(sha256(convert_to(
        coalesce(planta_id::text, 'sin_desglose') || ':' || string_agg(version_ficha, '' ORDER BY id),
        'UTF8'
      )), 'hex') AS version_detalle,
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
  ), pagina AS (
    SELECT f.id, f.fecha_plantacion, f.cantidad
    FROM filtradas f
    ORDER BY f.fecha_plantacion DESC, f.id DESC
    LIMIT tamano_pagina OFFSET ((p_pagina - 1) * tamano_pagina)
  )
  SELECT jsonb_build_object(
    'observado_en', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'filtros', jsonb_build_object(
      'desde', to_char(p_desde, 'YYYY-MM-DD'),
      'hasta', to_char(p_hasta, 'YYYY-MM-DD'),
      'organizacion_id', p_organizacion_id::text,
      'campania_id', p_campania_id::text,
      'planta_id', p_planta_id::text
    ) || CASE WHEN p_especie IS NULL THEN '{}'::jsonb ELSE
      jsonb_build_object('especie', p_especie, 'pagina', p_pagina) END,
    'totales', to_jsonb(resumen)
  ) || CASE WHEN p_especie IS NOT NULL THEN jsonb_build_object(
    'version_detalle', (SELECT version_detalle FROM especies),
    'tamano_pagina', tamano_pagina,
    'detalle', coalesce((
      SELECT jsonb_agg(f.ficha || jsonb_build_object('cantidad', p.cantidad)
        ORDER BY p.fecha_plantacion DESC, p.id DESC)
      FROM pagina p JOIN fichas_versionadas f USING (id)
    ), '[]'::jsonb)
  ) ELSE jsonb_build_object(
    'meses', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.mes) FROM meses m), '[]'::jsonb),
    'especies', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'planta_id', e.planta_id::text, 'version_detalle', e.version_detalle,
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
  ) END INTO reporte FROM resumen;

  IF p_especie IS NOT NULL AND reporte->>'version_detalle' IS DISTINCT FROM p_version_detalle THEN
    PERFORM public.pa_r_error(409, 'CORTE_ACTUALIZADO', 'Los registros cambiaron. Actualiza el reporte.');
  END IF;

  RETURN reporte;
END;
$$;

-- Los consumidores existentes conservan el endpoint y la firma de 114.
CREATE OR REPLACE FUNCTION public.reportes_plantaciones_leer(
  p_actor_id bigint, p_auth_id text, p_desde date, p_hasta date,
  p_organizacion_id bigint, p_campania_id bigint, p_planta_id bigint
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT public.reportes_plantaciones_leer_corte(p_actor_id, p_auth_id, p_desde, p_hasta,
    p_organizacion_id, p_campania_id, p_planta_id, NULL, NULL, NULL);
$$;

REVOKE ALL ON FUNCTION public.reportes_plantaciones_leer_corte(bigint,text,date,date,bigint,bigint,bigint,text,text,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reportes_plantaciones_leer_corte(bigint,text,date,date,bigint,bigint,bigint,text,text,integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
