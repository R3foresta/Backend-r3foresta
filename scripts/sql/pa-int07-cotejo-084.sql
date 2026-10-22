-- PA-INT07-084-CATALOGO/1. Cotejo acotado y estrictamente de lectura.
-- Ejecutar solo en un destino identificado por un canal privado. Esta consulta
-- no acredita por sí misma proyecto, aplicación de SQL, datos, HTTP o despliegue.
-- No consulta filas, llama RPC, crea objetos ni enumera cuentas/membresías.
-- Incluye las cinco funciones084 y sus overloads; dos CHECK de comandos; ACL
-- efectivas PUBLIC/anon/authenticated/service_role de las tablas tocadas, todas
-- sus columnas y la secuencia de historia. PUBLIC es el pseudorol0.
-- No emite cuerpos ni valores de defaults/settings desconocidos: solo MD5.
-- MD5 es una huella de cotejo, no una firma de seguridad. No usa OID en la salida.
-- El JSON se puede guardar como esperado local y comparar con otro destino:
-- separar entorno.postgresql y owners si los operadores autorizados difieren.
-- Las ACL de registro_plantacion y participacion_comando incluyen antecedentes;
-- no son todos grants nuevos084. MAINTAIN solo se evalúa si PG>=17.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH
funciones_esperadas(nombre,firma,prosrc_md5) AS (VALUES
 ('pa_correccion_ejecutar','public.pa_correccion_ejecutar(bigint,text,text,uuid,jsonb,text)','3719568bd548d9376dc5362aa20c2529'),
 ('pa_comando_recuperar','public.pa_comando_recuperar(bigint,text,text,uuid)','41923c052e2ad651f954e4770a7917b0'),
 ('pa_correccion_contexto_leer','public.pa_correccion_contexto_leer(bigint,text,bigint)','3e451420f51ecc0d1e0c3d1f52d7b7d8'),
 ('pa_correccion_historial_leer','public.pa_correccion_historial_leer(bigint,text,bigint,bigint,integer)','c6eeefaaf6f9231505c634efb481a53c'),
 ('pa_registro_detalle_propio_leer','public.pa_registro_detalle_propio_leer(bigint,text,bigint)','50b09f9f93cd7cbddd679395afcf937c')),
tablas_esperadas(nombre,alcance) AS (VALUES
 ('registro_plantacion','UPDATE_REVISION_REGISTRO; ACL_LEGADAS_TAMBIEN'),
 ('registro_plantacion_correccion','INSERT_HISTORIA_OBSERVACIONES'),
 ('registro_plantacion_efectivo','INSERT_OVERLAY_Y_UPDATE_OBSERVACIONES'),
 ('participacion_comando','DOS_CHECK_AMPLIADOS; ACL_LEGADAS_TAMBIEN')),
checks_esperados(nombre) AS (VALUES
 ('participacion_comando_operacion_ck'),('participacion_comando_resultado_tipo_ck')),
roles AS (
 SELECT s.nombre,r.oid,s.nombre='PUBLIC' OR r.oid IS NOT NULL existe
 FROM (VALUES('PUBLIC'),('anon'),('authenticated'),('service_role')) s(nombre)
 LEFT JOIN pg_roles r ON r.rolname=s.nombre),
funciones AS MATERIALIZED (
 SELECT p.*,l.lanname lenguaje,pg_get_userbyid(p.proowner) propietario,
   e.firma firma_esperada,e.prosrc_md5 prosrc_md5_esperado,
   p.oid=to_regprocedure(e.firma) firma_compatible
 FROM funciones_esperadas e JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.nombre
 JOIN pg_language l ON l.oid=p.prolang),
