-- Diagnóstico de catálogo del manifiesto 083; no aplica revocaciones ni ejecuta RPC.
-- READ ONLY + REPEATABLE READ, sin filas de negocio, defaults, credenciales ni
-- cuerpos de funciones. La única definición completa solicitada es la proyección
-- de public.v_ubicacion_enriquecida; las demás definiciones se identifican por MD5.
-- Grants del inventario son revocaciones previstas, NO bloqueos de preflight.
-- Riesgos heredados se atribuyen por ACL + pg_has_role(USAGE), sin simular REVOKE.
-- La búsqueda de definers replica prosrc/patrón/nombres de 083: no prueba ausencia
-- de SQL dinámico u otros escritores. No instala ni altera 080/083, RLS o roles.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH RECURSIVE
inventario(nombre,clase,opcional,tipo) AS (VALUES
 ('asignacion_vivero_subcampania','PRIVADA',false,'TABLA'),('registro_plantacion','PRIVADA',false,'TABLA'),
 ('registro_plantacion_detalle','PRIVADA',false,'TABLA'),('registro_plantacion_coresponsable','PRIVADA',false,'TABLA'),
 ('evento_plantacion','PRIVADA',false,'TABLA'),('evidencias_trazabilidad','PRIVADA',false,'TABLA'),
 ('subcampania_equipo','PRIVADA',false,'TABLA'),('subcampania','PRIVADA',false,'TABLA'),
 ('lote_vivero','PRIVADA',false,'TABLA'),('evento_lote_vivero','PRIVADA',false,'TABLA'),
 ('subcampania_meta_especie','PRIVADA',false,'TABLA'),('v_lote_vivero_saldos','PRIVADA',true,'VISTA'),
 ('campania','SOLO_LECTURA',false,'TABLA'),('campania_organizacion','SOLO_LECTURA',false,'TABLA'),
 ('campania_estado','SOLO_LECTURA',false,'VISTA'),('planta','SOLO_LECTURA',false,'TABLA'),
 ('division_administrativa','SOLO_LECTURA',false,'TABLA'),('tipo_planta','SOLO_LECTURA',true,'TABLA'),
 ('comunidad','SOLO_LECTURA',true,'TABLA')),
roles AS (
 SELECT s.nombre,r.oid,s.nombre='PUBLIC' OR r.oid IS NOT NULL existe,r.rolinherit,r.rolsuper,r.rolbypassrls
 FROM (VALUES('PUBLIC'),('anon'),('authenticated'),('service_role')) s(nombre)
 LEFT JOIN pg_roles r ON r.rolname=s.nombre),
membresia(origen,nodo) AS (
 SELECT oid,oid FROM roles WHERE oid IS NOT NULL
 UNION SELECT p.origen,m.roleid FROM membresia p JOIN pg_auth_members m ON m.member=p.nodo),
descendientes(oid,raiz_oid,privada) AS (
 SELECT c.oid,c.oid,i.clase='PRIVADA' FROM inventario i JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=i.nombre
 UNION SELECT rw.ev_class,p.raiz_oid,p.privada FROM descendientes p JOIN pg_depend d
 ON d.refclassid='pg_class'::regclass AND d.refobjid=p.oid AND d.classid='pg_rewrite'::regclass
 JOIN pg_rewrite rw ON rw.oid=d.objid JOIN pg_class c ON c.oid=rw.ev_class AND c.relkind IN('v','m')),
vistas AS (
 SELECT c.oid,bool_or(d.privada) ancestro_privado,
 array_agg(DISTINCT nr.nspname||'.'||cr.relname ORDER BY nr.nspname||'.'||cr.relname) raices
 FROM descendientes d JOIN pg_class c ON c.oid=d.oid AND c.relkind IN('v','m')
 JOIN pg_class cr ON cr.oid=d.raiz_oid JOIN pg_namespace nr ON nr.oid=cr.relnamespace GROUP BY c.oid),
relaciones AS (
 SELECT c.*,n.nspname esquema,i.clase,i.opcional,i.tipo,v.ancestro_privado,v.raices,
 CASE WHEN i.tipo='TABLA' THEN c.relkind IN('r','p') WHEN i.tipo='VISTA' THEN c.relkind IN('v','m') END tipo_compatible
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN inventario i ON n.nspname='public' AND c.relname=i.nombre LEFT JOIN vistas v ON v.oid=c.oid
 WHERE i.nombre IS NOT NULL OR v.oid IS NOT NULL OR (n.nspname='public' AND c.relname='v_ubicacion_enriquecida')),
