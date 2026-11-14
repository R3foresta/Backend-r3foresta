-- Diagnóstico del preflight de antecedentes críticos de102.
-- SOLO LECTURA: catálogo de funciones, sin filas de negocio ni cambios de SQL.
-- Ejecutar íntegro y compartir el resultado. No sustituye ni omite el preflight.
-- Fecha acepta010 original y su variante verificada sin bloque TODO; no otros cuerpos.
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
WITH esperados(firma,sha256_aceptados,definer_esperado) AS (VALUES
  ('public.m2_exigir_vivero(bigint,bigint)',ARRAY['dea018c1d8448bd360849c06ecc030d72241b5b4c1fde065dddf5ca89570caa3'],true),
  ('public.m2_acceso_efectivo(bigint,bigint)',ARRAY['c1470203e55fa6c2b511ab54a1223297c76bc125d4cbf12ce0c68e431fd3ad66'],true),
  ('public.m1_exigir_actor(bigint,boolean)',ARRAY['acb68521ae22771dc55e2cc0465d6988395bedf59391c1f7426e633d5cf34a3d'],true),
  ('public.pa_d_cuenta(bigint)',ARRAY['055c53cbd84b34a34fa6fd1e1734b54222b81e7cc80de17f0d74fca7252edd56'],false),
  ('public.fn_vivero_assert_fecha_operativa(date,date)',ARRAY['e62b14d2c5d963a0d9c49be78a766d1077e6b1219061da0449c99d825c3e7273','b0195755dbff0ec1d6da9518324884e654209936237dc9a0ce45c27b47c105a1'],false),
  ('public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)',ARRAY['4c6b099b1c67e18c17a7bc829734be833cd8d38d100d9ecb60508b4c2354a86e'],true),
  ('public.fn_subcampania_historial_prevent_mutation()',ARRAY['d8a06f5e3c465c27fc613260cca608d0150a72803ab2681bdfe4c7a7b5ecf443'],false)
), observados AS (
  SELECT e.*,p.oid,p.prosecdef,p.proconfig,
    encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') sha256_actual,
    CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END definicion
  FROM esperados e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.firma)
)
SELECT firma,
  CASE WHEN oid IS NULL THEN 'AUSENTE'
    WHEN prosecdef IS DISTINCT FROM definer_esperado THEN 'SEGURIDAD_DIFERENTE'
    WHEN NOT coalesce(sha256_actual=ANY(sha256_aceptados),false) THEN 'CUERPO_DIFERENTE'
    ELSE 'COINCIDE' END estado,
  oid IS NOT NULL presente,definer_esperado,prosecdef security_definer_actual,
  sha256_aceptados[1] sha256_esperado,sha256_aceptados,sha256_actual,proconfig configuracion,
  CASE WHEN NOT coalesce(sha256_actual=ANY(sha256_aceptados),false)
    OR prosecdef IS DISTINCT FROM definer_esperado THEN definicion END definicion_a_revisar
FROM observados
ORDER BY firma;
COMMIT;
