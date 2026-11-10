-- Proyección optativa de requisitos de INICIO. Conserva el estado físico y las
-- firmas de 095/096/097. La creación vuelve a verificar los requisitos con sus
-- locks, como hasta ahora, y DESECHO conserva su regla independiente.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
  IF to_regprocedure('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean)') IS NULL
    OR to_regprocedure('public.m2_inicio_lote_impl(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)') IS NULL THEN
    RAISE EXCEPTION 'VIVERO_REQUISITOS_INICIO_CATALOGO_INCOMPATIBLE: requiere 097';
  END IF;
END $$;

CREATE FUNCTION public.m2_origen_motivo_no_inicio(r public.recoleccion,p_estado text,p_saldo numeric)
RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  SELECT CASE
    WHEN p_estado='PENDIENTE_RECEPCION' THEN 'Pendiente de recepción física conforme.'
    WHEN p_estado='PENDIENTE_CONCILIACION' THEN 'Pendiente de conciliar el remanente histórico.'
    WHEN p_estado='INCIDENCIA_CONCILIACION' THEN 'Remanente bloqueado por una incidencia de conciliación.'
    WHEN r.id IS NULL OR coalesce(p_estado,'') NOT IN ('RECEPCION_CONFORME','CONCILIACION_CONFORME')
      THEN 'El origen no está disponible para iniciar un lote.'
    WHEN coalesce(r.unidad_canonica::text,'') NOT IN ('G','UNIDAD')
      OR (r.tipo_material::text='ESQUEJE' AND r.unidad_canonica::text<>'UNIDAD')
      THEN 'La unidad canónica del origen no es compatible con INICIO.'
    WHEN p_saldo IS NULL OR p_saldo::text IN ('NaN','Infinity','-Infinity')
      OR p_saldo<CASE WHEN r.unidad_canonica::text='UNIDAD' THEN 1 ELSE 0.000001 END
      THEN 'El saldo no alcanza la cantidad mínima admitida para su unidad.'
    WHEN NOT EXISTS(SELECT 1 FROM public.ubicacion u WHERE u.id=r.ubicacion_id
      AND u.latitud BETWEEN -90 AND 90 AND u.longitud BETWEEN -180 AND 180)
      THEN 'La ficha del origen no tiene ubicación válida para INICIO.'
    WHEN (SELECT count(*) FROM public.evidencias_trazabilidad e JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
      WHERE e.entidad_id=r.id AND upper(t.codigo)='RECOLECCION' AND t.activo AND e.eliminado_en IS NULL)<2
      THEN 'La ficha del origen necesita al menos dos evidencias de Recolección vigentes.'
    WHEN nullif(btrim(r.codigo_trazabilidad),'') IS NULL THEN 'La ficha del origen no tiene código de trazabilidad.'
    WHEN r.planta_id IS NULL THEN 'La ficha del origen no tiene planta asociada.'
    WHEN nullif(btrim(r.nombre_cientifico_snapshot),'') IS NULL OR nullif(btrim(r.nombre_comercial_snapshot),'') IS NULL
      OR nullif(btrim(r.variedad_snapshot),'') IS NULL OR nullif(btrim(r.nombre_comunidad_snapshot),'') IS NULL
      THEN 'Faltan datos históricos de la especie o la comunidad en la ficha del origen.'
    ELSE NULL
  END
$$;

CREATE FUNCTION public.m2_origenes_leer(
  p_actor_id bigint,p_vivero_id bigint,p_recoleccion_id bigint,p_pagina integer,p_limite integer,
  p_incluir_pendientes boolean,p_incluir_requisitos_inicio boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE pagina jsonb; filas jsonb;
BEGIN
  IF p_incluir_requisitos_inicio IS TRUE AND p_incluir_pendientes IS NOT TRUE THEN
    RAISE EXCEPTION 'La consulta de requisitos de INICIO requiere incluir_pendientes.' USING ERRCODE='22023';
  END IF;
  pagina:=public.m2_origenes_leer(p_actor_id,p_vivero_id,p_recoleccion_id,p_pagina,p_limite,p_incluir_pendientes);
  IF p_incluir_requisitos_inicio IS NOT TRUE THEN RETURN pagina; END IF;

  -- El monto se extrae del JSONB de PostgreSQL antes de serializarlo hacia JS.
  -- Enriquecer solo la página autorizada conserva cursor, orden y total.
  SELECT coalesce(jsonb_agg(f.item||jsonb_build_object(
    'saldo_actual_exacto',trim_scale(s.saldo)::text,
    'motivo_no_inicio',public.m2_origen_motivo_no_inicio(r,f.item->>'estado_habilitacion',s.saldo)
  ) ORDER BY f.posicion),'[]'::jsonb) INTO filas
  FROM jsonb_array_elements(pagina->'data') WITH ORDINALITY f(item,posicion)
  CROSS JOIN LATERAL (SELECT (f.item->>'saldo_actual')::numeric saldo) s
  LEFT JOIN public.recoleccion r ON r.id=(f.item->>'recoleccion_id')::bigint
    AND r.vivero_id=p_vivero_id AND r.eliminado_en IS NULL;
  RETURN jsonb_set(pagina,'{data}',filas);
END $$;

REVOKE ALL ON FUNCTION public.m2_origen_motivo_no_inicio(public.recoleccion,text,numeric),
  public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r(rol)
    CROSS JOIN (VALUES('public.m2_origen_motivo_no_inicio(public.recoleccion,text,numeric)'::regprocedure),
      ('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean,boolean)'::regprocedure)) f(firma)
    WHERE has_function_privilege(r.rol,f.firma,'EXECUTE')) THEN
    RAISE EXCEPTION 'VIVERO_REQUISITOS_INICIO_PRIVILEGIO_INESPERADO';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
