-- Ejecutar manualmente SOLO en el entorno remoto identificado, con credencial
-- de lectura del servidor. No muestra filas personales ni altera objetos.
BEGIN TRANSACTION READ ONLY;
SELECT current_database() AS base, current_user AS rol_consulta, current_setting('TimeZone') AS zona,
       current_setting('server_encoding') AS codificacion;
SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS tipo,
       a.attnotnull AS obligatorio, pg_get_expr(d.adbin,d.adrelid) AS defecto, a.attacl::text AS acl_columna
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname='public' AND c.relname IN ('usuario','organizacion')
ORDER BY c.relname,a.attnum;
SELECT c.relname, con.conname, con.contype, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
WHERE c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)
ORDER BY c.relname,con.conname;
SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('usuario','organizacion') ORDER BY tablename,indexname;
SELECT relname,relrowsecurity,relforcerowsecurity,relacl::text AS acl
FROM pg_class WHERE oid IN ('public.usuario'::regclass,'public.organizacion'::regclass);
SELECT r.rolname, c.relname, a.attname,
       has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS puede_leer,
       has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS puede_insertar,
       has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS puede_actualizar
FROM pg_roles r CROSS JOIN pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
WHERE r.rolname IN ('anon','authenticated','service_role')
  AND c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY r.rolname,c.relname,a.attnum;
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('usuario','organizacion');
SELECT rol::text, count(*) AS cuentas FROM public.usuario GROUP BY rol ORDER BY rol;
SELECT count(*) AS auth_id_nulos_o_vacios FROM public.usuario
WHERE auth_id IS NULL OR btrim(auth_id)='';
SELECT count(*) AS auth_id_duplicados FROM
  (SELECT auth_id FROM public.usuario GROUP BY auth_id HAVING count(*)>1) x;
SELECT count(*) AS nombres_no_identificables FROM public.usuario
WHERE NULLIF(btrim(nombre),'') IS NULL AND NULLIF(btrim(username),'') IS NULL;
SELECT count(*) AS afiliaciones_textuales_largas FROM public.usuario
WHERE length(organizacion)>150;
SELECT count(*) AS organizaciones_inactivas FROM public.organizacion WHERE activo=false;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef, p.proacl::text AS acl, md5(p.prosrc) AS huella,
       p.proconfig AS configuracion
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname ~* '(usuario|organizacion|pa_perfil|pa_actor)' OR p.prosrc ~* '(usuario|organizacion)')
ORDER BY p.proname,argumentos;
SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definicion,
       p.proname AS funcion, md5(p.prosrc) AS huella_funcion
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
WHERE c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)
ORDER BY c.relname,t.tgname;
ROLLBACK;
