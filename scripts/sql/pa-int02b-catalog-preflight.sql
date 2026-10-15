-- PA-T-INT02-B / BE01: catálogo de SOLO LECTURA, sin RPC ni filas personales.
-- Identificar primero proyecto/entorno por un canal independiente; postgres como
-- nombre de base no identifica el proyecto Supabase. Conservar salida sin claves.
-- Relaciones propuestas ausentes se informan: este archivo no instala B.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_database() AS base, current_user AS rol_consulta,
       current_setting('server_version') AS postgres_version,
       current_setting('server_version_num') AS postgres_version_num,
       current_setting('TimeZone') AS zona_horaria,
       current_setting('transaction_read_only') AS solo_lectura,
       current_timestamp AS observado_en;

WITH esperadas(nombre) AS (VALUES
  ('usuario'), ('usuario_credencial'), ('organizacion'), ('campania'),
  ('campania_organizacion'), ('subcampania'), ('subcampania_equipo'),
  ('subcampania_historial'), ('subcampania_meta_especie'),
  ('registro_plantacion'), ('registro_plantacion_detalle'),
  ('registro_plantacion_coresponsable'), ('evento_plantacion'),
  ('asignacion_vivero_subcampania'), ('evidencias_trazabilidad'),
  ('subcampania_permiso_revision'), ('subcampania_permiso'),
  ('participacion_comando'), ('participacion_carga'),
  ('participacion_carga_generacion'), ('usuario_autoridad_historial')
)
SELECT nombre, to_regclass('public.' || nombre) IS NOT NULL AS existe
FROM esperadas ORDER BY nombre;

-- Registro de migraciones: presencia y columnas; no asumir que migraciones
-- locales == SQL aplicado ni consultar una tabla inexistente.
SELECT n.nspname AS esquema, c.relname AS registro_migraciones,
       a.attname AS columna, format_type(a.atttypid, a.atttypmod) AS tipo
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE (n.nspname = 'supabase_migrations' AND c.relname = 'schema_migrations')
   OR (n.nspname = 'public' AND c.relname IN ('schema_migrations', 'migrations'))
ORDER BY n.nspname, c.relname, a.attnum;

SELECT c.relname AS relacion, a.attnum AS orden, a.attname AS columna,
       format_type(a.atttypid, a.atttypmod) AS tipo,
       a.attnotnull AS obligatorio, a.attidentity AS identidad,
       a.attgenerated AS generada, pg_get_expr(d.adbin, d.adrelid) AS defecto,
       a.attacl::text AS acl_columna
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
WHERE n.nspname = 'public' AND c.relname IN (
  'usuario','usuario_credencial','organizacion','campania','campania_organizacion',
  'subcampania','subcampania_equipo','subcampania_historial','subcampania_meta_especie',
  'registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable',
  'evento_plantacion','asignacion_vivero_subcampania','evidencias_trazabilidad',
  'subcampania_permiso_revision','subcampania_permiso','participacion_comando',
  'participacion_carga','participacion_carga_generacion','usuario_autoridad_historial'
) ORDER BY c.relname, a.attnum;

SELECT t.typname AS tipo_enum, e.enumlabel AS valor, e.enumsortorder AS orden
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder;

SELECT c.relname AS relacion, con.conname AS restriccion, con.contype AS clase,
       con.convalidated AS validada, pg_get_constraintdef(con.oid) AS definicion
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'usuario','organizacion','subcampania','subcampania_equipo','subcampania_historial',
  'subcampania_meta_especie','registro_plantacion','registro_plantacion_detalle',
  'registro_plantacion_coresponsable','evento_plantacion','asignacion_vivero_subcampania',
  'subcampania_permiso_revision','subcampania_permiso','participacion_comando',
  'participacion_carga','participacion_carga_generacion','usuario_autoridad_historial'
) ORDER BY c.relname, con.conname;

SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN (
  'usuario','subcampania','subcampania_equipo','subcampania_historial',
  'subcampania_meta_especie','registro_plantacion','registro_plantacion_coresponsable',
  'evento_plantacion','asignacion_vivero_subcampania','subcampania_permiso_revision',
  'subcampania_permiso','participacion_comando','participacion_carga',
  'participacion_carga_generacion','usuario_autoridad_historial'
) ORDER BY tablename, indexname;

-- La definicion del indice no basta: verificar validez/listo y predicado real.
SELECT tabla.relname AS tabla, indice.relname AS indice, i.indisunique,
       i.indisvalid, i.indisready, pg_get_expr(i.indpred,i.indrelid) AS predicado