acl_funciones AS (
 SELECT f.oid,rol.nombre rol,rol.existe,
   CASE WHEN NOT rol.existe THEN NULL WHEN rol.nombre='PUBLIC' THEN EXISTS(
     SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
     ELSE has_function_privilege(rol.oid,f.oid,'EXECUTE') END execute
 FROM funciones f CROSS JOIN roles rol),
tablas AS (
 SELECT c.*,e.alcance FROM tablas_esperadas e JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=e.nombre),
privilegios_tabla(privilegio) AS (
 SELECT p FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
 WHERE p<>'MAINTAIN' OR current_setting('server_version_num')::integer>=170000),
acl_tablas AS (
 SELECT t.oid,rol.nombre rol,rol.existe,p.privilegio,
   CASE WHEN NOT rol.existe THEN NULL
     WHEN p.privilegio='MAINTAIN' AND current_setting('server_version_num')::integer<170000 THEN NULL
     WHEN rol.nombre='PUBLIC' THEN EXISTS(
       SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
       WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
     ELSE has_table_privilege(rol.oid,t.oid,p.privilegio) END concedido
 FROM tablas t CROSS JOIN roles rol CROSS JOIN privilegios_tabla p),
columnas AS (
 SELECT a.*,t.relname,t.relowner,t.relacl FROM tablas t JOIN pg_attribute a ON a.attrelid=t.oid
 WHERE a.attnum>0 AND NOT a.attisdropped),
acl_columnas AS (
 SELECT c.attrelid,c.attnum,c.attname,rol.nombre rol,rol.existe,p.privilegio,
   CASE WHEN NOT rol.existe THEN NULL
     WHEN rol.nombre='PUBLIC' THEN EXISTS(
       SELECT 1 FROM aclexplode(c.attacl) a WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
       OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
         WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
     ELSE has_column_privilege(rol.oid,c.attrelid,c.attnum,p.privilegio) END concedido
 FROM columnas c CROSS JOIN roles rol
 CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilegio)),
columnas_por_rol AS (
 SELECT c.attrelid,c.attnum,c.attname,c.rol,
   jsonb_agg(c.privilegio ORDER BY c.privilegio) privilegios
 FROM acl_columnas c WHERE c.concedido GROUP BY c.attrelid,c.attnum,c.attname,c.rol),
secuencias AS (
 SELECT c.*,s.seqtypid,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_sequence s ON s.seqrelid=c.oid
 WHERE n.nspname='public' AND c.relname='registro_plantacion_correccion_id_seq' AND c.relkind='S'),
acl_secuencias AS (
 SELECT s.oid,rol.nombre rol,rol.existe,p.privilegio,
   CASE WHEN NOT rol.existe THEN NULL WHEN rol.nombre='PUBLIC' THEN EXISTS(
     SELECT 1 FROM aclexplode(coalesce(s.relacl,acldefault('S',s.relowner))) a
     WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
     ELSE has_sequence_privilege(rol.oid,s.oid,p.privilegio) END concedido
 FROM secuencias s CROSS JOIN roles rol
 CROSS JOIN (VALUES('SELECT'),('UPDATE'),('USAGE')) p(privilegio)),
checks AS (
 SELECT c.* FROM checks_esperados e JOIN pg_constraint c ON c.conname=e.nombre
 WHERE c.conrelid=to_regclass('public.participacion_comando'))
SELECT jsonb_build_object(
 'contrato','PA-INT07-084-CATALOGO/1',
 'entorno',jsonb_build_object('postgresql',current_setting('server_version'),
   'solo_lectura',current_setting('transaction_read_only'),'aislamiento',current_setting('transaction_isolation'),
   'maintain_disponible',current_setting('server_version_num')::integer>=170000),
 'faltantes',jsonb_build_object(
   'roles',(SELECT coalesce(jsonb_agg(nombre ORDER BY nombre),'[]'::jsonb) FROM roles WHERE NOT existe),
   'funciones',(SELECT coalesce(jsonb_agg(e.firma ORDER BY e.firma),'[]'::jsonb) FROM funciones_esperadas e
     WHERE NOT EXISTS(SELECT 1 FROM funciones f WHERE f.firma_esperada=e.firma AND f.firma_compatible)),
   'tablas',(SELECT coalesce(jsonb_agg(e.nombre ORDER BY e.nombre),'[]'::jsonb) FROM tablas_esperadas e
     WHERE NOT EXISTS(SELECT 1 FROM tablas t WHERE t.relname=e.nombre)),
   'checks',(SELECT coalesce(jsonb_agg(e.nombre ORDER BY e.nombre),'[]'::jsonb) FROM checks_esperados e
     WHERE NOT EXISTS(SELECT 1 FROM checks c WHERE c.conname=e.nombre)),
   'secuencias',CASE WHEN EXISTS(SELECT 1 FROM secuencias) THEN '[]'::jsonb
     ELSE '["public.registro_plantacion_correccion_id_seq"]'::jsonb END),
 'funciones',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'nombre',f.proname,'argumentos_identidad',pg_get_function_identity_arguments(f.oid),
   'argumentos_nombres',f.proargnames,'argumentos_modos',f.proargmodes,
   'firma_esperada',f.firma_esperada,'firma_compatible',f.firma_compatible,
   'retorno',pg_get_function_result(f.oid),'propietario',f.propietario,
   'lenguaje',f.lenguaje,'security_definer',f.prosecdef,'volatilidad',f.provolatile,
   'parallel',f.proparallel,'estricta',f.proisstrict,'leakproof',f.proleakproof,'setof',f.proretset,
   'cuerpo_md5',md5(f.prosrc),'cuerpo_md5_esperado',f.prosrc_md5_esperado,
   'cuerpo_coincide',md5(f.prosrc)=f.prosrc_md5_esperado,
   'definicion_md5',CASE WHEN f.prokind IN('f','p') THEN md5(pg_get_functiondef(f.oid)) ELSE NULL END,
   'defaults_cantidad',f.pronargdefaults,'defaults_md5',md5(pg_get_expr(f.proargdefaults,0)),
   'defaults_conocidos',CASE WHEN f.pronargdefaults=0 THEN 'SIN_DEFAULTS'
     WHEN f.proname='pa_correccion_historial_leer' AND pg_get_expr(f.proargdefaults,0)='NULL::bigint, 20'
     THEN 'p_antes_id=NULL;p_limite=20' ELSE 'DEFAULTS_DIFERENTES' END,
   'settings',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',split_part(s,'=',1),
     'valor',CASE WHEN s IN('search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s')
       THEN substr(s,strpos(s,'=')+1) ELSE NULL END,'md5',md5(s)) ORDER BY s),'[]'::jsonb)
     FROM unnest(f.proconfig) s),
   'execute',(SELECT jsonb_agg(jsonb_build_object('rol',a.rol,'existe',a.existe,'concedido',a.execute)
     ORDER BY a.rol) FROM acl_funciones a WHERE a.oid=f.oid)
 ) ORDER BY f.proname,pg_get_function_identity_arguments(f.oid)),'[]'::jsonb) FROM funciones f),
 'checks_comando',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',c.conname,'tipo',c.contype,
   'validado',c.convalidated,'diferible',c.condeferrable,'inicialmente_diferido',c.condeferred,
   'sin_herencia',c.connoinherit,'definicion_md5',md5(pg_get_constraintdef(c.oid)),
   'expresion_md5',md5(pg_get_expr(c.conbin,c.conrelid))) ORDER BY c.conname),'[]'::jsonb) FROM checks c),
 'tablas',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',t.relname,'tipo',t.relkind,
   'alcance',t.alcance,'propietario',pg_get_userbyid(t.relowner),'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,
   'politicas',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',p.polname,'comando',p.polcmd,
     'permisiva',p.polpermissive,'roles_publicos',0=ANY(p.polroles),
     'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),
     'with_check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY p.polname),'[]'::jsonb)
     FROM pg_policy p WHERE p.polrelid=t.oid),
   'columnas',(SELECT jsonb_agg(jsonb_build_object('nombre',c.attname,'posicion',c.attnum,
     'tipo',format_type(c.atttypid,c.atttypmod),'nullable',NOT c.attnotnull,'identity',c.attidentity,
     'generada',c.attgenerated) ORDER BY c.attnum) FROM columnas c WHERE c.attrelid=t.oid),
   'privilegios_por_rol',(SELECT jsonb_agg(jsonb_build_object('rol',rol.nombre,'existe',rol.existe,
     'tabla_concedidos',(SELECT coalesce(jsonb_agg(a.privilegio ORDER BY a.privilegio),'[]'::jsonb)
       FROM acl_tablas a WHERE a.oid=t.oid AND a.rol=rol.nombre AND a.concedido),
     'columna_concedidos',(SELECT coalesce(jsonb_agg(jsonb_build_object('columna',a.attname,
       'privilegios',a.privilegios) ORDER BY a.attnum),'[]'::jsonb)
       FROM columnas_por_rol a WHERE a.attrelid=t.oid AND a.rol=rol.nombre)) ORDER BY rol.nombre) FROM roles rol)
 ) ORDER BY t.relname),'[]'::jsonb) FROM tablas t),
 'secuencias',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',s.relname,'propietario',pg_get_userbyid(s.relowner),
   'tipo',format_type(s.seqtypid,NULL),'incremento',s.seqincrement::text,'minimo',s.seqmin::text,
   'maximo',s.seqmax::text,'cache',s.seqcache::text,'ciclica',s.seqcycle,
   'ownership',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',n.nspname,'tabla',t.relname,
     'columna',a.attname,'tipo_dependencia',d.deptype) ORDER BY n.nspname,t.relname,a.attname),'[]'::jsonb)
     FROM pg_depend d JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace n ON n.oid=t.relnamespace
     JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
     WHERE d.classid='pg_class'::regclass AND d.objid=s.oid AND d.refclassid='pg_class'::regclass
       AND d.deptype IN('a','i')),
   'privilegios_efectivos',(SELECT jsonb_agg(jsonb_build_object('rol',a.rol,'existe',a.existe,
     'privilegio',a.privilegio,'concedido',a.concedido) ORDER BY a.rol,a.privilegio)
     FROM acl_secuencias a WHERE a.oid=s.oid)) ORDER BY s.relname),'[]'::jsonb) FROM secuencias s),
 'limites',jsonb_build_array(
   'Cotejo del catalogo acotado084; no consulta filas ni prueba HTTP, datos, saldos, concurrencia o despliegue.',
   'PUBLIC se calcula por ACL del pseudorol0; los otros tres roles incluyen privilegios efectivos y herencia.',
   'columna_concedidos incluye privilegios heredados de la tabla; array vacio significa ninguno si existe=true.',
   'No enumera membresias ni cuentas; propietarios se muestran solo para los objetos enumerados.',
   'MD5 sirve para cotejar fuentes/definiciones; no es firma de seguridad. Un overload adicional permanece visible.',
   'Limites de secuencia son texto BIGINT exacto; no se consulta last_value ni is_called.',
   'Defaults/settings desconocidos solo se identifican por huellas; este archivo no los ejecuta ni expone sus valores.')
) AS cotejo;

ROLLBACK;
