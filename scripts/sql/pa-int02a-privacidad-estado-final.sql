-- Solo lectura, sin filas personales. Estado después de 066/067.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'observado_en',clock_timestamp(), 'servidor',current_setting('server_version'),
 'cuentas',(SELECT count(*) FROM public.usuario),
 'roles_cuentas',(SELECT jsonb_object_agg(rol,n) FROM (SELECT rol::text,count(*) n FROM public.usuario GROUP BY rol) r),
 'privilegios',(SELECT jsonb_agg(jsonb_build_object('rol',r.rolname,'tabla',t.tabla,
   'select',has_any_column_privilege(r.oid,t.tabla,'SELECT'), 'insert',has_any_column_privilege(r.oid,t.tabla,'INSERT'),
   'update',has_any_column_privilege(r.oid,t.tabla,'UPDATE'), 'delete',has_table_privilege(r.oid,t.tabla,'DELETE'),
   'truncate',has_table_privilege(r.oid,t.tabla,'TRUNCATE'), 'references',has_any_column_privilege(r.oid,t.tabla,'REFERENCES'),
   'trigger',has_table_privilege(r.oid,t.tabla,'TRIGGER'),
   'maintain',CASE WHEN current_setting('server_version_num')::integer>=170000 THEN has_table_privilege(r.oid,t.tabla,'MAINTAIN') ELSE NULL END)
   ORDER BY r.rolname,t.tabla) FROM pg_roles r CROSS JOIN (VALUES('public.usuario'),('public.usuario_credencial'),('public.organizacion')) t(tabla)
   WHERE r.rolname IN ('anon','authenticated','service_role')),
 'config_service_role',(SELECT rolconfig FROM pg_roles WHERE rolname='service_role')
) AS privacidad_estado_final;
ROLLBACK;
