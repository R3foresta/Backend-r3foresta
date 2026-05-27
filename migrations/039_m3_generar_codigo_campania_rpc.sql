-- 039_m3_generar_codigo_campania_rpc.sql
-- Modulo 3 (Plantacion) — RPC para generar codigos de trazabilidad de campanias.
-- Formato: 'CMP-{anio}-{NNN}' donde NNN es el contador global zero-padded a 3 digitos.
-- Depende de: 028_m3_campania.sql (tabla public.campania con columna codigo_trazabilidad).
-- Idempotente: DROP FUNCTION IF EXISTS antes de CREATE; CREATE SEQUENCE IF NOT EXISTS.
--
-- Uso desde el backend (campanias-codigos.service.ts):
--   const { data } = await supabase.rpc('fn_generar_codigo_campania', { p_anio: 2025 });
--   // data === 'CMP-2025-001'  (primera llamada)
--   // data === 'CMP-2025-002'  (segunda llamada)

DO $$
BEGIN
  IF to_regclass('public.campania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.campania. Ejecuta la migracion 028 primero.';
  END IF;
END $$;

-- =====================================================================
-- 1. Secuencia de contador para codigos de campania
-- =====================================================================
-- La secuencia es global y no reinicia por anio. El anio se inyecta como
-- parametro en la funcion para construir el formato correcto. Si en el
-- futuro se necesita reinicio anual automatico, reemplazar por una tabla
-- de contadores indexada por anio.

CREATE SEQUENCE IF NOT EXISTS public.seq_codigo_campania_contador
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE public.seq_codigo_campania_contador IS
  'Contador global para el sufijo numerico de codigos de campania (CMP-YYYY-NNN). Avanza con cada llamada a fn_generar_codigo_campania. No reinicia por anio; el anio se pasa como parametro a la funcion.';

-- =====================================================================
-- 2. RPC fn_generar_codigo_campania
-- =====================================================================
-- Genera y retorna el siguiente codigo de trazabilidad para el anio dado.
-- Consume un valor de la secuencia de forma atomica: el NEXTVAL ocurre
-- dentro de la misma transaccion que el INSERT en campania, garantizando
-- que no se generan huecos ni duplicados bajo carga concurrente.
--
-- Parametros:
--   p_anio INT  — anio de la campania (ej. 2025)
-- Retorno:
--   TEXT        — codigo en formato 'CMP-2025-001'
--
-- Ejemplos:
--   SELECT fn_generar_codigo_campania(2025);  --> 'CMP-2025-001'
--   SELECT fn_generar_codigo_campania(2025);  --> 'CMP-2025-002'
--   SELECT fn_generar_codigo_campania(2026);  --> 'CMP-2026-003'  (secuencia es global)
--
-- Uso atomico desde una RPC de creacion de campania:
--   v_codigo := fn_generar_codigo_campania(EXTRACT(YEAR FROM CURRENT_DATE)::INT);
--   INSERT INTO public.campania (codigo_trazabilidad, ...) VALUES (v_codigo, ...);

DROP FUNCTION IF EXISTS public.fn_generar_codigo_campania(INT);

CREATE FUNCTION public.fn_generar_codigo_campania(p_anio INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_siguiente BIGINT;
BEGIN
  v_siguiente := nextval('public.seq_codigo_campania_contador');
  RETURN 'CMP-' || p_anio::TEXT || '-' || lpad(v_siguiente::TEXT, 3, '0');
END $$;

COMMENT ON FUNCTION public.fn_generar_codigo_campania(INT) IS
  'Genera el siguiente codigo de trazabilidad para una campania: CMP-{anio}-{NNN}. Incrementa seq_codigo_campania_contador de forma atomica. Llamar dentro de la misma transaccion que el INSERT en campania para garantizar consistencia.';