FROM pg_index i JOIN pg_class tabla ON tabla.oid=i.indrelid
JOIN pg_class indice ON indice.oid=i.indexrelid
JOIN pg_namespace n ON n.oid=tabla.relnamespace
WHERE n.nspname='public' AND tabla.relname IN ('participacion_comando',
  'subcampania_permiso','subcampania_permiso_revision','subcampania_historial','subcampania')
ORDER BY tabla.relname,indice.relname;

SELECT n.nspname AS esquema, c.relname, c.relkind,
       c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forzada,
       pg_get_userbyid(c.relowner) AS propietario, c.relacl::text AS acl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE (n.nspname = 'public' AND c.relname IN (
  'usuario','usuario_credencial','organizacion','subcampania','subcampania_equipo',
  'subcampania_historial','registro_plantacion','evento_plantacion',
  'asignacion_vivero_subcampania','subcampania_permiso_revision','subcampania_permiso',
  'participacion_comando','participacion_carga','participacion_carga_generacion',
  'usuario_autoridad_historial'
)) OR (n.nspname = 'storage' AND c.relname IN ('objects','buckets'))
ORDER BY n.nspname, c.relname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE (schemaname = 'public' AND tablename IN (
  'usuario','usuario_credencial','organizacion','subcampania','subcampania_equipo',
  'subcampania_historial','registro_plantacion','evento_plantacion',
  'asignacion_vivero_subcampania','subcampania_permiso_revision','subcampania_permiso',
  'participacion_comando','participacion_carga','participacion_carga_generacion',
  'usuario_autoridad_historial'
)) OR (schemaname = 'storage' AND tablename IN ('objects','buckets'))
ORDER BY schemaname, tablename, policyname;

-- Privilegios efectivos incluyen herencia; RLS habilitada por sí sola no basta.
SELECT r.rolname, c.relname, p.privilegio,
       has_table_privilege(r.oid, c.oid, p.privilegio) AS concedido
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
                   ('REFERENCES'),('TRIGGER')) AS p(privilegio)
WHERE r.rolname IN ('anon','authenticated','service_role')
  AND n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
  AND c.relname IN (
    'usuario','usuario_credencial','organizacion','subcampania_historial',
    'subcampania_permiso_revision','subcampania_permiso','participacion_comando',
    'participacion_carga','participacion_carga_generacion','usuario_autoridad_historial'
  ) ORDER BY r.rolname, c.relname, p.privilegio;

SELECT r.rolname, c.relname, a.attname AS columna,
       has_column_privilege(r.oid,c.oid,a.attnum,'SELECT') AS puede_leer,
       has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') AS puede_insertar,
       has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE') AS puede_actualizar,
       has_column_privilege(r.oid,c.oid,a.attnum,'REFERENCES') AS puede_referenciar
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE r.rolname IN ('anon','authenticated','service_role')
  AND n.nspname = 'public' AND c.relname IN (
    'usuario','usuario_credencial','subcampania_historial','subcampania_permiso_revision',
    'subcampania_permiso','participacion_comando','participacion_carga',
    'participacion_carga_generacion','usuario_autoridad_historial'
  ) ORDER BY r.rolname, c.relname, a.attnum;

SELECT rolname, rolsuper, rolinherit, rolbypassrls, rolconfig
FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator');
SELECT miembro.rolname AS miembro, concedido.rolname AS hereda_rol
FROM pg_auth_members m JOIN pg_roles miembro ON miembro.oid = m.member
JOIN pg_roles concedido ON concedido.oid = m.roleid
WHERE miembro.rolname IN ('anon','authenticated','service_role','authenticator')
ORDER BY miembro.rolname, concedido.rolname;

-- Todas las sobrecargas consumidoras; no devuelve cuerpos ni ejecuta funciones.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid) AS retorno, p.prosecdef AS security_definer,
       p.proacl::text AS acl, p.proconfig AS configuracion,
       md5(p.prosrc) AS huella_cuerpo,
       EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_ejecuta,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
         THEN has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_ejecuta,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
         THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_ejecuta,
       CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role')
         THEN has_function_privilege('service_role',p.oid,'EXECUTE') END AS service_role_ejecuta
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND (
  p.proname ~* '(participacion|subcampania|plantacion|vivero|pa_)'
  OR p.prosrc ~* '(subcampania_permiso|participacion_comando|subcampania_equipo|subcampania_historial)'
) ORDER BY p.proname, argumentos;