acl_tabla AS (
 SELECT r.oid,r.esquema,r.relname,r.clase,r.relowner,r.relacl IS NOT NULL explicita,a.* FROM relaciones r
 CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL ELSE coalesce(r.relacl,acldefault('r',r.relowner)) END) a),
acl_columna AS (
 SELECT r.oid,r.esquema,r.relname,r.clase,r.relowner,c.attnum,c.attname,a.* FROM relaciones r
 JOIN pg_attribute c ON c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped
 CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(c.attacl)=0 THEN NULL ELSE c.attacl END) a),
acl_tabla_json AS (
 SELECT oid,jsonb_agg(jsonb_build_object('grantee',CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END,
 'grantor',pg_get_userbyid(grantor),'privilegio',privilege_type,'grant_option',is_grantable) ORDER BY grantee,grantor,privilege_type) acl
 FROM acl_tabla WHERE explicita GROUP BY oid),
acl_columna_json AS (
 SELECT oid,jsonb_agg(jsonb_build_object('columna',attname,'grantee',CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END,
 'grantor',pg_get_userbyid(grantor),'privilegio',privilege_type,'grant_option',is_grantable) ORDER BY attnum,grantee,grantor,privilege_type) acl
 FROM acl_columna GROUP BY oid),
requisitos(nombre,privilegio) AS (
 SELECT nombre,'SELECT' FROM inventario
 UNION SELECT nombre,p FROM inventario CROSS JOIN unnest(ARRAY['INSERT','UPDATE']) p WHERE nombre IN
 ('planta','division_administrativa','tipo_planta','comunidad','asignacion_vivero_subcampania','registro_plantacion','evidencias_trazabilidad','subcampania','lote_vivero','campania')
 UNION SELECT 'campania_organizacion',p FROM unnest(ARRAY['INSERT','DELETE']) p
 UNION SELECT 'subcampania_meta_especie',p FROM unnest(ARRAY['INSERT','UPDATE','DELETE']) p
 UNION SELECT 'subcampania_equipo',p FROM unnest(ARRAY['INSERT','DELETE']) p
 UNION SELECT nombre,'INSERT' FROM inventario WHERE nombre IN('registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion','evento_lote_vivero')),
servicio AS (
 SELECT q.*,r.oid IS NOT NULL objeto_existe,rol.existe rol_existe,
 CASE WHEN rol.existe AND r.tipo_compatible THEN has_table_privilege(rol.oid,r.oid,q.privilegio) END concedido
 FROM requisitos q LEFT JOIN relaciones r ON r.esquema='public' AND r.relname=q.nombre
 CROSS JOIN roles rol WHERE rol.nombre='service_role'),
vista_privilegios AS (
 SELECT r.oid,rol.nombre rol,CASE WHEN rol.existe THEN has_any_column_privilege(rol.oid,r.oid,'SELECT') END "select",
 CASE WHEN rol.existe THEN has_any_column_privilege(rol.oid,r.oid,'INSERT') END "insert",
 CASE WHEN rol.existe THEN has_any_column_privilege(rol.oid,r.oid,'UPDATE') END "update",
 CASE WHEN rol.existe THEN has_table_privilege(rol.oid,r.oid,'DELETE') END "delete"
 FROM relaciones r CROSS JOIN roles rol WHERE r.relkind IN('v','m') AND rol.nombre<>'PUBLIC'),
