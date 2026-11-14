-- Diagnóstico T5 revisión/107: ejecutar íntegro en el SQL Editor del destino.
-- SOLO LECTURA de catálogo. Sin .env, filas operativas, datos personales o Storage.
-- No aplica migraciones ni modifica permisos/roles. Compartir la única columna JSON.
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH firmas_base AS (
  SELECT * FROM (VALUES
    ('public.fn_vivero_registrar_embolsado(bigint,date,bigint,integer,text,bigint[])',
      'fd072db314cef4d158e3e19eac9844bb055f47ceafc3ca9eb1963a4ca0c7acb9','095'),
    ('public.m2_exigir_vivero(bigint,bigint)','dea018c1d8448bd360849c06ecc030d72241b5b4c1fde065dddf5ca89570caa3','095'),
    ('public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)','4c6b099b1c67e18c17a7bc829734be833cd8d38d100d9ecb60508b4c2354a86e','095'),
    ('public.m2_acceso_efectivo(bigint,bigint)','c1470203e55fa6c2b511ab54a1223297c76bc125d4cbf12ce0c68e431fd3ad66','094'),
    ('public.m1_exigir_actor(bigint,boolean)','acb68521ae22771dc55e2cc0465d6988395bedf59391c1f7426e633d5cf34a3d','093'),
    ('public.pa_d_cuenta(bigint)','055c53cbd84b34a34fa6fd1e1734b54222b81e7cc80de17f0d74fca7252edd56','077'),
    ('public.fn_vivero_assert_fecha_operativa(date,date)','e62b14d2c5d963a0d9c49be78a766d1077e6b1219061da0449c99d825c3e7273','010'),
    ('public.fn_vivero_crear_lote_desde_recoleccion(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text)',NULL,'100'),
    ('public.m2_incorporacion_crear(bigint,uuid,jsonb)',NULL,'102 opcional'),
    ('public.m2_incorporacion_recuperar(bigint,uuid)',NULL,'102 opcional')
  ) x(firma,sha256_esperado,fuente)
), firmas AS (
  SELECT f.*,CASE
    WHEN sha256_esperado IS NULL THEN NULL::text[]
    WHEN firma='public.fn_vivero_assert_fecha_operativa(date,date)'
      THEN ARRAY[sha256_esperado,'b0195755dbff0ec1d6da9518324884e654209936237dc9a0ce45c27b47c105a1']
    ELSE ARRAY[sha256_esperado] END sha256_aceptados
  FROM firmas_base f
), funciones AS (
  SELECT f.firma,f.fuente,f.sha256_esperado,f.sha256_aceptados,p.oid IS NOT NULL presente,
    encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha256_efectivo,
    CASE WHEN f.sha256_esperado IS NOT NULL THEN
      coalesce(encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=ANY(f.sha256_aceptados),false) END cuerpo_coincide,
    l.lanname lenguaje,p.prosecdef security_definer,p.proretset devuelve_set,
    CASE WHEN p.oid IS NOT NULL THEN pg_get_function_result(p.oid) END retorno,
    p.proconfig configuracion,p.proowner::regrole::text propietario,
    CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon',p.oid,'EXECUTE') END anon_execute,
    CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END authenticated_execute,
    CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('service_role',p.oid,'EXECUTE') END service_execute,
    CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END definicion
  FROM firmas f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.firma)
    LEFT JOIN pg_language l ON l.oid=p.prolang
), tablas AS (
  SELECT t.nombre,c.oid,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole::text propietario
  FROM (VALUES('lote_vivero'),('evento_lote_vivero'),('m2_evidencia_contexto'),('vivero_incorporacion')) t(nombre)
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.nombre)
), columnas AS (
  SELECT t.nombre tabla,a.attname nombre,format_type(a.atttypid,a.atttypmod) tipo,a.attnotnull obligatoria,
    pg_get_expr(d.adbin,d.adrelid) expresion_default
  FROM tablas t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
), restricciones AS (
  SELECT t.nombre tabla,c.conname nombre,c.contype tipo,c.convalidated validada,
    c.condeferrable diferible,c.condeferred inicialmente_diferida,pg_get_constraintdef(c.oid) definicion
  FROM tablas t JOIN pg_constraint c ON c.conrelid=t.oid
), indices AS (
  SELECT t.nombre tabla,ic.relname nombre,i.indisunique unico,i.indisvalid valido,i.indisready listo,
    pg_get_expr(i.indpred,i.indrelid) predicado,pg_get_indexdef(i.indexrelid) definicion
  FROM tablas t JOIN pg_index i ON i.indrelid=t.oid JOIN pg_class ic ON ic.oid=i.indexrelid
), disparadores AS (
  SELECT t.nombre tabla,g.tgname nombre,g.tgenabled habilitado,g.tgfoid::regprocedure::text funcion,
    pg_get_triggerdef(g.oid) definicion
  FROM tablas t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
)
SELECT jsonb_pretty(jsonb_build_object(
  'informe','T5_EMBOLSADO_107_CATALOGO_SOLO_LECTURA',
  'observado_en_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'postgresql',current_setting('server_version'),'timezone_sesion',current_setting('TimeZone'),
  'transaccion_solo_lectura',current_setting('transaction_read_only'),
  'interpretacion','010 exige antes no NULL en EMBOLSADO;019/095 insertan NULL.107 adapta CHECK conservando cero histórico. El diagnóstico no acredita SQL aplicado por número ni modifica datos.',
  'funciones',(SELECT jsonb_agg(to_jsonb(f) ORDER BY firma) FROM funciones f),
  'tablas',(SELECT jsonb_agg(to_jsonb(t)-'oid' ORDER BY nombre) FROM tablas t),
  'columnas',(SELECT jsonb_agg(to_jsonb(c) ORDER BY tabla,nombre) FROM columnas c),
  'restricciones',(SELECT jsonb_agg(to_jsonb(c) ORDER BY tabla,nombre) FROM restricciones c),
  'indices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tabla,nombre) FROM indices i),
  'disparadores',(SELECT jsonb_agg(to_jsonb(g) ORDER BY tabla,nombre) FROM disparadores g),
  'tipo_evento_vivero',(SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e
    WHERE e.enumtypid=to_regtype('public.tipo_evento_vivero'))
)) AS diagnostico_t5_embolsado_107;
COMMIT;
