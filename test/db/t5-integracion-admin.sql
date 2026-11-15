-- Focal109 para el runner T5 aislado; no ejecutarlo contra servicios reales.
-- Sus altos/fotos son metadatos sintéticos sin objetos Storage; todo revierte.
BEGIN;
SET LOCAL ROLE service_role;
DO $test$
DECLARE actor bigint; clave uuid; fotos jsonb; ids jsonb; intencion jsonb;
  antes jsonb; despues jsonb; confirmado jsonb; historico record; rechazado boolean;
BEGIN
  IF public.pa_d_cuenta(1)<>'ADMIN' THEN RAISE EXCEPTION 'FIXTURE_109_ADMIN_REQUERIDO'; END IF;
  FOREACH actor IN ARRAY ARRAY[20,22,3,5]::bigint[] LOOP
    clave:=gen_random_uuid();
    fotos:=jsonb_build_array(jsonb_build_object(
      'ruta_archivo','vivero/incorporaciones/'||actor||'/'||clave||'/109-sintetico.jpg',
      'mime_type','image/jpeg','tamano_bytes',20));
    intencion:=jsonb_build_object('vivero_id','1','planta_id','1','modalidad','RECEPCION',
      'procedencia','COMPRA','fecha_evento',CURRENT_DATE,'cantidad',1,'evidencia_ids',jsonb_build_array('1'));
    SELECT jsonb_build_array((SELECT count(*) FROM public.lote_vivero),
      (SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.vivero_incorporacion),
      (SELECT count(*) FROM public.evidencias_trazabilidad)) INTO antes;
    rechazado:=false;
    BEGIN
      PERFORM public.m2_incorporacion_crear(actor,clave,intencion);
    EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN rechazado:=true;
    END;
    IF NOT rechazado THEN RAISE EXCEPTION '109_ALTA_NO_ADMIN_ACEPTADA: %',actor; END IF;
    rechazado:=false;
    BEGIN
      PERFORM public.m2_incorporacion_evidencias_preparar(actor,1,clave,fotos);
    EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN rechazado:=true;
    END;
    IF NOT rechazado THEN RAISE EXCEPTION '109_FOTOS_NO_ADMIN_ACEPTADAS: %',actor; END IF;
    rechazado:=false;
    BEGIN
      PERFORM public.m2_incorporacion_evidencias_leer(actor,1,clave);
    EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT403' THEN rechazado:=true;
    END;
    IF NOT rechazado THEN RAISE EXCEPTION '109_LECTURA_FOTOS_NO_ADMIN_ACEPTADA: %',actor; END IF;
    SELECT jsonb_build_array((SELECT count(*) FROM public.lote_vivero),
      (SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.vivero_incorporacion),
      (SELECT count(*) FROM public.evidencias_trazabilidad)) INTO despues;
    IF antes IS DISTINCT FROM despues THEN RAISE EXCEPTION '109_RECHAZO_DEJO_RESULTADO_DURABLE: %',actor; END IF;
  END LOOP;

  clave:=gen_random_uuid();
  fotos:=jsonb_build_array(jsonb_build_object(
    'ruta_archivo','vivero/incorporaciones/1/'||clave||'/109-admin-sintetico.jpg',
    'mime_type','image/jpeg','tamano_bytes',20,'titulo','Conteo sintético109'));
  ids:=public.m2_incorporacion_evidencias_preparar(1,1,clave,fotos);
  IF jsonb_array_length(public.m2_incorporacion_evidencias_leer(1,1,clave))<>1 THEN
    RAISE EXCEPTION '109_ADMIN_NO_LEE_PENDIENTE_PROPIA'; END IF;
  IF public.m2_incorporacion_evidencias_leer(1,1,gen_random_uuid())<>'[]'::jsonb THEN
    RAISE EXCEPTION '109_LECTURA_FUERA_SOLICITUD'; END IF;
  intencion:=jsonb_build_object('vivero_id','1','planta_id','1','modalidad','SALDO_INICIAL',
    'procedencia','DONACION','fecha_evento',CURRENT_DATE,'cantidad',2,'evidencia_ids',ids);
  confirmado:=public.m2_incorporacion_crear(1,clave,intencion);
  IF confirmado->>'estado'<>'CONFIRMADO' OR public.m2_incorporacion_crear(1,clave,intencion) IS DISTINCT FROM confirmado
    OR public.m2_incorporacion_recuperar(1,clave) IS DISTINCT FROM confirmado THEN
    RAISE EXCEPTION '109_ADMIN_ALTA_REPLAY_RECUPERACION'; END IF;
  IF public.m2_incorporacion_evidencias_leer(1,1,clave)<>'[]'::jsonb THEN
    RAISE EXCEPTION '109_FOTO_VINCULADA_SIGUE_PENDIENTE'; END IF;
  rechazado:=false;
  BEGIN
    PERFORM public.m2_incorporacion_crear(20,clave,intencion);
  EXCEPTION WHEN insufficient_privilege THEN rechazado:=true;
  END;
  IF NOT rechazado THEN RAISE EXCEPTION '109_REPLAY_AJENO_PERMITIDO'; END IF;
  rechazado:=false;
  BEGIN
    PERFORM public.m2_incorporacion_recuperar(20,clave);
  EXCEPTION WHEN insufficient_privilege THEN rechazado:=true;
  END;
  IF NOT rechazado THEN RAISE EXCEPTION '109_RECUPERACION_AJENA_PERMITIDA'; END IF;

  -- Hechos20 pre109: misma intención sigue recuperable sin ADMIN actual.
  SELECT i.*,e.responsable_id INTO historico FROM public.vivero_incorporacion i
    JOIN public.evento_lote_vivero e ON e.id=i.evento_id WHERE e.responsable_id=20 ORDER BY i.evento_id LIMIT 1;
  IF NOT FOUND OR public.pa_d_cuenta(20)='ADMIN' THEN RAISE EXCEPTION 'FIXTURE_109_HISTORICO_PROPIO_NO_ADMIN'; END IF;
  confirmado:=public.m2_incorporacion_recuperar(20,historico.solicitud_id);
  IF confirmado->>'estado'<>'CONFIRMADO'
    OR public.m2_incorporacion_crear(20,historico.solicitud_id,historico.huella_solicitud-'version') IS DISTINCT FROM confirmado THEN
    RAISE EXCEPTION '109_REPLAY_PROPIO_TRAS_PERDER_ADMIN'; END IF;
END $test$;
ROLLBACK;
SELECT '109: ADMIN alta/fotos/pendientes; GENERAL/VALIDADOR M2/VOLUNTARIO/inactivo denegados sin persistencia; replay/GET propios históricos y UUID ajeno verificados';
