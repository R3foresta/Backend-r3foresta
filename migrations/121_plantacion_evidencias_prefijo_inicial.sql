-- Añadir inicial/ al reservar una generación nueva en participacion_evidencias.
-- Las reservas vigentes, los vínculos y la limpieza siguen usando rutas guardadas.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
  firma regprocedure := to_regprocedure('public.pa_cargas_operar(bigint,text,text,uuid,jsonb)');
  huella_074 constant text := '6f6e7e3d2f1ff1ae79f1b9f72dacf05a6338ff991d3cb30722822422c859a327';
  huella_121 constant text := 'e79fc884b3bdc23109b5f17cf1cfc62743bf29597347854f49d22e69d40a0c13';
  ruta_074 constant text := $linea$v_ruta:=p_actor_id||'/'||p_comando_id||'/'||v_carga||'/'||v_gen;$linea$;
  ruta_121 constant text := $linea$v_ruta:='inicial/'||p_actor_id||'/'||p_comando_id||'/'||v_carga||'/'||v_gen;$linea$;
  huella text;
BEGIN
  SELECT encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') INTO huella
    FROM pg_proc WHERE oid = firma AND NOT prosecdef;
  IF huella IS NULL OR huella NOT IN (huella_074, huella_121) THEN
    RAISE EXCEPTION 'M3_STORAGE_ANTECEDENTE_INCOMPATIBLE: revisar pa_cargas_operar';
  END IF;
  IF NOT has_function_privilege('service_role', firma, 'EXECUTE')
     OR has_function_privilege('anon', firma, 'EXECUTE')
     OR has_function_privilege('authenticated', firma, 'EXECUTE') THEN
    RAISE EXCEPTION 'M3_STORAGE_PRIVILEGIOS_INCOMPATIBLES';
  END IF;
  IF huella = huella_074 THEN
    EXECUTE replace(pg_get_functiondef(firma), ruta_074, ruta_121);
    IF (SELECT encode(sha256(convert_to(prosrc, 'UTF8')), 'hex')
          FROM pg_proc WHERE oid = firma) IS DISTINCT FROM huella_121 THEN
      RAISE EXCEPTION 'M3_STORAGE_DEFINICION_INCOMPATIBLE';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
