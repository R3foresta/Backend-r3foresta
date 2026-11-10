-- Preflight preliminar de 097. Ejecutar íntegro y compartir la única columna JSON.
-- Solo catálogo PostgreSQL. No consulta recolecciones, usuarios, inventario ni Storage.
-- Los hashes SHA-256 corresponden exactamente a pg_proc.prosrc de las migraciones
-- locales citadas. Una diferencia requiere cotejar el cuerpo efectivo y su origen.
-- enums_requeridos_presentes comprueba inclusión. enums_sin_extras informa
-- diferencias del catálogo para cotejo, sin convertirlas en rechazo automático.
-- El informe no acredita inventario físico, aplicación SQL, privacidad del bucket,
-- configuración del servicio, despliegue ni habilitación del piloto.
-- Si un objeto/rol falta se informa como ausente. No aplicar 097 desde este archivo.
BEGIN READ ONLY;
WITH
funciones_esperadas(firma,antecedente,sha256_esperado,servicio_esperado) AS (
  VALUES
    ('public.fn_recoleccion_recalcular_saldo_operativo(bigint)','011_recoleccion_saldo_operativo.sql','6ec1aac30c92906e5ef1b68c8173f7ab5c131a2300f2d459997f1f2fc7264085',NULL),
    ('public.fn_recoleccion_movimiento_sync_saldo_operativo()','011_recoleccion_saldo_operativo.sql','241074533d2330dd27a2e6c0a2ae8b11c962297a1591a77b110252e29c8bec3a',NULL),
    ('public.fn_recoleccion_acotar_excepcion_fecha_rechazo()','093_recoleccion_acceso_explicito.sql','9682de1268cc392f66ba4f85dfcc30328e017dd1cbc526d6e7a7c408ffe92860',false),
    ('public.m1_exigir_actor(bigint,boolean)','093_recoleccion_acceso_explicito.sql','acb68521ae22771dc55e2cc0465d6988395bedf59391c1f7426e633d5cf34a3d',true),
    ('public.m2_acceso_efectivo(bigint,bigint)','094_usuario_vivero.sql','c1470203e55fa6c2b511ab54a1223297c76bc125d4cbf12ce0c68e431fd3ad66',true),
    ('public.m2_acceso_ejecutar(bigint,text,text,uuid,jsonb)','094_usuario_vivero.sql','235478d93c692c8794f8be25a05466cccaecd01236b5acbd612732a5124708b4',true),
    ('public.m2_exigir_vivero(bigint,bigint)','095_vivero_operacion_por_ambito.sql','dea018c1d8448bd360849c06ecc030d72241b5b4c1fde065dddf5ca89570caa3',false),
    ('public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)','095_vivero_operacion_por_ambito.sql','4c6b099b1c67e18c17a7bc829734be833cd8d38d100d9ecb60508b4c2354a86e',false),
    ('public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)','095_vivero_operacion_por_ambito.sql','54f9d82901d1d087ab5ba0f6a8bdf90bdd6fca28ccbc5d31ccaa54c015f445c2',true),
    ('public.fn_recoleccion_registrar_desecho(bigint,numeric,bigint)','095_vivero_operacion_por_ambito.sql','b90e914ededd165d72b7dd8ac72fb6f2e56e98cae2178cd26431c440f1d2bb2b',true),
    ('public.m1_recepcion_exigir_objeto(bigint,bigint)','096_recoleccion_recepcion.sql','ed343c8aee52a61d97519739ca862bf6faf99879cbabae0acdf5a845595ec31f',false),
    ('public.m1_recepcion_evidencias_preparar(bigint,bigint,jsonb)','096_recoleccion_recepcion.sql','865f226875303b53b0e0985cf32aebfd9c0947aca2e33820842790aa34affa8f',true),
    ('public.m1_recepcion_ejecutar(bigint,text,uuid,jsonb)','096_recoleccion_recepcion.sql','007c95cf2c00f40cdb73bf466453ed8113f886591bc41e2ac475844b45075cbd',true),
    ('public.m1_recepcion_recuperar(bigint,text,uuid)','096_recoleccion_recepcion.sql','e513fe3e7de99294458a7cfef61e6922defd0862da3c158b3350b454cbdf0f9a',true),
    ('public.m1_recepcion_proteger_movimiento()','096_recoleccion_recepcion.sql','1676debf3f5e35b07cd222ddd921c9f06bbc5544530085c5b66ae7a0e8ed985e',false),
    ('public.m1_recepcion_congelar_declaracion()','096_recoleccion_recepcion.sql','df3590f198e6764e3a4bbe82bf4b0e270153e464ca70c94f69d3b488066ef157',false),
    ('public.m1_recepcion_proyectar(bigint,bigint,boolean)','096_recoleccion_recepcion.sql','316a9a5f9bfdd031ec7a65ee2d7e91bb1e8e69e8aae2bc1f4080686c8154b3b9',false),
    ('public.m1_recepcion_leer(bigint,bigint,bigint,integer)','096_recoleccion_recepcion.sql','8683beefe5236e4ef38980c5cb11eba42f5286197ec55966733a302590daba5e',true),
    ('public.m1_recepcion_diagnostico(bigint,bigint,integer)','096_recoleccion_recepcion.sql','422ff18278aee5967f163e541f0e5404245d18b1ce9c6046680d2c0744d99df7',true),
    ('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer)','096_recoleccion_recepcion.sql','65250fd32e04bcc85c2689051d9eab2f9058b601f6bcad2e82031c3d3574902b',true)
),
roles_objetivo AS (
  SELECT nombre,r.oid FROM (VALUES('anon'),('authenticated'),('service_role')) v(nombre)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname=v.nombre
),
funciones AS MATERIALIZED (
  SELECT e.*,p.oid,p.prosecdef,p.proconfig,p.provolatile,
    encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha256_efectivo,
    pg_catalog.pg_get_function_result(p.oid) retorno,
    coalesce((SELECT bool_and(NOT has_function_privilege(r.oid,p.oid,'EXECUTE'))
      FROM roles_objetivo r WHERE r.nombre IN ('anon','authenticated')),false) privadas,
    (SELECT has_function_privilege(r.oid,p.oid,'EXECUTE') FROM roles_objetivo r
      WHERE r.nombre='service_role') servicio_ejecuta,
    coalesce((SELECT jsonb_object_agg(r.nombre,has_function_privilege(r.oid,p.oid,'EXECUTE'))
      FROM roles_objetivo r),'{}'::jsonb) ejecucion_por_rol
  FROM funciones_esperadas e LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.firma)
),
columnas_esperadas(tabla,columna,tipo) AS (
  VALUES
    ('usuario','id','bigint'),('usuario','auth_id','text'),('usuario','activo','boolean'),
    ('recoleccion','id','bigint'),('recoleccion','usuario_id','bigint'),('recoleccion','vivero_id','bigint'),
    ('recoleccion','fecha','date'),('recoleccion','revision_captura','bigint'),
    ('recoleccion','estado_registro','public.estado_registro_recoleccion'),
    ('recoleccion','estado_operativo','public.estado_operativo_recoleccion'),
    ('recoleccion','saldo_actual','numeric'),('recoleccion','cantidad_inicial_canonica','numeric'),
    ('recoleccion','unidad_canonica','public.unidad_medida'),('recoleccion','tipo_material','public.tipo_material_origen'),
    ('recoleccion','codigo_trazabilidad','text'),('recoleccion','planta_id','bigint'),
    ('recoleccion','nombre_cientifico_snapshot','text'),('recoleccion','nombre_comercial_snapshot','text'),
    ('recoleccion','variedad_snapshot','text'),('recoleccion','nombre_comunidad_snapshot','text'),
    ('recoleccion','usuario_validacion_id','bigint'),('recoleccion','fecha_validacion','date'),
    ('recoleccion_movimiento','id','bigint'),('recoleccion_movimiento','recoleccion_id','bigint'),
    ('recoleccion_movimiento','lote_vivero_id','bigint'),('recoleccion_movimiento','delta','numeric'),
    ('recoleccion_movimiento','tipo_movimiento','public.tipo_movimiento_recoleccion'),
    ('recoleccion_movimiento','created_by','bigint'),('recoleccion_movimiento','created_at','date'),
    ('lote_vivero','id','bigint'),('lote_vivero','recoleccion_id','bigint'),('lote_vivero','vivero_id','bigint'),
    ('lote_vivero','cantidad_inicial_en_proceso','numeric'),('lote_vivero','unidad_medida_inicial','public.unidad_medida'),
    ('evento_lote_vivero','id','bigint'),('evento_lote_vivero','lote_id','bigint'),
    ('evento_lote_vivero','cantidad_afectada','numeric'),('evento_lote_vivero','unidad_medida_evento','public.unidad_medida'),
    ('asignacion_vivero_subcampania','id','bigint'),('asignacion_vivero_subcampania','lote_vivero_id','bigint'),
    ('asignacion_vivero_subcampania','subcampania_id','bigint'),
    ('evidencias_trazabilidad','id','bigint'),('evidencias_trazabilidad','entidad_id','bigint'),
    ('evidencias_trazabilidad','bucket','text'),('evidencias_trazabilidad','ruta_archivo','text'),
    ('tipos_entidad_evidencia','codigo','text'),('tipos_entidad_evidencia','descripcion','text')
),
columnas AS MATERIALIZED (
  SELECT e.*,a.attname IS NOT NULL presente,pg_catalog.format_type(a.atttypid,a.atttypmod) tipo_efectivo,
    coalesce(a.atttypid=pg_catalog.to_regtype(e.tipo),false) tipo_coincide,a.attnotnull obligatorio,
    a.attidentity identidad,a.attgenerated generada
  FROM columnas_esperadas e LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid=pg_catalog.to_regclass('public.'||e.tabla) AND a.attname=e.columna AND NOT a.attisdropped
),
relaciones_objetivo(nombre) AS (
  VALUES('usuario'),('usuario_vivero'),('usuario_vivero_revision'),('vivero_acceso_comando'),
    ('recoleccion'),('recoleccion_movimiento'),('lote_vivero'),('evento_lote_vivero'),('asignacion_vivero_subcampania'),
    ('evidencias_trazabilidad'),('tipos_entidad_evidencia'),('recoleccion_recepcion'),
    ('recoleccion_recepcion_comando'),('recoleccion_recepcion_observacion'),
    ('recoleccion_recepcion_evidencia_contexto'),('recoleccion_recepcion_evidencia')
),
relaciones AS MATERIALIZED (
  SELECT o.nombre,c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    coalesce((SELECT jsonb_object_agg(r.nombre,jsonb_build_object(
      'select',has_table_privilege(r.oid,c.oid,'SELECT'),
      'insert',has_table_privilege(r.oid,c.oid,'INSERT'),
      'update',has_table_privilege(r.oid,c.oid,'UPDATE'),
      'delete',has_table_privilege(r.oid,c.oid,'DELETE'),
      'truncate',has_table_privilege(r.oid,c.oid,'TRUNCATE'),
      'trigger',has_table_privilege(r.oid,c.oid,'TRIGGER'),
      'references',has_table_privilege(r.oid,c.oid,'REFERENCES'),
      'privilegios_servidor',(SELECT jsonb_object_agg(a.privilege_type,has_table_privilege(r.oid,c.oid,a.privilege_type) ORDER BY a.privilege_type)
        FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',c.relowner)) a),
      'alguna_columna_select_insert_update_references',has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
      FROM roles_objetivo r),'{}'::jsonb) permisos_efectivos,
    coalesce((SELECT jsonb_agg(jsonb_build_object('columna',a.attname,'rol',r.nombre,
      'privilegio',acl.privilege_type,'delegable',acl.is_grantable) ORDER BY a.attnum,r.nombre,acl.privilege_type)
      FROM pg_catalog.pg_attribute a CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      JOIN roles_objetivo r ON r.oid=acl.grantee
      WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'::jsonb) acl_columnas
  FROM relaciones_objetivo o LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.'||o.nombre)
),
triggers_esperados(tabla,nombre,funcion,tipo) AS (
  VALUES('recoleccion','trg_recoleccion_acotar_excepcion_fecha_rechazo','public.fn_recoleccion_acotar_excepcion_fecha_rechazo()',21),
    ('recoleccion','recepcion_congelar','public.m1_recepcion_congelar_declaracion()',19),
    ('recoleccion_movimiento','recepcion_exigida','public.m1_recepcion_proteger_movimiento()',7),
    ('recoleccion_movimiento','trg_recoleccion_movimiento_sync_saldo_operativo','public.fn_recoleccion_movimiento_sync_saldo_operativo()',29),
    ('recoleccion_recepcion','recepcion_inmutable','public.fn_subcampania_historial_prevent_mutation()',58),
    ('recoleccion_recepcion_comando','recepcion_inmutable','public.fn_subcampania_historial_prevent_mutation()',58),
    ('recoleccion_recepcion_observacion','recepcion_inmutable','public.fn_subcampania_historial_prevent_mutation()',58),
    ('recoleccion_recepcion_evidencia_contexto','recepcion_inmutable','public.fn_subcampania_historial_prevent_mutation()',58),
    ('recoleccion_recepcion_evidencia','recepcion_inmutable','public.fn_subcampania_historial_prevent_mutation()',58)
),
triggers AS MATERIALIZED (
  SELECT e.*,t.oid IS NOT NULL presente,t.tgenabled habilitado,t.tgtype tipo_efectivo,
    coalesce(t.tgfoid=pg_catalog.to_regprocedure(e.funcion) AND t.tgenabled='O' AND t.tgtype=e.tipo,false) coincide,
    pg_catalog.pg_get_triggerdef(t.oid,true) definicion
  FROM triggers_esperados e LEFT JOIN pg_catalog.pg_trigger t
    ON t.tgrelid=pg_catalog.to_regclass('public.'||e.tabla) AND t.tgname=e.nombre AND NOT t.tgisinternal
),
enums_esperados(nombre,valores) AS (
  VALUES('unidad_medida',ARRAY['UNIDAD','G']::text[]),
    ('tipo_material_origen',ARRAY['SEMILLA','ESQUEJE']::text[]),
    ('tipo_movimiento_recoleccion',ARRAY['CONSUMO_A_VIVERO','DESECHO']::text[]),
    ('estado_operativo_recoleccion',ARRAY['ABIERTO','CERRADO']::text[])
),
enums AS (
  SELECT e.nombre,e.valores esperados,array_agg(v.enumlabel::text ORDER BY v.enumsortorder) efectivos,
    ARRAY(SELECT x FROM unnest(array_agg(v.enumlabel::text)) x WHERE x IS NOT NULL AND NOT x=ANY(e.valores) ORDER BY x) extras,
    coalesce(array_agg(v.enumlabel::text) @> e.valores,false) requeridos_presentes,
    coalesce(array_agg(v.enumlabel::text ORDER BY v.enumlabel)=
      ARRAY(SELECT x FROM unnest(e.valores) x ORDER BY x),false) mismos_valores
  FROM enums_esperados e LEFT JOIN pg_catalog.pg_enum v ON v.enumtypid=pg_catalog.to_regtype('public.'||e.nombre)
  GROUP BY e.nombre,e.valores
),
objetos_097 AS (
  SELECT 'relacion' clase,c.relname nombre FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'recoleccion_conciliacion_%'
  UNION ALL
  SELECT 'funcion',p.oid::regprocedure::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname LIKE 'm2_conciliacion_%' OR p.proname IN (
    'm2_inicio_lote_impl','m2_inicio_lote_exacto','m2_origen_estado_habilitacion',
    'm2_origen_exigir_habilitacion','m2_estado_habilitacion')
    OR (p.proname='m2_origenes_leer' AND p.pronargs=6))
),
restricciones AS (
  SELECT r.nombre tabla,c.conname nombre,c.contype tipo,c.convalidated validada,
    pg_catalog.pg_get_constraintdef(c.oid,true) definicion,
    CASE WHEN c.conname='chk_fecha_rango' THEN pg_catalog.pg_get_expr(c.conbin,c.conrelid) END expresion
  FROM relaciones r JOIN pg_catalog.pg_constraint c ON c.conrelid=r.oid
),
comprobaciones AS (
  SELECT 'roles_anon_authenticated_service_presentes' nombre,(SELECT bool_and(oid IS NOT NULL) FROM roles_objetivo) cumple
  UNION ALL SELECT 'funciones_antecedentes_presentes',(SELECT bool_and(oid IS NOT NULL) FROM funciones)
  UNION ALL SELECT 'cuerpos_antecedentes_coinciden',(SELECT bool_and(coalesce(sha256_efectivo=sha256_esperado,false)) FROM funciones)
  UNION ALL SELECT 'columnas_minimas_presentes_y_tipos',(SELECT bool_and(presente AND tipo_coincide) FROM columnas)
  UNION ALL SELECT 'triggers_efectivos_coinciden',(SELECT bool_and(coincide) FROM triggers)
  UNION ALL SELECT 'enums_requeridos_presentes',(SELECT bool_and(requeridos_presentes) FROM enums)
  UNION ALL SELECT 'enums_sin_extras',(SELECT bool_and(mismos_valores) FROM enums)
  UNION ALL SELECT 'objetos_097_ausentes',NOT EXISTS(SELECT 1 FROM objetos_097)
  UNION ALL SELECT 'funciones_privadas_y_grants_esperados',(SELECT bool_and(oid IS NOT NULL AND privadas
    AND (servicio_esperado IS NULL OR servicio_ejecuta IS NOT DISTINCT FROM servicio_esperado)) FROM funciones WHERE servicio_esperado IS NOT NULL)
  UNION ALL SELECT 'check_fecha_presente_para_cotejo',EXISTS(SELECT 1 FROM restricciones
    WHERE tabla='recoleccion' AND nombre='chk_fecha_rango' AND tipo='c')
)
SELECT jsonb_pretty(jsonb_build_object(
  'informe','PREFLIGHT_PRELIMINAR_VIVERO_097',
  'migracion_097_sha256','21eb5f5a52ed04e124891e764548e761483742545e2c1da83f074a0b90ea14c2',
  'entorno',jsonb_build_object('version_postgresql',current_setting('server_version'),
    'version_completa',version(),'hora_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'timezone_sesion',current_setting('TimeZone'),'transaccion_solo_lectura',current_setting('transaction_read_only')),
  'alcance','Catálogo preliminar. Revisión humana de diferencias y del entorno de destino pendiente.',
  'comprobaciones',(SELECT jsonb_object_agg(nombre,cumple ORDER BY nombre) FROM comprobaciones),
  'funciones',(SELECT jsonb_agg(jsonb_build_object('firma',firma,'antecedente',antecedente,'presente',oid IS NOT NULL,
    'sha256_esperado',sha256_esperado,'sha256_efectivo',sha256_efectivo,
    'cuerpo_coincide',coalesce(sha256_efectivo=sha256_esperado,false),'security_definer',prosecdef,
    'configuracion',proconfig,'volatilidad',provolatile,'retorno',retorno,'ejecucion_por_rol',ejecucion_por_rol) ORDER BY firma) FROM funciones),
  'columnas_minimas',(SELECT jsonb_agg(to_jsonb(c) ORDER BY tabla,columna) FROM columnas c),
  'columnas_compatibilidad_movimiento',(SELECT coalesce(jsonb_agg(jsonb_build_object('columna',a.attname,
    'tipo',pg_catalog.format_type(a.atttypid,a.atttypmod),'obligatoria',a.attnotnull) ORDER BY a.attname),'[]'::jsonb)
    FROM pg_catalog.pg_attribute a WHERE a.attrelid=pg_catalog.to_regclass('public.recoleccion_movimiento')
      AND a.attname IN ('unidad_operativa','unidad_medida_evento','unidad_medida_movimiento','detalle_cambios') AND NOT a.attisdropped),
  'tablas_y_acl',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY nombre) FROM relaciones r),
  'triggers_minimos',(SELECT jsonb_agg(to_jsonb(t) ORDER BY tabla,nombre) FROM triggers t),
  'otros_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('tabla',r.nombre,'nombre',t.tgname,
    'habilitado',t.tgenabled,'definicion',pg_catalog.pg_get_triggerdef(t.oid,true)) ORDER BY r.nombre,t.tgname),'[]'::jsonb)
    FROM relaciones r JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid WHERE NOT t.tgisinternal
      AND NOT EXISTS(SELECT 1 FROM triggers_esperados e WHERE e.tabla=r.nombre AND e.nombre=t.tgname)),
  'enums',(SELECT jsonb_agg(to_jsonb(e) ORDER BY nombre) FROM enums e),
  'restricciones',(SELECT jsonb_agg(to_jsonb(c) ORDER BY tabla,nombre) FROM restricciones c),
  'objetos_097_encontrados',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY clase,nombre),'[]'::jsonb) FROM objetos_097 o)
)) AS preflight_vivero_097;
COMMIT;
