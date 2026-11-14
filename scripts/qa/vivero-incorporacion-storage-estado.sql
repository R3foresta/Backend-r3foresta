-- Estado focal de Storage, antes/después de 104 y después del alta por API.
-- Solo lectura de catálogo y metadatos del bucket dedicado. Sin objetos ni usuarios.
-- Requiere el esquema real de Storage. Ejecutar íntegro y compartir la columna JSON.
BEGIN READ ONLY;
WITH
roles AS (
  SELECT e.nombre,r.oid,r.rolsuper,r.rolbypassrls,
    EXISTS(SELECT 1 FROM pg_roles elevado WHERE (elevado.rolsuper OR elevado.rolbypassrls)
      AND pg_has_role(r.oid,elevado.oid,'MEMBER')) puede_asumir_rol_elevado,
    EXISTS(SELECT 1 FROM pg_class t WHERE t.oid IN (to_regclass('storage.buckets'),to_regclass('storage.objects'))
      AND pg_has_role(r.oid,t.relowner,'MEMBER')) puede_asumir_propietario
  FROM (VALUES('anon'),('authenticated'),('service_role')) e(nombre)
  LEFT JOIN pg_roles r ON r.rolname=e.nombre
),
tablas AS (
  SELECT e.nombre,c.oid,c.relkind,c.relrowsecurity rls,c.relforcerowsecurity rls_forzada,
    has_schema_privilege('service_role','storage','USAGE') servicio_schema_usage,
    coalesce((SELECT bool_and(has_table_privilege('service_role',c.oid,p.privilegio))
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p(privilegio)),false) servicio_crud
  FROM (VALUES('buckets'),('objects')) e(nombre)
  LEFT JOIN pg_class c ON c.oid=to_regclass('storage.'||e.nombre)
),
politicas AS (
  SELECT e.nombre tabla,p.polname nombre,p.polcmd comando,p.polroles roles,p.polpermissive permisiva,
    pg_get_expr(p.polqual,p.polrelid) condicion,pg_get_expr(p.polwithcheck,p.polrelid) comprobacion,
    coalesce(p.polcmd='*' AND p.polroles=ARRAY[0::oid] AND NOT p.polpermissive
      AND pg_get_expr(p.polqual,p.polrelid)=format('(%I <> %L::text)',e.columna,'vivero_incorporaciones')
      AND pg_get_expr(p.polwithcheck,p.polrelid)=format('(%I <> %L::text)',e.columna,'vivero_incorporaciones'),false) coincide
  FROM (VALUES('buckets','id'),('objects','bucket_id')) e(nombre,columna)
  LEFT JOIN pg_policy p ON p.polrelid=to_regclass('storage.'||e.nombre)
    AND p.polname='vivero_incorporaciones_solo_servicio'
),
bucket AS (
  SELECT jsonb_build_object('id',b.id,'name',b.name,'public',b.public,'file_size_limit',b.file_size_limit,
      'allowed_mime_types',b.allowed_mime_types,'type',to_jsonb(b)->>'type') metadatos,
    b.name='vivero_incorporaciones' AND b.public=false AND b.file_size_limit=15728640::bigint
      AND (SELECT array_agg(DISTINCT m ORDER BY m) FROM unnest(b.allowed_mime_types) m)
        =ARRAY['image/heic','image/heif','image/jpeg','image/png','image/webp']::text[]
      AND coalesce(to_jsonb(b)->>'type','STANDARD')='STANDARD' compatible
  FROM storage.buckets b WHERE b.id='vivero_incorporaciones'
),
comprobaciones AS (
  SELECT 'storage_real_y_rls_activa' nombre,(SELECT bool_and(oid IS NOT NULL AND relkind='r' AND rls) FROM tablas) cumple
  UNION ALL SELECT 'roles_cliente_sin_bypass_ni_propiedad',(SELECT bool_and(oid IS NOT NULL AND NOT rolsuper
    AND NOT rolbypassrls AND NOT puede_asumir_rol_elevado AND NOT puede_asumir_propietario) FROM roles WHERE nombre<>'service_role')
  UNION ALL SELECT 'servicio_bypass_y_permisos',(SELECT coalesce(bool_and(oid IS NOT NULL AND rolbypassrls),false)
    FROM roles WHERE nombre='service_role') AND (SELECT bool_and(servicio_schema_usage AND servicio_crud) FROM tablas)
  UNION ALL SELECT 'politicas_dedicadas_exactas',(SELECT bool_and(coincide) FROM politicas)
  UNION ALL SELECT 'bucket_ausente_o_configuracion_compatible',NOT EXISTS(SELECT 1 FROM bucket WHERE compatible IS NOT TRUE)
)
SELECT jsonb_pretty(jsonb_build_object(
  'informe','ESTADO_STORAGE_INCORPORACION_104',
  'entorno',jsonb_build_object('postgresql',current_setting('server_version'),
    'hora_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'transaccion_solo_lectura',current_setting('transaction_read_only')),
  'alcance','Cierre dedicado de políticas y metadatos. El bucket se administra por API; no acredita carga de archivos ni piloto.',
  'comprobaciones',(SELECT jsonb_object_agg(nombre,cumple ORDER BY nombre) FROM comprobaciones),
  'roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY nombre) FROM roles r),
  'tablas',(SELECT jsonb_agg(to_jsonb(t)-'oid' ORDER BY nombre) FROM tablas t),
  'politicas_dedicadas',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tabla) FROM politicas p),
  'bucket_presente',EXISTS(SELECT 1 FROM bucket),
  'bucket',(SELECT metadatos FROM bucket)
)) AS estado_storage_incorporacion;
COMMIT;
