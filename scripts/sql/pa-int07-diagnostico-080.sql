-- Diagnóstico previo080, 2026-10-20. Solo catálogo: no ejecuta RPC ni lee filas
-- de negocio, cuerpos, defaults, conexiones, passwords o configuración sensible.
-- Replica las condiciones de preflight080 como resultados, sin detenerse en el
-- primer bloqueo. No instala ni modifica080, roles, grants, RLS o datos.
-- Un grant efectivo no identifica su origen: cotejar ACL, propietarios y cadenas
-- de membresía. PUBLIC es pseudorol0. La detección de definers usa el mismo
-- prosrc/nombres que080: no demuestra ausencia de SQL dinámico/escritores externos.
-- PostgreSQL >=12; opciones de membresía nuevas se leen por to_jsonb para admitir
-- PG14 y PG17. Herencia efectiva se consulta con has_*_privilege del destino.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH RECURSIVE
inventario(nombre,clase,obligatorio) AS (VALUES
  ('asignacion_vivero_subcampania','OBJETIVO',true),('registro_plantacion','OBJETIVO',true),
  ('registro_plantacion_detalle','OBJETIVO',true),('registro_plantacion_coresponsable','OBJETIVO',true),
  ('evento_plantacion','OBJETIVO',true),('evidencias_trazabilidad','OBJETIVO',true),
  ('subcampania_equipo','OBJETIVO',true),('subcampania','OBJETIVO',true),
  ('lote_vivero','OBJETIVO',true),('evento_lote_vivero','OBJETIVO',true),
  ('subcampania_meta_especie','PREVIO_FUERA_ALCANCE',false),
  ('campania','PREVIO_FUERA_ALCANCE',false),('campania_organizacion','PREVIO_FUERA_ALCANCE',false),
  ('campania_estado','PREVIO_FUERA_ALCANCE',false),('v_lote_vivero_saldos','PREVIO_FUERA_ALCANCE',false),
  ('planta','CATALOGO',true),('tipo_planta','CATALOGO',false),
  ('comunidad','CATALOGO',true),('division_administrativa','CATALOGO',true)
),
roles_solicitados(nombre) AS (VALUES('PUBLIC'),('anon'),('authenticated'),('service_role')),
roles AS (
  SELECT s.nombre,r.oid,s.nombre='PUBLIC' OR r.oid IS NOT NULL existe,
    r.rolinherit,r.rolsuper,r.rolbypassrls
  FROM roles_solicitados s LEFT JOIN pg_roles r ON r.rolname=s.nombre
),
membresia_alcanzable(origen,nodo) AS (
  SELECT oid,oid FROM roles WHERE oid IS NOT NULL
  UNION
  SELECT previa.origen,m.roleid FROM membresia_alcanzable previa
  JOIN pg_auth_members m ON m.member=previa.nodo
),
vistas_ids(oid) AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN inventario i ON i.nombre=c.relname AND i.clase='OBJETIVO' WHERE n.nspname='public'
  UNION
  SELECT rw.ev_class FROM vistas_ids previa
  JOIN pg_depend d ON d.refclassid='pg_class'::regclass AND d.refobjid=previa.oid
    AND d.classid='pg_rewrite'::regclass
  JOIN pg_rewrite rw ON rw.oid=d.objid
  JOIN pg_class c ON c.oid=rw.ev_class AND c.relkind IN('v','m')
),
relaciones_ids(oid) AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN inventario i ON i.nombre=c.relname WHERE n.nspname='public'
  UNION SELECT c.oid FROM vistas_ids v JOIN pg_class c ON c.oid=v.oid WHERE c.relkind IN('v','m')
),
relaciones AS (
  SELECT c.*,n.nspname esquema,i.clase,
    c.relkind IN('v','m') AND EXISTS(SELECT 1 FROM vistas_ids v WHERE v.oid=c.oid) vista_dependiente,
    c.oid IN(coalesce(to_regclass('public.campania_estado')::oid,0::oid),
             coalesce(to_regclass('public.v_lote_vivero_saldos')::oid,0::oid)) vista_excepcion080
  FROM relaciones_ids i0 JOIN pg_class c ON c.oid=i0.oid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN inventario i ON n.nspname='public' AND i.nombre=c.relname
),
columnas AS (
  SELECT r.oid relacion_oid,r.esquema,r.relname,r.relowner,r.relacl,a.attnum,a.attname,a.attacl
  FROM relaciones r JOIN pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
),
tabla_efectivos AS (
  SELECT r.oid relacion_oid,r.esquema,r.relname,rol.nombre rol,rol.existe,p.privilegio,
    CASE WHEN NOT rol.existe THEN NULL WHEN rol.nombre='PUBLIC' THEN EXISTS(
      SELECT 1 FROM aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL
        ELSE coalesce(r.relacl,acldefault('r',r.relowner)) END) a
      WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
      ELSE has_table_privilege(rol.oid,r.oid,p.privilegio) END concedido
  FROM relaciones r CROSS JOIN roles rol
  CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilegio)
),
columna_efectivos AS (
  SELECT c.relacion_oid,c.esquema,c.relname,c.attname columna,rol.nombre rol,rol.existe,p.privilegio,
    CASE WHEN NOT rol.existe THEN NULL WHEN rol.nombre='PUBLIC' THEN EXISTS(
      SELECT 1 FROM aclexplode(CASE WHEN cardinality(c.attacl)=0 THEN NULL ELSE c.attacl END) a
      WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
      OR EXISTS(SELECT 1 FROM tabla_efectivos t WHERE t.relacion_oid=c.relacion_oid
        AND t.rol='PUBLIC' AND t.privilegio=p.privilegio AND t.concedido)
      ELSE has_column_privilege(rol.oid,c.relacion_oid,c.attnum,p.privilegio) END concedido
  FROM columnas c CROSS JOIN roles rol
  CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilegio)
),
columna_resumen AS (
  SELECT esquema,relname,rol,existe,privilegio,bool_or(concedido) alguna_columna_concedida
  FROM columna_efectivos GROUP BY esquema,relname,rol,existe,privilegio
),
requisitos_servicio(nombre,privilegio) AS (
  SELECT nombre,'SELECT' FROM inventario WHERE clase IN('OBJETIVO','CATALOGO') OR nombre='v_lote_vivero_saldos'
  UNION SELECT nombre,p.privilegio FROM inventario CROSS JOIN (VALUES('INSERT'),('UPDATE')) p(privilegio)
    WHERE clase='CATALOGO' OR nombre IN('asignacion_vivero_subcampania','registro_plantacion','evidencias_trazabilidad','subcampania','lote_vivero')
  UNION SELECT 'subcampania_equipo','INSERT' UNION SELECT 'subcampania_equipo','DELETE'
  UNION SELECT nombre,'INSERT' FROM inventario WHERE clase='OBJETIVO'
    AND nombre NOT IN('asignacion_vivero_subcampania','registro_plantacion','evidencias_trazabilidad','subcampania','lote_vivero','subcampania_equipo')
),
servicio AS (
  SELECT q.nombre,q.privilegio,r.oid IS NOT NULL objeto_existe,
    (SELECT existe FROM roles WHERE nombre='service_role') rol_existe,
    t.concedido FROM requisitos_servicio q
  LEFT JOIN relaciones r ON r.esquema='public' AND r.relname=q.nombre
  LEFT JOIN tabla_efectivos t ON t.relacion_oid=r.oid AND t.rol='service_role' AND t.privilegio=q.privilegio
),
funciones AS MATERIALIZED (
  SELECT p.*,n.nspname esquema,
    md5(CASE WHEN p.prokind IN('f','p') THEN pg_get_functiondef(p.oid) ELSE p.prosrc END) definicion_md5,
    p.prosecdef AND (p.prosrc ~* '\m(usuario|subcampania|campania|registro_plantacion|asignacion_vivero_subcampania|lote_vivero|evidencias_trazabilidad)\M'
      OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania')) definer_alcance080
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND ((p.prosecdef AND p.prosrc ~* '\m(usuario|subcampania|campania|registro_plantacion|asignacion_vivero_subcampania|lote_vivero|evidencias_trazabilidad)\M')
      OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania'))
),
funcion_efectivos AS (
  SELECT f.oid funcion_oid,f.esquema,f.proname nombre,pg_get_function_identity_arguments(f.oid) argumentos,
    rol.nombre rol,rol.existe,
    CASE WHEN NOT rol.existe THEN NULL WHEN rol.nombre='PUBLIC' THEN EXISTS(
      SELECT 1 FROM aclexplode(CASE WHEN cardinality(f.proacl)=0 THEN NULL
        ELSE coalesce(f.proacl,acldefault('f',f.proowner)) END) a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
      ELSE has_function_privilege(rol.oid,f.oid,'EXECUTE') END execute
  FROM funciones f CROSS JOIN roles rol
),
bloqueos AS (
  SELECT CASE WHEN i.clase='CATALOGO' THEN 'PA_D_CATALOGO_REQUERIDO' ELSE 'PA_D_RELACION_REQUERIDA' END codigo,
    'public' esquema,i.nombre objeto,NULL::text rol,NULL::text privilegio
    FROM inventario i WHERE i.obligatorio AND NOT EXISTS(SELECT 1 FROM relaciones r WHERE r.esquema='public' AND r.relname=i.nombre)
  UNION ALL SELECT 'PA_D_SERVICE_ROL_AUSENTE','public',NULL,'service_role',NULL FROM roles WHERE nombre='service_role' AND NOT existe
  UNION ALL SELECT CASE WHEN i.clase='CATALOGO' THEN 'PA_D_CATALOGO_SERVICE_SIN_PRIVILEGIO'
      WHEN s.nombre='v_lote_vivero_saldos' THEN 'PA_D_SERVICE_SIN_VISTA'
      WHEN s.privilegio='SELECT' THEN 'PA_D_SERVICE_SIN_SELECT' ELSE 'PA_D_SERVICE_SIN_PRIVILEGIO' END,
    'public',s.nombre,'service_role',s.privilegio FROM servicio s JOIN inventario i ON i.nombre=s.nombre
    WHERE s.objeto_existe AND s.rol_existe AND NOT coalesce(s.concedido,false)
  UNION ALL SELECT 'PA_D_FUERA_ALCANCE_SELECT_PUBLICO',c.esquema,c.relname,c.rol,'SELECT'
    FROM columna_efectivos c WHERE c.relname='subcampania_meta_especie' AND c.esquema='public'
      AND c.rol IN('anon','authenticated') AND c.privilegio='SELECT' AND c.concedido
    GROUP BY c.esquema,c.relname,c.rol
  UNION ALL SELECT 'PA_D_FUERA_ALCANCE_DML_PUBLICO',c.esquema,c.relname,c.rol,c.privilegio
    FROM columna_efectivos c JOIN inventario i ON i.nombre=c.relname AND i.clase='PREVIO_FUERA_ALCANCE'
    WHERE c.esquema='public' AND c.rol IN('anon','authenticated') AND c.privilegio IN('INSERT','UPDATE','REFERENCES') AND c.concedido
    GROUP BY c.esquema,c.relname,c.rol,c.privilegio
  UNION ALL SELECT 'PA_D_FUERA_ALCANCE_DML_PUBLICO',t.esquema,t.relname,t.rol,t.privilegio
    FROM tabla_efectivos t JOIN inventario i ON i.nombre=t.relname AND i.clase='PREVIO_FUERA_ALCANCE'
    WHERE t.esquema='public' AND t.rol IN('anon','authenticated') AND t.privilegio IN('DELETE','TRUNCATE','TRIGGER') AND t.concedido
  UNION ALL SELECT 'PA_D_VISTA_PUBLICA_NO_AUTORIZADA',r.esquema,r.relname,c.rol,c.privilegio
    FROM relaciones r JOIN columna_efectivos c ON c.relacion_oid=r.oid
    WHERE r.vista_dependiente AND NOT r.vista_excepcion080 AND c.rol IN('anon','authenticated')
      AND c.privilegio IN('SELECT','INSERT','UPDATE') AND c.concedido
    GROUP BY r.esquema,r.relname,c.rol,c.privilegio
  UNION ALL SELECT 'PA_D_VISTA_PUBLICA_NO_AUTORIZADA',r.esquema,r.relname,t.rol,'DELETE'
    FROM relaciones r JOIN tabla_efectivos t ON t.relacion_oid=r.oid
    WHERE r.vista_dependiente AND NOT r.vista_excepcion080 AND t.rol IN('anon','authenticated') AND t.privilegio='DELETE' AND t.concedido
  UNION ALL SELECT 'PA_D_DEFINER_PUBLICO_NO_AUTORIZADO',f.esquema,
    f.proname||'('||pg_get_function_identity_arguments(f.oid)||')',p.rol,'EXECUTE'
    FROM funciones f JOIN funcion_efectivos p ON p.funcion_oid=f.oid
    WHERE f.definer_alcance080 AND p.rol IN('anon','authenticated') AND p.execute
)
SELECT jsonb_build_object(
  'contrato','PA-INT07-DIAGNOSTICO-080/1',
  'alcance','CONDICIONES_PREFLIGHT_080_SIN_MUTAR',
  'entorno',jsonb_build_object('postgresql',current_setting('server_version'),
    'solo_lectura',current_setting('transaction_read_only'),'aislamiento',current_setting('transaction_isolation')),
  'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY nombre) FROM roles r),
  'objetos',(SELECT jsonb_agg(jsonb_build_object('esquema','public','nombre',i.nombre,'clase',i.clase,
    'obligatorio',i.obligatorio,'existe',r.oid IS NOT NULL,'tipo',r.relkind,
    'owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'rls_forzada',r.relforcerowsecurity,
    'acl_explicita',r.relacl IS NOT NULL) ORDER BY i.nombre) FROM inventario i
    LEFT JOIN relaciones r ON r.esquema='public' AND r.relname=i.nombre),
  'bloqueos',(SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY codigo,esquema,objeto,rol,privilegio),'[]'::jsonb) FROM bloqueos b),
  'requisitos_servicio',(SELECT jsonb_agg(to_jsonb(s) ORDER BY nombre,privilegio) FROM servicio s),
  'acl_tabla_explicita',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',r.esquema,'objeto',r.relname,
    'owner',pg_get_userbyid(r.relowner),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'grantor',pg_get_userbyid(a.grantor),'privilegio',a.privilege_type,'grant_option',a.is_grantable)
    ORDER BY r.esquema,r.relname,a.grantee,a.privilege_type),'[]'::jsonb)
    FROM relaciones r CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL ELSE r.relacl END) a),
  'acl_columna_explicita',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',c.esquema,'objeto',c.relname,
    'columna',c.attname,'owner',pg_get_userbyid(c.relowner),
    'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'grantor',pg_get_userbyid(a.grantor),'privilegio',a.privilege_type,'grant_option',a.is_grantable)
    ORDER BY c.esquema,c.relname,c.attnum,a.grantee,a.privilege_type),'[]'::jsonb)
    FROM columnas c CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(c.attacl)=0 THEN NULL ELSE c.attacl END) a),
  'privilegios_tabla_efectivos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY esquema,relname,rol,privilegio),'[]'::jsonb) FROM tabla_efectivos t),
  'privilegios_columna_efectivos',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY esquema,relname,rol,privilegio),'[]'::jsonb) FROM columna_resumen c),
  'membresias_relevantes',(SELECT coalesce(jsonb_agg(jsonb_build_object('origen',pg_get_userbyid(al.origen),
    'miembro',pg_get_userbyid(m.member),'rol',pg_get_userbyid(m.roleid),'admin_option',m.admin_option,
    'inherit_option',(to_jsonb(m)->>'inherit_option')::boolean,
    'set_option',(to_jsonb(m)->>'set_option')::boolean,'miembro_rolinherit',miembro.rolinherit)
    ORDER BY al.origen,m.member,m.roleid),'[]'::jsonb)
    FROM membresia_alcanzable al JOIN pg_auth_members m ON m.member=al.nodo JOIN pg_roles miembro ON miembro.oid=m.member),
  'vistas_dependientes',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',r.esquema,'nombre',r.relname,
    'owner',pg_get_userbyid(r.relowner),'excepcion080',r.vista_excepcion080,'definicion_md5',md5(pg_get_viewdef(r.oid,true)))
    ORDER BY r.esquema,r.relname),'[]'::jsonb) FROM relaciones r WHERE r.vista_dependiente),
  'funciones_definer_y_codigos',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',f.esquema,'nombre',f.proname,
    'argumentos',pg_get_function_identity_arguments(f.oid),'owner',pg_get_userbyid(f.proowner),
    'security_definer',f.prosecdef,'definer_alcance080',f.definer_alcance080,'definicion_md5',f.definicion_md5)
    ORDER BY f.esquema,f.proname,pg_get_function_identity_arguments(f.oid)),'[]'::jsonb) FROM funciones f),
  'helpers_codigos_esperados',(SELECT jsonb_agg(jsonb_build_object('nombre',n.nombre,
    'existe',EXISTS(SELECT 1 FROM funciones f WHERE f.proname=n.nombre)) ORDER BY n.nombre)
    FROM (VALUES('fn_generar_codigo_campania'),('fn_generar_codigo_subcampania')) n(nombre)),
  'privilegios_funcion_efectivos',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY esquema,nombre,argumentos,rol),'[]'::jsonb) FROM funcion_efectivos f),
  'acl_funcion_explicita',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',f.esquema,'nombre',f.proname,
    'argumentos',pg_get_function_identity_arguments(f.oid),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    'grantor',pg_get_userbyid(a.grantor),'privilegio',a.privilege_type,'grant_option',a.is_grantable)
    ORDER BY f.esquema,f.proname,pg_get_function_identity_arguments(f.oid),a.grantee),'[]'::jsonb)
    FROM funciones f CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(f.proacl)=0 THEN NULL ELSE f.proacl END) a),
  'limites',jsonb_build_array(
    'Solo condiciones y catalogo del preflight080; un catalogo no acredita ejecucion de RPC ni cierre aplicado.',
    'ACL explicita NULL usa defaults/owner: los privilegios efectivos se reportan aparte.',
    'Privilegios de columna resumidos por relacion/rol/privilegio; ACL explicitas conservan nombres de columna.',
    'Membresias alcanzables incluyen rutas de SET ROLE; inherit_option NULL en versiones anteriores aPG16.',
    'El objetivo de080 se revoca al aplicar080; este diagnostico no llama esas revocaciones ni modifica cinco objetos previos.',
    'MD5 compara definiciones, no es firma de seguridad; no se imprimen cuerpos ni expresiones.',
    'Sin conexion ni identidad de proyecto: registrar procedencia del destino por un canal independiente.')) AS diagnostico;

ROLLBACK;
