-- 053_m3_registrar_plantacion_sin_despacho.sql
-- Tarea M2-M3-03: reescribe fn_m3_registrar_plantacion para el contrato fisico.
--
-- La plantacion/reposicion CONSUME stock ya entregado a la subcampania:
--   - NO inserta EVENTO_LOTE_VIVERO (RN-VIV-52).
--   - NO modifica LOTE_VIVERO.saldo_vivo_actual (el descuento ocurrio al asignar).
--   - NO usa origen_despacho = AUTOMATICO_PLANTACION (RN-VIV-55).
--   - Solo aumenta ASIGNACION_VIVERO_SUBCAMPANIA.cantidad_consumida.
--
-- Cambios funcionales respecto a 034:
--   1. Estados permitidos: plantacion inicial solo ACTIVA; reposicion tambien
--      COMPLETADA y FINALIZADA_PARCIAL.
--   2. Reposicion valida contra el pendiente del grupo origen:
--      cantidad <= cantidad_muerta_acumulada - cantidad_repuesta_acumulada,
--      y actualiza cantidad_repuesta_acumulada del origen.
--   3. Plantacion inicial valida meta por especie (SUBCAMPANIA_META_ESPECIE):
--      la especie debe estar en el plan y el acumulado no puede exceder
--      cantidad_objetivo.
--   4. Actualiza contadores de subcampania: total_plantado_inicial (inicial)
--      o total_repuesto (reposicion). La reposicion NO avanza la meta.
--   5. La cota minima de fecha es la MAX(fecha_asignacion) de las asignaciones
--      consumidas (no la fecha de embolsado del lote: el lote ya no participa).
--   6. La respuesta reemplaza `despachos` por `consumos` (detalle por asignacion).
--
-- Depende de: 051 (schema fisico), 052 (asignacion fisica), 034 (version previa).

