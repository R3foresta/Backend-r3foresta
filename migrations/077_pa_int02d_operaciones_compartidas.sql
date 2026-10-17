-- PA-T-INT02-D. Instalar durante pausa/drenaje de inicial, tras catálogo 074–076 cotejado.
-- Migración aditiva; no modifica hechos/roles/equipo ni ejecuta transición real.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.pa_d_cuenta(p_id BIGINT) RETURNS TEXT
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE u public.usuario%ROWTYPE;
BEGIN
 SELECT * INTO u FROM public.usuario WHERE id=p_id FOR SHARE;
 IF NOT FOUND OR NOT u.activo THEN RAISE EXCEPTION 'CUENTA_NO_DISPONIBLE' USING ERRCODE='PT403'; END IF;
 RETURN upper(u.rol::text);
END $$;


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
SECURITY INVOKER
SET search_path=public,pg_temp
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
  v_rol TEXT;
BEGIN
  IF p_es_reposicion IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CLIENTE_INCOMPATIBLE: la inicial requiere /api/v1/plantaciones/iniciales y comando durable.' USING ERRCODE='PT409';
  END IF;
  -- Cuentas completas antes del ámbito; no adquirir nuevas cuentas después.
  PERFORM 1 FROM public.usuario WHERE id=ANY(array_append(coalesce(p_coresponsable_ids,ARRAY[]::bigint[]),p_responsable_id)) ORDER BY id FOR SHARE;
  v_rol:=public.pa_d_cuenta(p_responsable_id);
  IF v_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RAISE EXCEPTION 'AUTORIDAD_INTERNA_REQUERIDA' USING ERRCODE='PT403'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(coalesce(p_coresponsable_ids,ARRAY[]::bigint[])) x(id) LEFT JOIN public.usuario u ON u.id=x.id WHERE u.id IS NULL OR NOT u.activo) THEN
    RAISE EXCEPTION 'PARTICIPANTE_INTERNO_NO_DISPONIBLE' USING ERRCODE='PT403';
  END IF;
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
  PERFORM pg_advisory_xact_lock(
    hashtextextended('rp_seq:' || p_subcampania_id::TEXT, 0)
  );


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
  -- =====================================================================
  -- 8. Coherencia es_reposicion <-> grupo origen (locked)
  -- =====================================================================
  v_proposito_requerido := CASE
    WHEN v_es_reposicion THEN 'REPOSICION'::public.proposito_asignacion
    ELSE 'PLANTACION_INICIAL'::public.proposito_asignacion
  END;

  IF v_es_reposicion = TRUE THEN
    SELECT rp.id, rp.subcampania_id, rp.es_reposicion, rp.cantidad_muerta_acumulada, rp.cantidad_repuesta_acumulada
    INTO v_origen
    FROM public.registro_plantacion rp
    WHERE rp.id = p_registro_plantacion_origen_id
    FOR UPDATE;

    IF NOT FOUND OR v_origen.es_reposicion = TRUE OR v_origen.subcampania_id IS DISTINCT FROM p_subcampania_id THEN
      RAISE EXCEPTION
        'registro_plantacion_origen_id % no es un origen inicial del ámbito autorizado.',
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
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id IN (SELECT asignacion_id FROM _detalles)
  ORDER BY av.id FOR UPDATE OF av;

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
  -- 11. Especies del plan (solo plantacion inicial).
  --     cantidad_objetivo es una meta de planificacion, no un tope de consumo.
  --     El limite duro es el saldo asignado disponible (seccion 10).
  --     La reposicion NO avanza la meta y no se valida contra ella.
  -- =====================================================================
  IF v_es_reposicion = FALSE THEN
    FOR v_meta_record IN
      SELECT
        d.planta_id,
        SUM(d.cantidad)::INT AS cantidad_pedida,
        sme.cantidad_objetivo
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

  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id, ev.tipo_entidad_id, ev.creado_por_usuario_id, ev.bucket, ev.metadata
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0)
    AND ev.creado_por_usuario_id=p_responsable_id
    AND ev.tipo_entidad_id=(SELECT id FROM public.tipos_entidad_evidencia WHERE codigo='REGISTRO_PLANTACION' AND activo)
    AND ev.bucket='participacion_evidencias'
    AND ev.metadata->>'subcampania_id'=p_subcampania_id::text
    AND ev.metadata->>'proposito'='REPOSICION';

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

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

