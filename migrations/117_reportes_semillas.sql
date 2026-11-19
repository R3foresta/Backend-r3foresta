-- Lecturas administrativas de semillas en custodia y de sus movimientos físicos.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.reportes_semillas_saldo_leer(
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

  WITH semillas AS NOT MATERIALIZED (
    SELECT r.id, r.planta_id, r.vivero_id, r.unidad_canonica, r.saldo_actual,
      r.estado_registro, r.estado_operativo
    FROM public.recoleccion r
    WHERE r.tipo_material = 'SEMILLA' AND r.eliminado_en IS NULL
  ), lotes_conformes AS MATERIALIZED (
    SELECT s.planta_id, s.vivero_id, s.unidad_canonica::text AS unidad, s.saldo_actual,
      (s.planta_id IS NOT NULL
        AND s.saldo_actual > 0 AND s.saldo_actual::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND s.unidad_canonica IN ('G', 'UNIDAD') AND c.unidad_recibida = s.unidad_canonica
        AND s.saldo_actual = round(s.saldo_actual, 6)
        AND (s.unidad_canonica <> 'UNIDAD' OR s.saldo_actual = trunc(s.saldo_actual))) AS saldo_verificable
    FROM semillas s
    JOIN public.recoleccion_recepcion c ON c.recoleccion_id = s.id AND c.vivero_id = s.vivero_id
    WHERE s.estado_registro = 'VALIDADO' AND s.estado_operativo = 'ABIERTO'
      AND (p_planta_id IS NULL OR s.planta_id = p_planta_id)
      AND (p_vivero_id IS NULL OR s.vivero_id = p_vivero_id)
  ), saldos AS (
    SELECT planta_id, vivero_id, unidad, sum(saldo_actual) AS saldo
    FROM lotes_conformes WHERE saldo_verificable
    GROUP BY planta_id, vivero_id, unidad
  ), viveros AS MATERIALIZED (
    SELECT v.id, v.nombre::text AS nombre
    FROM public.vivero v
    WHERE EXISTS (SELECT 1 FROM semillas s WHERE s.vivero_id = v.id)
  ), especies AS MATERIALIZED (
    SELECT p.id, coalesce(nullif(btrim(p.nombre_comun_principal), ''),
      nullif(btrim(p.nombre_cientifico), ''), 'Especie ' || p.id) AS nombre
    FROM public.planta p
    WHERE EXISTS (SELECT 1 FROM semillas s WHERE s.planta_id = p.id)
  ), filas AS MATERIALIZED (
    SELECT s.planta_id, p.nombre AS especie, s.vivero_id, v.nombre AS vivero, s.unidad, s.saldo
    FROM saldos s
    JOIN especies p ON p.id = s.planta_id
    JOIN viveros v ON v.id = s.vivero_id
  )
  SELECT jsonb_build_object(
    'observado_en', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'filtros', jsonb_build_object('planta_id', p_planta_id::text, 'vivero_id', p_vivero_id::text),
    'opciones', jsonb_build_object(
      'viveros', coalesce((SELECT jsonb_agg(
        jsonb_build_object('id', id::text, 'nombre', nombre) ORDER BY nombre, id
      ) FROM viveros), '[]'::jsonb),
      'especies', coalesce((SELECT jsonb_agg(
        jsonb_build_object('id', id::text, 'nombre', nombre) ORDER BY nombre, id
      ) FROM especies), '[]'::jsonb)
    ),
    'saldo_invalido', EXISTS (SELECT 1 FROM lotes_conformes WHERE saldo_verificable IS NOT TRUE),
    'totales', (SELECT jsonb_build_object(
      'G', trim_scale(coalesce(sum(saldo) FILTER (WHERE unidad = 'G'), 0))::text,
      'UNIDAD', trim_scale(coalesce(sum(saldo) FILTER (WHERE unidad = 'UNIDAD'), 0))::text
    ) FROM filas),
    'filas', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'planta_id', planta_id::text, 'especie', especie, 'vivero_id', vivero_id::text,
      'vivero', vivero, 'unidad', unidad, 'saldo', trim_scale(saldo)::text
    ) ORDER BY vivero, especie, vivero_id, planta_id, unidad) FROM filas), '[]'::jsonb)
  ) INTO reporte;
  IF reporte->'saldo_invalido' = 'true'::jsonb THEN
    PERFORM public.pa_r_error(503, 'SALDO_SEMILLAS_NO_VERIFICABLE', 'No se pudo confirmar el saldo de semillas.');
  END IF;
  RETURN reporte - 'saldo_invalido';