SELECT c.relname, t.tgname, t.tgisinternal, t.tgenabled, pg_get_triggerdef(t.oid) AS definicion,
       p.proname AS funcion, md5(p.prosrc) AS huella_funcion
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public' AND c.relname IN (
  'usuario','subcampania','subcampania_historial','subcampania_permiso_revision',
  'subcampania_permiso','participacion_comando'
) ORDER BY c.relname, t.tgname;

-- ACL/privilegios efectivos de las secuencias dependientes de estas tablas.
SELECT DISTINCT tabla.relname AS tabla, secuencia.relname AS secuencia,
       secuencia.relacl::text AS acl, rol.rolname,
       has_sequence_privilege(rol.oid,secuencia.oid,'USAGE') AS uso,
       has_sequence_privilege(rol.oid,secuencia.oid,'SELECT') AS lectura,
       has_sequence_privilege(rol.oid,secuencia.oid,'UPDATE') AS actualizacion
FROM pg_depend d JOIN pg_class secuencia ON secuencia.oid=d.objid AND secuencia.relkind='S'
JOIN pg_class tabla ON tabla.oid=d.refobjid
JOIN pg_namespace n ON n.oid=tabla.relnamespace CROSS JOIN pg_roles rol
WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
  AND d.deptype IN ('a','i') AND n.nspname='public'
  AND tabla.relname IN ('participacion_comando','subcampania_permiso',
    'subcampania_permiso_revision','subcampania_historial','subcampania')
  AND rol.rolname IN ('anon','authenticated','service_role')
ORDER BY tabla.relname,secuencia.relname,rol.rolname;

SELECT rol.rolname, c.relname,
       has_any_column_privilege(rol.oid,c.oid,'REFERENCES') AS referencias,
       has_table_privilege(rol.oid,c.oid,'TRIGGER') AS trigger,
       CASE WHEN current_setting('server_version_num')::integer>=170000
         THEN has_table_privilege(rol.oid,c.oid,'MAINTAIN') ELSE NULL END AS maintain,
       has_any_column_privilege(rol.oid,c.oid,'INSERT') AS insercion,
       has_any_column_privilege(rol.oid,c.oid,'UPDATE') AS actualizacion
FROM pg_roles rol CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('participacion_comando','subcampania_permiso',
  'subcampania_permiso_revision','subcampania_historial','subcampania')
  AND rol.rolname IN ('anon','authenticated','service_role')
ORDER BY rol.rolname,c.relname;

-- Vistas equivalentes: dependencias y seguridad, sin definición/cuerpos de filas.
SELECT DISTINCT v.relname AS vista, v.reloptions AS opciones,
       pg_get_userbyid(v.relowner) AS propietario, v.relacl::text AS acl,
       origen.relname AS relacion_referenciada
FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid
JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind IN ('v','m')
JOIN pg_namespace nv ON nv.oid = v.relnamespace
JOIN pg_class origen ON origen.oid = d.refobjid
JOIN pg_namespace no ON no.oid = origen.relnamespace
WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass
  AND nv.nspname = 'public' AND no.nspname = 'public'
  AND origen.relname IN ('usuario','subcampania_historial','subcampania_permiso',
                        'subcampania_permiso_revision','participacion_comando')
ORDER BY v.relname, origen.relname;

-- Solo agregados. Fallar si faltan relaciones base es evidencia de incompatibilidad.
SELECT rol::text AS rol_global, activo, count(*) AS cuentas
FROM public.usuario GROUP BY rol, activo ORDER BY rol::text, activo;
SELECT count(*) FILTER (WHERE auth_id IS NULL OR btrim(auth_id) = '') AS identidades_ausentes,
       count(*) FILTER (WHERE revision_autoridad < 0) AS revisiones_invalidas
FROM public.usuario;
SELECT count(*) AS grupos_auth_id_duplicados FROM (
  SELECT auth_id FROM public.usuario WHERE NULLIF(btrim(auth_id),'') IS NOT NULL
  GROUP BY auth_id HAVING count(*) > 1
) d;
SELECT estado::text AS estado, count(*) AS ambitos
FROM public.subcampania GROUP BY estado ORDER BY estado::text;
SELECT e.rol::text AS rol_equipo, u.rol::text AS rol_global, u.activo,
       s.estado::text AS estado_ambito, count(*) AS integrantes
FROM public.subcampania_equipo e JOIN public.usuario u ON u.id = e.usuario_id
JOIN public.subcampania s ON s.id = e.subcampania_id
GROUP BY e.rol, u.rol, u.activo, s.estado ORDER BY 1,2,3,4;
SELECT tipo_historial::text AS evento, count(*) AS eventos
FROM public.subcampania_historial GROUP BY tipo_historial ORDER BY tipo_historial::text;

ROLLBACK;
