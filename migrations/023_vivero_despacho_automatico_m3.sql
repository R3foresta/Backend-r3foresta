-- 023_vivero_despacho_automatico_m3.sql
-- Extiende EVENTO_LOTE_VIVERO para soportar despachos automaticos desde Modulo 3 (Plantacion).
--
-- Cambios:
--   1. Agrega PLANTACION_CAMPANIA al enum destino_tipo_vivero
--   2. Crea el enum origen_despacho_vivero (MANUAL | AUTOMATICO_PLANTACION)
--   3. Agrega columnas origen_despacho, subcampania_id, campania_id, registro_plantacion_id
--   4. Agrega CHECK constraints de consistencia entre origen_despacho y los campos de M3
--
-- NOTA: los CHECK constraints que involucran el nuevo valor PLANTACION_CAMPANIA usan
-- casteo a ::text para la comparacion. Esto evita el error 55P04 de Postgres ("unsafe use
-- of new value") que ocurre cuando ALTER TYPE ADD VALUE y el uso del nuevo valor estan en
-- la misma transaccion (comportamiento del SQL Editor de Supabase). La restriccion es
-- funcionalmente identica; solo difiere en la forma de la expresion de comparacion.

-- =====================================================================
-- 1. Nuevo valor en destino_tipo_vivero
--    Estado actual en Supabase: PLANTACION_PROPIA, PLANTACION_COMUNIDAD, DONACION, VENTA, OTRO
--    Se agrega: PLANTACION_CAMPANIA (despacho automatico hacia subcampana de M3)
-- =====================================================================
ALTER TYPE public.destino_tipo_vivero ADD VALUE IF NOT EXISTS 'PLANTACION_CAMPANIA';

-- =====================================================================
-- 2. Nuevo enum origen_despacho_vivero
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'origen_despacho_vivero'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.origen_despacho_vivero AS ENUM (
      'MANUAL',
      'AUTOMATICO_PLANTACION'
    );
  END IF;
END $$;

-- =====================================================================
-- 3. Nuevas columnas en evento_lote_vivero
--    - origen_despacho: NOT NULL DEFAULT 'MANUAL' — filas existentes quedan como MANUAL
--    - subcampania_id, campania_id, registro_plantacion_id: nullable hasta que exista M3 en BD
-- =====================================================================
ALTER TABLE public.evento_lote_vivero
  ADD COLUMN IF NOT EXISTS origen_despacho        public.origen_despacho_vivero NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS subcampania_id         BIGINT,
  ADD COLUMN IF NOT EXISTS campania_id            BIGINT,
  ADD COLUMN IF NOT EXISTS registro_plantacion_id BIGINT;

-- FKs reales se agregan en migracion futura cuando existan las tablas de M3 en BD
COMMENT ON COLUMN public.evento_lote_vivero.origen_despacho IS
  'MANUAL = despacho registrado desde Vivero. AUTOMATICO_PLANTACION = generado por el sistema desde M3 al plantar o reponer.';
COMMENT ON COLUMN public.evento_lote_vivero.subcampania_id IS
  'FK pendiente a SUBCAMPANIA (Modulo 3). Obligatorio cuando origen_despacho = AUTOMATICO_PLANTACION.';
COMMENT ON COLUMN public.evento_lote_vivero.campania_id IS
  'FK pendiente a CAMPANIA (Modulo 3). Obligatorio cuando origen_despacho = AUTOMATICO_PLANTACION.';
COMMENT ON COLUMN public.evento_lote_vivero.registro_plantacion_id IS
  'FK pendiente a REGISTRO_PLANTACION (Modulo 3). Obligatorio cuando origen_despacho = AUTOMATICO_PLANTACION.';

-- =====================================================================
-- 4. CHECK constraints de consistencia
-- =====================================================================

-- Garantiza que un DESPACHO MANUAL nunca apunta a PLANTACION_CAMPANIA
-- y que un DESPACHO AUTOMATICO_PLANTACION siempre lleva los tres IDs de M3.
-- Eventos que no son DESPACHO pasan sin restriccion.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evento_lote_vivero_origen_despacho_consistency_chk'
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT evento_lote_vivero_origen_despacho_consistency_chk
      CHECK (
        tipo_evento::text <> 'DESPACHO'
        OR (
          (
            origen_despacho::text = 'MANUAL'
            AND destino_tipo::text <> 'PLANTACION_CAMPANIA'
            AND subcampania_id IS NULL
            AND campania_id IS NULL
            AND registro_plantacion_id IS NULL
          )
          OR (
            origen_despacho::text = 'AUTOMATICO_PLANTACION'
            AND destino_tipo::text = 'PLANTACION_CAMPANIA'
            AND subcampania_id IS NOT NULL
            AND campania_id IS NOT NULL
            AND registro_plantacion_id IS NOT NULL
          )
        )
      );
  END IF;
END $$;

-- Los despachos automaticos siempre se miden en UNIDAD (plantas individuales)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evento_lote_vivero_auto_plantacion_unidad_chk'
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT evento_lote_vivero_auto_plantacion_unidad_chk
      CHECK (
        origen_despacho::text <> 'AUTOMATICO_PLANTACION'
        OR unidad_medida_evento::text = 'UNIDAD'
      );
  END IF;
END $$;
