-- Diagnóstico POST-aplicación de 064, exclusivamente de solo lectura.
-- Un único resultado JSON evita copiar solo la última pestaña del SQL Editor.
-- No ejecuta RPC ni devuelve usuarios, contactos, credenciales o claves.
-- La base/usuario SQL no identifican por sí solos el proyecto o entorno Supabase.
-- Huellas: texto exacto de la 064 revisada localmente; una diferencia también
-- puede deberse a formato. Cotejar firmas, argumentos y definición antes de corregir.
BEGIN TRANSACTION READ ONLY;
WITH esperadas(firma,huella,argumentos) AS (VALUES
  ('public.pa_actor_verificar(text)','4e4af36d3def92498409a9898ed3e2b2',ARRAY['p_auth_id']),
  ('public.pa_perfil_leer(bigint,text)','1d5ab3d5389835854e0478cb312b2f1f',ARRAY['p_usuario_id','p_auth_id']),
  ('public.pa_perfil_actualizar(bigint,text,boolean,text,boolean,text,boolean,bigint,text,jsonb)','2044ea02a7e84398b5849ed67d8131a5',ARRAY['p_usuario_id','p_auth_id','p_cambiar_nombre','p_nombre','p_cambiar_apellido','p_apellido','p_cambiar_afiliacion','p_organizacion_id','p_organizacion_otra','p_datos_historicos']),
  ('public.pa_organizaciones_seleccionables(bigint,text,text,bigint,integer)','7b6440db49e68a029373d0ddced53301',ARRAY['p_usuario_id','p_auth_id','p_consulta','p_despues_id','p_limite','organizacion_id','nombre']),
  ('public.pa_perfil_foto_actualizar(bigint,text,text)','46ae1f8d8a59932daa9afeaf807a86a9',ARRAY['p_usuario_id','p_auth_id','p_foto_url'])
)
SELECT jsonb_build_object(
  'sesion_sql', jsonb_build_object(
    'base',current_database(),'rol',current_user,'servidor',current_setting('server_version'),
    'codificacion',current_setting('server_encoding'),'zona',current_setting('TimeZone'),
    'statement_timeout_sql_editor',current_setting('statement_timeout'),
    'observado_en',current_timestamp),
  'columnas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tabla',c.relname,'columna',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),
    'not_null',a.attnotnull,'defecto',pg_get_expr(d.adbin,d.adrelid),'acl_columna',a.attacl::text
    ) ORDER BY c.relname,a.attnum),'[]'::jsonb)
    FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)
      AND a.attnum>0 AND NOT a.attisdropped),
  'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tabla',c.relname,'nombre',k.conname,'validada',k.convalidated,
    'definicion',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname),'[]'::jsonb)
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
    WHERE c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)),
  'indices', (SELECT coalesce(jsonb_agg(jsonb_build_object('tabla',tablename,'nombre',indexname,'definicion',indexdef)
    ORDER BY tablename,indexname),'[]'::jsonb) FROM pg_indexes
    WHERE schemaname='public' AND tablename IN ('usuario','organizacion')),
  'tablas_rls_acl', (SELECT jsonb_agg(jsonb_build_object(
    'tabla',relname,'rls',relrowsecurity,'rls_forzada',relforcerowsecurity,'acl',relacl::text) ORDER BY relname)
    FROM pg_class WHERE oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)),
  'privilegios_tabla', (SELECT jsonb_agg(jsonb_build_object(
    'rol',r.rolname,'tabla',c.relname,
    'select',has_any_column_privilege(r.oid,c.oid,'SELECT'),
    'insert',has_any_column_privilege(r.oid,c.oid,'INSERT'),
    'update',has_any_column_privilege(r.oid,c.oid,'UPDATE'),
    'delete',has_table_privilege(r.oid,c.oid,'DELETE'),
    'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),
    'references',has_any_column_privilege(r.oid,c.oid,'REFERENCES'),
    'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),
    'maintain',CASE WHEN current_setting('server_version_num')::integer>=170000
      THEN has_table_privilege(r.oid,c.oid,'MAINTAIN') ELSE NULL END
    ) ORDER BY r.rolname,c.relname) FROM pg_roles r CROSS JOIN pg_class c
    WHERE r.rolname IN ('anon','authenticated','service_role')
      AND c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)),
  'privilegios_efectivos', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'rol',r.rolname,'tabla',c.relname,'columna',a.attname,
    'select',has_column_privilege(r.oid,c.oid,a.attnum,'SELECT'),
    'insert',has_column_privilege(r.oid,c.oid,a.attnum,'INSERT'),
    'update',has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE'))
    ORDER BY r.rolname,c.relname,a.attnum),'[]'::jsonb)
    FROM pg_roles r CROSS JOIN pg_class c JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE r.rolname IN ('anon','authenticated','service_role')
      AND c.oid IN ('public.usuario'::regclass,'public.organizacion'::regclass)
      AND a.attnum>0 AND NOT a.attisdropped),
  'rpc_esperadas', (SELECT jsonb_agg(jsonb_build_object(
    'firma',e.firma,'existe',p.oid IS NOT NULL,
    'argumentos_coinciden',p.proargnames=e.argumentos,
    'huella_textual_coincide',md5(p.prosrc)=e.huella) ORDER BY e.firma)
    FROM esperadas e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.firma)),
  'sobrecargas_actuales', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'firma',p.oid::regprocedure::text,'argumentos',p.proargnames,
    'retorno',pg_get_function_result(p.oid),'security_definer',p.prosecdef,
    'huella',md5(p.prosrc),'acl',p.proacl::text,'configuracion',p.proconfig,
    'anon_execute',CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN has_function_privilege('anon',p.oid,'EXECUTE') END,
    'authenticated_execute',CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END,
    'service_role_execute',CASE WHEN EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN has_function_privilege('service_role',p.oid,'EXECUTE') END
    ) ORDER BY p.proname,p.oid::regprocedure::text),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'pa_actor_verificar','pa_perfil_leer','pa_perfil_actualizar',
      'pa_organizaciones_seleccionables','pa_perfil_foto_actualizar')),
  'controles_datos', (SELECT jsonb_build_object(
    'cuentas',count(*),
    'auth_id_nulos_o_vacios',count(*) FILTER(WHERE auth_id IS NULL OR btrim(auth_id)=''),
    'nombres_no_identificables',count(*) FILTER(WHERE NULLIF(btrim(nombre),'') IS NULL AND NULLIF(btrim(username),'') IS NULL),
    'afiliaciones_textuales_largas',count(*) FILTER(WHERE length(organizacion)>150)) FROM public.usuario),
  'auth_id_duplicados', (SELECT count(*) FROM (SELECT auth_id FROM public.usuario GROUP BY auth_id HAVING count(*)>1) x),
  'roles', (SELECT jsonb_agg(jsonb_build_object('rol',rol,'cuentas',cuentas) ORDER BY rol)
    FROM (SELECT rol::text AS rol,count(*) AS cuentas FROM public.usuario GROUP BY rol) x)
) AS diagnostico;
ROLLBACK;
