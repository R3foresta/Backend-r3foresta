-- PA-T-INT02-C: cotejo completo SOLO LECTURA después de 072/073.
-- Ejecutar en el proyecto desarrollo identificado; current_database no prueba ref.
-- Salida sin nombres/correos/auth_id/IDs/comandos/motivos reales: sólo catálogo,
-- huellas de funciones y agregados. No inicia transición ni ejecuta RPC de dominio.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
WITH relaciones AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('participacion_comando',
  'subcampania_permiso_revision','subcampania_permiso','subcampania_historial',
  'usuario_autoridad_historial')
), funciones AS (
 SELECT p.oid,p.proname,p.prosecdef,p.proconfig,p.prosrc,p.proacl,p.provolatile
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (left(p.proname,5)='pa_c_' OR p.proname IN (
  'pa_acceso_ejecutar','pa_autoridad_ejecutar','pa_autoridad_leer','pa_comando_recuperar',
  'pa_lecturas_actor','pa_lecturas_ambitos_validar','pa_capacidades_leer',
  'pa_miembros_participacion_leer','pa_personas_buscar','pa_accesos_revisar'))
), secuencias AS (
 SELECT DISTINCT c.oid,c.relname FROM relaciones r
 JOIN pg_attribute a ON a.attrelid=r.oid AND a.attname='id' AND NOT a.attisdropped
 JOIN pg_class c ON c.oid=pg_get_serial_sequence('public.'||r.relname,'id')::regclass
), roles_api AS (
 SELECT oid,rolname,rolbypassrls,rolconfig FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')
)
SELECT jsonb_pretty(jsonb_build_object(
 'observado_en',to_char(current_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'base',current_database(),'rol_consulta',current_user,
 'postgres_version',current_setting('server_version'),
 'solo_lectura',current_setting('transaction_read_only'),
 'locale',jsonb_build_object('server_encoding',current_setting('server_encoding'),
   'lc_ctype',current_setting('lc_ctype'),'lc_collate',current_setting('lc_collate'),
   'normalizacion_unicode_correcta',lower(normalize('ÁÉÑ',NFC))='áéñ'),
 'roles_api',coalesce((SELECT jsonb_agg(jsonb_build_object('rol',rolname,
   'bypass_rls',rolbypassrls,'configuracion',rolconfig) ORDER BY rolname) FROM roles_api),'[]'::jsonb),
 'relaciones',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',relname,
   'rls',relrowsecurity,'rls_forzado',relforcerowsecurity,'acl',relacl::text) ORDER BY relname)
   FROM relaciones),'[]'::jsonb),
 'columnas',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',r.relname,'columna',a.attname,
   'tipo',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,
   'generated',a.attgenerated) ORDER BY r.relname,a.attnum)
   FROM relaciones r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb),
 'restricciones',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',r.relname,'nombre',c.conname,
   'validada',c.convalidated,'definicion',pg_get_constraintdef(c.oid)) ORDER BY r.relname,c.conname)
   FROM relaciones r JOIN pg_constraint c ON c.conrelid=r.oid),'[]'::jsonb),
 'privilegios',coalesce((SELECT jsonb_agg(jsonb_build_object('rol',rol.rolname,'tabla',r.relname,
   'select',has_any_column_privilege(rol.oid,r.oid,'SELECT'),
   'insert',has_any_column_privilege(rol.oid,r.oid,'INSERT'),
   'update',has_any_column_privilege(rol.oid,r.oid,'UPDATE'),
   'references',has_any_column_privilege(rol.oid,r.oid,'REFERENCES'),
   'delete',has_table_privilege(rol.oid,r.oid,'DELETE'),
   'truncate',has_table_privilege(rol.oid,r.oid,'TRUNCATE'),
   'trigger',has_table_privilege(rol.oid,r.oid,'TRIGGER')) ORDER BY rol.rolname,r.relname)
   FROM relaciones r CROSS JOIN roles_api rol),'[]'::jsonb),
 'funciones',coalesce((SELECT jsonb_agg(jsonb_build_object('firma',f.oid::regprocedure::text,
   'security_definer',f.prosecdef,'configuracion',f.proconfig,'volatilidad',f.provolatile,
   'md5_cuerpo',md5(f.prosrc),'md5_definicion',md5(pg_get_functiondef(f.oid)),'acl',f.proacl::text,
   'anon_ejecuta',has_function_privilege('anon',f.oid,'EXECUTE'),
   'authenticated_ejecuta',has_function_privilege('authenticated',f.oid,'EXECUTE'),
   'service_role_ejecuta',has_function_privilege('service_role',f.oid,'EXECUTE')) ORDER BY f.oid::regprocedure::text)
   FROM funciones f),'[]'::jsonb),
 'politicas',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',r.relname,'nombre',p.polname,
   'comando',p.polcmd,'permisiva',p.polpermissive,
   'public_o_api_publica',0::oid=ANY(p.polroles) OR EXISTS(SELECT 1 FROM roles_api rol
      WHERE rol.rolname IN ('anon','authenticated') AND rol.oid=ANY(p.polroles)),
   'md5_using',md5(pg_get_expr(p.polqual,p.polrelid)),
   'md5_check',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY r.relname,p.polname)
   FROM relaciones r JOIN pg_policy p ON p.polrelid=r.oid),'[]'::jsonb),
 'secuencias',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',s.relname,'rol',rol.rolname,
   'usage',has_sequence_privilege(rol.oid,s.oid,'USAGE'),
   'select',has_sequence_privilege(rol.oid,s.oid,'SELECT'),
   'update',has_sequence_privilege(rol.oid,s.oid,'UPDATE')) ORDER BY s.relname,rol.rolname)
   FROM secuencias s CROSS JOIN roles_api rol),'[]'::jsonb),
 'indices',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',c.relname,'nombre',i.relname,
   'unico',x.indisunique,'valido',x.indisvalid,'listo',x.indisready,
   'definicion',pg_get_indexdef(x.indexrelid)) ORDER BY c.relname,i.relname)
   FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid
   WHERE c.oid IN(SELECT oid FROM relaciones) OR c.oid='public.usuario'::regclass),'[]'::jsonb),
 'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',r.relname,'nombre',t.tgname,
   'habilitado',t.tgenabled,'funcion',t.tgfoid::regprocedure::text) ORDER BY r.relname,t.tgname)
   FROM relaciones r JOIN pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal),'[]'::jsonb),
 'vistas_publicas_dependientes',coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object(
   'vista',v.relname,'rol',rol.rolname))
   FROM pg_depend d JOIN pg_rewrite w ON w.oid=d.objid JOIN pg_class v ON v.oid=w.ev_class
   JOIN relaciones r ON r.oid=d.refobjid CROSS JOIN roles_api rol
   WHERE d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
     AND v.relkind IN ('v','m') AND rol.rolname IN ('anon','authenticated')
     AND has_any_column_privilege(rol.oid,v.oid,'SELECT')),'[]'::jsonb),
 'agregados',jsonb_build_object(
   'usuarios',(SELECT count(*) FROM public.usuario),
   'administradores_globales_activos',(SELECT count(*) FROM public.usuario WHERE activo AND rol::text='ADMIN'),
   'roles_cuentas',(SELECT jsonb_agg(to_jsonb(x) ORDER BY rol,activo)
      FROM (SELECT rol::text rol,activo,count(*) cuentas FROM public.usuario GROUP BY rol,activo) x),
   'permisos',(SELECT count(*) FROM public.subcampania_permiso),
   'permisos_vigentes',(SELECT count(*) FROM public.subcampania_permiso WHERE revocado_en IS NULL),
   'administradores_contextuales_efectivos',(SELECT count(*) FROM public.subcampania_permiso p
      JOIN public.usuario u ON u.id=p.usuario_id WHERE p.revocado_en IS NULL
        AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' AND u.activo),
   'ambitos_inicializados',(SELECT count(*) FROM public.subcampania WHERE participacion_inicializada_en IS NOT NULL),
   'ambitos_inicializados_sin_administrador_efectivo',(SELECT count(*) FROM public.subcampania s
      WHERE s.participacion_inicializada_en IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.subcampania_permiso p
         JOIN public.usuario u ON u.id=p.usuario_id WHERE p.subcampania_id=s.id
           AND p.revocado_en IS NULL AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' AND u.activo)),
   'revisiones_permiso',(SELECT count(*) FROM public.subcampania_permiso_revision),
   'historial_subcampania',(SELECT count(*) FROM public.subcampania_historial),
   'historial_autoridad',(SELECT count(*) FROM public.usuario_autoridad_historial),
   'comandos_por_estado',(SELECT coalesce(jsonb_object_agg(estado,total),'{}'::jsonb)
      FROM (SELECT estado,count(*) total FROM public.participacion_comando GROUP BY estado) x),
   'grupos_correo_normalizado_duplicado',(SELECT count(*) FROM (
      SELECT lower(btrim(correo)) FROM public.usuario WHERE activo AND NULLIF(btrim(correo),'') IS NOT NULL
      GROUP BY lower(btrim(correo)) HAVING count(*)>1) x)
 ),
 'limites',jsonb_build_array('Estado posterior; no certifica conservación real antes/después.',
   'No ejecuta comandos ni verifica datos/RPC por persona real.',
   'Cotejar md5_cuerpo por firma con fuentes locales; REST sólo acredita superficie y errores tempranos.',
   'INT03-A/INT02-D siguen sus pruebas y entregas específicas.')
)) AS estado_int02c;
ROLLBACK;
