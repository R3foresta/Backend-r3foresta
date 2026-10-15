-- PA-T-INT02-B: resultado compacto antes/despues, SOLO LECTURA.
-- No sustituye catalog-preflight completo ni identifica por si solo el proyecto.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH relaciones AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relacl,c.relowner
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('participacion_comando',
  'subcampania_permiso_revision','subcampania_permiso','subcampania_historial')
), funciones AS (
 SELECT p.oid,p.proname,p.prosecdef,p.proconfig,p.prosrc
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('pa_inicializar_participacion_legada',
  'pa_permiso_revision_proteger','pa_permiso_vigencia_proteger',
  'pa_participacion_marca_proteger','pa_participacion_comando_proteger',
  'fn_subcampania_historial_prevent_mutation')
)
SELECT jsonb_pretty(jsonb_build_object(
 'observado_en',current_timestamp,'base',current_database(),'rol_consulta',current_user,
 'postgres_version',current_setting('server_version'),'solo_lectura',current_setting('transaction_read_only'),
 'relaciones',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',relname,'rls',relrowsecurity,
   'acl',relacl::text) ORDER BY relname) FROM relaciones),'[]'::jsonb),
 'restricciones',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',r.relname,'nombre',c.conname,
   'validada',c.convalidated,'definicion',pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname)
   FROM relaciones r JOIN pg_constraint c ON c.conrelid=r.oid),'[]'::jsonb),
 'privilegios',coalesce((SELECT jsonb_agg(jsonb_build_object('rol',rol.rolname,'tabla',r.relname,
   'select',has_any_column_privilege(rol.oid,r.oid,'SELECT'),
   'insert',has_any_column_privilege(rol.oid,r.oid,'INSERT'),
   'update',has_any_column_privilege(rol.oid,r.oid,'UPDATE'),
   'delete',has_table_privilege(rol.oid,r.oid,'DELETE'),
   'truncate',has_table_privilege(rol.oid,r.oid,'TRUNCATE')) ORDER BY rol.rolname,r.relname)
   FROM relaciones r CROSS JOIN pg_roles rol WHERE rol.rolname IN ('anon','authenticated','service_role')),'[]'::jsonb),
 'funciones',coalesce((SELECT jsonb_agg(jsonb_build_object('firma',f.oid::regprocedure::text,
   'security_definer',f.prosecdef,'configuracion',f.proconfig,'huella',md5(f.prosrc),
   'anon_ejecuta',has_function_privilege('anon',f.oid,'EXECUTE'),
   'authenticated_ejecuta',has_function_privilege('authenticated',f.oid,'EXECUTE'),
   'service_role_ejecuta',has_function_privilege('service_role',f.oid,'EXECUTE')) ORDER BY f.oid::regprocedure::text)
   FROM funciones f),'[]'::jsonb),
 'marca_inicializacion',coalesce((SELECT jsonb_agg(jsonb_build_object('columna',attname,
   'tipo',format_type(atttypid,atttypmod))) FROM pg_attribute
   WHERE attrelid='public.subcampania'::regclass AND NOT attisdropped
     AND attname IN ('participacion_inicializada_en','participacion_inicializada_por')),'[]'::jsonb),
 'roles_cuentas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY rol,activo)
   FROM (SELECT rol::text AS rol,activo,count(*) AS cuentas FROM public.usuario GROUP BY rol,activo) x),
 'legado',jsonb_build_object('usuarios',(SELECT count(*) FROM public.usuario),
   'equipo',(SELECT count(*) FROM public.subcampania_equipo),
   'hechos',(SELECT count(*) FROM public.registro_plantacion),
   'historial',(SELECT count(*) FROM public.subcampania_historial))
)) AS estado_int02b;
ROLLBACK;
