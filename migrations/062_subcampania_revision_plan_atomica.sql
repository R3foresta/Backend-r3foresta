-- ADR-PLA-05: meta total y especies se guardan como una sola revision ADMIN.
-- Depende de 047 (plan/historial), 060 (asignacion) y 061 (plantacion).
-- Las RPC 060/061 toman subcampania FOR UPDATE antes de consultar el plan.
-- Esta revision comparte ese lock y no altera plantaciones, stock ni estado.

ALTER TABLE public.subcampania
  ADD COLUMN IF NOT EXISTS plan_revision BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.subcampania'::regclass
      AND conname = 'subcampania_plan_revision_no_negativa_chk'
  ) THEN
    ALTER TABLE public.subcampania
      ADD CONSTRAINT subcampania_plan_revision_no_negativa_chk
      CHECK (plan_revision >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.subcampania.plan_revision IS
  'Version del conjunto meta_total_arboles + plan por especie. Se incrementa en la revision atomica y permite rechazar escrituras obsoletas (ADR-PLA-05).';

ALTER TYPE public.tipo_historial_subcampania
  ADD VALUE IF NOT EXISTS 'PLAN_REVISADO';

COMMENT ON TABLE public.subcampania_meta_especie IS
  'Plan por especie: ADMIN puede revisar en BORRADOR/ACTIVA mediante fn_subcampania_revisar_plan. SUM(%)=100 y SUM(cantidad)=meta_total_arboles. Metas orientativas; no limitan consumo de stock.';

-- Una sola sentencia/snapshot para que meta, version y especies correspondan
-- siempre a la misma revision, incluso durante un guardado concurrente.
CREATE OR REPLACE FUNCTION public.fn_subcampania_obtener_plan(
  p_subcampania_id BIGINT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'subcampania_id', s.id,
    'estado', s.estado,
    'meta_total_arboles', s.meta_total_arboles,
    'plan_revision', s.plan_revision,
    'metas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'planta_id', m.planta_id,
        'porcentaje_objetivo', m.porcentaje_objetivo,
        'cantidad_objetivo', m.cantidad_objetivo,
        'planta', jsonb_build_object(
          'id', p.id,
          'especie', p.especie,
          'nombre_cientifico', p.nombre_cientifico
        )
      ) ORDER BY m.planta_id)
      FROM public.subcampania_meta_especie m
      JOIN public.planta p ON p.id = m.planta_id
      WHERE m.subcampania_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id AND s.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.fn_subcampania_revisar_plan(
  p_subcampania_id BIGINT,
  p_meta_total_arboles INTEGER,
  p_metas JSONB,
  p_actor_user_id BIGINT,
  p_revision_esperada BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.subcampania%ROWTYPE;
  v_rol TEXT;
  v_meta_total INTEGER;
  v_item JSONB;
  v_planta_id BIGINT;
  v_cantidad INTEGER;
  v_porcentaje NUMERIC;
  v_suma_cantidades BIGINT := 0;
  v_suma_porcentajes NUMERIC := 0;
  v_especie_protegida BIGINT;
  v_anterior JSONB;
  v_nuevo JSONB;
  v_fecha TIMESTAMPTZ;
BEGIN
  SELECT UPPER(u.rol::text) INTO v_rol
  FROM public.usuario u
  WHERE u.id = p_actor_user_id
  FOR SHARE;

  IF v_rol IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo ADMIN global puede revisar la meta total y el plan de especies.'
      USING ERRCODE = 'PT403';
  END IF;

  -- Frontera comun con asignacion (060) y plantacion (061). Despues de
  -- esperar el lock se leen estado, version, registros y stock actuales.
  SELECT * INTO v_sub
  FROM public.subcampania
  WHERE id = p_subcampania_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada.', p_subcampania_id
      USING ERRCODE = 'PT404';
  END IF;

  IF v_sub.estado NOT IN ('BORRADOR', 'ACTIVA') THEN
    RAISE EXCEPTION 'El plan solo se puede revisar en BORRADOR o ACTIVA (estado actual: %).', v_sub.estado
      USING ERRCODE = 'PT422';
  END IF;

  IF v_sub.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Subcampania % no encontrada.', p_subcampania_id
      USING ERRCODE = 'PT404';
  END IF;

  IF v_sub.estado = 'ACTIVA'
     AND (p_meta_total_arboles IS NULL OR p_revision_esperada IS NULL) THEN
    RAISE EXCEPTION 'En ACTIVA se requieren meta_total_arboles y revision_esperada para guardar una revision completa.'
      USING ERRCODE = 'PT422';
  END IF;

  IF p_meta_total_arboles IS NOT NULL AND p_revision_esperada IS NULL THEN
    RAISE EXCEPTION 'Una revision completa de meta_total_arboles y especies requiere revision_esperada.'
      USING ERRCODE = 'PT422';
  END IF;

  IF p_revision_esperada IS NOT NULL
     AND p_revision_esperada IS DISTINCT FROM v_sub.plan_revision THEN
    RAISE EXCEPTION 'El plan cambio desde su lectura (revision esperada: %, revision actual: %). Volver a leer antes de guardar.', p_revision_esperada, v_sub.plan_revision
      USING ERRCODE = 'PT409';
  END IF;

  -- Compatibilidad BORRADOR: el antiguo cuerpo {metas} conserva la meta
  -- vigente, validando la misma coherencia que una revision completa.
  v_meta_total := COALESCE(p_meta_total_arboles, v_sub.meta_total_arboles);
  IF v_meta_total IS NULL OR v_meta_total <= 0 THEN
    RAISE EXCEPTION 'meta_total_arboles debe ser un entero mayor a 0.'
      USING ERRCODE = 'PT422';
  END IF;

  IF p_metas IS NULL OR jsonb_typeof(p_metas) <> 'array' THEN
    RAISE EXCEPTION 'metas debe ser un array de especies.' USING ERRCODE = 'PT422';
  END IF;
  IF jsonb_array_length(p_metas) = 0 THEN
    RAISE EXCEPTION 'El plan requiere al menos una especie.' USING ERRCODE = 'PT422';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_metas)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_item->'planta_id') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'cantidad_objetivo') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item->'porcentaje_objetivo') IS DISTINCT FROM 'number'
       OR (v_item->>'planta_id') !~ '^[1-9][0-9]*$'
       OR (v_item->>'cantidad_objetivo') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Cada especie requiere planta_id y cantidad_objetivo enteros positivos, y porcentaje_objetivo numerico.'
        USING ERRCODE = 'PT422';
    END IF;

    BEGIN
      v_planta_id := (v_item->>'planta_id')::BIGINT;
      v_cantidad := (v_item->>'cantidad_objetivo')::INTEGER;
      v_porcentaje := (v_item->>'porcentaje_objetivo')::NUMERIC;
    EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN
      RAISE EXCEPTION 'Los valores del plan exceden el rango admitido.' USING ERRCODE = 'PT422';
    END;

    IF v_porcentaje <= 0 OR v_porcentaje > 100
       OR v_porcentaje <> ROUND(v_porcentaje, 2) THEN
      RAISE EXCEPTION 'porcentaje_objetivo debe ser mayor a 0 y hasta 100, con hasta dos decimales.'
        USING ERRCODE = 'PT422';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.planta WHERE id = v_planta_id) THEN
      RAISE EXCEPTION 'La planta_id % no existe en el catalogo.', v_planta_id
        USING ERRCODE = '23503';
    END IF;

    v_suma_cantidades := v_suma_cantidades + v_cantidad;
    v_suma_porcentajes := v_suma_porcentajes + v_porcentaje;
  END LOOP;

  IF EXISTS (
    SELECT m.planta_id
    FROM jsonb_to_recordset(p_metas) AS m(planta_id BIGINT)
    GROUP BY m.planta_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada planta_id solo puede aparecer una vez en el plan.' USING ERRCODE = 'PT422';
  END IF;

  IF v_suma_cantidades <> v_meta_total OR v_suma_porcentajes <> 100 THEN
    RAISE EXCEPTION 'El plan debe sumar meta_total_arboles (%) en cantidades y 100 en porcentajes (cantidades: %, porcentajes: %).', v_meta_total, v_suma_cantidades, v_suma_porcentajes
      USING ERRCODE = 'PT422';
  END IF;

  -- Solo se protegen especies retiradas. Los objetivos pueden ser menores
  -- que lo real: siguen siendo orientativos. El lock padre impide nuevas
  -- asignaciones/plantaciones entre estas comprobaciones y la escritura.
  SELECT m.planta_id INTO v_especie_protegida
  FROM public.subcampania_meta_especie m
  WHERE m.subcampania_id = p_subcampania_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_metas) AS n(planta_id BIGINT)
      WHERE n.planta_id = m.planta_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.registro_plantacion rp
      JOIN public.registro_plantacion_detalle d ON d.registro_plantacion_id = rp.id
      WHERE rp.subcampania_id = p_subcampania_id
        AND rp.es_reposicion = FALSE AND d.planta_id = m.planta_id
    )
  ORDER BY m.planta_id LIMIT 1;

  IF v_especie_protegida IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede retirar la especie %: tiene plantacion inicial registrada.', v_especie_protegida
      USING ERRCODE = 'PT422';
  END IF;

  SELECT m.planta_id INTO v_especie_protegida
  FROM public.subcampania_meta_especie m
  WHERE m.subcampania_id = p_subcampania_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_metas) AS n(planta_id BIGINT)
      WHERE n.planta_id = m.planta_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.asignacion_vivero_subcampania a
      JOIN public.lote_vivero l ON l.id = a.lote_vivero_id
      WHERE a.subcampania_id = p_subcampania_id
        AND a.proposito = 'PLANTACION_INICIAL'
        AND a.saldo_asignado_disponible > 0 AND l.planta_id = m.planta_id
    )
  ORDER BY m.planta_id LIMIT 1;

  IF v_especie_protegida IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede retirar la especie %: tiene stock disponible para plantacion inicial.', v_especie_protegida
      USING ERRCODE = 'PT422';
  END IF;

  v_anterior := public.fn_subcampania_obtener_plan(p_subcampania_id);
  v_fecha := clock_timestamp();

  DELETE FROM public.subcampania_meta_especie m
  WHERE m.subcampania_id = p_subcampania_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_metas) AS n(planta_id BIGINT)
      WHERE n.planta_id = m.planta_id
    );

  -- Conservar identidad/autoria de las especies retenidas.
  INSERT INTO public.subcampania_meta_especie (
    subcampania_id, planta_id, porcentaje_objetivo, cantidad_objetivo,
    created_at, updated_at, created_by, updated_by
  )
  SELECT p_subcampania_id, m.planta_id, m.porcentaje_objetivo, m.cantidad_objetivo,
         v_fecha, v_fecha, p_actor_user_id, p_actor_user_id
  FROM jsonb_to_recordset(p_metas) AS m(
    planta_id BIGINT, porcentaje_objetivo NUMERIC, cantidad_objetivo INTEGER
  )
  ON CONFLICT (subcampania_id, planta_id) DO UPDATE
    SET porcentaje_objetivo = EXCLUDED.porcentaje_objetivo,
        cantidad_objetivo = EXCLUDED.cantidad_objetivo,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  UPDATE public.subcampania
  SET meta_total_arboles = v_meta_total,
      plan_revision = plan_revision + 1,
      updated_at = v_fecha,
      updated_by = p_actor_user_id
  WHERE id = p_subcampania_id;

  v_nuevo := public.fn_subcampania_obtener_plan(p_subcampania_id);

  -- Sin captura best-effort: cualquier fallo del historial revierte meta,
  -- especies y version junto con la transaccion de esta llamada RPC.
  INSERT INTO public.subcampania_historial (
    subcampania_id, tipo_historial, estado_origen, estado_destino,
    metadata, actor_user_id, created_at
  ) VALUES (
    p_subcampania_id, 'PLAN_REVISADO', v_sub.estado, v_sub.estado,
    jsonb_build_object('anterior', v_anterior, 'nuevo', v_nuevo),
    p_actor_user_id, v_fecha
  );

  RETURN v_nuevo;
END;
$$;

COMMENT ON FUNCTION public.fn_subcampania_revisar_plan(BIGINT, INTEGER, JSONB, BIGINT, BIGINT) IS
  'ADR-PLA-05: revision atomica ADMIN en BORRADOR/ACTIVA de meta y especies, con version esperada, proteccion de especies usadas y auditoria obligatoria. Comparte lock padre con asignacion/plantacion; no altera hechos, saldos ni estado.';

REVOKE ALL ON FUNCTION public.fn_subcampania_revisar_plan(BIGINT, INTEGER, JSONB, BIGINT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_subcampania_revisar_plan(BIGINT, INTEGER, JSONB, BIGINT, BIGINT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
