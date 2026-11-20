-- Evidencias M2 por evento. Provisionar vivero_evidencias mediante Storage API.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
  IF to_regprocedure('public.m2_evidencias_preparar(bigint,bigint,bigint,text,jsonb)') IS NULL
     OR to_regprocedure('public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'M2_STORAGE_ANTECEDENTE_INCOMPATIBLE: instalar 095';
  END IF;
  IF (SELECT count(*) FROM pg_class
       WHERE oid IN (to_regclass('storage.buckets'), to_regclass('storage.objects'))
         AND relkind = 'r' AND relrowsecurity) <> 2
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls)
     OR EXISTS (SELECT 1 FROM pg_roles r
        WHERE r.rolname IN ('anon', 'authenticated') AND (
          EXISTS (SELECT 1 FROM pg_roles elevado
                  WHERE (elevado.rolsuper OR elevado.rolbypassrls)
                    AND pg_has_role(r.oid, elevado.oid, 'MEMBER'))
          OR EXISTS (SELECT 1 FROM pg_class t
                     WHERE t.oid IN (to_regclass('storage.buckets'), to_regclass('storage.objects'))
                       AND pg_has_role(r.oid, t.relowner, 'MEMBER')))) THEN
    RAISE EXCEPTION 'M2_STORAGE_CATALOGO_INCOMPATIBLE: revisar RLS y roles de Storage';
  END IF;
END $$;

LOCK TABLE storage.buckets, storage.objects IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'vivero_evidencias' AND (
      b.name IS DISTINCT FROM 'vivero_evidencias' OR b.public IS DISTINCT FROM false
      OR b.file_size_limit IS DISTINCT FROM 15728640::bigint
      OR (SELECT array_agg(DISTINCT m ORDER BY m) FROM unnest(b.allowed_mime_types) m)
         IS DISTINCT FROM ARRAY['image/heic','image/heif','image/jpeg','image/png','image/webp']
      OR coalesce(to_jsonb(b)->>'type', 'STANDARD') <> 'STANDARD')) THEN
    RAISE EXCEPTION 'M2_STORAGE_BUCKET_INCOMPATIBLE: revisar configuración de vivero_evidencias';
  END IF;
END $$;

DROP POLICY IF EXISTS vivero_evidencias_solo_servicio ON storage.buckets;
CREATE POLICY vivero_evidencias_solo_servicio ON storage.buckets
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (id <> 'vivero_evidencias') WITH CHECK (id <> 'vivero_evidencias');

DROP POLICY IF EXISTS vivero_evidencias_solo_servicio ON storage.objects;
CREATE POLICY vivero_evidencias_solo_servicio ON storage.objects
  AS RESTRICTIVE FOR ALL TO PUBLIC
  USING (bucket_id <> 'vivero_evidencias') WITH CHECK (bucket_id <> 'vivero_evidencias');

CREATE OR REPLACE FUNCTION public.m2_evidencias_preparar(
  p_actor_id bigint, p_vivero_id bigint, p_lote_id bigint, p_evento text, p_fotos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET lock_timeout = '5s'
SET statement_timeout = '30s' AS $$
DECLARE f jsonb; tipo bigint; eid bigint; ids jsonb := '[]'; vivero bigint; ruta_patron text;
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_evento IS NULL OR p_evento NOT IN ('INICIO','EMBOLSADO','ADAPTABILIDAD','MERMA','DESPACHO','DESCARTE_PRE_EMBOLSADO')
    OR (p_evento='INICIO') IS DISTINCT FROM (p_lote_id IS NULL)
    OR jsonb_typeof(p_fotos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Contexto de evidencia inválido.' USING ERRCODE='22023'; END IF;
  IF p_lote_id IS NOT NULL THEN
    SELECT vivero_id INTO vivero FROM public.lote_vivero WHERE id=p_lote_id AND estado_lote='ACTIVO' FOR SHARE;
    IF NOT FOUND OR vivero IS DISTINCT FROM p_vivero_id THEN
      RAISE EXCEPTION 'Lote no disponible en el vivero.' USING ERRCODE='42501'; END IF;
  END IF;
  SELECT id INTO STRICT tipo FROM public.tipos_entidad_evidencia WHERE upper(codigo)='EVENTO_LOTE_VIVERO' AND activo;
  ruta_patron := '^eventos/' || lower(p_evento) || '/' || p_vivero_id || '/' || p_actor_id
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|heic|heif)$';
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF (f->>'bucket') IS DISTINCT FROM 'vivero_evidencias' OR coalesce(f->>'ruta_archivo','') !~ ruta_patron
      OR coalesce(f->>'mime_type','') NOT LIKE 'image/%' OR coalesce((f->>'tamano_bytes')::bigint,0)<=0 THEN
      RAISE EXCEPTION 'Foto inválida.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_por_usuario_id)
    VALUES(tipo,0,'vivero_evidencias',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',
      (f->>'tamano_bytes')::bigint,f->>'hash_sha256',f->>'titulo',f->>'descripcion',coalesce(f->'metadata','{}'::jsonb),
      false,jsonb_array_length(ids),(f->>'tomado_en')::timestamptz,p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.m2_evidencia_contexto(evidencia_id,vivero_id,lote_id,evento,actor_id)
      VALUES(eid,p_vivero_id,p_lote_id,p_evento,p_actor_id);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;

CREATE OR REPLACE FUNCTION public.m2_evidencias_exigir(
  p_ids bigint[], p_actor_id bigint, p_vivero_id bigint, p_lote_id bigint, p_evento text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
SET lock_timeout = '5s'
SET statement_timeout = '30s' AS $$
DECLARE eid bigint;
BEGIN
  -- Cuenta -> campaña/hija/asignación (si corresponde) -> lote/origen -> fotos ASC.
  FOR eid IN SELECT DISTINCT x FROM unnest(coalesce(p_ids,'{}'::bigint[])) x ORDER BY x LOOP
    PERFORM 1 FROM public.evidencias_trazabilidad e
      JOIN public.m2_evidencia_contexto c ON c.evidencia_id=e.id
      JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
      WHERE e.id=eid AND e.eliminado_en IS NULL AND coalesce(e.entidad_id,0)=0
        AND c.actor_id=p_actor_id AND e.creado_por_usuario_id=p_actor_id
        AND c.vivero_id=p_vivero_id AND c.lote_id IS NOT DISTINCT FROM p_lote_id AND c.evento=p_evento
        AND upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo
        AND e.bucket IN ('vivero_evidencias','recoleccion_fotos')
      FOR UPDATE OF e;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.m2_evidencias_preparar(bigint,bigint,bigint,text,jsonb),
  public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.m2_evidencias_preparar(bigint,bigint,bigint,text,jsonb) TO service_role;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['anon','authenticated']) rol
    CROSS JOIN unnest(ARRAY[
      'public.m2_evidencias_preparar(bigint,bigint,bigint,text,jsonb)',
      'public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)']) firma
    WHERE has_function_privilege(rol, firma, 'EXECUTE')
  ) OR has_function_privilege('service_role', 'public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'M2_STORAGE_PRIVILEGIOS_INCOMPATIBLES';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
