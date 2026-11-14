-- T5 postflight: catálogo posterior a101–107. SOLO LECTURA.
-- No crea funciones/tablas, no ejecuta RPC operativas ni lee filas de negocio.
-- Huellas del commit7984368; compartir la única columna JSON.
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH esperados(firma,sha256_esperado,definer_esperado,fuente) AS (VALUES
  ('public.m2_incorporacion_integridad()','7b8273286e33fb0ad0f8f4b4b9a502964a4a88808a038c4602e9572ab1175423',true,'102'),
  ('public.m2_incorporacion_conservar_lote()','4289a168f48509c1e45f36a895c67d71579a3b6e6883e09d4a2498b6116cb9a7',true,'102'),
  ('public.m2_incorporacion_conservar_evento()','7962ab7afab5e4ff495f6a456012a9be8d1be8175d01695f891b65445740aefc',true,'102'),
  ('public.m2_incorporacion_recibo(bigint)','aaeaa7a724d1475a71213040fceceaf8cb707592dbf288c6e1603eb477831a74',true,'102'),
  ('public.m2_incorporacion_recuperar(bigint,uuid)','5671b16415d797010d24e7e595ae44eb561f9ffe88aad5d3b1681d82abe30121',true,'102'),
  ('public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb)','f7aaa4b7e0c90599ec750291ec9b5d0232aa65e881f6cfc2e3fe5c56b5192936',true,'102'),
  ('public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid)','2f2c67f6605b0c3f484362bfcead4c2235c0d47b8a8b0e62e6f691dec21ecac6',true,'102'),
  ('public.m2_incorporacion_crear(bigint,uuid,jsonb)','a8c18b371af2ba8631f8e3f0dc36be63ca637a16828d9e83fc38ddeb4827025f',true,'102'),
  ('public.fn_vivero_registrar_adaptabilidad(bigint,date,bigint,public.subetapa_adaptabilidad,text,bigint[])','efb117beabdf0d6f829c1b975679569b307146fd2a6bd6b2fdd79e8698d601e0',true,'102'),
  ('public.fn_vivero_registrar_despacho(bigint,date,bigint,integer,public.destino_tipo_vivero,text,bigint,text,bigint[])','2a8f950a2af740c06c889ac361de341db4b444f20c9ab2c9eb252941f71d91b8',true,'102'),
  ('public.fn_vivero_registrar_merma(bigint,date,bigint,integer,public.causa_merma_vivero,text,bigint[])','4f0d97ae7dcef9f35ecd8d79733c8478376f1326258b95aa4ed0a3a5d9d4e325',true,'102'),
  ('public.fn_vivero_asignar_stock_subcampania(bigint,bigint,int,public.proposito_asignacion,bigint,date,bigint[],text)','46ccc3bec635058a51fac028e2e9db18aa3240b62f15a596b53fe97805dcbff1',true,'102'),
  ('public.t5_detalle_snapshot_lote()','a06508652d0f22632a863fef9ada2d016e020c0950787a007724cfb66687c894',false,'103'),
  ('public.pa_registro_procedencia_propia_leer(bigint,text,bigint)','d6a5f36d7acd127e3e05bc464b2b6d422838d4dbe06584d33a9f847ffc8bc400',false,'103'),
  ('public.fn_vivero_registrar_adaptabilidad_exacto(bigint,date,bigint,public.subetapa_adaptabilidad,text,bigint[])','7b5fcc734dc44f9ae6be4a8b7abb9ab6aa22343530b47c168da574f23530dfb5',true,'105'),
  ('public.fn_vivero_registrar_merma_exacto(bigint,date,bigint,integer,public.causa_merma_vivero,text,bigint[])','9f4328be938648999cea583afb101ac892b9d0dd3c3ce2c944e5b53a48c14689',true,'105'),
  ('public.fn_vivero_registrar_despacho_exacto(bigint,date,bigint,integer,public.destino_tipo_vivero,text,bigint,text,bigint[])','b7662e2afff63ac2c32042747d13cb39198a59a3b09d5102a508284646ed951a',true,'105'),
  ('public.fn_vivero_asignar_stock_subcampania_exacto(bigint,bigint,int,public.proposito_asignacion,bigint,date,bigint[],text)','5b0c084508fc83acc351396ed6e1d00a90bbec82c9ccc76fd781122ea6b1cdcb',true,'105'),
  ('public.fn_m3_devolver_asignacion_vivero_exacto(bigint,int,public.motivo_devolucion_plantacion,bigint,date,text)','6dcf5d38be183b55034377c5aa6e6857a85ad751f47ccf4502a8021608288ed6',true,'105'),
  ('public.fn_m3_registrar_plantacion_exacto(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])','abdf5e3246fc318c764a68ae3d8682dac1f4b059c40619d409a6cd5cc13cab5e',false,'106'),
  ('public.pa_d_evidencias_reposicion_exacto(bigint,bigint,text,jsonb)','91a78bff831846f87834480f24acb8a84e9d76cb4d29889a176c3628be4fbded',false,'106')
), funciones AS (
  SELECT e.*,p.oid IS NOT NULL presente,
    coalesce(encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e.sha256_esperado,false) cuerpo_coincide,
    coalesce(p.prosecdef=e.definer_esperado,false) seguridad_coincide,
    p.proconfig configuracion,
    CASE WHEN p.oid IS NOT NULL THEN pg_get_function_result(p.oid) END retorno,
    CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('anon',p.oid,'EXECUTE') END anon_execute,
    CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END authenticated_execute,
    CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('service_role',p.oid,'EXECUTE') END servicio_execute,
    CASE WHEN p.oid IS NOT NULL THEN EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') END public_execute
  FROM esperados e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.firma)
), tablas AS (
  SELECT nombre,to_regclass('public.'||nombre) oid FROM (VALUES
    ('lote_vivero'),('evento_lote_vivero'),('m2_evidencia_contexto'),('vivero_incorporacion'),('registro_plantacion_detalle')) t(nombre)
), restricciones AS (
  SELECT t.nombre tabla,c.conname nombre,c.convalidated validada,pg_get_constraintdef(c.oid) definicion
  FROM tablas t JOIN pg_constraint c ON c.conrelid=t.oid
), triggers AS (
  SELECT t.nombre tabla,g.tgname nombre,g.tgenabled habilitado,g.tgfoid::regprocedure::text funcion,pg_get_triggerdef(g.oid) definicion
  FROM tablas t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
), indices AS (
  SELECT t.nombre tabla,i.indisunique unico,i.indisvalid valido,pg_get_indexdef(i.indexrelid) definicion
  FROM tablas t JOIN pg_index i ON i.indrelid=t.oid
)
SELECT jsonb_pretty(jsonb_build_object(
  'informe','T5_POSTFLIGHT_101_107_SOLO_LECTURA','revision_fuente','7984368',
  'observado_en_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'postgresql',current_setting('server_version'),'solo_lectura',current_setting('transaction_read_only'),
  'resumen_funciones',jsonb_build_object('esperadas',(SELECT count(*) FROM funciones),
    'presentes',(SELECT count(*) FROM funciones WHERE presente),
    'cuerpos_y_seguridad_coinciden',(SELECT bool_and(cuerpo_coincide AND seguridad_coincide) FROM funciones),
    'sin_execute_publico_anon_auth',(SELECT bool_and(NOT coalesce(public_execute,true) AND NOT coalesce(anon_execute,true) AND NOT coalesce(authenticated_execute,true)) FROM funciones)),
  'funciones',(SELECT jsonb_agg(to_jsonb(f) ORDER BY firma) FROM funciones f),
  'restricciones',(SELECT jsonb_agg(to_jsonb(c) ORDER BY tabla,nombre) FROM restricciones c),
  'triggers',(SELECT jsonb_agg(to_jsonb(g) ORDER BY tabla,nombre) FROM triggers g),
  'indices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY tabla,definicion) FROM indices i),
  'incorporacion_enum',EXISTS(SELECT 1 FROM pg_enum WHERE enumtypid=to_regtype('public.tipo_evento_vivero') AND enumlabel='INCORPORACION'),
  'limites','No acredita Storage, datos operativos, sesión de operador ni HTTP; restricciones/triggers/índices se revisan en su definición.')) AS postflight_t5;
COMMIT;
