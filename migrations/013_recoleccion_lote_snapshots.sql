-- 013_recoleccion_lote_snapshots.sql
-- Objetivo:
-- - Guardar snapshots explicitos de identidad vegetal en public.recoleccion
-- - Preparar herencia de snapshots hacia public.lote_vivero
--
-- Nota:
-- - Esta migracion no realiza backfill ni transformacion de datos historicos.
-- - El entorno actual usa datos de prueba y puede limpiarse antes de aplicar reglas
--   mas estrictas a nivel de aplicacion o base de datos.

DO $$
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.recoleccion. Esta migracion requiere el esquema base de Recoleccion.';
  END IF;

  IF to_regclass('public.lote_vivero') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.lote_vivero. Esta migracion requiere el esquema base de Vivero.';
  END IF;
END;
$$;

-- =========================================================
-- RECOLECCION: snapshots explicitos de identidad
-- =========================================================

ALTER TABLE public.recoleccion
  ADD COLUMN IF NOT EXISTS nombre_cientifico_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS nombre_comercial_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS variedad_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS nombre_comunidad_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS nombre_recolector_snapshot TEXT;

COMMENT ON COLUMN public.recoleccion.nombre_cientifico_snapshot
  IS 'Nombre cientifico congelado de la planta al momento de registrar/validar la recoleccion.';

COMMENT ON COLUMN public.recoleccion.nombre_comercial_snapshot
  IS 'Nombre comercial o comun congelado al momento de registrar/validar la recoleccion.';

COMMENT ON COLUMN public.recoleccion.variedad_snapshot
  IS 'Variedad congelada de la planta al momento de registrar/validar la recoleccion.';

COMMENT ON COLUMN public.recoleccion.nombre_comunidad_snapshot
  IS 'Nombre de la comunidad de origen congelado al momento de registrar/validar la recoleccion.';

COMMENT ON COLUMN public.recoleccion.nombre_recolector_snapshot
  IS 'Nombre del recolector/responsable congelado al momento de registrar/validar la recoleccion.';

-- =========================================================
-- LOTE_VIVERO: snapshots heredados desde recoleccion
-- =========================================================

ALTER TABLE public.lote_vivero
  ADD COLUMN IF NOT EXISTS variedad_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS nombre_comunidad_origen_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS nombre_responsable_snapshot TEXT;

COMMENT ON COLUMN public.lote_vivero.variedad_snapshot
  IS 'Variedad heredada desde recoleccion y congelada al crear el lote.';

COMMENT ON COLUMN public.lote_vivero.nombre_comunidad_origen_snapshot
  IS 'Nombre de la comunidad origen heredado desde recoleccion y congelado al crear el lote.';

COMMENT ON COLUMN public.lote_vivero.nombre_responsable_snapshot
  IS 'Nombre del responsable que crea el lote de vivero, congelado al momento de creacion.';
