-- 034_m3_registrar_plantacion_rpc.sql
-- RPC fn_m3_registrar_plantacion: handler atomico de creacion de REGISTRO_PLANTACION
-- (tarea 03 del modulo de integracion M2 <-> M3).
--
-- En una sola transaccion:
--   1. Valida subcampania ACTIVA, GPS contra poligono (PostGIS, con tolerancia).
--   2. Valida responsable + corresponsables ∈ SUBCAMPANIA_EQUIPO.
--   3. Bloquea con FOR UPDATE las asignaciones y los lotes implicados (anti-deadlock).
--   4. Valida proposito coherente (PLANTACION_INICIAL si !es_reposicion, REPOSICION si lo es)
--      y saldo suficiente por asignacion y por lote.
--   5. Valida fechas (fn_vivero_assert_fecha_operativa) con cota minima = MAX(fecha_embolsado).
--   6. Inserta REGISTRO_PLANTACION + CORESPONSABLES + DETALLE (despacho_id = NULL).
--   7. Por cada lote afectado inserta evento_lote_vivero DESPACHO AUTOMATICO_PLANTACION,
--      actualiza saldo_vivo_actual y, si saldo=0, llama fn_vivero_cerrar_lote_si_corresponde.
--      Actualiza registro_plantacion_detalle.evento_lote_vivero_despacho_id con el id real.
--   8. Por cada asignacion, suma cantidad_consumida (el trigger transiciona estado).
--   9. Vincula evidencias previamente subidas (entidad_id=0) a entidad REGISTRO_PLANTACION.
--  10. Verifica invariante post-commit:
--      SUM(evento.cantidad_afectada del registro) = registro.cantidad_total_plantada.
--
-- Cualquier excepcion aborta la transaccion completa (Postgres lo garantiza por defecto).
--
-- Decisiones de diseno tomadas con el usuario (plan tarea 03):
--   - Reposicion cross-subcampania PERMITIDA. Solo se valida que el origen exista y NO
--     sea a su vez una reposicion (no encadenar).
--   - Actor = responsable (un solo id; el endpoint resuelve x-auth-id antes de llamar).
--   - destino_referencia del DESPACHO automatico = registro.codigo_trazabilidad.
--   - codigo_trazabilidad del registro = 'PLT-NNN-' || subcampania.codigo_trazabilidad.
--     Concurrencia: pg_advisory_xact_lock por subcampania durante la generacion.
--   - GPS fuera de poligono NO aborta — se guarda gps_dentro_poligono=FALSE como flag.

