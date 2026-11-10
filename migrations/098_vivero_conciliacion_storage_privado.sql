-- Storage de conciliación. Cierre dedicado previo al alta del bucket por API.
-- Las filas de storage.buckets/objects se administran exclusivamente por API.
-- Fuentes: https://supabase.com/docs/guides/storage/security/access-control
--          https://supabase.com/docs/guides/storage/schema/design
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE tabla text; rol record; c record;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'CONCILIACION_STORAGE_CATALOGO_INCOMPATIBLE: requiere Storage real';
  END IF;
  FOREACH tabla IN ARRAY ARRAY['buckets','objects'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('storage.'||tabla)::regclass
      AND relkind='r' AND relrowsecurity) THEN
      RAISE EXCEPTION 'CONCILIACION_STORAGE_CATALOGO_INCOMPATIBLE: %.RLS',tabla;
    END IF;
  END LOOP;
  FOR c IN SELECT * FROM (VALUES
    ('buckets','id','text'),('buckets','name','text'),('buckets','public','boolean'),
    ('buckets','file_size_limit','bigint'),('buckets','allowed_mime_types','text[]'),
    ('objects','bucket_id','text')
  ) e(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('storage.'||c.tabla)::regclass
      AND attname=c.columna AND atttypid=c.tipo::regtype AND NOT attisdropped) THEN
      RAISE EXCEPTION 'CONCILIACION_STORAGE_CATALOGO_INCOMPATIBLE: %.%',c.tabla,c.columna;
    END IF;
  END LOOP;
  FOR rol IN SELECT e.nombre,r.oid,r.rolsuper,r.rolbypassrls FROM (VALUES('anon'),('authenticated')) e(nombre)
    LEFT JOIN pg_roles r ON r.rolname=e.nombre LOOP
    IF rol.oid IS NULL OR rol.rolsuper OR rol.rolbypassrls
      OR EXISTS(SELECT 1 FROM pg_roles elevado WHERE (elevado.rolsuper OR elevado.rolbypassrls)
        AND pg_has_role(rol.oid,elevado.oid,'MEMBER'))
      OR EXISTS(SELECT 1 FROM pg_class t WHERE t.oid IN ('storage.buckets'::regclass,'storage.objects'::regclass)
        AND pg_has_role(rol.oid,t.relowner,'MEMBER')) THEN
      RAISE EXCEPTION 'CONCILIACION_STORAGE_ROL_INCOMPATIBLE: %',rol.nombre;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'CONCILIACION_STORAGE_ROL_INCOMPATIBLE: service_role requiere BYPASSRLS';
  END IF;
  IF NOT has_schema_privilege('service_role','storage','USAGE') THEN
    RAISE EXCEPTION 'CONCILIACION_STORAGE_SERVICIO_SIN_PRIVILEGIO: storage.USAGE';
  END IF;
  FOREACH tabla IN ARRAY ARRAY['buckets','objects'] LOOP
    IF EXISTS(SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p(privilegio)
      WHERE NOT has_table_privilege('service_role',('storage.'||tabla)::regclass,p.privilegio)) THEN
      RAISE EXCEPTION 'CONCILIACION_STORAGE_SERVICIO_SIN_PRIVILEGIO: %',tabla;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM (VALUES
    ('public.fn_recoleccion_acotar_excepcion_fecha_rechazo()','326fcd23396c03ad3a9cae33afc327fe6fbf063eca41b66d5d97e530a9712959',true),
    ('public.m1_recepcion_proteger_movimiento()','1f66c8ec8e4b5e6206e2cd9219dbaccccdc0207551df7930aac85df0b1acfcbc',true),
    ('public.m2_conciliacion_acreditada(public.recoleccion,public.recoleccion_conciliacion_evento)','78824817089f6b5ed358da1b6f6aebae6d8fe44b3b820eef3ae20a59fca775e0',false)
  ) e(firma,sha256,definer) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.firma)
    WHERE p.oid IS NULL OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM e.sha256
      OR p.prosecdef IS DISTINCT FROM e.definer) THEN
    RAISE EXCEPTION 'CONCILIACION_STORAGE_CATALOGO_INCOMPATIBLE: cotejar 097';
  END IF;
END $$;

LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE b record; formatos text[]:=ARRAY['image/heic','image/heif','image/jpeg','image/png','image/webp'];
BEGIN
  SELECT * INTO b FROM storage.buckets WHERE id='r3foresta-conciliacion';
  IF FOUND AND (b.name IS DISTINCT FROM 'r3foresta-conciliacion' OR b.public IS DISTINCT FROM false
    OR b.file_size_limit IS DISTINCT FROM 15728640::bigint
    OR (SELECT array_agg(DISTINCT m ORDER BY m) FROM unnest(b.allowed_mime_types) m) IS DISTINCT FROM formatos
    OR coalesce(to_jsonb(b)->>'type','STANDARD')<>'STANDARD') THEN
    RAISE EXCEPTION 'CONCILIACION_STORAGE_BUCKET_INCOMPATIBLE: conservar y revisar configuración existente';
  END IF;
END $$;

-- El servidor canonicaliza expresiones con los mismos tipos. Sin filas de negocio.
CREATE TEMP TABLE pg_temp._r3_098_politica_referencia(id text,bucket_id text) ON COMMIT DROP;
ALTER TABLE pg_temp._r3_098_politica_referencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY buckets ON pg_temp._r3_098_politica_referencia AS RESTRICTIVE FOR ALL TO PUBLIC
  USING(id<>'r3foresta-conciliacion') WITH CHECK(id<>'r3foresta-conciliacion');
CREATE POLICY objects ON pg_temp._r3_098_politica_referencia AS RESTRICTIVE FOR ALL TO PUBLIC
  USING(bucket_id<>'r3foresta-conciliacion') WITH CHECK(bucket_id<>'r3foresta-conciliacion');
DO $$
DECLARE tabla text; columna text; esperado record; actual record; fase integer;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['buckets','objects'] LOOP
    columna:=CASE WHEN tabla='buckets' THEN 'id' ELSE 'bucket_id' END;
    SELECT polcmd,polroles,polpermissive,pg_get_expr(polqual,polrelid) condicion,
      pg_get_expr(polwithcheck,polrelid) comprobacion INTO STRICT esperado
      FROM pg_policy WHERE polrelid='pg_temp._r3_098_politica_referencia'::regclass AND polname=tabla;
    FOR fase IN 1..2 LOOP
      SELECT polcmd,polroles,polpermissive,pg_get_expr(polqual,polrelid) condicion,
        pg_get_expr(polwithcheck,polrelid) comprobacion INTO actual
        FROM pg_policy WHERE polrelid=('storage.'||tabla)::regclass AND polname='r3foresta_conciliacion_solo_servicio';
      IF FOUND THEN
        IF actual IS DISTINCT FROM esperado THEN
          RAISE EXCEPTION 'CONCILIACION_STORAGE_POLITICA_DRIFT: %',tabla;
        END IF;
      ELSIF fase=1 THEN
        EXECUTE format('CREATE POLICY r3foresta_conciliacion_solo_servicio ON storage.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (%I<>%L) WITH CHECK (%I<>%L)',
          tabla,columna,'r3foresta-conciliacion',columna,'r3foresta-conciliacion');
      ELSE
        RAISE EXCEPTION 'CONCILIACION_STORAGE_POLITICA_DRIFT: % ausente',tabla;
      END IF;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
