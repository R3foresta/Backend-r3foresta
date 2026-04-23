-- 016_recoleccion_movimiento_unidad_compat.sql
-- Objetivo:
-- - reparar la desalineacion entre entornos que exponen
--   recoleccion_movimiento.unidad_operativa y otros que exponen
--   recoleccion_movimiento.unidad_medida_evento
-- - mantener ambas columnas sincronizadas para no romper triggers legacy
--   ni contratos REST ya publicados

DO $$
BEGIN
  IF to_regclass('public.recoleccion_movimiento') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.recoleccion_movimiento. Esta migracion requiere el ledger de movimientos.';
  END IF;

  IF to_regtype('public.unidad_medida') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.unidad_medida. Ejecuta antes las migraciones base de unidades.';
  END IF;
END;
$$;

DO $$
DECLARE
  v_has_unidad_operativa BOOLEAN;
  v_has_unidad_medida_evento BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_operativa'
  )
  INTO v_has_unidad_operativa;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_medida_evento'
  )
  INTO v_has_unidad_medida_evento;

  IF NOT v_has_unidad_operativa AND NOT v_has_unidad_medida_evento THEN
    RAISE EXCEPTION
      'public.recoleccion_movimiento no tiene ni unidad_operativa ni unidad_medida_evento.';
  END IF;

  IF NOT v_has_unidad_operativa THEN
    ALTER TABLE public.recoleccion_movimiento
      ADD COLUMN unidad_operativa public.unidad_medida;
  END IF;

  IF NOT v_has_unidad_medida_evento THEN
    ALTER TABLE public.recoleccion_movimiento
      ADD COLUMN unidad_medida_evento public.unidad_medida;
  END IF;
END;
$$;

UPDATE public.recoleccion_movimiento
SET unidad_operativa = COALESCE(unidad_operativa, unidad_medida_evento),
    unidad_medida_evento = COALESCE(unidad_medida_evento, unidad_operativa)
WHERE unidad_operativa IS DISTINCT FROM unidad_medida_evento
   OR unidad_operativa IS NULL
   OR unidad_medida_evento IS NULL;

CREATE OR REPLACE FUNCTION public.fn_recoleccion_movimiento_sync_unidad_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.unidad_operativa IS NULL AND NEW.unidad_medida_evento IS NULL THEN
    RAISE EXCEPTION
      'recoleccion_movimiento requiere unidad_operativa o unidad_medida_evento.';
  END IF;

  IF NEW.unidad_operativa IS NULL THEN
    NEW.unidad_operativa := NEW.unidad_medida_evento;
  END IF;

  IF NEW.unidad_medida_evento IS NULL THEN
    NEW.unidad_medida_evento := NEW.unidad_operativa;
  END IF;

  IF NEW.unidad_operativa IS DISTINCT FROM NEW.unidad_medida_evento THEN
    RAISE EXCEPTION
      'unidad_operativa (%) y unidad_medida_evento (%) deben ser equivalentes.',
      NEW.unidad_operativa,
      NEW.unidad_medida_evento;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recoleccion_movimiento_sync_unidad_columns
  ON public.recoleccion_movimiento;

CREATE TRIGGER trg_recoleccion_movimiento_sync_unidad_columns
BEFORE INSERT OR UPDATE OF unidad_operativa, unidad_medida_evento
ON public.recoleccion_movimiento
FOR EACH ROW
EXECUTE FUNCTION public.fn_recoleccion_movimiento_sync_unidad_columns();

COMMENT ON COLUMN public.recoleccion_movimiento.unidad_operativa
  IS 'Columna de compatibilidad para triggers legacy. Debe reflejar el mismo valor que unidad_medida_evento.';

COMMENT ON COLUMN public.recoleccion_movimiento.unidad_medida_evento
  IS 'Columna expuesta para consumo operativo/REST. Se mantiene sincronizada con unidad_operativa por compatibilidad.';

NOTIFY pgrst, 'reload schema';
