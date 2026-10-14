-- El timeout debe existir ANTES del comando PostgREST, no dentro de la RPC.
-- Configuración por rol SQL privado, conservando anon=3s/authenticated=8s.
-- Fuente: https://supabase.com/docs/guides/database/postgres/timeouts
BEGIN;
ALTER ROLE service_role SET statement_timeout='30s';
ALTER ROLE service_role SET lock_timeout='5s';
-- Diagnóstico mínimo privado para medir configuración e interrupción reales vía REST.
-- No consulta ni modifica filas. Máximo 31s para una única prueba de cancelación.
CREATE OR REPLACE FUNCTION public.pa_privado_timeout_diagnostico(p_espera_segundos INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF p_espera_segundos IS NULL OR p_espera_segundos NOT BETWEEN 0 AND 31 THEN
    RAISE EXCEPTION 'ESPERA_INVALIDA';
  END IF;
  IF p_espera_segundos>0 THEN PERFORM pg_sleep(p_espera_segundos); END IF;
  RETURN jsonb_build_object('rol',current_user,'statement_timeout',current_setting('statement_timeout'),
    'lock_timeout',current_setting('lock_timeout'),'observado_en',clock_timestamp());
END $$;
REVOKE EXECUTE ON FUNCTION public.pa_privado_timeout_diagnostico(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pa_privado_timeout_diagnostico(INTEGER) TO service_role;
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'TIMEOUT_CONFIGURADO_PENDIENTE_MEDICION_POSTGREST' AS resultado;
