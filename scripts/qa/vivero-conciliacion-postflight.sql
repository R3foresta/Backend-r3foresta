-- Ejecutar íntegro después de Success al aplicar 097 y compartir la columna JSON.
-- Solo lectura de catálogo y conteos, sin IDs, datos personales ni archivos.
-- La huella identifica el SQL local de referencia, no prueba por sí sola qué se aplicó.
-- No sustituye la comprobación física, QA HTTP/PWA ni la habilitación del piloto.
BEGIN READ ONLY;
WITH
roles_objetivo AS (
  SELECT v.nombre,r.oid FROM (VALUES('anon'),('authenticated'),('service_role')) v(nombre)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname=v.nombre
),
raices AS (
  SELECT v.nombre,c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM (VALUES('recoleccion'),('recoleccion_movimiento')) v(nombre)
  LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.'||v.nombre)
),
privilegios AS (
  SELECT t.nombre tabla,r.nombre rol,a.privilege_type privilegio,
    has_table_privilege(r.oid,t.oid,a.privilege_type) concedido
  FROM raices t CROSS JOIN roles_objetivo r
  CROSS JOIN LATERAL pg_catalog.aclexplode(pg_catalog.acldefault('r',t.relowner)) a
),
columnas AS (
  SELECT t.nombre tabla,r.nombre rol,
    has_any_column_privilege(r.oid,t.oid,'INSERT,UPDATE,REFERENCES') escritura_efectiva
  FROM raices t CROSS JOIN roles_objetivo r WHERE r.nombre IN ('anon','authenticated')
),
funciones_esperadas(firma,servicio_esperado) AS (
  VALUES
    ('public.m2_conciliacion_leer(bigint,bigint,bigint,integer,bigint)',true),
    ('public.m2_conciliacion_ejecutar(bigint,text,uuid,jsonb)',true),
    ('public.m2_conciliacion_recuperar(bigint,text,uuid)',true),
    ('public.m2_conciliacion_evidencias_preparar(bigint,bigint,jsonb)',true),
    ('public.m2_conciliacion_acreditada(public.recoleccion,public.recoleccion_conciliacion_evento)',false),
    ('public.m2_estado_habilitacion(public.recoleccion)',true),
    ('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer)',true),
    ('public.m2_origenes_leer(bigint,bigint,bigint,integer,integer,boolean)',true),
    ('public.m2_inicio_lote_impl(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)',false),
    ('public.m2_inicio_lote_exacto(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)',true),
    ('public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)',true),
    ('public.fn_recoleccion_acotar_excepcion_fecha_rechazo()',false),
    ('public.m1_recepcion_proteger_movimiento()',false)
),
cuerpos_esperados(firma,sha256) AS (
  VALUES
    ('public.fn_recoleccion_acotar_excepcion_fecha_rechazo()','326fcd23396c03ad3a9cae33afc327fe6fbf063eca41b66d5d97e530a9712959'),
    ('public.m1_recepcion_proteger_movimiento()','1f66c8ec8e4b5e6206e2cd9219dbaccccdc0207551df7930aac85df0b1acfcbc'),
    ('public.m2_conciliacion_acreditada(public.recoleccion,public.recoleccion_conciliacion_evento)','78824817089f6b5ed358da1b6f6aebae6d8fe44b3b820eef3ae20a59fca775e0')
),
funciones AS (
  SELECT e.*,p.oid IS NOT NULL presente,
    coalesce((SELECT bool_and(NOT has_function_privilege(r.oid,p.oid,'EXECUTE'))
      FROM roles_objetivo r WHERE r.nombre IN ('anon','authenticated')),false) privadas,
    coalesce((SELECT has_function_privilege(r.oid,p.oid,'EXECUTE') IS NOT DISTINCT FROM e.servicio_esperado
      FROM roles_objetivo r WHERE r.nombre='service_role'),false) grant_servicio_coincide,
    p.prosecdef security_definer,p.proconfig configuracion,
    encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha256_cuerpo,
    ce.sha256 sha256_cuerpo_esperado
  FROM funciones_esperadas e LEFT JOIN pg_catalog.pg_proc p ON p.oid=pg_catalog.to_regprocedure(e.firma)
  LEFT JOIN cuerpos_esperados ce ON ce.firma=e.firma
),
tablas AS (
  SELECT v.nombre,c.oid IS NOT NULL presente,c.relrowsecurity rls,
    coalesce((SELECT bool_and(NOT has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(pg_catalog.acldefault('r',c.relowner)) a
        WHERE has_table_privilege(r.oid,c.oid,a.privilege_type))) FROM roles_objetivo r),false) privadas,
    EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND t.tgname='conciliacion_inmutable'
      AND t.tgfoid=pg_catalog.to_regprocedure('public.fn_subcampania_historial_prevent_mutation()')
      AND t.tgenabled='O' AND t.tgtype=58) historial_inmutable
  FROM (VALUES('recoleccion_conciliacion_comando'),('recoleccion_conciliacion_evento'),
    ('recoleccion_conciliacion_evidencia_contexto'),('recoleccion_conciliacion_evidencia')) v(nombre)
  LEFT JOIN pg_catalog.pg_class c ON c.oid=pg_catalog.to_regclass('public.'||v.nombre)
),
triggers AS (
  SELECT v.tabla,v.nombre,EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid=pg_catalog.to_regclass('public.'||v.tabla) AND t.tgname=v.nombre
      AND t.tgfoid=pg_catalog.to_regprocedure(v.funcion) AND t.tgenabled='O' AND t.tgtype=v.tipo) coincide
  FROM (VALUES
    ('recoleccion','trg_recoleccion_acotar_excepcion_fecha_rechazo','public.fn_recoleccion_acotar_excepcion_fecha_rechazo()',21),
    ('recoleccion_movimiento','recepcion_exigida','public.m1_recepcion_proteger_movimiento()',7),
    ('recoleccion_movimiento','trg_recoleccion_movimiento_sync_saldo_operativo','public.fn_recoleccion_movimiento_sync_saldo_operativo()',29)
  ) v(tabla,nombre,funcion,tipo)
),
conteos AS (
  -- CASE evita consultar una tabla ausente o sin SELECT para el ejecutor actual.
  -- Las dos consultas son constantes y devuelven exclusivamente COUNT.
  SELECT CASE WHEN pg_catalog.to_regclass('public.recoleccion_conciliacion_evento') IS NOT NULL
      AND has_table_privilege(current_user,pg_catalog.to_regclass('public.recoleccion_conciliacion_evento'),'SELECT')
    THEN jsonb_build_object(
      'eventos_totales',((xpath('/table/row/conteo/text()',query_to_xml(
        'SELECT count(*) AS conteo FROM public.recoleccion_conciliacion_evento',false,false,'')))[1]::text)::bigint,
      'origenes_en_padron',((xpath('/table/row/conteo/text()',query_to_xml(
        'SELECT count(*) AS conteo FROM (SELECT DISTINCT ON (recoleccion_id) estado FROM public.recoleccion_conciliacion_evento ORDER BY recoleccion_id,revision DESC) e WHERE estado<>''RETIRADO''',false,false,'')))[1]::text)::bigint)
    ELSE NULL END datos
),
comprobaciones AS (
  SELECT 'roles_requeridos_presentes' nombre,(SELECT bool_and(oid IS NOT NULL) FROM roles_objetivo) cumple
  UNION ALL SELECT 'raices_presentes',(SELECT bool_and(oid IS NOT NULL) FROM raices)
  UNION ALL SELECT 'escritura_tabla_anon_auth_ausente',(SELECT bool_and(NOT concedido) FROM privilegios
    WHERE rol IN ('anon','authenticated') AND privilegio<>'SELECT')
  UNION ALL SELECT 'escritura_columna_anon_auth_ausente',(SELECT bool_and(NOT escritura_efectiva) FROM columnas)
  UNION ALL SELECT 'funciones_097_presentes_y_privadas',(SELECT bool_and(presente AND privadas AND grant_servicio_coincide) FROM funciones)
  UNION ALL SELECT 'cuerpos_criticos_097_coinciden',(SELECT bool_and(coalesce(sha256_cuerpo=sha256_cuerpo_esperado,false))
    FROM funciones WHERE sha256_cuerpo_esperado IS NOT NULL)
  UNION ALL SELECT 'tablas_097_presentes_privadas_inmutables',(SELECT bool_and(presente AND privadas AND rls AND historial_inmutable) FROM tablas)
  UNION ALL SELECT 'triggers_efectivos_coinciden',(SELECT bool_and(coincide) FROM triggers)
  UNION ALL SELECT 'check_fecha_rango_retirado',NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid=pg_catalog.to_regclass('public.recoleccion') AND c.conname='chk_fecha_rango')
)
SELECT jsonb_pretty(jsonb_build_object(
  'informe','POSTFLIGHT_FOCAL_VIVERO_097',
  'migracion_097_sha256_referencia','21eb5f5a52ed04e124891e764548e761483742545e2c1da83f074a0b90ea14c2',
  'entorno',jsonb_build_object('version_postgresql',current_setting('server_version'),
    'hora_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'transaccion_solo_lectura',current_setting('transaction_read_only')),
  'alcance','Catálogo y conteos posteriores a instalación. No acredita habilitación del piloto.',
  'comprobaciones',(SELECT jsonb_object_agg(nombre,cumple ORDER BY nombre) FROM comprobaciones),
  'privilegios_tabla',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tabla,rol,privilegio) FROM privilegios p),
  'escritura_columnas',(SELECT jsonb_agg(to_jsonb(c) ORDER BY tabla,rol) FROM columnas c),
  'rls_raices',(SELECT jsonb_agg(to_jsonb(r)-'oid'-'relowner' ORDER BY nombre) FROM raices r),
  'funciones',(SELECT jsonb_agg(to_jsonb(f) ORDER BY firma) FROM funciones f),
  'tablas',(SELECT jsonb_agg(to_jsonb(t) ORDER BY nombre) FROM tablas t),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY tabla,nombre) FROM triggers t),
  'conteos',(SELECT datos FROM conteos)
)) AS postflight_vivero_097;
COMMIT;
