-- PA-T-INT07-BE01: cotejo de catálogo, estrictamente de lectura.
-- Ejecutar únicamente en el destino previamente identificado por un canal privado.
-- No instala INT07, no llama RPC, no consulta filas de negocio ni identifica la
-- conexión/base/host/usuario. Objetos o roles ausentes se informan sin abortar.
-- PostgreSQL >= 12 (catálogos attgenerated/prokind); destino previsto PG17.
--
-- Alcance: relaciones public enumeradas y vistas dependientes transitivas;
-- secuencias vinculadas por ownership/default; triggers adjuntos, incluso internos;
-- funciones/procedimientos candidatos de esquemas no internos y sus overloads.
-- La búsqueda textual de referencias/escritura solo descubre candidatos: puede
-- dar falsos positivos y omitir SQL dinámico, llamadas indirectas, lenguajes
-- externos o escritores SQL privilegiados. No prueba ausencia de escritores.
-- Inspeccionar definiciones y disciplina de locks en sesión privada al cotejar.
--
-- No se emiten cuerpos, expresiones, defaults, comentarios, argumentos de trigger,
-- opciones de conexión ni ACL raw. MD5 es una huella comparativa, no una firma de
-- seguridad; diferencias de formato/versión también cambian la huella. Las ACL
-- efectivas incluyen herencia/PUBLIC; no equivalen a autorización de dominio ni
-- resuelven el efecto de RLS. PUBLIC es el pseudorol 0, no un pg_roles existente.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH RECURSIVE
esperadas(nombre) AS (VALUES
  ('usuario'), ('organizacion'), ('campania'), ('campania_organizacion'),
  ('campania_estado'), ('subcampania'), ('subcampania_equipo'),
  ('subcampania_historial'), ('subcampania_meta_especie'),
  ('subcampania_permiso'), ('subcampania_permiso_revision'),
  ('registro_plantacion'), ('registro_plantacion_detalle'),
  ('registro_plantacion_coresponsable'), ('evento_plantacion'),
  ('registro_plantacion_grupo_revision'), ('registro_plantacion_correccion'),
  ('registro_plantacion_efectivo'), ('evento_plantacion_efectivo'),
  ('registro_plantacion_participante_efectivo'),
  ('registro_plantacion_consumo_credito'), ('registro_plantacion_consumo_compensacion'),
  ('asignacion_vivero_subcampania'), ('lote_vivero'), ('evento_lote_vivero'),
  ('v_lote_vivero_saldos'), ('participacion_comando'), ('participacion_carga'),
  ('participacion_carga_generacion'), ('usuario_autoridad_historial'),
  ('evidencias_trazabilidad'), ('tipos_entidad_evidencia'), ('planta')
),
roles_solicitados(nombre) AS (VALUES
  ('PUBLIC'), ('anon'), ('authenticated'), ('service_role')
),
roles AS (
  SELECT s.nombre, r.oid,
    s.nombre='PUBLIC' OR r.oid IS NOT NULL AS existe,
    r.rolsuper, r.rolinherit, r.rolbypassrls
  FROM roles_solicitados s LEFT JOIN pg_roles r ON r.rolname=s.nombre
),
relaciones_ids(oid) AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN esperadas e ON e.nombre=c.relname
  WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
  UNION
  SELECT rw.ev_class FROM relaciones_ids previa
  JOIN pg_depend d ON d.refclassid='pg_class'::regclass AND d.refobjid=previa.oid
    AND d.classid='pg_rewrite'::regclass
  JOIN pg_rewrite rw ON rw.oid=d.objid
  JOIN pg_class c ON c.oid=rw.ev_class AND c.relkind IN ('v','m')
),
relaciones AS (
  SELECT c.*, n.nspname esquema FROM relaciones_ids i
  JOIN pg_class c ON c.oid=i.oid JOIN pg_namespace n ON n.oid=c.relnamespace
),
columnas AS (
  SELECT a.*, r.esquema, r.relname, r.relowner, r.relacl,
    pg_get_expr(d.adbin,d.adrelid) expresion_default
  FROM relaciones r JOIN pg_attribute a ON a.attrelid=r.oid
    AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
),
secuencias_ids(oid) AS (
  SELECT s.oid FROM pg_depend d JOIN relaciones r ON r.oid=d.refobjid
  JOIN pg_class s ON s.oid=d.objid AND s.relkind='S'
  WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
    AND d.deptype IN ('a','i')
  UNION
  SELECT s.oid FROM pg_attrdef ad JOIN relaciones r ON r.oid=ad.adrelid
  JOIN pg_depend d ON d.classid='pg_attrdef'::regclass AND d.objid=ad.oid
    AND d.refclassid='pg_class'::regclass
  JOIN pg_class s ON s.oid=d.refobjid AND s.relkind='S'
),
secuencias AS (
  SELECT c.*,n.nspname esquema FROM secuencias_ids i
  JOIN pg_class c ON c.oid=i.oid JOIN pg_namespace n ON n.oid=c.relnamespace
),
definiciones AS MATERIALIZED (
  SELECT p.*, n.nspname esquema, l.lanname lenguaje,
    pg_get_functiondef(p.oid) definicion
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  JOIN pg_language l ON l.oid=p.prolang
  WHERE p.prokind IN ('f','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname !~ '^pg_(toast|temp)'
),
funciones_marcadas AS (
  SELECT d.*,
    EXISTS(SELECT 1 FROM esperadas e
      WHERE d.definicion ~* ('\m'||e.nombre||'\M')) AS referencia_objeto,
    d.definicion ~* '\m(mortandad|mortalidad|mortandad_reportada|cantidad_muerta_delta|cantidad_muerta_acumulada|cantidad_repuesta_acumulada|total_muerto_acumulado)\M'
      AS referencia_grupo_mortandad,
    d.definicion ~* '\m(insert|update|delete|truncate|merge|execute|call)\M'
      AS texto_posible_escritura,
    EXISTS(SELECT 1 FROM pg_trigger t JOIN relaciones r ON r.oid=t.tgrelid
      WHERE t.tgfoid=d.oid) AS trigger_adjunto
  FROM definiciones d
),
funciones_ids(oid) AS (
  SELECT f.oid FROM funciones_marcadas f
  WHERE f.referencia_objeto OR f.referencia_grupo_mortandad OR f.trigger_adjunto
    OR (f.esquema='public' AND f.proname ~ '^(pa_|fn_m3_|fn_m2_m3_|fn_subcampania_|fn_campania_)')
  UNION
  -- Conservar todos los overloads de cada nombre candidato.
  SELECT otra.oid FROM funciones_marcadas f JOIN funciones_marcadas otra
    ON otra.pronamespace=f.pronamespace AND otra.proname=f.proname
  JOIN funciones_ids i ON i.oid=f.oid
),
funciones AS (
  SELECT f.* FROM funciones_marcadas f JOIN funciones_ids i ON i.oid=f.oid
),
esquemas AS (
  SELECT relnamespace oid FROM relaciones UNION SELECT relnamespace FROM secuencias
  UNION SELECT pronamespace FROM funciones
),
privilegios_tabla AS (
  SELECT r.esquema,r.relname,rol.nombre rol,rol.existe,p.privilegio,
    CASE WHEN NOT rol.existe THEN NULL
      WHEN rol.nombre='PUBLIC' THEN EXISTS(
        SELECT 1 FROM aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL
          ELSE coalesce(r.relacl,acldefault('r',r.relowner)) END) a
        WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
      ELSE has_table_privilege(rol.oid,r.oid,p.privilegio) END concedido
  FROM relaciones r CROSS JOIN roles rol
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilegio)
),
privilegios_columna AS (
  SELECT c.esquema,c.relname,c.attname columna,rol.nombre rol,rol.existe,p.privilegio,
    CASE WHEN NOT rol.existe THEN NULL
      WHEN rol.nombre='PUBLIC' THEN EXISTS(
        SELECT 1 FROM aclexplode(CASE WHEN cardinality(c.attacl)>0 THEN c.attacl END) a
        WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
        OR EXISTS(SELECT 1 FROM aclexplode(CASE WHEN cardinality(c.relacl)=0 THEN NULL
          ELSE coalesce(c.relacl,acldefault('r',c.relowner)) END) a
          WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
      ELSE has_column_privilege(rol.oid,c.attrelid,c.attnum,p.privilegio) END concedido
  FROM columnas c CROSS JOIN roles rol
  CROSS JOIN (VALUES ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilegio)
),
privilegios_secuencia AS (
  SELECT s.esquema,s.relname secuencia,rol.nombre rol,rol.existe,p.privilegio,
    CASE WHEN NOT rol.existe THEN NULL
      WHEN rol.nombre='PUBLIC' THEN EXISTS(
        SELECT 1 FROM aclexplode(CASE WHEN cardinality(s.relacl)=0 THEN NULL
          ELSE coalesce(s.relacl,acldefault('S',s.relowner)) END) a
        WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
      ELSE has_sequence_privilege(rol.oid,s.oid,p.privilegio) END concedido
  FROM secuencias s CROSS JOIN roles rol
  CROSS JOIN (VALUES ('SELECT'),('UPDATE'),('USAGE')) p(privilegio)
),
privilegios_funcion AS (
  SELECT f.esquema,f.proname nombre,pg_get_function_identity_arguments(f.oid) argumentos,
    rol.nombre rol,rol.existe,
    CASE WHEN NOT rol.existe THEN NULL
      WHEN rol.nombre='PUBLIC' THEN EXISTS(
        SELECT 1 FROM aclexplode(CASE WHEN cardinality(f.proacl)=0 THEN NULL
          ELSE coalesce(f.proacl,acldefault('f',f.proowner)) END) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
      ELSE has_function_privilege(rol.oid,f.oid,'EXECUTE') END execute
  FROM funciones f CROSS JOIN roles rol
),
privilegios_esquema AS (
  SELECT n.nspname esquema,rol.nombre rol,rol.existe,p.privilegio,
    CASE WHEN NOT rol.existe THEN NULL
      WHEN rol.nombre='PUBLIC' THEN EXISTS(
        SELECT 1 FROM aclexplode(CASE WHEN cardinality(n.nspacl)=0 THEN NULL
          ELSE coalesce(n.nspacl,acldefault('n',n.nspowner)) END) a
        WHERE a.grantee=0 AND a.privilege_type=p.privilegio)
      ELSE has_schema_privilege(rol.oid,n.oid,p.privilegio) END concedido
  FROM esquemas e JOIN pg_namespace n ON n.oid=e.oid CROSS JOIN roles rol
  CROSS JOIN (VALUES ('USAGE'),('CREATE')) p(privilegio)
)
SELECT jsonb_build_object(
  'contrato','PA-INT07-CATALOGO/1',
  'fuente','CATALOGO_OBSERVADO_NO_ACREDITA_APLICACION_INT07',
  'entorno',jsonb_build_object(
    'postgresql',current_setting('server_version'),
    'postgresql_num',current_setting('server_version_num'),
    'zona_horaria',current_setting('TimeZone'),
    'statement_timeout',current_setting('statement_timeout'),
    'lock_timeout',current_setting('lock_timeout'),
    'solo_lectura',current_setting('transaction_read_only'),
    'aislamiento',current_setting('transaction_isolation'),
    'postgis_extension',(SELECT extversion FROM pg_extension WHERE extname='postgis')),
  'roles', (SELECT jsonb_agg(jsonb_build_object('rol',nombre,'existe',existe,
    'superuser',rolsuper,'hereda',rolinherit,'bypass_rls',rolbypassrls) ORDER BY nombre) FROM roles),
  'objetos_esperados',(SELECT jsonb_agg(jsonb_build_object('esquema','public','nombre',e.nombre,
    'existe',EXISTS(SELECT 1 FROM relaciones r WHERE r.esquema='public' AND r.relname=e.nombre)) ORDER BY e.nombre) FROM esperadas e),
  'relaciones',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',r.esquema,'nombre',r.relname,'tipo',r.relkind,
    'rls',r.relrowsecurity,'rls_forzada',r.relforcerowsecurity,
    'vista_md5',CASE WHEN r.relkind IN ('v','m') THEN md5(pg_get_viewdef(r.oid,true)) ELSE NULL END)
    ORDER BY r.esquema,r.relname),'[]'::jsonb) FROM relaciones r),
  'columnas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',c.esquema,'relacion',c.relname,'orden',c.attnum,'nombre',c.attname,
    'tipo',format_type(c.atttypid,c.atttypmod),'obligatorio',c.attnotnull,
    'identidad',c.attidentity,'generada',c.attgenerated,'default_md5',md5(c.expresion_default))
    ORDER BY c.esquema,c.relname,c.attnum),'[]'::jsonb) FROM columnas c),
  'restricciones',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',r.esquema,'relacion',r.relname,'nombre',c.conname,'tipo',c.contype,
    'validada',c.convalidated,'diferible',c.condeferrable,'inicialmente_diferida',c.condeferred,
    'columnas',(SELECT jsonb_agg(a.attname ORDER BY k.orden) FROM unnest(c.conkey) WITH ORDINALITY k(numero,orden)
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.numero),
    'referencia_esquema',rn.nspname,'referencia_relacion',rc.relname,
    'referencia_columnas',(SELECT jsonb_agg(a.attname ORDER BY k.orden) FROM unnest(c.confkey) WITH ORDINALITY k(numero,orden)
      JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.numero),
    'fk_al_borrar',c.confdeltype,'fk_al_actualizar',c.confupdtype,
    'definicion_md5',md5(pg_get_constraintdef(c.oid,true))) ORDER BY r.esquema,r.relname,c.conname),'[]'::jsonb)
    FROM relaciones r JOIN pg_constraint c ON c.conrelid=r.oid
    LEFT JOIN pg_class rc ON rc.oid=c.confrelid LEFT JOIN pg_namespace rn ON rn.oid=rc.relnamespace),
  'indices',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',r.esquema,'relacion',r.relname,'nombre',ic.relname,'unico',i.indisunique,
    'primario',i.indisprimary,'valido',i.indisvalid,'listo',i.indisready,
    'definicion_md5',md5(pg_get_indexdef(i.indexrelid)),
    'predicado_md5',md5(pg_get_expr(i.indpred,i.indrelid))) ORDER BY r.esquema,r.relname,ic.relname),'[]'::jsonb)
    FROM relaciones r JOIN pg_index i ON i.indrelid=r.oid JOIN pg_class ic ON ic.oid=i.indexrelid),
  'secuencias',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',s.esquema,'nombre',s.relname,
    'tipo',format_type(q.seqtypid,NULL),'incremento',q.seqincrement,'minimo',q.seqmin,
    'maximo',q.seqmax,'cache',q.seqcache,'ciclica',q.seqcycle) ORDER BY s.esquema,s.relname),'[]'::jsonb)
    FROM secuencias s LEFT JOIN pg_sequence q ON q.seqrelid=s.oid),
  'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',r.esquema,'relacion',r.relname,'nombre',t.tgname,'habilitacion',t.tgenabled,
    'interno',t.tgisinternal,'tipo_bits',t.tgtype,'funcion_esquema',fn.nspname,'funcion',p.proname,
    'funcion_argumentos',pg_get_function_identity_arguments(p.oid),
    'definicion_md5',md5(pg_get_triggerdef(t.oid,true))) ORDER BY r.esquema,r.relname,t.tgname),'[]'::jsonb)
    FROM relaciones r JOIN pg_trigger t ON t.tgrelid=r.oid
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=p.pronamespace),
  'politicas_rls',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',r.esquema,'relacion',r.relname,'nombre',p.polname,'comando',p.polcmd,
    'permisiva',p.polpermissive,'roles_oid',to_jsonb(p.polroles),
    'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),
    'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid))) ORDER BY r.esquema,r.relname,p.polname),'[]'::jsonb)
    FROM relaciones r JOIN pg_policy p ON p.polrelid=r.oid),
  'funciones_candidatas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'esquema',f.esquema,'nombre',f.proname,'argumentos',pg_get_function_identity_arguments(f.oid),
    'retorno',pg_get_function_result(f.oid),'tipo',f.prokind,'lenguaje',f.lenguaje,
    'security_definer',f.prosecdef,'volatilidad',f.provolatile,
    'definicion_md5',md5(f.definicion),'referencia_objeto',f.referencia_objeto,
    'referencia_grupo_mortandad',f.referencia_grupo_mortandad,
    'texto_posible_escritura',f.texto_posible_escritura,'trigger_adjunto',f.trigger_adjunto,
    'settings_acotados',(SELECT coalesce(jsonb_agg(c ORDER BY c),'[]'::jsonb) FROM unnest(f.proconfig) c
      WHERE split_part(c,'=',1) IN ('statement_timeout','lock_timeout','TimeZone','timezone')))
    ORDER BY f.esquema,f.proname,pg_get_function_identity_arguments(f.oid)),'[]'::jsonb) FROM funciones f),
  'privilegios',jsonb_build_object(
    'esquemas',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY esquema,rol,privilegio),'[]'::jsonb) FROM privilegios_esquema p),
    'tablas_vistas',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY esquema,relname,rol,privilegio),'[]'::jsonb) FROM privilegios_tabla p),
    'columnas',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY esquema,relname,columna,rol,privilegio),'[]'::jsonb) FROM privilegios_columna p),
    'secuencias',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY esquema,secuencia,rol,privilegio),'[]'::jsonb) FROM privilegios_secuencia p),
    'funciones',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY esquema,nombre,argumentos,rol),'[]'::jsonb) FROM privilegios_funcion p)),
  'limites',jsonb_build_array(
    'Sin filas de negocio, secretos, cuerpos ni expresiones completas; cotejo de definiciones en sesion privada.',
    'Referencias y texto de escritura son candidatos heuristicos, no prueba de ausencia ni de locks compartidos.',
    'PUBLIC es pseudorol; roles ausentes producen existe=false y privilegios null.',
    'Privilegios efectivos no conceden autoridad de dominio; considerar tambien esquema y RLS.',
    'Sin lectura de valores actuales de secuencias; huellas MD5 solo comparan catalogos.',
    'El inventario no identifica proyecto ni acredita SQL aplicado, despliegue o pruebas de INT07.')) AS catalogo;

ROLLBACK;
