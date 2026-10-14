-- Solo lectura; ejecutar en el proyecto de DESARROLLO confirmado.
BEGIN READ ONLY;
WITH RECURSIVE vistas AS (
 SELECT DISTINCT c.oid FROM pg_class c JOIN pg_rewrite rw ON rw.ev_class=c.oid
 JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass
 WHERE c.relkind IN ('v','m') AND d.refobjid IN ('public.usuario'::regclass,'public.usuario_credencial'::regclass)
 UNION
 SELECT c.oid FROM pg_class c JOIN pg_rewrite rw ON rw.ev_class=c.oid
 JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass
 JOIN vistas v ON v.oid=d.refobjid WHERE c.relkind IN ('v','m')
)
SELECT jsonb_build_object(
 'servidor',current_setting('server_version'), 'base',current_database(),
 'cuentas',(SELECT count(*) FROM public.usuario),
 'roles_cuentas',(SELECT jsonb_object_agg(rol,n) FROM (SELECT rol::text,count(*) n FROM public.usuario GROUP BY rol) r),
 'tablas',(SELECT jsonb_agg(jsonb_build_object('tabla',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl::text)) FROM pg_class c WHERE c.oid IN ('public.usuario'::regclass,'public.usuario_credencial'::regclass,'public.organizacion'::regclass)),
 'permisos',(SELECT jsonb_agg(jsonb_build_object('rol',r.rolname,'tabla',t.tabla,'select',has_any_column_privilege(r.oid,t.tabla,'SELECT'),'insert',has_any_column_privilege(r.oid,t.tabla,'INSERT'),'update',has_any_column_privilege(r.oid,t.tabla,'UPDATE'),'delete',has_table_privilege(r.oid,t.tabla,'DELETE'))) FROM pg_roles r CROSS JOIN (VALUES ('public.usuario'),('public.usuario_credencial'),('public.organizacion')) t(tabla) WHERE r.rolname IN ('anon','authenticated','service_role')),
 'vistas_usuario',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',c.oid::regclass::text,'definicion',pg_get_viewdef(c.oid,true),'acl',c.relacl::text)),'[]') FROM pg_class c JOIN vistas v ON v.oid=c.oid),
 'funciones_consumidoras',(SELECT coalesce(jsonb_agg(jsonb_build_object('firma',p.oid::regprocedure::text,'definer',p.prosecdef,'config',p.proconfig,'md5',md5(p.prosrc),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.proname),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.prosrc ~* '\m(usuario|usuario_credencial|organizacion)\M'),
 'politicas',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM pg_policies p WHERE schemaname='public' AND tablename IN ('usuario','usuario_credencial','organizacion')),
 'config_roles',(SELECT jsonb_agg(jsonb_build_object('rol',rolname,'bypassrls',rolbypassrls,'config',rolconfig)) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator')),
 'config_base_roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('rol',coalesce(r.rolname,'ALL'),'base',coalesce(d.datname,'ALL'),'config',s.setconfig)),'[]') FROM pg_db_role_setting s LEFT JOIN pg_roles r ON r.oid=s.setrole LEFT JOIN pg_database d ON d.oid=s.setdatabase WHERE r.rolname IN ('anon','authenticated','service_role','authenticator') OR s.setrole=0)
) AS privacidad_preflight;
ROLLBACK;
