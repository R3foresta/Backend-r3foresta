-- Exclusivamente fixture T5 privado con PostGIS, tras 103/110 y consumos reales.
-- Ejecutar como service_role. No inserta ni modifica consumos o stock; el
-- permiso contextual sintético ejercita072 y se revierte con toda la prueba.
BEGIN;
SET LOCAL ROLE service_role;
DO $test$
DECLARE v_id BIGINT; v_admin JSONB; v_propia JSONB; v_fila JSONB;
  v_previo JSONB; v_posterior JSONB; v_existe BOOLEAN; v_registro RECORD;
  v_origenes TEXT[]:='{}'; v_bigint BOOLEAN:=false; v_snapshot_historico BOOLEAN:=false;
  v_payload JSONB; v_permiso JSONB; v_revision BIGINT; v_sub BIGINT;
BEGIN
  SELECT min(r.id) INTO v_id FROM public.registro_plantacion r
    WHERE jsonb_array_length(public.pa_p_relacion_propia(21,r.id))>0
      AND EXISTS(SELECT 1 FROM public.registro_plantacion_detalle d WHERE d.registro_plantacion_id=r.id);
  IF v_id IS NULL THEN RAISE EXCEPTION 'Fixture T5: falta consumo de autor21'; END IF;
  IF has_function_privilege('anon','public.pa_registro_procedencia_administrativa_leer(bigint,text,bigint)','EXECUTE')
    OR has_function_privilege('authenticated','public.pa_registro_procedencia_administrativa_leer(bigint,text,bigint)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.pa_registro_procedencia_administrativa_leer(bigint,text,bigint)','EXECUTE') THEN
    RAISE EXCEPTION '110: frontera SQL no es privada';
  END IF;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.registro_plantacion_detalle),
    (SELECT sum(cantidad) FROM public.registro_plantacion_detalle),
    (SELECT sum(saldo_vivo_actual) FROM public.lote_vivero),
    (SELECT sum(saldo_asignado_disponible) FROM public.asignacion_vivero_subcampania),
    (SELECT count(*) FROM public.evento_lote_vivero)
  ) INTO v_previo;
  v_admin:=public.pa_registro_procedencia_administrativa_leer(1,'fixture-admin',v_id);
  v_propia:=public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',v_id);
  IF v_admin->'data' IS DISTINCT FROM v_propia->'data'
    OR v_admin->'data'->>'registro_plantacion_id'<>v_id::text
    OR v_admin->'data'->>'criterio_atribucion'<>'CONSUMOS_PERSISTIDOS'
    OR (SELECT sum((x->>'cantidad')::integer) FROM jsonb_array_elements(v_admin->'data'->'consumos') x)
      IS DISTINCT FROM (v_admin->'data'->>'cantidad_total_plantada')::integer
    OR v_admin->>'observado_en' IS NULL THEN
    RAISE EXCEPTION '110: ADMIN independiente y proyección propia divergen';
  END IF;
  FOR v_fila IN SELECT x FROM jsonb_array_elements(v_admin->'data'->'consumos') x LOOP
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['detalle_id','asignacion_id','lote_vivero_id','planta_id']) k
        WHERE jsonb_typeof(v_fila->k) IS DISTINCT FROM 'string')
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_fila) k
        WHERE k NOT IN('detalle_id','asignacion_id','lote_vivero_id','codigo_lote','planta_id','cantidad',
          'nombre_cientifico_snapshot','nombre_comercial_snapshot','variedad_snapshot','origen'))
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_fila->'origen') k
        WHERE k NOT IN('tipo','recoleccion_id','modalidad','procedencia')) THEN
      RAISE EXCEPTION '110: IDs inexactos o datos privados M2';
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.registro_plantacion_detalle d
      WHERE d.id=(v_fila->>'detalle_id')::bigint AND d.registro_plantacion_id=v_id
        AND d.asignacion_id::text=v_fila->>'asignacion_id'
        AND d.lote_vivero_id::text=v_fila->>'lote_vivero_id'
        AND d.nombre_cientifico_snapshot IS NOT DISTINCT FROM v_fila->>'nombre_cientifico_snapshot'
        AND d.nombre_comercial_snapshot IS NOT DISTINCT FROM v_fila->>'nombre_comercial_snapshot'
        AND d.variedad_snapshot IS NOT DISTINCT FROM v_fila->>'variedad_snapshot') INTO v_existe;
    IF NOT v_existe THEN RAISE EXCEPTION '110: no preserva consumo y snapshots persistidos'; END IF;
  END LOOP;
  -- El runner ya confirmó consumos reales LIFO075/reposición077 de compra,
  -- donación y M1, incluidos IDs mayores que MAX_SAFE_INTEGER. Recorrer sus
  -- registros comprueba110 contra filas exactas, sin crear consumos de lectura.
  FOR v_registro IN SELECT r.id,r.responsable_id,u.auth_id FROM public.registro_plantacion r
    JOIN public.usuario u ON u.id=r.responsable_id
    WHERE EXISTS(SELECT 1 FROM public.registro_plantacion_detalle d WHERE d.registro_plantacion_id=r.id)
    ORDER BY r.id LOOP
    v_admin:=public.pa_registro_procedencia_administrativa_leer(1,'fixture-admin',v_registro.id);
    v_propia:=public.pa_registro_procedencia_propia_leer(v_registro.responsable_id,v_registro.auth_id,v_registro.id);
    IF v_admin->'data' IS DISTINCT FROM v_propia->'data' THEN
      RAISE EXCEPTION '110: proyección divergente en registro %',v_registro.id; END IF;
    IF (SELECT sum((x->>'cantidad')::integer) FROM jsonb_array_elements(v_admin->'data'->'consumos') x)
      IS DISTINCT FROM (v_admin->'data'->>'cantidad_total_plantada')::integer THEN
      RAISE EXCEPTION '110: suma de consumos divergente en registro %',v_registro.id; END IF;
    FOR v_fila IN SELECT x FROM jsonb_array_elements(v_admin->'data'->'consumos') x LOOP
      v_origenes:=array_append(v_origenes,coalesce(v_fila->'origen'->>'procedencia',v_fila->'origen'->>'tipo'));
      v_bigint:=v_bigint OR (v_fila->>'lote_vivero_id')::bigint>9007199254740991;
      IF EXISTS(SELECT 1 FROM unnest(ARRAY['detalle_id','asignacion_id','lote_vivero_id','planta_id']) k
        WHERE jsonb_typeof(v_fila->k) IS DISTINCT FROM 'string') THEN
        RAISE EXCEPTION '110: IDs BIGINT no textuales'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.registro_plantacion_detalle d
        JOIN public.lote_vivero l ON l.id=d.lote_vivero_id
        WHERE d.id::text=v_fila->>'detalle_id' AND d.asignacion_id::text=v_fila->>'asignacion_id'
          AND d.lote_vivero_id::text=v_fila->>'lote_vivero_id' AND l.codigo_trazabilidad=v_fila->>'codigo_lote'
          AND d.cantidad=(v_fila->>'cantidad')::integer
          AND d.nombre_cientifico_snapshot IS NOT DISTINCT FROM v_fila->>'nombre_cientifico_snapshot'
          AND d.nombre_comercial_snapshot IS NOT DISTINCT FROM v_fila->>'nombre_comercial_snapshot'
          AND d.variedad_snapshot IS NOT DISTINCT FROM v_fila->>'variedad_snapshot') THEN
        RAISE EXCEPTION '110: detalle/código/snapshots no corresponden al hecho persistido'; END IF;
      v_snapshot_historico:=v_snapshot_historico OR EXISTS(SELECT 1 FROM public.registro_plantacion_detalle d
        JOIN public.planta p ON p.id=d.planta_id WHERE d.id::text=v_fila->>'detalle_id'
          AND d.nombre_cientifico_snapshot IS DISTINCT FROM p.nombre_cientifico);
    END LOOP;
  END LOOP;
  IF NOT ARRAY['COMPRA','DONACION','RECOLECCION']::text[]<@v_origenes
    OR NOT v_bigint OR NOT v_snapshot_historico THEN
    RAISE EXCEPTION 'Fixture110 incompleto: falta origen real, BIGINT o snapshot separado del catálogo'; END IF;
  BEGIN
    PERFORM public.pa_registro_procedencia_propia_leer(1,'fixture-admin',v_id);
    RAISE EXCEPTION '110: ADMIN sin relación abrió audiencia propia';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.pa_registro_procedencia_administrativa_leer(21,'fixture-t2-m1',v_id);
    RAISE EXCEPTION '110: autor no ADMIN abrió audiencia administrativa';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN
    PERFORM public.pa_registro_procedencia_administrativa_leer(20,'fixture-t2-operario',9223372036854775807);
    RAISE EXCEPTION '110: M2 no ADMIN distinguió registro inexistente';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  BEGIN
    PERFORM public.pa_registro_procedencia_administrativa_leer(1,'fixture-admin',9223372036854775807);
    RAISE EXCEPTION '110: ADMIN leyó registro inexistente';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.pa_registro_procedencia_administrativa_leer(1,'identidad-ajena',v_id);
    RAISE EXCEPTION '110: identidad discordante leyó registro';
  EXCEPTION WHEN SQLSTATE 'PT401' THEN NULL; END;
  BEGIN
    PERFORM public.pa_registro_procedencia_administrativa_leer(5,'fixture-inactivo',v_id);
    RAISE EXCEPTION '110: cuenta inactiva leyó registro';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  SELECT subcampania_id INTO v_sub FROM public.registro_plantacion WHERE id=v_id;
  SELECT coalesce((SELECT revision FROM public.subcampania_permiso_revision
    WHERE subcampania_id=v_sub AND usuario_id=20),0) INTO v_revision;
  v_payload:=jsonb_build_object('usuario_destino_id','20','ambitos',jsonb_build_array(
    jsonb_build_object('subcampania_id',v_sub::text,'revision_esperada',v_revision::text)));
  v_permiso:=public.pa_acceso_ejecutar(1,'fixture-admin','DESIGNAR_ADMINISTRADOR',
    gen_random_uuid(),v_payload,v_payload::text);
  IF v_permiso->'body'->>'estado' IS DISTINCT FROM 'CONFIRMADO'
    OR NOT EXISTS(SELECT 1 FROM public.subcampania_permiso WHERE subcampania_id=v_sub
      AND usuario_id=20 AND revocado_en IS NULL AND rol_contextual='ADMINISTRADOR_SUBCAMPANIA')
    OR (SELECT rol::text FROM public.usuario WHERE id=20)='ADMIN' THEN
    RAISE EXCEPTION 'Fixture110: no pudo establecer administración contextual sin ADMIN global'; END IF;
  BEGIN
    PERFORM public.pa_registro_procedencia_administrativa_leer(20,'fixture-t2-operario',v_id);
    RAISE EXCEPTION '110: administrador contextual abrió audiencia ADMIN global';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL; END;
  SELECT jsonb_build_array(
    (SELECT count(*) FROM public.registro_plantacion_detalle),
    (SELECT sum(cantidad) FROM public.registro_plantacion_detalle),
    (SELECT sum(saldo_vivo_actual) FROM public.lote_vivero),
    (SELECT sum(saldo_asignado_disponible) FROM public.asignacion_vivero_subcampania),
    (SELECT count(*) FROM public.evento_lote_vivero)
  ) INTO v_posterior;
  IF v_previo IS DISTINCT FROM v_posterior THEN
    RAISE EXCEPTION '110: una lectura alteró detalles, stock o eventos';
  END IF;
END $test$;
ROLLBACK;
