-- Lectura privada del equipo para PLANTADOR vigente en su propia subcampaña.
-- No amplía la política GESTIONAR ni las escrituras de acceso.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION public.pa_miembros_participacion_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_subcampania_id BIGINT,p_despues_id BIGINT,p_limite INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_rol TEXT; v_rows JSONB; v_nombre TEXT;
BEGIN
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 101 OR p_despues_id<=0 OR p_subcampania_id IS NULL OR p_subcampania_id<=0 THEN
    RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"La entrada no cumple el contrato v1.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  v_rol:=public.pa_lecturas_actor(p_actor_id,p_auth_id);
  -- Esta lectura admite al plantador vigente del ámbito; gestionar accesos
  -- sigue bajo la política GESTIONAR usada por búsqueda, revisión y comandos.
  PERFORM 1 FROM public.subcampania s
    JOIN public.campania c ON c.id=s.campania_id
    WHERE s.id=p_subcampania_id AND s.deleted_at IS NULL AND c.deleted_at IS NULL
      AND (v_rol='ADMIN' OR EXISTS(
        SELECT 1 FROM public.subcampania_permiso p
          WHERE p.subcampania_id=s.id AND p.usuario_id=p_actor_id
            AND p.revocado_en IS NULL
            AND p.rol_contextual IN('PLANTADOR','ADMINISTRADOR_SUBCAMPANIA')))
    FOR SHARE OF s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='PT403', DETAIL='{"codigo":"CAPACIDAD_INSUFICIENTE","mensaje":"No tiene capacidad para esta operación.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}';
  END IF;
  IF p_despues_id IS NOT NULL THEN
    SELECT lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)) INTO v_nombre
      FROM public.usuario u WHERE u.id=p_despues_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ENTRADA_INVALIDA' USING ERRCODE='PT422', DETAIL='{"codigo":"ENTRADA_INVALIDA","mensaje":"El cursor no es válido.","campos":[],"ambitos":[],"reintento":"NO_APLICA"}'; END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(q.fila ORDER BY q.nombre_orden,q.id),'[]'::jsonb) INTO v_rows FROM (
    SELECT u.id,lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)) nombre_orden,
      jsonb_build_object('usuario_id',u.id::text,'nombre',COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),
        'organizacion',CASE WHEN u.organizacion_id IS NOT NULL THEN o.nombre ELSE NULLIF(btrim(u.organizacion),'') END,
        'permiso_contextual',p.rol_contextual,'revision_permiso',COALESCE(r.revision,0)::text,
        'acceso_global',u.activo AND u.rol::text='ADMIN','etiqueta_acceso_global',CASE WHEN u.activo AND u.rol::text='ADMIN' THEN 'Administrador · Acceso global' ELSE NULL END,
        'responsabilidad_logistica',e.rol::text) fila
    FROM public.usuario u LEFT JOIN public.organizacion o ON o.id=u.organizacion_id
    LEFT JOIN public.subcampania_permiso p ON p.usuario_id=u.id AND p.subcampania_id=p_subcampania_id AND p.revocado_en IS NULL
    LEFT JOIN public.subcampania_permiso_revision r ON r.usuario_id=u.id AND r.subcampania_id=p_subcampania_id
    LEFT JOIN public.subcampania_equipo e ON e.usuario_id=u.id AND e.subcampania_id=p_subcampania_id
    WHERE ((u.activo AND u.rol::text='ADMIN') OR p.id IS NOT NULL OR e.id IS NOT NULL)
      AND (p_despues_id IS NULL OR (lower(normalize(COALESCE(NULLIF(btrim(u.nombre),''),btrim(u.username)),NFC)),u.id)>(v_nombre,p_despues_id))
    ORDER BY nombre_orden,u.id LIMIT p_limite
  ) q;
  RETURN jsonb_build_object('data',v_rows,'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $$;

-- La firma existente conserva el privilegio; reafirmar la frontera privada.
REVOKE ALL ON FUNCTION public.pa_miembros_participacion_leer(BIGINT,TEXT,BIGINT,BIGINT,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_miembros_participacion_leer(BIGINT,TEXT,BIGINT,BIGINT,INTEGER) TO service_role;
COMMIT;