DO $$
BEGIN
  IF to_regclass('public.subcampania_meta_especie') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania_meta_especie. Ejecuta antes la migracion 047.';
  END IF;

  IF to_regprocedure('public.gps_dentro_poligono_con_tolerancia(bigint,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION 'No existe public.gps_dentro_poligono_con_tolerancia. Ejecuta antes la migracion 032.';
  END IF;

  IF to_regprocedure('public.fn_vivero_assert_fecha_operativa(date,date)') IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_vivero_assert_fecha_operativa. Ejecuta antes la migracion 010.';
  END IF;
END $$;

-- La firma no cambia: se reemplaza el cuerpo.
DROP FUNCTION IF EXISTS public.fn_m3_registrar_plantacion(
  BIGINT, BOOLEAN, BIGINT, DATE, BIGINT, NUMERIC, NUMERIC, TEXT, BIGINT[], JSONB, BIGINT[]
);

CREATE OR REPLACE FUNCTION public.fn_m3_registrar_plantacion(
  p_subcampania_id                BIGINT,
  p_es_reposicion                 BOOLEAN,
  p_registro_plantacion_origen_id BIGINT,
  p_fecha_plantacion              DATE,
  p_responsable_id                BIGINT,
  p_latitud                       NUMERIC,
  p_longitud                      NUMERIC,
  p_observaciones                 TEXT,
  p_coresponsable_ids             BIGINT[],
  p_detalles                      JSONB,
  p_evidencia_ids                 BIGINT[]
)
RETURNS TABLE (
  registro_plantacion_id        BIGINT,
  codigo_trazabilidad           TEXT,
  cantidad_total_plantada       INT,
  gps_dentro_poligono           BOOLEAN,
  gps_distancia_a_poligono_m    NUMERIC,
  consumos                      JSONB,
  coresponsable_ids_vinculados  BIGINT[],
  evidencia_ids_vinculadas      BIGINT[]
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_subcampania            RECORD;
  v_zona_nombre            TEXT;
  v_responsable_nombre     TEXT;
  v_gps                    RECORD;
  v_coresponsable_ids      BIGINT[];
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_es_reposicion          BOOLEAN := COALESCE(p_es_reposicion, FALSE);
  v_observaciones          TEXT;
  v_cantidad_total         INT;
  v_codigo_trazabilidad    TEXT;
  v_seq_n                  INT;
  v_registro_id            BIGINT;
  v_tipo_entidad_id        BIGINT;
  v_proposito_requerido    public.proposito_asignacion;
  v_origen                 RECORD;
  v_pendiente_reposicion   INT;
  v_fecha_min              DATE;
  v_consumos               JSONB := '[]'::JSONB;
  v_asig_record            RECORD;
  v_meta_record            RECORD;
BEGIN
  -- =====================================================================
  -- 1. Guards de parametros
  -- =====================================================================
  IF p_subcampania_id IS NULL THEN
    RAISE EXCEPTION 'subcampania_id es obligatorio.';
  END IF;

  IF p_fecha_plantacion IS NULL THEN
    RAISE EXCEPTION 'fecha_plantacion es obligatoria.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_latitud IS NULL OR p_longitud IS NULL THEN
    RAISE EXCEPTION 'latitud y longitud son obligatorias.';
  END IF;

  IF p_latitud < -90 OR p_latitud > 90 THEN
    RAISE EXCEPTION 'latitud fuera de rango (% debe estar entre -90 y 90).', p_latitud;
  END IF;

  IF p_longitud < -180 OR p_longitud > 180 THEN
    RAISE EXCEPTION 'longitud fuera de rango (% debe estar entre -180 y 180).', p_longitud;
  END IF;

  IF v_es_reposicion = TRUE AND p_registro_plantacion_origen_id IS NULL THEN
    RAISE EXCEPTION 'es_reposicion=TRUE requiere registro_plantacion_origen_id.';
  END IF;

  IF v_es_reposicion = FALSE AND p_registro_plantacion_origen_id IS NOT NULL THEN
    RAISE EXCEPTION
      'registro_plantacion_origen_id solo se permite cuando es_reposicion=TRUE.';
  END IF;

  IF p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array' THEN
    RAISE EXCEPTION 'p_detalles debe ser un JSONB array de detalles.';
  END IF;

  IF jsonb_array_length(p_detalles) = 0 THEN
    RAISE EXCEPTION 'p_detalles debe contener al menos un detalle.';
  END IF;

  -- Normalizar y deduplicar evidencias
  SELECT ARRAY_AGG(DISTINCT eid ORDER BY eid)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS eid
  WHERE eid IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'REGISTRO_PLANTACION requiere al menos una evidencia previamente subida.';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  v_observaciones := NULLIF(BTRIM(COALESCE(p_observaciones, '')), '');

  -- =====================================================================
  -- 2. Lock cooperativo por subcampania (protege la secuencia de codigo)
  -- =====================================================================
  PERFORM pg_advisory_xact_lock(
    hashtextextended('rp_seq:' || p_subcampania_id::TEXT, 0)
  );

  -- =====================================================================
  -- 3. Leer subcampania (locked) y validar estado segun tipo de registro
  --    Inicial: solo ACTIVA. Reposicion: ACTIVA | COMPLETADA | FINALIZADA_PARCIAL.
  -- =====================================================================
  SELECT
    s.id,
    s.estado,
    s.zona_id,
    s.campania_id,
    s.codigo_trazabilidad,
    s.nombre,
    s.tolerancia_gps_metros
  INTO v_subcampania
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La subcampania % no existe o esta eliminada.', p_subcampania_id;
  END IF;

  IF v_es_reposicion = FALSE
     AND v_subcampania.estado IS DISTINCT FROM 'ACTIVA' THEN
    RAISE EXCEPTION
      'La subcampania % no esta ACTIVA (estado actual: %). La plantacion inicial solo se permite en ACTIVA.',
      p_subcampania_id,
      v_subcampania.estado;
  END IF;

  IF v_es_reposicion = TRUE
     AND v_subcampania.estado::text NOT IN ('ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL') THEN
    RAISE EXCEPTION
      'La reposicion solo se permite con la subcampania en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: %).',
      v_subcampania.estado;
  END IF;

  SELECT da.nombre INTO v_zona_nombre
  FROM public.division_administrativa da
  WHERE da.id = v_subcampania.zona_id;

  -- =====================================================================
  -- 4. Validar GPS (no aborta si fuera de poligono — se guarda como flag)
  -- =====================================================================
  SELECT g.dentro, g.distancia_m
  INTO v_gps
  FROM public.gps_dentro_poligono_con_tolerancia(
    p_subcampania_id, p_latitud, p_longitud
  ) g;

  IF v_gps.dentro IS NULL THEN
    RAISE EXCEPTION
      'No se pudo evaluar el GPS contra el poligono de la subcampania (poligono NULL?).';
  END IF;

  -- =====================================================================
  -- 5. Validar responsable y resolver nombre snapshot
  -- =====================================================================
  IF NOT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = p_subcampania_id
      AND se.usuario_id = p_responsable_id
      AND se.rol IN ('COORDINADOR'::public.rol_en_subcampania,
                     'OPERARIO'::public.rol_en_subcampania)
  ) THEN
    RAISE EXCEPTION
      'El responsable % no pertenece al equipo (COORDINADOR|OPERARIO) de la subcampania %.',
      p_responsable_id,
      p_subcampania_id;
  END IF;

  SELECT u.nombre INTO v_responsable_nombre
  FROM public.usuario u
  WHERE u.id = p_responsable_id;

  IF v_responsable_nombre IS NULL THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- =====================================================================
  -- 6. Deduplicar y validar coresponsables
  -- =====================================================================
  SELECT ARRAY_AGG(DISTINCT cid ORDER BY cid)
  INTO v_coresponsable_ids
  FROM UNNEST(COALESCE(p_coresponsable_ids, ARRAY[]::BIGINT[])) AS cid
  WHERE cid IS NOT NULL
    AND cid <> p_responsable_id;

  v_coresponsable_ids := COALESCE(v_coresponsable_ids, ARRAY[]::BIGINT[]);

  IF CARDINALITY(v_coresponsable_ids) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM UNNEST(v_coresponsable_ids) AS cid
      LEFT JOIN public.subcampania_equipo se
        ON se.usuario_id = cid AND se.subcampania_id = p_subcampania_id
      WHERE se.id IS NULL
    ) THEN
      RAISE EXCEPTION
        'Alguno de los coresponsable_ids no pertenece al equipo de la subcampania %.',
        p_subcampania_id;
    END IF;
  END IF;

  -- =====================================================================
  -- 7. Validar evidencias (locked, no eliminadas, pendientes)
  -- =====================================================================
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- =====================================================================
  -- 8. Coherencia es_reposicion <-> grupo origen (locked)
  -- =====================================================================
  v_proposito_requerido := CASE
    WHEN v_es_reposicion THEN 'REPOSICION'::public.proposito_asignacion
    ELSE 'PLANTACION_INICIAL'::public.proposito_asignacion
  END;

  IF v_es_reposicion = TRUE THEN
    SELECT rp.id, rp.es_reposicion, rp.cantidad_muerta_acumulada, rp.cantidad_repuesta_acumulada
    INTO v_origen
    FROM public.registro_plantacion rp
    WHERE rp.id = p_registro_plantacion_origen_id
    FOR UPDATE;

    IF NOT FOUND OR v_origen.es_reposicion = TRUE THEN
      RAISE EXCEPTION
        'registro_plantacion_origen_id % no existe o ya es una reposicion (no se permite encadenar reposiciones).',
        p_registro_plantacion_origen_id;
    END IF;

    v_pendiente_reposicion :=
      COALESCE(v_origen.cantidad_muerta_acumulada, 0)
      - COALESCE(v_origen.cantidad_repuesta_acumulada, 0);
  END IF;

  -- =====================================================================
  -- 9. Expandir p_detalles a tabla temp y validar estructura
  -- =====================================================================
  CREATE TEMP TABLE _detalles ON COMMIT DROP AS
  SELECT
    (d->>'asignacion_id')::BIGINT  AS asignacion_id,
    (d->>'lote_vivero_id')::BIGINT AS lote_vivero_id,
    (d->>'planta_id')::BIGINT      AS planta_id,
    (d->>'cantidad')::INT          AS cantidad
  FROM jsonb_array_elements(p_detalles) AS d;

  IF EXISTS (
    SELECT 1 FROM _detalles
    WHERE asignacion_id IS NULL
       OR lote_vivero_id IS NULL
       OR planta_id IS NULL
       OR cantidad IS NULL
       OR cantidad <= 0
  ) THEN
    RAISE EXCEPTION
      'Cada detalle requiere asignacion_id, lote_vivero_id, planta_id y cantidad>0.';
  END IF;

  IF EXISTS (
    SELECT asignacion_id, planta_id
    FROM _detalles
    GROUP BY asignacion_id, planta_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Detalles duplicados: combinar la cantidad en una sola entrada por (asignacion_id, planta_id).';
  END IF;

  SELECT SUM(cantidad) INTO v_cantidad_total FROM _detalles;

  IF v_cantidad_total IS NULL OR v_cantidad_total <= 0 THEN
    RAISE EXCEPTION 'cantidad_total_plantada calculada debe ser > 0.';
  END IF;

  -- Tope de reposicion contra el pendiente del grupo origen (RN-PLA/contrato 6.2).
  IF v_es_reposicion = TRUE AND v_cantidad_total > v_pendiente_reposicion THEN
    RAISE EXCEPTION
      'La reposicion (%) excede el pendiente de reposicion del grupo origen % (muertas acumuladas % - repuestas acumuladas % = pendiente %).',
      v_cantidad_total,
      p_registro_plantacion_origen_id,
      COALESCE(v_origen.cantidad_muerta_acumulada, 0),
      COALESCE(v_origen.cantidad_repuesta_acumulada, 0),
      v_pendiente_reposicion;
  END IF;

  -- =====================================================================
  -- 10. Bloquear asignaciones (anti-deadlock por id asc) y validar
  --     Las asignaciones son la UNICA fuente de stock: el lote no participa.
  -- =====================================================================
  PERFORM 1
  FROM (
    SELECT DISTINCT asignacion_id FROM _detalles ORDER BY asignacion_id
  ) a
  JOIN public.asignacion_vivero_subcampania av ON av.id = a.asignacion_id
  FOR UPDATE OF av;

  CREATE TEMP TABLE _asig_pedido ON COMMIT DROP AS
  SELECT asignacion_id, SUM(cantidad)::INT AS cantidad_pedida
  FROM _detalles
  GROUP BY asignacion_id;

  IF EXISTS (
    SELECT 1
    FROM _asig_pedido ap
    LEFT JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id
    WHERE av.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Alguna asignacion_id referenciada no existe.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _asig_pedido ap
    JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id
    WHERE av.subcampania_id <> p_subcampania_id
  ) THEN
    RAISE EXCEPTION
      'Alguna asignacion no pertenece a la subcampania % indicada.', p_subcampania_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _asig_pedido ap
    JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id
    WHERE av.estado <> 'ACTIVA'::public.estado_asignacion_vivero
  ) THEN
    RAISE EXCEPTION
      'Alguna asignacion no esta ACTIVA. No se puede consumir de asignaciones agotadas o devueltas.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _asig_pedido ap
    JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id
    WHERE av.proposito <> v_proposito_requerido
  ) THEN
    RAISE EXCEPTION
      'Proposito incoherente: para es_reposicion=% se requiere asignaciones con proposito %.',
      v_es_reposicion, v_proposito_requerido;
  END IF;

  -- El lote del detalle debe coincidir con el lote de la asignacion.
  IF EXISTS (
    SELECT 1
    FROM _detalles d
    JOIN public.asignacion_vivero_subcampania av ON av.id = d.asignacion_id
    WHERE av.lote_vivero_id <> d.lote_vivero_id
  ) THEN
    RAISE EXCEPTION
      'El lote_vivero_id del detalle no coincide con el lote_vivero_id de la asignacion.';
  END IF;

  -- La planta del detalle debe coincidir con la planta del lote (consistencia
  -- de especie; lectura sin lock: el lote NO se modifica en este flujo).
  IF EXISTS (
    SELECT 1
    FROM _detalles d
    JOIN public.lote_vivero lv ON lv.id = d.lote_vivero_id
    WHERE lv.planta_id <> d.planta_id
  ) THEN
    RAISE EXCEPTION
      'El planta_id del detalle no coincide con planta_id del lote_vivero.';
  END IF;

  -- Saldo asignado disponible por asignacion: limite duro del contrato.
  IF EXISTS (
    SELECT 1
    FROM _asig_pedido ap
    JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id
    WHERE av.saldo_asignado_disponible < ap.cantidad_pedida
  ) THEN
    RAISE EXCEPTION
      'Saldo asignado insuficiente en alguna asignacion (pedido excede saldo_asignado_disponible).';
  END IF;

  -- =====================================================================
  -- 11. Meta por especie (solo plantacion inicial)
  --     La especie debe estar en SUBCAMPANIA_META_ESPECIE y el acumulado de
  --     plantaciones iniciales no puede exceder cantidad_objetivo.
  --     La reposicion NO avanza la meta y no se valida contra ella.
  -- =====================================================================
  IF v_es_reposicion = FALSE THEN
    FOR v_meta_record IN
      SELECT
        d.planta_id,
        SUM(d.cantidad)::INT AS cantidad_pedida,
        sme.cantidad_objetivo,
        COALESCE((
          SELECT SUM(rpd.cantidad)::INT
          FROM public.registro_plantacion_detalle rpd
          JOIN public.registro_plantacion rp ON rp.id = rpd.registro_plantacion_id
          WHERE rp.subcampania_id = p_subcampania_id
            AND rp.es_reposicion = FALSE
            AND rpd.planta_id = d.planta_id
        ), 0) AS acumulado_previo
      FROM _detalles d
      LEFT JOIN public.subcampania_meta_especie sme
        ON sme.subcampania_id = p_subcampania_id
       AND sme.planta_id = d.planta_id
      GROUP BY d.planta_id, sme.cantidad_objetivo
    LOOP
      IF v_meta_record.cantidad_objetivo IS NULL THEN
        RAISE EXCEPTION
          'La especie (planta_id %) no esta en el plan de especies de la subcampania % (SUBCAMPANIA_META_ESPECIE).',
          v_meta_record.planta_id,
          p_subcampania_id;
      END IF;

      IF v_meta_record.acumulado_previo + v_meta_record.cantidad_pedida
         > v_meta_record.cantidad_objetivo THEN
        RAISE EXCEPTION
          'La plantacion excede la meta de la especie (planta_id %): acumulado % + pedido % > objetivo %.',
          v_meta_record.planta_id,
          v_meta_record.acumulado_previo,
          v_meta_record.cantidad_pedida,
          v_meta_record.cantidad_objetivo;
      END IF;
    END LOOP;
  END IF;

  -- =====================================================================
  -- 12. Fecha operativa: cota minima = MAX(fecha_asignacion) de las
  --     asignaciones consumidas (no se puede plantar antes de recibir stock).
  -- =====================================================================
  SELECT MAX(av.fecha_asignacion)::DATE
  INTO v_fecha_min
  FROM _asig_pedido ap
  JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id;

  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_plantacion, v_fecha_min);

  -- =====================================================================
  -- 13. Generar codigo_trazabilidad del registro
  -- =====================================================================
  SELECT COUNT(*) + 1
  INTO v_seq_n
  FROM public.registro_plantacion
  WHERE subcampania_id = p_subcampania_id;

  v_codigo_trazabilidad :=
    'PLT-' || LPAD(v_seq_n::TEXT, 3, '0')
    || '-' || v_subcampania.codigo_trazabilidad;

  -- =====================================================================
  -- 14. Insertar REGISTRO_PLANTACION
  -- =====================================================================
  INSERT INTO public.registro_plantacion (
    subcampania_id,
    es_reposicion,
    registro_plantacion_origen_id,
    fecha_plantacion,
    responsable_id,
    latitud,
    longitud,
    gps_dentro_poligono,
    gps_distancia_a_poligono_m,
    cantidad_total_plantada,
    nombre_subcampania_snapshot,
    nombre_zona_snapshot,
    nombre_responsable_snapshot,
    observaciones,
    codigo_trazabilidad,
    created_by
  )
  VALUES (
    p_subcampania_id,
    v_es_reposicion,
    p_registro_plantacion_origen_id,
    p_fecha_plantacion,
    p_responsable_id,
    p_latitud,
    p_longitud,
    v_gps.dentro,
    v_gps.distancia_m,
    v_cantidad_total,
    v_subcampania.nombre,
    v_zona_nombre,
    v_responsable_nombre,
    v_observaciones,
    v_codigo_trazabilidad,
    p_responsable_id
  )
  RETURNING id INTO v_registro_id;

  -- =====================================================================
  -- 15. Insertar coresponsables (si hay)
  -- =====================================================================
  IF CARDINALITY(v_coresponsable_ids) > 0 THEN
    INSERT INTO public.registro_plantacion_coresponsable (
      registro_plantacion_id,
      usuario_id
    )
    SELECT v_registro_id, cid
    FROM UNNEST(v_coresponsable_ids) AS cid;
  END IF;

  -- =====================================================================
  -- 16. Insertar detalles. evento_lote_vivero_despacho_id = NULL SIEMPRE:
  --     plantar no genera eventos M2 (RN-VIV-52).
  -- =====================================================================
  INSERT INTO public.registro_plantacion_detalle (
    registro_plantacion_id,
    asignacion_id,
    lote_vivero_id,
    planta_id,
    cantidad,
    nombre_cientifico_snapshot,
    nombre_comercial_snapshot,
    variedad_snapshot,
    evento_lote_vivero_despacho_id
  )
  SELECT
    v_registro_id,
    d.asignacion_id,
    d.lote_vivero_id,
    d.planta_id,
    d.cantidad,
    lv.nombre_cientifico_snapshot,
    lv.nombre_comercial_snapshot,
    p.variedad,
    NULL
  FROM _detalles d
  JOIN public.lote_vivero lv ON lv.id = d.lote_vivero_id
  JOIN public.planta p ON p.id = d.planta_id;

  -- =====================================================================
  -- 17. Consumir asignaciones (trigger transiciona estado a AGOTADA si
  --     corresponde) y armar el resumen `consumos` de la respuesta.
  -- =====================================================================
  FOR v_asig_record IN
    SELECT
      ap.asignacion_id,
      ap.cantidad_pedida,
      av.lote_vivero_id,
      av.saldo_asignado_disponible AS saldo_antes
    FROM _asig_pedido ap
    JOIN public.asignacion_vivero_subcampania av ON av.id = ap.asignacion_id
    ORDER BY ap.asignacion_id
  LOOP
    UPDATE public.asignacion_vivero_subcampania av
    SET cantidad_consumida = av.cantidad_consumida + v_asig_record.cantidad_pedida
    WHERE av.id = v_asig_record.asignacion_id;

    v_consumos := v_consumos || jsonb_build_object(
      'asignacion_id', v_asig_record.asignacion_id,
      'lote_vivero_id', v_asig_record.lote_vivero_id,
      'cantidad_consumida', v_asig_record.cantidad_pedida,
      'saldo_asignado_antes', v_asig_record.saldo_antes,
      'saldo_asignado_despues', v_asig_record.saldo_antes - v_asig_record.cantidad_pedida,
      'estado_final', (
        SELECT av2.estado
        FROM public.asignacion_vivero_subcampania av2
        WHERE av2.id = v_asig_record.asignacion_id
      )
    );
  END LOOP;

  -- =====================================================================
  -- 18. Actualizar contadores del grupo origen y de la subcampania.
  --     La reposicion suma a total_repuesto y al grupo origen; NO avanza
  --     la meta (total_plantado_inicial).
  -- =====================================================================
  IF v_es_reposicion = TRUE THEN
    UPDATE public.registro_plantacion
    SET cantidad_repuesta_acumulada = cantidad_repuesta_acumulada + v_cantidad_total
    WHERE id = p_registro_plantacion_origen_id;

    UPDATE public.subcampania
    SET total_repuesto = total_repuesto + v_cantidad_total,
        updated_at     = NOW(),
        updated_by     = p_responsable_id
    WHERE id = p_subcampania_id;
  ELSE
    UPDATE public.subcampania
    SET total_plantado_inicial = total_plantado_inicial + v_cantidad_total,
        updated_at             = NOW(),
        updated_by             = p_responsable_id
    WHERE id = p_subcampania_id;
  END IF;

  -- =====================================================================
  -- 19. Vincular evidencias a la entidad REGISTRO_PLANTACION
  -- =====================================================================
  SELECT te.id
  INTO v_tipo_entidad_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'REGISTRO_PLANTACION'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_id IS NULL THEN
    RAISE EXCEPTION
      'No existe tipo_entidad_evidencia activo para REGISTRO_PLANTACION (aplica migracion 033).';
  END IF;

  UPDATE public.evidencias_trazabilidad
  SET tipo_entidad_id            = v_tipo_entidad_id,
      entidad_id                 = v_registro_id,
      codigo_trazabilidad        = v_codigo_trazabilidad,
      actualizado_en             = NOW(),
      actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- =====================================================================
  -- 20. Invariantes de cierre (RN-VIV-52 / RN-VIV-53)
  -- =====================================================================
  -- RN-VIV-53: conservacion detalle <-> total.
  IF (SELECT COALESCE(SUM(rpd.cantidad), 0)::INT
      FROM public.registro_plantacion_detalle rpd
      WHERE rpd.registro_plantacion_id = v_registro_id) <> v_cantidad_total THEN
    RAISE EXCEPTION
      'Invariante violada (RN-VIV-53): SUM(detalles) no coincide con cantidad_total_plantada=%.',
      v_cantidad_total;
  END IF;

  -- RN-VIV-52: plantar no genera eventos M2.
  IF EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero elv
    WHERE elv.registro_plantacion_id = v_registro_id
  ) THEN
    RAISE EXCEPTION
      'Invariante violada (RN-VIV-52): el registro de plantacion % genero eventos M2.',
      v_registro_id;
  END IF;

  -- =====================================================================
  -- 21. Retornar resultado
  -- =====================================================================
  registro_plantacion_id       := v_registro_id;
  codigo_trazabilidad          := v_codigo_trazabilidad;
  cantidad_total_plantada      := v_cantidad_total;
  gps_dentro_poligono          := v_gps.dentro;
  gps_distancia_a_poligono_m   := v_gps.distancia_m;
  consumos                     := v_consumos;
  coresponsable_ids_vinculados := v_coresponsable_ids;
  evidencia_ids_vinculadas     := v_evidencia_ids;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fn_m3_registrar_plantacion(
  BIGINT, BOOLEAN, BIGINT, DATE, BIGINT, NUMERIC, NUMERIC, TEXT, BIGINT[], JSONB, BIGINT[]
) IS
  'Registra plantacion inicial o reposicion consumiendo stock YA asignado fisicamente a la subcampania. No genera EVENTO_LOTE_VIVERO ni modifica LOTE_VIVERO.saldo_vivo_actual (RN-VIV-52/55). Valida proposito, saldo asignado, meta por especie (inicial) y pendiente de reposicion (reposicion). Actualiza contadores de subcampania y grupo origen.';

GRANT EXECUTE ON FUNCTION public.fn_m3_registrar_plantacion(
  BIGINT, BOOLEAN, BIGINT, DATE, BIGINT, NUMERIC, NUMERIC, TEXT, BIGINT[], JSONB, BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