DO $$
BEGIN
  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta antes la migracion 029.';
  END IF;

  IF to_regclass('public.registro_plantacion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.registro_plantacion. Ejecuta antes la migracion 030.';
  END IF;

  IF to_regclass('public.asignacion_vivero_subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.asignacion_vivero_subcampania. Ejecuta antes la migracion 024.';
  END IF;

  IF to_regclass('public.evento_lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evento_lote_vivero. Ejecuta antes la migracion 007.';
  END IF;

  IF to_regprocedure('public.gps_dentro_poligono_con_tolerancia(bigint,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.gps_dentro_poligono_con_tolerancia. Ejecuta antes la migracion 032.';
  END IF;

  IF to_regprocedure('public.fn_vivero_assert_fecha_operativa(date,date)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.fn_vivero_assert_fecha_operativa. Ejecuta antes la migracion 010.';
  END IF;

  IF to_regprocedure('public.fn_vivero_cerrar_lote_si_corresponde(bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.fn_vivero_cerrar_lote_si_corresponde. Ejecuta antes la migracion 010.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tipos_entidad_evidencia
    WHERE UPPER(codigo) = 'REGISTRO_PLANTACION'
  ) THEN
    RAISE EXCEPTION
      'No existe tipo_entidad REGISTRO_PLANTACION sembrado. Ejecuta antes la migracion 033.';
  END IF;
END;
$$;

-- Borrar cualquier firma previa por si hubo intentos anteriores
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
  despachos                     JSONB,
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
  v_lote_record            RECORD;
  v_evento_id              BIGINT;
  v_saldo_antes            INT;
  v_saldo_despues          INT;
  v_lote_finalizado        BOOLEAN;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_fecha_min              DATE;
  v_despachos              JSONB := '[]'::JSONB;
  v_invariante_sum         INT;
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
  -- 3. Leer subcampania (locked) y validar estado ACTIVA
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

  IF v_subcampania.estado IS DISTINCT FROM 'ACTIVA' THEN
    RAISE EXCEPTION
      'La subcampania % no esta ACTIVA (estado actual: %). No se permite registrar plantacion.',
      p_subcampania_id,
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
    -- La subcampania activada deberia tener poligono (CHECK), pero por defensa:
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
  -- 8. Validar coherencia es_reposicion <-> origen
  -- =====================================================================
  IF v_es_reposicion = TRUE THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.registro_plantacion rp
      WHERE rp.id = p_registro_plantacion_origen_id
        AND rp.es_reposicion = FALSE
    ) THEN
      RAISE EXCEPTION
        'registro_plantacion_origen_id % no existe o ya es una reposicion (no se permite encadenar reposiciones).',
        p_registro_plantacion_origen_id;
    END IF;
  END IF;

  v_proposito_requerido := CASE
    WHEN v_es_reposicion THEN 'REPOSICION'::public.proposito_asignacion
    ELSE 'PLANTACION_INICIAL'::public.proposito_asignacion
  END;

  -- =====================================================================
  -- 9. Expandir p_detalles a tabla temp y validar
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

  -- Detectar duplicados logicos (misma asignacion + misma planta)
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

  -- =====================================================================
  -- 10. Bloquear asignaciones (anti-deadlock por id asc) y validar
  -- =====================================================================
  PERFORM 1
  FROM (
    SELECT DISTINCT asignacion_id FROM _detalles ORDER BY asignacion_id
  ) a
  JOIN public.asignacion_vivero_subcampania av ON av.id = a.asignacion_id
  FOR UPDATE OF av;

  -- Acumular cantidad pedida por asignacion
  CREATE TEMP TABLE _asig_pedido ON COMMIT DROP AS
  SELECT asignacion_id, SUM(cantidad)::INT AS cantidad_pedida
  FROM _detalles
  GROUP BY asignacion_id;

  -- Validar cada asignacion
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

  -- Validar que lote_vivero_id del detalle coincide con el de la asignacion
  IF EXISTS (
    SELECT 1
    FROM _detalles d
    JOIN public.asignacion_vivero_subcampania av ON av.id = d.asignacion_id
    WHERE av.lote_vivero_id <> d.lote_vivero_id
  ) THEN
    RAISE EXCEPTION
      'El lote_vivero_id del detalle no coincide con el lote_vivero_id de la asignacion.';
  END IF;

  -- Validar saldo disponible por asignacion
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
  -- 11. Bloquear lotes implicados (anti-deadlock por id asc) y validar
  -- =====================================================================
  PERFORM 1
  FROM (
    SELECT DISTINCT lote_vivero_id FROM _detalles ORDER BY lote_vivero_id
  ) l
  JOIN public.lote_vivero lv ON lv.id = l.lote_vivero_id
  FOR UPDATE OF lv;

  CREATE TEMP TABLE _lote_pedido ON COMMIT DROP AS
  SELECT lote_vivero_id, SUM(cantidad)::INT AS cantidad_pedida
  FROM _detalles
  GROUP BY lote_vivero_id;

  IF EXISTS (
    SELECT 1
    FROM _lote_pedido lp
    LEFT JOIN public.lote_vivero lv ON lv.id = lp.lote_vivero_id
    WHERE lv.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Algun lote_vivero_id referenciado no existe.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _lote_pedido lp
    JOIN public.lote_vivero lv ON lv.id = lp.lote_vivero_id
    WHERE lv.estado_lote IS DISTINCT FROM 'ACTIVO'
  ) THEN
    RAISE EXCEPTION
      'Algun lote no esta ACTIVO; no se puede generar DESPACHO automatico.';
  END IF;

  -- planta_id del detalle debe coincidir con la planta del lote
  IF EXISTS (
    SELECT 1
    FROM _detalles d
    JOIN public.lote_vivero lv ON lv.id = d.lote_vivero_id
    WHERE lv.planta_id <> d.planta_id
  ) THEN
    RAISE EXCEPTION
      'El planta_id del detalle no coincide con planta_id del lote_vivero.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM _lote_pedido lp
    JOIN public.lote_vivero lv ON lv.id = lp.lote_vivero_id
    WHERE lv.saldo_vivo_actual IS NULL
       OR lv.saldo_vivo_actual < lp.cantidad_pedida
  ) THEN
    RAISE EXCEPTION
      'Saldo vivo insuficiente o no materializado en algun lote (verifica EMBOLSADO previo).';
  END IF;

  -- =====================================================================
  -- 12. Validar fecha contra MAX(fecha_embolsado) de los lotes afectados
  -- =====================================================================
  SELECT MAX(elv.fecha_evento)
  INTO v_fecha_min
  FROM public.evento_lote_vivero elv
  JOIN _lote_pedido lp ON lp.lote_vivero_id = elv.lote_id
  WHERE elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_min IS NULL THEN
    RAISE EXCEPTION
      'Alguno de los lotes afectados no tiene EMBOLSADO previo. DESPACHO automatico requiere EMBOLSADO previo.';
  END IF;

  -- Asegurar que TODOS los lotes tienen EMBOLSADO previo
  IF (
    SELECT COUNT(DISTINCT lote_id)
    FROM public.evento_lote_vivero elv
    JOIN _lote_pedido lp ON lp.lote_vivero_id = elv.lote_id
    WHERE elv.tipo_evento = 'EMBOLSADO'
  ) <> (SELECT COUNT(*) FROM _lote_pedido) THEN
    RAISE EXCEPTION
      'Alguno de los lotes afectados no tiene EMBOLSADO previo.';
  END IF;

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
  -- 16. Insertar detalles con evento_lote_vivero_despacho_id = NULL
  --     y snapshots de planta tomadas del lote (lote ya guarda snapshots)
  --     mas la variedad de planta.
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
  -- 17. Por cada lote distinto: insertar DESPACHO AUTOMATICO, ajustar saldos
  -- =====================================================================
  FOR v_lote_record IN
    SELECT lp.lote_vivero_id, lp.cantidad_pedida, lv.saldo_vivo_actual, lv.codigo_trazabilidad AS codigo_lote
    FROM _lote_pedido lp
    JOIN public.lote_vivero lv ON lv.id = lp.lote_vivero_id
    ORDER BY lp.lote_vivero_id
  LOOP
    v_saldo_antes   := v_lote_record.saldo_vivo_actual;
    v_saldo_despues := v_saldo_antes - v_lote_record.cantidad_pedida;

    INSERT INTO public.evento_lote_vivero (
      lote_id,
      tipo_evento,
      fecha_evento,
      responsable_id,
      cantidad_afectada,
      unidad_medida_evento,
      destino_tipo,
      destino_referencia,
      comunidad_destino_id,
      origen_despacho,
      subcampania_id,
      campania_id,
      registro_plantacion_id,
      saldo_vivo_antes,
      saldo_vivo_despues,
      observaciones
    )
    VALUES (
      v_lote_record.lote_vivero_id,
      'DESPACHO',
      p_fecha_plantacion,
      p_responsable_id,
      v_lote_record.cantidad_pedida,
      'UNIDAD',
      'PLANTACION_CAMPANIA'::public.destino_tipo_vivero,
      v_codigo_trazabilidad,
      v_subcampania.zona_id,
      'AUTOMATICO_PLANTACION'::public.origen_despacho_vivero,
      p_subcampania_id,
      v_subcampania.campania_id,
      v_registro_id,
      v_saldo_antes,
      v_saldo_despues,
      NULL
    )
    RETURNING id INTO v_evento_id;

    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        updated_at        = NOW()
    WHERE id = v_lote_record.lote_vivero_id;

    UPDATE public.registro_plantacion_detalle
    SET evento_lote_vivero_despacho_id = v_evento_id
    WHERE registro_plantacion_id = v_registro_id
      AND lote_vivero_id = v_lote_record.lote_vivero_id;

    v_lote_finalizado := FALSE;
    v_motivo_cierre := NULL;

    IF v_saldo_despues = 0 THEN
      PERFORM public.fn_vivero_cerrar_lote_si_corresponde(
        v_lote_record.lote_vivero_id, v_evento_id
      );

      SELECT lv.motivo_cierre
      INTO v_motivo_cierre
      FROM public.lote_vivero lv
      WHERE lv.id = v_lote_record.lote_vivero_id;

      v_lote_finalizado := TRUE;
    END IF;

    v_despachos := v_despachos || jsonb_build_object(
      'evento_id', v_evento_id,
      'lote_vivero_id', v_lote_record.lote_vivero_id,
      'codigo_trazabilidad_lote', v_lote_record.codigo_lote,
      'cantidad_afectada', v_lote_record.cantidad_pedida,
      'saldo_vivo_antes', v_saldo_antes,
      'saldo_vivo_despues', v_saldo_despues,
      'lote_finalizado', v_lote_finalizado,
      'motivo_cierre', v_motivo_cierre
    );
  END LOOP;

  -- =====================================================================
  -- 18. Sumar cantidad_consumida por asignacion (trigger transiciona estado)
  -- =====================================================================
  UPDATE public.asignacion_vivero_subcampania av
  SET cantidad_consumida = av.cantidad_consumida + ap.cantidad_pedida
  FROM _asig_pedido ap
  WHERE av.id = ap.asignacion_id;

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
  -- 20. Invariante post-commit
  -- =====================================================================
  SELECT COALESCE(SUM(cantidad_afectada), 0)::INT
  INTO v_invariante_sum
  FROM public.evento_lote_vivero
  WHERE registro_plantacion_id = v_registro_id
    AND origen_despacho = 'AUTOMATICO_PLANTACION'::public.origen_despacho_vivero;

  IF v_invariante_sum <> v_cantidad_total THEN
    RAISE EXCEPTION
      'Invariante violada: SUM(despachos)=% no coincide con cantidad_total_plantada=%.',
      v_invariante_sum, v_cantidad_total;
  END IF;

  -- =====================================================================
  -- 21. Retornar resultado
  -- =====================================================================
  registro_plantacion_id       := v_registro_id;
  codigo_trazabilidad          := v_codigo_trazabilidad;
  cantidad_total_plantada      := v_cantidad_total;
  gps_dentro_poligono          := v_gps.dentro;
  gps_distancia_a_poligono_m   := v_gps.distancia_m;
  despachos                    := v_despachos;
  coresponsable_ids_vinculados := v_coresponsable_ids;
  evidencia_ids_vinculadas     := v_evidencia_ids;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_m3_registrar_plantacion(
  BIGINT, BOOLEAN, BIGINT, DATE, BIGINT, NUMERIC, NUMERIC, TEXT, BIGINT[], JSONB, BIGINT[]
) TO service_role;

NOTIFY pgrst, 'reload schema';
