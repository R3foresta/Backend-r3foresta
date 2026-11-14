-- T5: confirmar esta migración antes de 102 (valor ENUM nuevo).
-- No transforma lotes ni fabrica historia de incorporación.
BEGIN;
DO $$ BEGIN
  IF to_regtype('public.tipo_evento_vivero') IS NULL THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: falta tipo_evento_vivero';
  END IF;
END $$;
ALTER TYPE public.tipo_evento_vivero ADD VALUE IF NOT EXISTS 'INCORPORACION';
COMMIT;
