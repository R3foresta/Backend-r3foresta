-- Mis registros: corrige la volatilidad de la lectura con bloqueo de actor y
-- entrega especies/foto autorizada para autor o participante historico.
-- Nunca entrega bucket, ruta de Storage ni originales en el DTO HTTP.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF to_regprocedure('public.pa_mis_registros_leer(bigint,text,bigint,integer)') IS NULL
    OR to_regprocedure('public.pa_p_relacion_propia(bigint,bigint)') IS NULL
    OR to_regprocedure('public.pa_lecturas_actor(bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'PA_MIS_REGISTROS_ANTECEDENTE_INCOMPLETO: requiere 085';
  END IF;
END $$;

-- Proyeccion interna de material fotografico. La API nunca entrega esta ruta.
-- El invocador solo la usa tras verificar la relacion historica por registro.
CREATE OR REPLACE FUNCTION public.pa_p_foto_propia_material(
  p_registro_id BIGINT, p_evidencia_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public AS $$
DECLARE e public.evidencias_trazabilidad%ROWTYPE; v_bucket TEXT; v_ruta TEXT;
BEGIN
  SELECT ev.* INTO e FROM public.evidencias_trazabilidad ev
    JOIN public.tipos_entidad_evidencia t ON t.id=ev.tipo_entidad_id
      AND upper(t.codigo)='REGISTRO_PLANTACION' AND t.activo
    WHERE ev.id=p_evidencia_id AND ev.entidad_id=p_registro_id
      AND ev.eliminado_en IS NULL AND ev.tipo_archivo='FOTO';
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Carga inicial confirmada: exclusivamente el JPEG derivado y verificado.
  SELECT x.bucket,x.ruta_derivada INTO v_bucket,v_ruta
    FROM public.participacion_carga x
    JOIN public.participacion_comando c ON c.id=x.comando_interno_id
      AND c.estado='CONFIRMADO' AND c.registro_plantacion_id=p_registro_id
    JOIN public.registro_plantacion r ON r.id=p_registro_id
      AND r.subcampania_id=x.subcampania_id
    WHERE x.evidencia_id=e.id AND x.actor_id=e.creado_por_usuario_id
      AND x.tipo_entidad_id=e.tipo_entidad_id AND x.bucket=e.bucket
      AND x.ruta_original=e.ruta_archivo
      AND e.hash_sha256=encode(x.hash_original_sha256,'hex')
      AND x.estado='VINCULADA' AND x.objetos_verificados_en IS NOT NULL
    LIMIT 1;
  IF FOUND THEN
    IF v_bucket='participacion_evidencias' AND v_ruta IS NOT NULL
      AND v_ruta=regexp_replace(e.ruta_archivo,'/original$','/derivada.jpg')
      AND v_ruta LIKE '%/derivada.jpg' AND v_ruta NOT LIKE '%..%'
      AND v_ruta NOT LIKE '/%' THEN
      RETURN jsonb_build_object('bucket',v_bucket,'ruta',v_ruta,'legada',false);
    END IF;
    RETURN NULL;
  END IF;

  -- Reposicion privada con derivada sanitizada y procedencia comprobada.
  IF e.bucket='participacion_evidencias'
    AND e.metadata->>'proposito'='REPOSICION'
    AND e.metadata->>'derivada_sanitizada'='true'
    AND coalesce(e.metadata->>'hash_derivada','') ~ '^[0-9a-f]{64}$'
    AND EXISTS(SELECT 1 FROM public.registro_plantacion r
      WHERE r.id=p_registro_id AND r.es_reposicion
        AND e.metadata->>'subcampania_id'=r.subcampania_id::text
        AND e.ruta_archivo ~ ('^reposiciones/'||e.creado_por_usuario_id||'/'||r.subcampania_id||'/[0-9a-f-]{36}/original$'))
    AND e.metadata->>'ruta_derivada'=regexp_replace(e.ruta_archivo,'/original$','/derivada.jpg') THEN
    RETURN jsonb_build_object('bucket',e.bucket,'ruta',e.metadata->>'ruta_derivada','legada',false);
  END IF;

  -- Foto historica: el servidor sanitiza los bytes antes de responder.
  IF e.bucket='recoleccion_fotos' AND e.ruta_archivo IS NOT NULL
    AND e.ruta_archivo<>'' AND e.ruta_archivo NOT LIKE '/%'
    AND e.ruta_archivo NOT LIKE '%..%' THEN
    RETURN jsonb_build_object('bucket',e.bucket,'ruta',e.ruta_archivo,'legada',true);
  END IF;
  RETURN NULL;
END $$;

-- Material solo a quien tiene autoria o participacion historica efectiva.
-- El 404 no distingue registro ajeno, evidencia ajena o material inexistente.
CREATE OR REPLACE FUNCTION public.pa_foto_propia_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_id BIGINT,p_evidencia_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v_material JSONB;
BEGIN
  PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
  IF p_registro_id IS NULL OR p_evidencia_id IS NULL
    OR p_registro_id<=0 OR p_evidencia_id<=0 THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no esta disponible.');
  END IF;
  PERFORM 1 FROM public.registro_plantacion r
    WHERE r.id=p_registro_id
      AND jsonb_array_length(coalesce(public.pa_p_relacion_propia(p_actor_id,r.id),'[]'::jsonb))>0
    FOR SHARE;
  IF NOT FOUND THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no esta disponible.');
  END IF;
  v_material:=public.pa_p_foto_propia_material(p_registro_id,p_evidencia_id);
  IF v_material IS NULL THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no esta disponible.');
  END IF;
  RETURN jsonb_build_object('data',v_material);
END $$;

-- VOLATILE es necesario: pa_lecturas_actor usa SELECT FOR SHARE. STABLE
-- provoca SQLSTATE 25006 en PostgREST aun cuando la funcion solo lee datos.
CREATE OR REPLACE FUNCTION public.pa_mis_registros_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_cursor BIGINT DEFAULT NULL,p_limite INTEGER DEFAULT 20
) RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v JSONB;
BEGIN
  PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
  IF p_limite NOT BETWEEN 1 AND 100 THEN
    PERFORM public.pa_r_error(422,'ENTRADA_INVALIDA','Limite no valido.');
  END IF;
  WITH propios AS MATERIALIZED (
    SELECT r.*,r.responsable_id=p_actor_id autor,
      public.pa_p_relacion_propia(p_actor_id,r.id)?'PARTICIPANTE' participante
      FROM public.registro_plantacion r
      WHERE jsonb_array_length(coalesce(public.pa_p_relacion_propia(p_actor_id,r.id),'[]'::jsonb))>0
  ), pagina AS (
    SELECT * FROM propios WHERE p_cursor IS NULL OR id<p_cursor ORDER BY id DESC LIMIT p_limite
  )
  SELECT jsonb_build_object('registros',coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id::text,'subcampania_id',p.subcampania_id::text,
    'subcampania_nombre',coalesce(p.nombre_subcampania_snapshot,s.nombre),
    'fecha_plantacion',p.fecha_plantacion::text,
    'codigo_trazabilidad',p.codigo_trazabilidad,
    'cantidad_total_plantada',p.cantidad_total_plantada,'es_reposicion',p.es_reposicion,
    'relaciones',CASE WHEN autor AND participante THEN '["AUTOR","PARTICIPANTE"]'::jsonb
      WHEN autor THEN '["AUTOR"]'::jsonb ELSE '["PARTICIPANTE"]'::jsonb END,
    'especies',coalesce((SELECT jsonb_agg(jsonb_build_object(
      'planta_id',d.planta_id::text,'nombre',d.nombre,'cantidad',d.cantidad) ORDER BY d.planta_id)
      FROM (SELECT planta_id,max(coalesce(nombre_comercial_snapshot,nombre_cientifico_snapshot)) nombre,
        sum(cantidad)::integer cantidad FROM public.registro_plantacion_detalle
        WHERE registro_plantacion_id=p.id GROUP BY planta_id) d),'[]'::jsonb),
    'foto_portada',CASE WHEN foto.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',foto.id::text,'url','/api/v1/plantaciones/'||p.id||'/imagenes/'||foto.id) END,
    'url_publica',CASE WHEN ca.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.estado::text IN ('ACTIVA','COMPLETADA','FINALIZADA_PARCIAL')
      THEN '/api/v1/impact/registros/'||p.id ELSE NULL END,
    'url_detalle_propio','/api/v1/plantaciones/'||p.id||'/detalle-propio'
  ) ORDER BY p.id DESC),'[]'::jsonb),
    'siguiente_cursor',CASE WHEN EXISTS(
      SELECT 1 FROM propios WHERE id<(SELECT min(id) FROM pagina))
      THEN (SELECT min(id)::text FROM pagina) ELSE NULL END)
  INTO v FROM pagina p
    JOIN public.subcampania s ON s.id=p.subcampania_id
    JOIN public.campania ca ON ca.id=s.campania_id
    LEFT JOIN LATERAL (
      SELECT e.id FROM public.evidencias_trazabilidad e
        WHERE e.entidad_id=p.id
          AND public.pa_p_foto_propia_material(p.id,e.id) IS NOT NULL
        ORDER BY e.es_principal DESC NULLS LAST,e.id LIMIT 1
    ) foto ON TRUE;
  RETURN jsonb_build_object('data',v);
END $$;

REVOKE ALL ON FUNCTION public.pa_p_foto_propia_material(BIGINT,BIGINT),
  public.pa_foto_propia_leer(BIGINT,TEXT,BIGINT,BIGINT),
  public.pa_mis_registros_leer(BIGINT,TEXT,BIGINT,INTEGER)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.pa_p_foto_propia_material(BIGINT,BIGINT),
  public.pa_foto_propia_leer(BIGINT,TEXT,BIGINT,BIGINT),
  public.pa_mis_registros_leer(BIGINT,TEXT,BIGINT,INTEGER) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
