-- 058_recoleccion_motivo_rechazo.sql
--
-- Alinea la persistencia de Recoleccion con el contrato HTTP de rechazo:
-- PATCH /api/recolecciones/:id/reject recibe motivo_rechazo de 10 a 500
-- caracteres y debe conservarlo en la ficha, ademas del historial append-only.

DO $$
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.recoleccion. Esta migracion requiere el esquema base de Recoleccion.';
  END IF;
END;
$$;

ALTER TABLE public.recoleccion
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_recoleccion_motivo_rechazo_longitud'
      AND conrelid = 'public.recoleccion'::regclass
  ) THEN
    ALTER TABLE public.recoleccion
      ADD CONSTRAINT chk_recoleccion_motivo_rechazo_longitud
      CHECK (
        motivo_rechazo IS NULL
        OR char_length(motivo_rechazo) BETWEEN 10 AND 500
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.recoleccion.motivo_rechazo
  IS 'Motivo comunicado por el validador al rechazar la recoleccion. Es nullable para registros que nunca fueron rechazados y conserva exactamente el texto aceptado por el contrato HTTP (10 a 500 caracteres).';

COMMENT ON CONSTRAINT chk_recoleccion_motivo_rechazo_longitud
  ON public.recoleccion IS
  'Cuando existe, motivo_rechazo debe tener entre 10 y 500 caracteres, igual que RejectValidationDto.';

NOTIFY pgrst, 'reload schema';