funciones AS MATERIALIZED (
 SELECT p.*,n.nspname esquema,md5(CASE WHEN p.prokind IN('f','p') THEN pg_get_functiondef(p.oid) ELSE p.prosrc END) definicion_md5,
 p.prosecdef AND (p.prosrc ~* (SELECT '\m('||string_agg(nombre,'|' ORDER BY nombre)||'|usuario)\M' FROM inventario)
 OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania')) definer_alcance083
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND ((p.prosecdef AND p.prosrc ~* (SELECT '\m('||string_agg(nombre,'|' ORDER BY nombre)||'|usuario)\M' FROM inventario))
 OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania'))),
funcion_privilegios AS (
 SELECT f.oid,rol.nombre rol,CASE WHEN NOT rol.existe THEN NULL WHEN rol.nombre='PUBLIC' THEN EXISTS
 (SELECT 1 FROM aclexplode(CASE WHEN cardinality(f.proacl)=0 THEN NULL ELSE coalesce(f.proacl,acldefault('f',f.proowner)) END) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
 ELSE has_function_privilege(rol.oid,f.oid,'EXECUTE') END execute FROM funciones f CROSS JOIN roles rol),
previstas AS (
 SELECT a.esquema,a.relname objeto,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END rol,
 a.privilege_type privilegio,'TABLA' nivel,NULL::text[] columnas FROM acl_tabla a
 WHERE a.clase IS NOT NULL AND (a.clase='PRIVADA' OR a.privilege_type<>'SELECT')
 AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM roles WHERE nombre IN('anon','authenticated')))
 UNION ALL SELECT a.esquema,a.relname,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
 a.privilege_type,'COLUMNA',array_agg(DISTINCT a.attname ORDER BY a.attname) FROM acl_columna a
 WHERE a.clase IS NOT NULL AND (a.clase='PRIVADA' OR a.privilege_type<>'SELECT')
 AND (a.grantee=0 OR a.grantee IN(SELECT oid FROM roles WHERE nombre IN('anon','authenticated')))
 GROUP BY a.esquema,a.relname,a.grantee,a.privilege_type),
riesgos AS (
 SELECT DISTINCT a.esquema,a.relname objeto,rol.nombre rol,a.privilege_type privilegio,
 'TABLA' nivel,pg_get_userbyid(a.grantee) concedido_a FROM acl_tabla a CROSS JOIN roles rol
 WHERE a.clase IS NOT NULL AND (a.clase='PRIVADA' OR a.privilege_type<>'SELECT')
 AND rol.nombre IN('anon','authenticated') AND rol.existe
 AND CASE WHEN a.grantee=0 OR a.grantee IN(SELECT oid FROM roles WHERE nombre IN('anon','authenticated')) THEN false ELSE pg_has_role(rol.oid,a.grantee,'USAGE') END
 UNION SELECT DISTINCT a.esquema,a.relname,rol.nombre,a.privilege_type,'COLUMNA',pg_get_userbyid(a.grantee)
 FROM acl_columna a CROSS JOIN roles rol WHERE a.clase IS NOT NULL AND (a.clase='PRIVADA' OR a.privilege_type<>'SELECT')
 AND rol.nombre IN('anon','authenticated') AND rol.existe
 AND CASE WHEN a.grantee=0 OR a.grantee IN(SELECT oid FROM roles WHERE nombre IN('anon','authenticated')) THEN false ELSE pg_has_role(rol.oid,a.grantee,'USAGE') END),
bloqueos AS (
 SELECT 'PA_SUPERFICIE_COMPAT_ROLES_REQUERIDOS' codigo,NULL::text esquema,NULL::text objeto,nombre rol,NULL::text privilegio FROM roles WHERE nombre<>'PUBLIC' AND NOT existe
 UNION ALL SELECT 'PA_D_RELACION_REQUERIDA','public',i.nombre,NULL,NULL FROM inventario i WHERE NOT i.opcional AND NOT EXISTS(SELECT 1 FROM relaciones r WHERE r.esquema='public' AND r.relname=i.nombre)
 UNION ALL SELECT 'PA_SUPERFICIE_COMPAT_TIPO_INCOMPATIBLE',esquema,relname,NULL,NULL FROM relaciones WHERE tipo_compatible=false
 UNION ALL SELECT CASE WHEN privilegio='SELECT' THEN 'PA_D_SERVICE_SIN_SELECT' ELSE 'PA_D_SERVICE_SIN_PRIVILEGIO' END,'public',nombre,'service_role',privilegio FROM servicio WHERE objeto_existe AND rol_existe AND concedido=false
 UNION ALL SELECT 'PA_D_VISTA_PUBLICA_NO_AUTORIZADA',r.esquema,r.relname,p.rol,v.privilegio FROM relaciones r JOIN vista_privilegios p ON p.oid=r.oid
 CROSS JOIN LATERAL (VALUES('SELECT',p."select" AND r.ancestro_privado),('INSERT',p."insert"),('UPDATE',p."update"),('DELETE',p."delete")) v(privilegio,concedido)
 WHERE r.raices IS NOT NULL AND r.clase IS NULL AND p.rol IN('anon','authenticated') AND v.concedido
 UNION ALL SELECT 'PA_D_DEFINER_PUBLICO_NO_AUTORIZADO',f.esquema,f.proname||'('||pg_get_function_identity_arguments(f.oid)||')',p.rol,'EXECUTE' FROM funciones f JOIN funcion_privilegios p ON p.oid=f.oid WHERE f.definer_alcance083 AND p.rol IN('anon','authenticated') AND p.execute),
ubicacion_dependencias(oid) AS (
 SELECT oid FROM relaciones WHERE esquema='public' AND relname='v_ubicacion_enriquecida'
 UNION SELECT d.refobjid FROM ubicacion_dependencias p JOIN pg_rewrite rw ON rw.ev_class=p.oid JOIN pg_depend d
 ON d.classid='pg_rewrite'::regclass AND d.objid=rw.oid AND d.refclassid='pg_class'::regclass
 JOIN pg_class c ON c.oid=d.refobjid WHERE c.relkind IN('r','p','v','m','f'))
SELECT jsonb_build_object(
 'contrato','PA-SUPERFICIE-083-DIAGNOSTICO/1','alcance','PREFLIGHT_083_SIN_MUTAR',
 'entorno',jsonb_build_object('postgresql',current_setting('server_version'),'solo_lectura',current_setting('transaction_read_only'),'aislamiento',current_setting('transaction_isolation')),
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY nombre) FROM roles r),
 'objetos',(SELECT jsonb_agg(jsonb_build_object('nombre',i.nombre,'clase',i.clase,'opcional',i.opcional,'existe',r.oid IS NOT NULL,'tipo',r.relkind,'tipo_compatible',r.tipo_compatible,'owner',pg_get_userbyid(r.relowner)) ORDER BY i.nombre) FROM inventario i LEFT JOIN relaciones r ON r.esquema='public' AND r.relname=i.nombre),
 'requisitos_servicio',(SELECT jsonb_agg(to_jsonb(s) ORDER BY nombre,privilegio) FROM servicio s),
 'bloqueos_preflight',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY codigo,esquema,objeto,rol,privilegio),'[]'::jsonb) FROM bloqueos b),
 'riesgos_postflight_herencia',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY esquema,objeto,rol,privilegio,nivel,concedido_a),'[]'::jsonb) FROM riesgos r),
 'revocaciones_previstas',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY esquema,objeto,rol,privilegio,nivel),'[]'::jsonb) FROM previstas p),
 'membresias_relevantes',(SELECT coalesce(jsonb_agg(jsonb_build_object('origen',pg_get_userbyid(al.origen),'miembro',pg_get_userbyid(m.member),'rol',pg_get_userbyid(m.roleid),'admin_option',m.admin_option,'inherit_option',(to_jsonb(m)->>'inherit_option')::boolean,'set_option',(to_jsonb(m)->>'set_option')::boolean) ORDER BY al.origen,m.member,m.roleid),'[]'::jsonb) FROM membresia al JOIN pg_auth_members m ON m.member=al.nodo),
 'vistas_dependientes',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',r.esquema,'nombre',r.relname,'owner',pg_get_userbyid(r.relowner),'ancestro_privado',r.ancestro_privado,'raices',r.raices,'inventario083',r.clase IS NOT NULL,'definicion_md5',md5(pg_get_viewdef(r.oid,true)),
 'columnas',(SELECT jsonb_agg(jsonb_build_object('nombre',a.attname,'tipo',format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
 'privilegios_efectivos',(SELECT jsonb_agg(to_jsonb(p)-'oid' ORDER BY rol) FROM vista_privilegios p WHERE p.oid=r.oid),'acl_tabla_explicita',coalesce(t.acl,'[]'::jsonb),'acl_columna_explicita',coalesce(c.acl,'[]'::jsonb)) ORDER BY r.esquema,r.relname),'[]'::jsonb) FROM relaciones r LEFT JOIN acl_tabla_json t ON t.oid=r.oid LEFT JOIN acl_columna_json c ON c.oid=r.oid WHERE r.relkind IN('v','m') AND r.raices IS NOT NULL),
 'funciones_definer_y_codigos',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',f.esquema,'nombre',f.proname,'argumentos',pg_get_function_identity_arguments(f.oid),'owner',pg_get_userbyid(f.proowner),'security_definer',f.prosecdef,'definer_alcance083',f.definer_alcance083,'definicion_md5',f.definicion_md5,
 'execute',(SELECT jsonb_agg(to_jsonb(p)-'oid' ORDER BY rol) FROM funcion_privilegios p WHERE p.oid=f.oid)) ORDER BY f.proname,pg_get_function_identity_arguments(f.oid)),'[]'::jsonb) FROM funciones f),
 'v_ubicacion_enriquecida',coalesce((SELECT jsonb_build_object('existe',true,'tipo',r.relkind,'owner',pg_get_userbyid(r.relowner),'reloptions',r.reloptions,'ancestro_privado',r.ancestro_privado,'raices',r.raices,
 'definicion_sql',CASE WHEN r.relkind IN('v','m') THEN pg_get_viewdef(r.oid,true) END,
 'columnas',(SELECT jsonb_agg(jsonb_build_object('posicion',a.attnum,'nombre',a.attname,'tipo',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
 'dependencias_transitivas',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',n.nspname,'relacion',c.relname,'tipo',c.relkind) ORDER BY n.nspname,c.relname),'[]'::jsonb) FROM ubicacion_dependencias d JOIN pg_class c ON c.oid=d.oid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE d.oid<>r.oid),
 'updatable_sin_triggers',pg_relation_is_updatable(r.oid,false),'updatable_con_triggers',pg_relation_is_updatable(r.oid,true),
 'information_schema',(SELECT jsonb_build_object('is_updatable',v.is_updatable,'is_insertable_into',v.is_insertable_into) FROM information_schema.views v WHERE v.table_schema=r.esquema AND v.table_name=r.relname),
 'reglas_no_return',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',rw.rulename,'evento',rw.ev_type,'instead',rw.is_instead,'habilitada',rw.ev_enabled,'definicion_md5',md5(pg_get_ruledef(rw.oid,true))) ORDER BY rw.rulename),'[]'::jsonb) FROM pg_rewrite rw WHERE rw.ev_class=r.oid AND rw.rulename<>'_RETURN'),
 'triggers_no_internos',(SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',tg.tgname,'habilitado',tg.tgenabled,'funcion',tg.tgfoid::regprocedure::text,'definicion_md5',md5(pg_get_triggerdef(tg.oid,true))) ORDER BY tg.tgname),'[]'::jsonb) FROM pg_trigger tg WHERE tg.tgrelid=r.oid AND NOT tg.tgisinternal),
 'acl_tabla_explicita',coalesce(t.acl,'[]'::jsonb),'acl_columna_explicita',coalesce(c.acl,'[]'::jsonb),
 'privilegios_efectivos',(SELECT jsonb_agg(to_jsonb(p)-'oid' ORDER BY rol) FROM vista_privilegios p WHERE p.oid=r.oid)) FROM relaciones r LEFT JOIN acl_tabla_json t ON t.oid=r.oid LEFT JOIN acl_columna_json c ON c.oid=r.oid WHERE r.esquema='public' AND r.relname='v_ubicacion_enriquecida'),jsonb_build_object('existe',false)),
 'limites',jsonb_build_array('Solo catalogo, sin revocaciones, filas, RPC ni prueba de despliegue.','Revocaciones previstas dentro del inventario no son bloqueos de preflight.','Riesgos heredados son atribuciones por ACL/USAGE; no ejecutan el postflight de 083 ni demuestran ausencia de otros privilegios del propietario/superusuario.','SQL completo solo para v_ubicacion_enriquecida, solicitado para auditar su proyeccion; funciones, triggers y reglas restantes solo por huellas.','Bitmasks updatable de pg_relation_is_updatable son metadata, no prueban que una escritura de negocio sea ejecutable.','MD5 sirve para cotejo, no es firma de seguridad. La heuristica prosrc no demuestra ausencia de SQL dinamico.')) AS diagnostico;

ROLLBACK;
