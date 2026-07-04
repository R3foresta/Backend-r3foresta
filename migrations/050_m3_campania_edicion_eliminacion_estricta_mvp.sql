-- 050_m3_campania_edicion_eliminacion_estricta_mvp.sql
-- Modulo 3 (Plantacion) — regla MVP RN-PLA-38:
-- - datos generales de campania corregibles sin cascada;
-- - tipo solo editable si no hay ninguna subcampania asociada (incluso soft-deleted);
-- - desactivacion logica (soft-delete) permitida si no hay subcampanias o si todas
--   estan CANCELADA;
-- - DELETE fisico solo si no hay ninguna subcampania asociada.
--
-- Origen: RN-PLA-38 (r3foresta-docs/03-plantacion-module/01_reglas_de_negocio_plantacion.md)
--         ADR-PLA-01 (r3foresta-docs/decisiones/02_decisiones_plantacion.md).
-- Depende de: 028 (campania), 029 (subcampania), 037 (campania.tipo).
-- Idempotente.

DO $$
BEGIN
  IF to_regclass('public.campania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.campania. Ejecuta la migracion 028 primero.';
  END IF;

  IF to_regclass('public.campania_organizacion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.campania_organizacion. Ejecuta la migracion 028 primero.';
  END IF;

  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta la migracion 029 primero.';
  END IF;
END $$;

-- El trigger especifico de tipo creado en 037 queda reemplazado por una regla
-- MVP mas precisa: permite correcciones generales, bloquea cambio de tipo si
-- ya existe cualquier subcampania (incluso soft-deleted), y regula soft-delete
-- y DELETE fisico segun estado de subcampanias.
DROP TRIGGER IF EXISTS trg_campania_tipo_inmutable ON public.campania;
DROP TRIGGER IF EXISTS trg_campania_edicion_estricta_mvp ON public.campania;
DROP TRIGGER IF EXISTS trg_campania_edicion_eliminacion_estricta_mvp ON public.campania;
DROP TRIGGER IF EXISTS trg_campania_delete_estricto_mvp ON public.campania;
DROP FUNCTION IF EXISTS public.check_campania_edicion_estricta_mvp();
DROP FUNCTION IF EXISTS public.check_campania_edicion_eliminacion_estricta_mvp();

CREATE OR REPLACE FUNCTION public.check_campania_edicion_eliminacion_estricta_mvp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- DELETE fisico: solo permitido si nunca hubo subcampanias (incluso soft-deleted).
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.subcampania
      WHERE campania_id = OLD.id
    ) THEN
      RAISE EXCEPTION
        'CAMPANIA % no se puede eliminar: ya tiene subcampanias asociadas',
        OLD.id;
    END IF;

    RETURN OLD;
  END IF;

  -- Cambio de tipo: bloqueado si existe cualquier subcampania asociada
  -- (incluye BORRADOR, ACTIVA, CANCELADA e historicas soft-deleted).
  IF OLD.tipo IS DISTINCT FROM NEW.tipo
     AND EXISTS (
       SELECT 1
       FROM public.subcampania
       WHERE campania_id = OLD.id
     ) THEN
    RAISE EXCEPTION
      'CAMPANIA % no puede cambiar tipo: ya tiene subcampanias asociadas',
      OLD.id;
  END IF;

  -- Soft-delete / inactivacion logica: permitido si no hay subcampanias vivas
  -- (deleted_at IS NULL) o si todas las vivas estan CANCELADA. Las subcampanias
  -- ya soft-deleted no bloquean el soft-delete de la campania.
  IF NEW.deleted_at IS NOT NULL
     AND (
       OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
       OR OLD.deleted_by IS DISTINCT FROM NEW.deleted_by
     )
     AND EXISTS (
       SELECT 1
       FROM public.subcampania
       WHERE campania_id = OLD.id
         AND deleted_at IS NULL
         AND estado <> 'CANCELADA'
     ) THEN
    RAISE EXCEPTION
      'CAMPANIA % no se puede desactivar: tiene subcampanias no canceladas',
      OLD.id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_campania_edicion_eliminacion_estricta_mvp
  ON public.campania;

CREATE TRIGGER trg_campania_edicion_eliminacion_estricta_mvp
BEFORE UPDATE OF tipo, deleted_at, deleted_by
ON public.campania
FOR EACH ROW
EXECUTE FUNCTION public.check_campania_edicion_eliminacion_estricta_mvp();

DROP TRIGGER IF EXISTS trg_campania_delete_estricto_mvp
  ON public.campania;

CREATE TRIGGER trg_campania_delete_estricto_mvp
BEFORE DELETE
ON public.campania
FOR EACH ROW
EXECUTE FUNCTION public.check_campania_edicion_eliminacion_estricta_mvp();

COMMENT ON FUNCTION public.check_campania_edicion_eliminacion_estricta_mvp() IS
  'Regla MVP RN-PLA-38: bloquea cambio de tipo con cualquier subcampania asociada; permite soft-delete sin subcampanias o si todas las vivas estan CANCELADA; bloquea DELETE fisico si hay cualquier subcampania asociada.';

-- La relacion CAMPANIA_ORGANIZACION queda editable en el MVP; limpiamos
-- cualquier trigger restrictivo dejado por borradores previos.
DROP TRIGGER IF EXISTS trg_campania_organizacion_edicion_estricta_mvp
  ON public.campania_organizacion;
DROP FUNCTION IF EXISTS public.check_campania_organizacion_edicion_estricta_mvp();

NOTIFY pgrst, 'reload schema';