END;
$$;

CREATE OR REPLACE FUNCTION public.reportes_semillas_movimientos_leer(
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

  WITH semillas AS NOT MATERIALIZED (
    SELECT r.id, r.planta_id, r.vivero_id, r.codigo_trazabilidad, r.nombre_comercial_snapshot
    FROM public.recoleccion r
    WHERE r.tipo_material = 'SEMILLA' AND r.eliminado_en IS NULL AND r.planta_id IS NOT NULL
  ), eventos_fuente AS (
    SELECT c.id, 'RECEPCION_CONFORME'::text AS tipo, c.fecha_recepcion AS fecha,
      c.recoleccion_id, s.planta_id, c.vivero_id, NULL::bigint AS vivero_destino_id,
      c.unidad_recibida::text AS unidad, c.cantidad_recibida AS cantidad
    FROM public.recoleccion_recepcion c
    JOIN semillas s ON s.id = c.recoleccion_id
    WHERE c.fecha_recepcion BETWEEN p_desde AND p_hasta
      AND (p_planta_id IS NULL OR s.planta_id = p_planta_id)
      AND (p_vivero_id IS NULL OR c.vivero_id = p_vivero_id)
    UNION ALL
    SELECT m.id, m.tipo_movimiento::text, m.created_at, m.recoleccion_id, s.planta_id,
      s.vivero_id, l.vivero_id,
      CASE WHEN m.unidad_operativa IS NULL OR m.unidad_operativa = m.unidad_medida_evento
        THEN m.unidad_medida_evento::text END,
      -m.delta
    FROM public.recoleccion_movimiento m
    JOIN semillas s ON s.id = m.recoleccion_id
    LEFT JOIN public.lote_vivero l ON l.id = m.lote_vivero_id
      AND l.recoleccion_id = s.id AND m.tipo_movimiento = 'CONSUMO_A_VIVERO'
    WHERE m.tipo_movimiento IN ('CONSUMO_A_VIVERO', 'DESECHO')
      AND m.created_at BETWEEN p_desde AND p_hasta
      AND (p_planta_id IS NULL OR s.planta_id = p_planta_id)
      AND (p_vivero_id IS NULL OR s.vivero_id = p_vivero_id)
  ), eventos AS MATERIALIZED (
    SELECT id, tipo, fecha, recoleccion_id, planta_id, vivero_id, vivero_destino_id,
      CASE WHEN unidad IN ('G', 'UNIDAD') THEN unidad END AS unidad,
      CASE WHEN unidad IN ('G', 'UNIDAD') AND cantidad > 0
        AND cantidad::text NOT IN ('NaN', 'Infinity', '-Infinity')
        AND cantidad = round(cantidad, 6)
        AND (unidad <> 'UNIDAD' OR cantidad = trunc(cantidad))
        THEN cantidad END AS cantidad
    FROM eventos_fuente
  ), montos AS (
    SELECT unidad, jsonb_build_object(
      'recibido', trim_scale(coalesce(sum(cantidad) FILTER (WHERE tipo = 'RECEPCION_CONFORME'), 0))::text,
      'consumido', trim_scale(coalesce(sum(cantidad) FILTER (WHERE tipo = 'CONSUMO_A_VIVERO'), 0))::text,
      'descartado', trim_scale(coalesce(sum(cantidad) FILTER (WHERE tipo = 'DESECHO'), 0))::text
    ) AS montos
    FROM (VALUES ('G'), ('UNIDAD')) AS u(unidad)
    LEFT JOIN eventos e USING (unidad)
    GROUP BY unidad
  ), pagina AS MATERIALIZED (
    SELECT * FROM eventos ORDER BY fecha DESC, tipo, id DESC
    LIMIT tamano_pagina OFFSET ((p_pagina - 1) * tamano_pagina)
  ), viveros AS MATERIALIZED (
    SELECT v.id, v.nombre::text AS nombre
    FROM public.vivero v
    WHERE EXISTS (SELECT 1 FROM semillas s WHERE s.vivero_id = v.id)
      OR EXISTS (SELECT 1 FROM public.recoleccion_recepcion c
        JOIN semillas s ON s.id = c.recoleccion_id WHERE c.vivero_id = v.id)
  ), especies AS MATERIALIZED (
    SELECT p.id, coalesce(nullif(btrim(p.nombre_comun_principal), ''),
      nullif(btrim(p.nombre_cientifico), ''), 'Especie ' || p.id) AS nombre
    FROM public.planta p
    WHERE EXISTS (SELECT 1 FROM semillas s WHERE s.planta_id = p.id)
  )
  SELECT jsonb_build_object(
    'observado_en', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'filtros', jsonb_build_object('planta_id', p_planta_id::text, 'vivero_id', p_vivero_id::text,
      'desde', to_char(p_desde, 'YYYY-MM-DD'), 'hasta', to_char(p_hasta, 'YYYY-MM-DD'), 'pagina', p_pagina),
    'opciones', jsonb_build_object(
      'viveros', coalesce((SELECT jsonb_agg(
        jsonb_build_object('id', id::text, 'nombre', nombre) ORDER BY nombre, id
      ) FROM viveros), '[]'::jsonb),
      'especies', coalesce((SELECT jsonb_agg(
        jsonb_build_object('id', id::text, 'nombre', nombre) ORDER BY nombre, id
      ) FROM especies), '[]'::jsonb)
    ),
    'totales', (SELECT jsonb_object_agg(unidad, montos) FROM montos)
      || (SELECT jsonb_build_object('eventos', count(*),
        'eventos_sin_cantidad', count(*) FILTER (WHERE cantidad IS NULL)) FROM eventos),
    'tamano_pagina', tamano_pagina,
    'detalle', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', e.id::text, 'tipo', e.tipo, 'fecha', to_char(e.fecha, 'YYYY-MM-DD'),
      'recoleccion_id', e.recoleccion_id::text, 'codigo_recoleccion', nullif(btrim(s.codigo_trazabilidad), ''),
      'planta_id', e.planta_id::text,
      'especie', coalesce(nullif(btrim(s.nombre_comercial_snapshot), ''), p.nombre),
      'vivero_id', e.vivero_id::text, 'vivero', v.nombre,
      'vivero_destino', destino.nombre::text, 'unidad', e.unidad, 'cantidad', trim_scale(e.cantidad)::text
    ) ORDER BY e.fecha DESC, e.tipo, e.id DESC)
      FROM pagina e
      JOIN semillas s ON s.id = e.recoleccion_id
      JOIN especies p ON p.id = e.planta_id
      LEFT JOIN viveros v ON v.id = e.vivero_id
      LEFT JOIN public.vivero destino ON destino.id = e.vivero_destino_id
    ), '[]'::jsonb)
  ) INTO reporte;
  RETURN reporte;
END;
$$;

REVOKE ALL ON FUNCTION public.reportes_semillas_saldo_leer(bigint, text, bigint, bigint),
  public.reportes_semillas_movimientos_leer(bigint, text, date, date, bigint, bigint, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reportes_semillas_saldo_leer(bigint, text, bigint, bigint),
  public.reportes_semillas_movimientos_leer(bigint, text, date, date, bigint, bigint, integer)
  TO service_role;

DO $$
DECLARE
  firma regprocedure;
BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.reportes_semillas_saldo_leer(bigint,text,bigint,bigint)'::regprocedure,
    'public.reportes_semillas_movimientos_leer(bigint,text,date,date,bigint,bigint,integer)'::regprocedure
  ] LOOP
    IF has_function_privilege('anon', firma, 'EXECUTE')
      OR has_function_privilege('authenticated', firma, 'EXECUTE') THEN
      RAISE EXCEPTION 'REPORTES_SEMILLAS_PRIVILEGIO_PUBLICO_HEREDADO';
    END IF;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
