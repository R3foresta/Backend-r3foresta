-- PA-S01. Avance inicial efectivo por especie en el contexto v1.
-- Requiere el ledger INT07 de 082; no altera originales ni saldos.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
  IF to_regprocedure('public.pa_registro_contexto_leer(bigint,text,bigint)') IS NULL
    OR to_regclass('public.registro_plantacion_consumo_credito') IS NULL
    OR to_regclass('public.registro_plantacion_consumo_compensacion') IS NULL
    OR to_regclass('public.registro_plantacion_detalle') IS NULL THEN
    RAISE EXCEPTION 'PA_CONTEXTO_REQUIERE_075_082';
  END IF;
END $$;

-- pa_r_ambito_leer retiene FOR SHARE sobre la subcampaña. Los escritores de
-- plan, registro y corrección bloquean esa misma fila antes de sus efectos.
-- La única SELECT de especies observa plan, stock y ledger en un snapshot.
CREATE OR REPLACE FUNCTION public.pa_registro_contexto_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_subcampania_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v public.subcampania%ROWTYPE; v_hoy DATE;
  v_especies JSONB; v_saldo BIGINT; v_avance_invalido BOOLEAN;
BEGIN
  PERFORM set_config('TimeZone','America/La_Paz',true);
  v_hoy:=(transaction_timestamp() AT TIME ZONE 'America/La_Paz')::date;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  v:=public.pa_r_ambito_leer(p_actor_id,v_rol,p_subcampania_id);
  IF v.poligono_geom IS NULL OR ST_IsEmpty(v.poligono_geom) OR NOT ST_IsValid(v.poligono_geom)
    OR NOT EXISTS(SELECT 1 FROM public.subcampania_meta_especie WHERE subcampania_id=v.id)
    OR EXISTS(SELECT 1 FROM public.asignacion_vivero_subcampania a
      WHERE a.subcampania_id=v.id AND a.estado::text='ACTIVA' AND a.proposito::text='PLANTACION_INICIAL'
        AND a.saldo_asignado_disponible>0 AND a.fecha_entrega_operativa IS NULL) THEN
    PERFORM public.pa_r_error(422,'CONTEXTO_INCOMPLETO','El plan, polígono o día de entrega requiere conciliación.');
  END IF;
  SELECT jsonb_agg(jsonb_build_object('planta_id',m.planta_id::text,
    'nombre',coalesce(nullif(p.especie,''),p.nombre_cientifico),
    'porcentaje_objetivo',m.porcentaje_objetivo,'cantidad_objetivo',m.cantidad_objetivo,
    'saldo_elegible',coalesce(x.saldo,0),
    'plantado_inicial',coalesce(y.plantado,0),
    'pendiente_meta',greatest(0,m.cantidad_objetivo-coalesce(y.plantado,0))) ORDER BY m.planta_id),
    coalesce(sum(x.saldo),0),coalesce(bool_or(y.plantado<0 OR y.plantado>2147483647),false)
    INTO v_especies,v_saldo,v_avance_invalido
  FROM public.subcampania_meta_especie m JOIN public.planta p ON p.id=m.planta_id
  LEFT JOIN LATERAL(SELECT sum(a.saldo_asignado_disponible) saldo
    FROM public.asignacion_vivero_subcampania a JOIN public.lote_vivero l ON l.id=a.lote_vivero_id
    WHERE a.subcampania_id=v.id AND l.planta_id=m.planta_id AND a.estado::text='ACTIVA'
      AND a.proposito::text='PLANTACION_INICIAL' AND a.saldo_asignado_disponible>0
      AND a.fecha_entrega_operativa<=v_hoy) x ON true
  LEFT JOIN LATERAL(SELECT sum(linea.cantidad) plantado FROM (
    SELECT d.planta_id,d.cantidad::bigint cantidad
      FROM public.registro_plantacion r JOIN public.registro_plantacion_detalle d ON d.registro_plantacion_id=r.id
      WHERE r.subcampania_id=v.id AND NOT r.es_reposicion AND d.planta_id=m.planta_id
    UNION ALL
    SELECT cr.planta_id,cr.cantidad::bigint
      FROM public.registro_plantacion r JOIN public.registro_plantacion_consumo_credito cr ON cr.registro_plantacion_id=r.id
      WHERE r.subcampania_id=v.id AND NOT r.es_reposicion AND cr.correccion_id IS NOT NULL AND cr.planta_id=m.planta_id
    UNION ALL
    SELECT cr.planta_id,-co.cantidad::bigint
      FROM public.registro_plantacion r JOIN public.registro_plantacion_consumo_credito cr ON cr.registro_plantacion_id=r.id
      JOIN public.registro_plantacion_consumo_compensacion co ON co.credito_id=cr.id
      WHERE r.subcampania_id=v.id AND NOT r.es_reposicion AND cr.planta_id=m.planta_id
  ) linea) y ON true
  WHERE m.subcampania_id=v.id;
  IF v_avance_invalido THEN
    PERFORM public.pa_r_error(422,'CONTEXTO_INCOMPLETO','El avance efectivo requiere conciliación.');
  END IF;
  RETURN jsonb_build_object('data',jsonb_build_object(
    'subcampania',jsonb_build_object('id',v.id::text,'campania_id',v.campania_id::text,
      'nombre',v.nombre,'campania_nombre',(SELECT nombre FROM public.campania WHERE id=v.campania_id),
      'estado','ACTIVA','plan_revision',v.plan_revision::text,'meta_total_arboles',v.meta_total_arboles,
      'poligono',ST_AsGeoJSON(v.poligono_geom)::jsonb),
    'actor',jsonb_build_object('usuario_id',p_actor_id::text,'fuente_autoridad',CASE WHEN v_rol='ADMIN' THEN 'GLOBAL' ELSE 'CONTEXTUAL' END),
    'disponibilidad',CASE WHEN v_saldo>0 THEN 'DISPONIBLE' ELSE 'SIN_STOCK' END,'especies',v_especies,
    'reglas',jsonb_build_object('hoy_operativo',v_hoy::text,'fecha_minima_ventana',(v_hoy-10)::text,
      'fecha_maxima',v_hoy::text,'zona_horaria','America/La_Paz','ventana_retroactiva_dias',10,
      'fotos_min',1,'fotos_max',10,'exterior_permitido',true)),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

REVOKE ALL ON FUNCTION public.pa_registro_contexto_leer(BIGINT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_registro_contexto_leer(BIGINT,TEXT,BIGINT) TO service_role;
COMMIT;