CREATE OR REPLACE FUNCTION public.fn_vivero_asignar_stock_subcampania(
  p_lote_vivero_id        BIGINT,
  p_subcampania_id        BIGINT,
  p_cantidad_asignada     INT,
  p_proposito             public.proposito_asignacion,
  p_usuario_asignacion_id BIGINT,
  p_fecha_asignacion      DATE,
  p_evidencia_ids         BIGINT[],
  p_observaciones         TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad_lote  TEXT,
  subcampania_id            BIGINT,
  campania_id               BIGINT,
  proposito                 public.proposito_asignacion,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_asignada         INT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_lote                   RECORD;
  v_subcampania            RECORD;
  v_usuario_rol            TEXT;
  v_es_coordinador         BOOLEAN;
  v_fecha_embolsado        DATE;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_tipo_entidad_evento_id BIGINT;
  v_asignacion_id          BIGINT;
  v_evento_id              BIGINT;
  v_evento_plantacion_id   BIGINT;
  v_saldo_antes            INT;
  v_saldo_despues          INT;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_destino_referencia     TEXT;
  v_observaciones          TEXT;
  v_campania_id            BIGINT;
BEGIN
  v_usuario_rol:=public.pa_d_cuenta(p_usuario_asignacion_id);
  IF v_usuario_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RAISE EXCEPTION 'AUTORIDAD_INTERNA_REQUERIDA' USING ERRCODE='PT403'; END IF;
  -- -----------------------------------------------------------------
  -- 1. Guards de parametros
  -- -----------------------------------------------------------------
  IF p_lote_vivero_id IS NULL THEN
    RAISE EXCEPTION 'lote_vivero_id es obligatorio.';
  END IF;

  IF p_subcampania_id IS NULL THEN
    RAISE EXCEPTION 'subcampania_id es obligatorio.';
  END IF;

  IF p_cantidad_asignada IS NULL OR p_cantidad_asignada <= 0 THEN
    RAISE EXCEPTION 'cantidad_asignada debe ser un entero mayor a 0.';
  END IF;

  IF p_proposito IS NULL THEN
    RAISE EXCEPTION 'proposito es obligatorio (PLANTACION_INICIAL | REPOSICION).';
  END IF;

  IF p_usuario_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_asignacion_id es obligatorio.';
  END IF;

  IF p_fecha_asignacion IS NULL THEN
    RAISE EXCEPTION 'fecha_asignacion es obligatoria.';
  END IF;

  v_observaciones := NULLIF(BTRIM(COALESCE(p_observaciones, '')), '');

  -- Evidencia de entrega obligatoria (RN-VIV-54).
  SELECT ARRAY_AGG(DISTINCT eid ORDER BY eid)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS eid
  WHERE eid IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'La asignacion fisica requiere al menos una evidencia de entrega/salida (RN-VIV-54).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------
  -- 2. Campaña antes de subcampaña. La FK de evento_lote_vivero toma
  -- KEY SHARE sobre campaña al insertar; tomarlo tarde invertiría el orden
  -- frente a desactivación masiva (campaña UPDATE -> subcampañas UPDATE).
  -- Cuenta -> campaña -> subcampaña -> asignaciones -> lote -> evidencias.
  -- -----------------------------------------------------------------
  SELECT s.campania_id INTO v_campania_id FROM public.subcampania s
  WHERE s.id=p_subcampania_id AND s.deleted_at IS NULL;
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  SELECT s.id, s.estado, s.zona_id, s.campania_id, s.codigo_trazabilidad
  INTO v_subcampania
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada o eliminada.', p_subcampania_id;
  END IF;
  IF v_subcampania.campania_id IS DISTINCT FROM v_campania_id THEN
    RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409';
  END IF;

  IF v_subcampania.estado IN ('BORRADOR', 'CANCELADA') THEN
    RAISE EXCEPTION
      'No se puede asignar a una subcampania en estado %.',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'PLANTACION_INICIAL' AND v_subcampania.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION
      'PLANTACION_INICIAL solo se permite con la subcampania ACTIVA (estado actual: %).',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'REPOSICION'
     AND v_subcampania.estado NOT IN ('ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL') THEN
    RAISE EXCEPTION
      'REPOSICION solo se permite con la subcampania en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: %).',
      v_subcampania.estado;
  END IF;

  -- -----------------------------------------------------------------
  -- 3. Leer y bloquear el lote (el lock serializa asignaciones concurrentes)
  -- -----------------------------------------------------------------
  PERFORM 1 FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id=p_subcampania_id AND av.lote_vivero_id=p_lote_vivero_id
    ORDER BY av.id FOR UPDATE;
  SELECT
    lv.id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.planta_id,
    lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', p_lote_vivero_id;
  END IF;

  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'No se puede asignar desde un lote en estado %. Solo lotes ACTIVOS (RN-VIV-61).',
      v_lote.estado_lote;
  END IF;

  -- EMBOLSADO previo obligatorio (RN-VIV-61).
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_vivero_id
    AND elv.tipo_evento = 'EMBOLSADO';

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene EMBOLSADO registrado. Antes de EMBOLSADO solo existe material en proceso, no plantas entregables (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  IF v_lote.saldo_vivo_actual IS NULL OR v_lote.saldo_vivo_actual <= 0 THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo fisico disponible (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  -- Validacion FISICA: contra el saldo del lote, sin restar asignaciones
  -- previas (ya descontaron el saldo al entregarse — RN-VIV-47/57).
  IF p_cantidad_asignada > v_lote.saldo_vivo_actual THEN
    RAISE EXCEPTION
      'La cantidad a asignar (%) excede el saldo vivo fisico del lote % (%).',
      p_cantidad_asignada,
      p_lote_vivero_id,
      v_lote.saldo_vivo_actual;
  END IF;

  -- Fecha operativa coherente con la vida del lote.
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_asignacion, v_fecha_embolsado);

  -- -----------------------------------------------------------------
  -- 4. Permisos: ADMIN global o COORDINADOR de la subcampania
  -- -----------------------------------------------------------------
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_asignacion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_asignacion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = p_subcampania_id
      AND se.usuario_id = p_usuario_asignacion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR de la subcampania pueden registrar la asignacion fisica.';
  END IF;

  -- Guard de plan antes de cualquier entrega fisica. La subcampania ya
  -- esta bloqueada: usa el mismo plan y especie que validara la plantacion
  -- inicial (053). REPOSICION conserva su contrato de grupo origen.
  IF p_proposito = 'PLANTACION_INICIAL' AND NOT EXISTS (
    SELECT 1
    FROM public.subcampania_meta_especie sme
    WHERE sme.subcampania_id = p_subcampania_id
      AND sme.planta_id = v_lote.planta_id
  ) THEN
    RAISE EXCEPTION
      'La especie del lote (planta_id %) no esta en el plan de especies de la subcampania %. No se puede asignar para PLANTACION_INICIAL.',
      v_lote.planta_id,
      p_subcampania_id;
  END IF;

  -- -----------------------------------------------------------------
  -- 5. Validar evidencias (existen, no eliminadas, pendientes)
  -- -----------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id, ev.creado_por_usuario_id, ev.tipo_entidad_id, ev.bucket
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0)
    AND ev.creado_por_usuario_id=p_usuario_asignacion_id
    AND ev.tipo_entidad_id=v_tipo_entidad_evento_id
    AND ev.bucket<>'participacion_evidencias';

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de la asignacion deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------
  -- 6. Efectos atomicos
  -- -----------------------------------------------------------------
  v_saldo_antes   := v_lote.saldo_vivo_actual;
  v_saldo_despues := v_saldo_antes - p_cantidad_asignada;

  -- 6.1 Asignacion (entrega fisica).
  INSERT INTO public.asignacion_vivero_subcampania (
    lote_vivero_id,
    subcampania_id,
    cantidad_asignada,
    proposito,
    usuario_asignacion_id,
    fecha_asignacion,
    fecha_entrega_operativa
  )
  VALUES (
    p_lote_vivero_id,
    p_subcampania_id,
    p_cantidad_asignada,
    p_proposito,
    p_usuario_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_fecha_asignacion
  )
  RETURNING id INTO v_asignacion_id;

  v_destino_referencia :=
    'ASG-' || v_asignacion_id::TEXT || '-' || v_subcampania.codigo_trazabilidad;

  -- 6.2 Evento M2 de salida fisica por asignacion (RN-VIV-47/54).
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
    asignacion_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_vivero_id,
    'DESPACHO',
    p_fecha_asignacion,
    p_usuario_asignacion_id,
    p_cantidad_asignada,
    'UNIDAD',
    'PLANTACION_CAMPANIA'::public.destino_tipo_vivero,
    v_destino_referencia,
    v_subcampania.zona_id,
    'ASIGNACION_SUBCAMPANIA'::public.origen_despacho_vivero,
    p_subcampania_id,
    v_subcampania.campania_id,
    NULL,
    v_asignacion_id,
    v_saldo_antes,
    v_saldo_despues,
    v_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- 6.3 Descuento fisico del saldo del lote.
  UPDATE public.lote_vivero
  SET saldo_vivo_actual = v_saldo_despues,
      updated_at        = NOW()
  WHERE id = p_lote_vivero_id;

  -- 6.4 Vincular evidencias al evento M2.
  UPDATE public.evidencias_trazabilidad
  SET tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = NOW(),
      actualizado_por_usuario_id = p_usuario_asignacion_id
  WHERE id = ANY(v_evidencia_ids);

  -- 6.5 Evento M3 para la linea de tiempo de la subcampania.
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_asignada_evento,
    created_by
  )
  VALUES (
    'ASIGNACION_VIVERO'::public.tipo_evento_plantacion,
    p_subcampania_id,
    v_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_usuario_asignacion_id,
    v_observaciones,
    p_cantidad_asignada,
    p_usuario_asignacion_id
  )
  RETURNING id INTO v_evento_plantacion_id;

  -- 6.6 Cierre automatico si el saldo fisico llego a 0.
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_vivero_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_vivero_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------
  -- 7. Resultado
  -- -----------------------------------------------------------------
  asignacion_id            := v_asignacion_id;
  evento_lote_vivero_id    := v_evento_id;
  evento_plantacion_id     := v_evento_plantacion_id;
  lote_vivero_id           := p_lote_vivero_id;
  codigo_trazabilidad_lote := v_lote.codigo_trazabilidad;
  subcampania_id           := p_subcampania_id;
  campania_id              := v_subcampania.campania_id;
  proposito                := p_proposito;
  estado_asignacion        := 'ACTIVA'::public.estado_asignacion_vivero;
  cantidad_asignada        := p_cantidad_asignada;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_m3_devolver_asignacion_vivero(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_devuelta_delta   INT,
  cantidad_devuelta_total   INT,
  saldo_asignado_disponible INT,
  lote_vivero_id            BIGINT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  lote_reabierto            BOOLEAN,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_asignacion    RECORD;
  v_usuario_rol   TEXT;
  v_es_coordinador BOOLEAN;
  v_resultado     RECORD;
  v_final         RECORD;
  v_sub_id BIGINT;
  v_campania_id BIGINT;
  v_campania_actual BIGINT;
BEGIN
  v_usuario_rol:=public.pa_d_cuenta(p_usuario_devolucion_id);
  IF v_usuario_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RAISE EXCEPTION 'AUTORIDAD_INTERNA_REQUERIDA' USING ERRCODE='PT403'; END IF;
  SELECT av.subcampania_id,s.campania_id INTO v_sub_id,v_campania_id
  FROM public.asignacion_vivero_subcampania av JOIN public.subcampania s ON s.id=av.subcampania_id
  WHERE av.id=p_asignacion_id;
  IF v_sub_id IS NULL THEN RAISE EXCEPTION 'Asignacion no encontrada.' USING ERRCODE='PT404'; END IF;
  -- También la devolución inserta un evento con FK hacia campaña.
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  SELECT s.campania_id INTO v_campania_actual FROM public.subcampania s WHERE s.id=v_sub_id FOR UPDATE;
  IF v_campania_actual IS DISTINCT FROM v_campania_id THEN RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409'; END IF;
  IF p_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'asignacion_id es obligatorio.';
  END IF;

  IF p_motivo_devolucion IS NULL THEN
    RAISE EXCEPTION 'motivo_devolucion es obligatorio.';
  END IF;

  IF p_usuario_devolucion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_devolucion_id es obligatorio.';
  END IF;

  IF p_fecha_devolucion IS NULL THEN
    RAISE EXCEPTION 'fecha_devolucion es obligatoria.';
  END IF;

  -- Asignación después de cuenta, campaña y subcampaña.
  SELECT av.id, av.subcampania_id, av.fecha_asignacion
  INTO v_asignacion
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignacion % no encontrada.', p_asignacion_id;
  END IF;
  IF v_asignacion.subcampania_id IS DISTINCT FROM v_sub_id THEN RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409'; END IF;

  -- Fecha coherente: no antes de la entrega, no futura, max 10 dias atras.
  PERFORM public.fn_vivero_assert_fecha_operativa(
    p_fecha_devolucion, v_asignacion.fecha_asignacion::DATE
  );

  -- Permisos: ADMIN global o COORDINADOR de la subcampania.
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_devolucion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_devolucion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = v_asignacion.subcampania_id
      AND se.usuario_id = p_usuario_devolucion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR de la subcampania pueden registrar la devolucion fisica.';
  END IF;

  -- Aplicar la devolucion (valida cantidad y estado, mueve saldos, eventos).
  SELECT *
  INTO v_resultado
  FROM public.fn_m2_m3_aplicar_devolucion_fisica(
    p_asignacion_id,
    p_cantidad_devuelta,
    p_motivo_devolucion,
    p_usuario_devolucion_id,
    p_fecha_devolucion,
    p_observaciones
  );

  SELECT av.estado, av.cantidad_devuelta, av.saldo_asignado_disponible
  INTO v_final
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id;

  asignacion_id             := p_asignacion_id;
  estado_asignacion         := v_final.estado;
  cantidad_devuelta_delta   := p_cantidad_devuelta;
  cantidad_devuelta_total   := v_final.cantidad_devuelta;
  saldo_asignado_disponible := v_final.saldo_asignado_disponible;
  lote_vivero_id            := v_resultado.lote_vivero_id;
  saldo_vivo_antes          := v_resultado.saldo_vivo_antes;
  saldo_vivo_despues        := v_resultado.saldo_vivo_despues;
  lote_reabierto            := v_resultado.lote_reabierto;
  evento_lote_vivero_id     := v_resultado.evento_lote_vivero_id;
  evento_plantacion_id      := v_resultado.evento_plantacion_id;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_m2_m3_aplicar_devolucion_fisica(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT
)
RETURNS TABLE (
  evento_lote_vivero_id BIGINT,
  evento_plantacion_id  BIGINT,
  lote_vivero_id        BIGINT,
  saldo_vivo_antes      INT,
  saldo_vivo_despues    INT,
  lote_reabierto        BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_asignacion       RECORD;
  v_lote             RECORD;
  v_saldo_antes      INT;
  v_saldo_despues    INT;
  v_lote_reabierto   BOOLEAN := FALSE;
  v_evento_m2_id     BIGINT;
  v_evento_m3_id     BIGINT;
  v_campania_id      BIGINT;
BEGIN
  -- La asignacion debe venir bloqueada por el caller; se relee por seguridad.
  SELECT av.id, av.lote_vivero_id, av.subcampania_id, av.estado,
         av.saldo_asignado_disponible
  INTO v_asignacion
  FROM public.asignacion_vivero_subcampania av
  WHERE av.id = p_asignacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignacion % no encontrada.', p_asignacion_id;
  END IF;

  IF p_cantidad_devuelta IS NULL OR p_cantidad_devuelta <= 0 THEN
    RAISE EXCEPTION 'cantidad_devuelta debe ser un entero mayor a 0.';
  END IF;

  IF v_asignacion.estado = 'DEVUELTA'::public.estado_asignacion_vivero THEN
    RAISE EXCEPTION 'La asignacion % ya esta DEVUELTA.', p_asignacion_id;
  END IF;

  IF p_cantidad_devuelta > COALESCE(v_asignacion.saldo_asignado_disponible, 0) THEN
    RAISE EXCEPTION
      'La devolucion (%) excede el saldo asignado disponible (%) de la asignacion %.',
      p_cantidad_devuelta,
      COALESCE(v_asignacion.saldo_asignado_disponible, 0),
      p_asignacion_id;
  END IF;

  -- Lock del lote (despues de la asignacion: orden estable anti-deadlock).
  SELECT lv.id, lv.codigo_trazabilidad, lv.estado_lote, lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = v_asignacion.lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', v_asignacion.lote_vivero_id;
  END IF;

  v_saldo_antes   := COALESCE(v_lote.saldo_vivo_actual, 0);
  v_saldo_despues := v_saldo_antes + p_cantidad_devuelta;

  SELECT s.campania_id INTO v_campania_id
  FROM public.subcampania s
  WHERE s.id = v_asignacion.subcampania_id;

  -- 1. Aumentar cantidad_devuelta (el trigger de estado transiciona la fila).
  UPDATE public.asignacion_vivero_subcampania
  SET cantidad_devuelta = cantidad_devuelta + p_cantidad_devuelta
  WHERE id = p_asignacion_id;

  -- 2. Retorno fisico al lote (RN-VIV-48). Reabre el lote si estaba FINALIZADO.
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        estado_lote       = 'ACTIVO',
        motivo_cierre     = NULL,
        updated_at        = NOW()
    WHERE id = v_lote.id;
    v_lote_reabierto := TRUE;
  ELSE
    UPDATE public.lote_vivero
    SET saldo_vivo_actual = v_saldo_despues,
        updated_at        = NOW()
    WHERE id = v_lote.id;
  END IF;

  -- 3. Evento M2 de entrada fisica (explica el aumento de saldo en el lote).
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    asignacion_id,
    subcampania_id,
    campania_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    v_lote.id,
    'DEVOLUCION_PLANTACION'::public.tipo_evento_vivero,
    p_fecha_devolucion,
    p_usuario_devolucion_id,
    p_cantidad_devuelta,
    'UNIDAD',
    p_asignacion_id,
    v_asignacion.subcampania_id,
    v_campania_id,
    v_saldo_antes,
    v_saldo_despues,
    NULLIF(BTRIM(COALESCE(p_observaciones, '')), '')
  )
  RETURNING id INTO v_evento_m2_id;

  -- 4. Evento M3 (linea de tiempo de la subcampania).
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_devuelta,
    motivo_devolucion,
    created_by
  )
  VALUES (
    'DEVOLUCION_A_VIVERO'::public.tipo_evento_plantacion,
    v_asignacion.subcampania_id,
    p_asignacion_id,
    p_fecha_devolucion::TIMESTAMPTZ,
    p_usuario_devolucion_id,
    NULLIF(BTRIM(COALESCE(p_observaciones, '')), ''),
    p_cantidad_devuelta,
    p_motivo_devolucion,
    p_usuario_devolucion_id
  )
  RETURNING id INTO v_evento_m3_id;

  evento_lote_vivero_id := v_evento_m2_id;
  evento_plantacion_id  := v_evento_m3_id;
  lote_vivero_id        := v_lote.id;
  saldo_vivo_antes      := v_saldo_antes;
  saldo_vivo_despues    := v_saldo_despues;
  lote_reabierto        := v_lote_reabierto;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_subcampania_cancelar_interna(
  p_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT,
  p_contexto JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub public.subcampania%ROWTYPE;
  v_estado_origen public.estado_subcampania;
  v_asig RECORD;
  v_asignaciones_devueltas INT := 0;
  v_unidades_devueltas INT := 0;
  v_contexto JSONB := COALESCE(p_contexto, '{}'::JSONB);
  v_campania_id BIGINT;
BEGIN
  IF p_motivo IS NULL
     OR LENGTH(BTRIM(p_motivo)) < 3
     OR LENGTH(BTRIM(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'El motivo de cancelacion debe tener entre 3 y 1000 caracteres.'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'actor_user_id es obligatorio.'
      USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_contexto) <> 'object' THEN
    RAISE EXCEPTION 'El contexto de cancelacion debe ser un objeto JSON.'
      USING ERRCODE = 'P0001';
  END IF;

  -- La cancelación individual también inserta eventos con FK hacia campaña.
  -- En el caller masivo ambos locks son reentrantes y ya están adquiridos.
  SELECT s.campania_id INTO v_campania_id FROM public.subcampania s
  WHERE s.id=p_id AND s.deleted_at IS NULL;
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  -- El caller masivo ya bloqueo todas las subcampanias en orden estable.
  -- El lock se repite para que el helper tambien sea seguro desde la RPC
  -- individual.
  SELECT *
  INTO v_sub
  FROM public.subcampania
  WHERE id = p_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada.', p_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_sub.campania_id IS DISTINCT FROM v_campania_id THEN
    RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409';
  END IF;

  v_estado_origen := v_sub.estado;

  IF v_sub.estado NOT IN ('BORRADOR', 'ACTIVA') THEN
    RAISE EXCEPTION
      'Solo se puede cancelar una subcampania en BORRADOR o ACTIVA (estado actual: %).',
      v_sub.estado
      USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(v_sub.total_plantado_inicial, 0) > 0 THEN
    RAISE EXCEPTION
      'La subcampania ya tiene plantaciones registradas (total_plantado_inicial = %). Usar cierre FINALIZADA_PARCIAL.',
      v_sub.total_plantado_inicial
      USING ERRCODE = 'P0001';
  END IF;

  -- Prelock de todas las asignaciones y despues de todos sus lotes, ambos en
  -- orden global estable. En la operacion de campaña estos locks ya fueron
  -- adquiridos para todas las hijas y las lecturas siguientes son reentrantes.
  PERFORM 1
  FROM public.asignacion_vivero_subcampania av
  WHERE av.subcampania_id = p_id
    AND av.estado = 'ACTIVA'
    AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ORDER BY av.id ASC
  FOR UPDATE;

  PERFORM 1
  FROM public.lote_vivero lv
  JOIN (
    SELECT DISTINCT av.lote_vivero_id
    FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id = p_id
      AND av.estado = 'ACTIVA'
      AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ) lotes ON lotes.lote_vivero_id = lv.id
  ORDER BY lv.id ASC
  FOR UPDATE OF lv;

  -- Devolucion fisica de asignaciones activas con saldo disponible. El helper
  -- de M2/M3 registra DEVOLUCION_PLANTACION y DEVOLUCION_A_VIVERO.
  FOR v_asig IN
    SELECT av.id, av.saldo_asignado_disponible
    FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id = p_id
      AND av.estado = 'ACTIVA'
    ORDER BY av.id ASC
    FOR UPDATE
  LOOP
    IF COALESCE(v_asig.saldo_asignado_disponible, 0) > 0 THEN
      PERFORM public.fn_m2_m3_aplicar_devolucion_fisica(
        v_asig.id,
        v_asig.saldo_asignado_disponible,
        'CIERRE_SUBCAMPANIA'::public.motivo_devolucion_plantacion,
        p_actor_user_id,
        CURRENT_DATE,
        'Devolucion fisica automatica por cancelacion de subcampania. Motivo: '
          || BTRIM(p_motivo)
      );

      v_asignaciones_devueltas := v_asignaciones_devueltas + 1;
      v_unidades_devueltas :=
        v_unidades_devueltas + v_asig.saldo_asignado_disponible;
    END IF;
  END LOOP;

  UPDATE public.subcampania
  SET estado = 'CANCELADA',
      deleted_at = NOW(),
      deleted_by = p_actor_user_id,
      updated_at = NOW(),
      updated_by = p_actor_user_id
  WHERE id = p_id
  RETURNING * INTO v_sub;

  INSERT INTO public.subcampania_historial (
    subcampania_id,
    tipo_historial,
    estado_origen,
    estado_destino,
    observaciones,
    metadata,
    actor_user_id
  )
  VALUES (
    p_id,
    'SUBCAMPANIA_CANCELADA',
    v_estado_origen,
    'CANCELADA',
    BTRIM(p_motivo),
    jsonb_build_object(
      'asignaciones_devueltas', v_asignaciones_devueltas,
      'unidades_devueltas', v_unidades_devueltas,
      'motivo_devolucion', 'CIERRE_SUBCAMPANIA',
      'devolucion_fisica', TRUE
    ) || v_contexto,
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'subcampania_id', v_sub.id,
    'asignaciones_devueltas', v_asignaciones_devueltas,
    'unidades_devueltas', v_unidades_devueltas
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_subcampania_cancelar(
  p_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT
)
RETURNS public.subcampania
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_sub public.subcampania%ROWTYPE;
  v_actor_rol TEXT;
BEGIN
  v_actor_rol:=public.pa_d_cuenta(p_actor_user_id);

  IF v_actor_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_actor_user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_rol <> 'ADMIN' THEN
    RAISE EXCEPTION 'Solo el rol ADMIN puede cancelar subcampanias.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.fn_subcampania_cancelar_interna(
    p_id,
    p_actor_user_id,
    p_motivo,
    '{}'::JSONB
  );

  SELECT *
  INTO v_sub
  FROM public.subcampania
  WHERE id = p_id;

  RETURN v_sub;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_campania_desactivar_sin_plantaciones(
  p_campania_id BIGINT,
  p_actor_user_id BIGINT,
  p_motivo TEXT
)
RETURNS TABLE (
  campania_id BIGINT,
  deleted_at TIMESTAMPTZ,
  subcampanias_canceladas INT,
  asignaciones_devueltas INT,
  unidades_devueltas INT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_campania public.campania%ROWTYPE;
  v_actor_rol TEXT;
  v_sub RECORD;
  v_resultado JSONB;
  v_bloqueos JSONB;
  v_subcampanias_canceladas INT := 0;
  v_asignaciones_devueltas INT := 0;
  v_unidades_devueltas INT := 0;
BEGIN
  IF p_motivo IS NULL
     OR LENGTH(BTRIM(p_motivo)) < 3
     OR LENGTH(BTRIM(p_motivo)) > 1000 THEN
    RAISE EXCEPTION 'El motivo debe tener entre 3 y 1000 caracteres.'
      USING ERRCODE = 'P0001';
  END IF;

  v_actor_rol:=public.pa_d_cuenta(p_actor_user_id);

  IF v_actor_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_actor_user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_actor_rol <> 'ADMIN' THEN
    RAISE EXCEPTION 'Solo el rol ADMIN puede desactivar campanias.'
      USING ERRCODE = 'P0001';
  END IF;

  -- La campania define la unidad transaccional.
  SELECT *
  INTO v_campania
  FROM public.campania c
  WHERE c.id = p_campania_id
    AND c.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campania % no encontrada o ya desactivada.', p_campania_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock de todas las subcampanias vivas antes de validar o mutar.
  PERFORM 1
  FROM public.subcampania s
  WHERE s.campania_id = p_campania_id
    AND s.deleted_at IS NULL
  ORDER BY s.id ASC
  FOR UPDATE;

  -- La validacion completa ocurre despues de adquirir locks y antes de la
  -- primera devolucion/cancelacion.
  SELECT jsonb_agg(
    jsonb_build_object(
      'subcampania_id', s.id,
      'estado', s.estado,
      'total_plantado_inicial', COALESCE(s.total_plantado_inicial, 0),
      'codigo',
        CASE
          WHEN COALESCE(s.total_plantado_inicial, 0) > 0
            THEN 'SUBCAMPANIA_CON_PLANTACIONES'
          ELSE 'ESTADO_NO_ELEGIBLE'
        END
    )
    ORDER BY s.id
  )
  INTO v_bloqueos
  FROM public.subcampania s
  WHERE s.campania_id = p_campania_id
    AND s.deleted_at IS NULL
    AND (
      COALESCE(s.total_plantado_inicial, 0) > 0
      OR s.estado NOT IN ('BORRADOR', 'ACTIVA', 'CANCELADA')
    );

  IF v_bloqueos IS NOT NULL THEN
    RAISE EXCEPTION
      'La campania % no es elegible para desactivacion masiva. Bloqueos: %',
      p_campania_id,
      v_bloqueos::TEXT
      USING ERRCODE = 'P0003',
            DETAIL = v_bloqueos::TEXT;
  END IF;

  -- Prelock global de recursos de devolucion. Evita que el procesamiento
  -- subcampania por subcampania introduzca ordenes de lotes distintos entre
  -- transacciones concurrentes.
  PERFORM 1
  FROM public.asignacion_vivero_subcampania av
  JOIN public.subcampania s ON s.id = av.subcampania_id
  WHERE s.campania_id = p_campania_id
    AND s.deleted_at IS NULL
    AND s.estado IN ('BORRADOR', 'ACTIVA')
    AND av.estado = 'ACTIVA'
    AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ORDER BY av.id ASC
  FOR UPDATE OF av;

  PERFORM 1
  FROM public.lote_vivero lv
  JOIN (
    SELECT DISTINCT av.lote_vivero_id
    FROM public.asignacion_vivero_subcampania av
    JOIN public.subcampania s ON s.id = av.subcampania_id
    WHERE s.campania_id = p_campania_id
      AND s.deleted_at IS NULL
      AND s.estado IN ('BORRADOR', 'ACTIVA')
      AND av.estado = 'ACTIVA'
      AND COALESCE(av.saldo_asignado_disponible, 0) > 0
  ) lotes ON lotes.lote_vivero_id = lv.id
  ORDER BY lv.id ASC
  FOR UPDATE OF lv;

  FOR v_sub IN
    SELECT s.id
    FROM public.subcampania s
    WHERE s.campania_id = p_campania_id
      AND s.deleted_at IS NULL
      AND s.estado IN ('BORRADOR', 'ACTIVA')
    ORDER BY s.id ASC
  LOOP
    v_resultado := public.fn_subcampania_cancelar_interna(
      v_sub.id,
      p_actor_user_id,
      BTRIM(p_motivo),
      jsonb_build_object(
        'origen', 'DESACTIVACION_CAMPANIA',
        'campania_id', p_campania_id
      )
    );

    v_subcampanias_canceladas := v_subcampanias_canceladas + 1;
    v_asignaciones_devueltas := v_asignaciones_devueltas
      + COALESCE((v_resultado->>'asignaciones_devueltas')::INT, 0);
    v_unidades_devueltas := v_unidades_devueltas
      + COALESCE((v_resultado->>'unidades_devueltas')::INT, 0);
  END LOOP;

  UPDATE public.campania c
  SET deleted_at = NOW(),
      deleted_by = p_actor_user_id,
      updated_at = NOW(),
      updated_by = p_actor_user_id
  WHERE c.id = p_campania_id
  RETURNING c.* INTO v_campania;

  campania_id := v_campania.id;
  deleted_at := v_campania.deleted_at;
  subcampanias_canceladas := v_subcampanias_canceladas;
  asignaciones_devueltas := v_asignaciones_devueltas;
  unidades_devueltas := v_unidades_devueltas;
  RETURN NEXT;
END;
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
  v_rol:=public.pa_d_cuenta(p_actor_user_id);

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


-- PostgREST compatible hoista estas opciones ANTES del statement RPC.
-- SQL directo debe aplicarlas antes de invocar;067 configura rol privado.
DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['fn_m3_registrar_plantacion','fn_vivero_asignar_stock_subcampania','fn_m3_devolver_asignacion_vivero','fn_subcampania_cancelar','fn_campania_desactivar_sin_plantaciones','fn_subcampania_revisar_plan','fn_subcampania_obtener_plan']) LOOP
  EXECUTE format('ALTER FUNCTION %s SET lock_timeout TO %L',f.firma,'5s');
  EXECUTE format('ALTER FUNCTION %s SET statement_timeout TO %L',f.firma,'30s');
 END LOOP;
END $$;
-- Cerrar todas las sobrecargas: solo las firmas vigentes vuelven a operar por servicio privado.
DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY['pa_d_cuenta','fn_m3_registrar_plantacion','fn_vivero_asignar_stock_subcampania','fn_m3_devolver_asignacion_vivero','fn_m2_m3_aplicar_devolucion_fisica','fn_subcampania_cancelar_interna','fn_subcampania_cancelar','fn_campania_desactivar_sin_plantaciones','fn_subcampania_revisar_plan','fn_subcampania_obtener_plan','fn_subcampania_setear_poligono']) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.pa_d_cuenta(BIGINT),
 public.fn_m3_registrar_plantacion(BIGINT,BOOLEAN,BIGINT,DATE,BIGINT,NUMERIC,NUMERIC,TEXT,BIGINT[],JSONB,BIGINT[]),
 public.fn_vivero_asignar_stock_subcampania(BIGINT,BIGINT,INTEGER,public.proposito_asignacion,BIGINT,DATE,BIGINT[],TEXT),
 public.fn_m3_devolver_asignacion_vivero(BIGINT,INTEGER,public.motivo_devolucion_plantacion,BIGINT,DATE,TEXT),
 public.fn_m2_m3_aplicar_devolucion_fisica(BIGINT,INTEGER,public.motivo_devolucion_plantacion,BIGINT,DATE,TEXT),
 public.fn_subcampania_cancelar_interna(BIGINT,BIGINT,TEXT,JSONB),
 public.fn_subcampania_cancelar(BIGINT,BIGINT,TEXT),
 public.fn_campania_desactivar_sin_plantaciones(BIGINT,BIGINT,TEXT),
 public.fn_subcampania_revisar_plan(BIGINT,INTEGER,JSONB,BIGINT,BIGINT),
 public.fn_subcampania_obtener_plan(BIGINT) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
