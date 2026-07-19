-- 056_fix_devolucion_saldo_constraint.sql
-- Permite y valida el incremento de saldo producido por una devolucion fisica.
-- Depende de: 051 (enum DEVOLUCION_PLANTACION) y 054 (RPC de devolucion).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'tipo_evento_vivero'
      AND e.enumlabel = 'DEVOLUCION_PLANTACION'
  ) THEN
    RAISE EXCEPTION 'Falta DEVOLUCION_PLANTACION. Ejecuta antes la migracion 051.';
  END IF;
END $$;

-- La regla original de la migracion 010 solo permite que el saldo se mantenga
-- o disminuya, salvo EMBOLSADO. DEVOLUCION_PLANTACION es la segunda operacion
-- valida que incrementa el saldo del lote.
ALTER TABLE public.evento_lote_vivero
  DROP CONSTRAINT IF EXISTS chk_evento_lote_vivero_saldo_no_incrementa;

ALTER TABLE public.evento_lote_vivero
  ADD CONSTRAINT chk_evento_lote_vivero_saldo_no_incrementa
  CHECK (
    saldo_vivo_antes IS NULL
    OR saldo_vivo_despues IS NULL
    OR tipo_evento::text IN ('EMBOLSADO', 'DEVOLUCION_PLANTACION')
    OR saldo_vivo_despues <= saldo_vivo_antes
  );

ALTER TABLE public.evento_lote_vivero
  DROP CONSTRAINT IF EXISTS chk_evento_lote_vivero_devolucion_saldo_consistente;

ALTER TABLE public.evento_lote_vivero
  ADD CONSTRAINT chk_evento_lote_vivero_devolucion_saldo_consistente
  CHECK (
    tipo_evento::text <> 'DEVOLUCION_PLANTACION'
    OR (
      cantidad_afectada IS NOT NULL
      AND cantidad_afectada > 0
      AND saldo_vivo_antes IS NOT NULL
      AND saldo_vivo_despues IS NOT NULL
      AND saldo_vivo_despues = saldo_vivo_antes + cantidad_afectada
    )
  );

COMMENT ON CONSTRAINT chk_evento_lote_vivero_devolucion_saldo_consistente
  ON public.evento_lote_vivero IS
  'DEVOLUCION_PLANTACION incrementa el saldo exactamente por cantidad_afectada.';

NOTIFY pgrst, 'reload schema';
