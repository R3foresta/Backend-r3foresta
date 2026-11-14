-- SINTÉTICO AISLADO T5 + inicial075. Ejecutar únicamente dentro del runner T5,
-- sobre su antecedente T2/077/100/102 y PostGIS real. No es replay001–100.
-- La infraestructura M3 ya fue completada por vivero-acceso-postgis-fixture.sql.
-- 074/075 se instalan íntegramente: comandos/cargas/locks/LIFO/consumos y PostGIS
-- siguen siendo las funciones reales. Los bytes externos de Storage no se
-- acreditan mediante estas preparaciones SQL de metadatos sintéticos.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis')
    OR to_regclass('public.vivero_incorporacion') IS NULL
    OR to_regprocedure('public.m2_incorporacion_crear(bigint,uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_T5_INICIAL_REQUIERE_100_102_Y_POSTGIS_REAL'; END IF;
END $$;
\ir ../../migrations/074_pa_int03a_cargas.sql
\ir ../../migrations/075_pa_int03a_registro.sql
-- No se reinstalan076/077/095 aquí: reemplazarían operaciones M2 posteriores.
-- 075 no modifica la firma/cuerpo de las cuatro operaciones M2 ni los helpers
-- m2_incorporacion_*. El preflight102 continúa comprobándolos en la repetición.
