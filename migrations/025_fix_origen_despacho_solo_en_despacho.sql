-- 025_fix_origen_despacho_solo_en_despacho.sql
-- Fix de la migracion 023: origen_despacho solo debe poblarse cuando tipo_evento = 'DESPACHO'.
--
-- Problema: la migracion 023 creo origen_despacho como NOT NULL DEFAULT 'MANUAL', lo cual
-- aplico 'MANUAL' a TODOS los eventos existentes (INICIO, EMBOLSADO, ADAPTABILIDAD, MERMA,
-- CIERRE_AUTOMATICO), eventos que no son despachos en absoluto.
--
-- Esta migracion:
--   1. Hace origen_despacho NULL-able y remueve el default
--   2. Backfill: pone origen_despacho = NULL para todos los eventos que no son DESPACHO
--   3. Endurece el CHECK constraint para garantizar la invariante:
--      - non-DESPACHO         -> origen_despacho IS NULL y campos M3 IS NULL
--      - DESPACHO MANUAL       -> origen_despacho = 'MANUAL', sin campos M3
--      - DESPACHO AUTOMATICO   -> origen_despacho = 'AUTOMATICO_PLANTACION' + campos M3

-- =====================================================================
-- 1. Drop del CHECK constraint actual para poder modificar la columna
-- =====================================================================
ALTER TABLE public.evento_lote_vivero
  DROP CONSTRAINT IF EXISTS evento_lote_vivero_origen_despacho_consistency_chk;

-- =====================================================================
-- 2. Columna nullable y sin default
-- =====================================================================
ALTER TABLE public.evento_lote_vivero
  ALTER COLUMN origen_despacho DROP NOT NULL,
  ALTER COLUMN origen_despacho DROP DEFAULT;

-- =====================================================================
-- 3. Backfill: NULL para todos los eventos que no son DESPACHO
-- =====================================================================
UPDATE public.evento_lote_vivero
   SET origen_despacho = NULL
 WHERE tipo_evento::text <> 'DESPACHO'
   AND origen_despacho IS NOT NULL;

-- =====================================================================
-- 4. Re-crear CHECK constraint con la nueva invariante
-- =====================================================================
ALTER TABLE public.evento_lote_vivero
  ADD CONSTRAINT evento_lote_vivero_origen_despacho_consistency_chk
  CHECK (
    (
      -- Eventos que no son DESPACHO: origen_despacho y campos M3 deben ser NULL
      tipo_evento::text <> 'DESPACHO'
      AND origen_despacho IS NULL
      AND subcampania_id IS NULL
      AND campania_id IS NULL
      AND registro_plantacion_id IS NULL
    )
    OR (
      -- DESPACHO MANUAL: registrado desde Vivero, sin referencias a M3
      tipo_evento::text = 'DESPACHO'
      AND origen_despacho::text = 'MANUAL'
      AND destino_tipo::text <> 'PLANTACION_CAMPANIA'
      AND subcampania_id IS NULL
      AND campania_id IS NULL
      AND registro_plantacion_id IS NULL
    )
    OR (
      -- DESPACHO AUTOMATICO_PLANTACION: generado por M3, los tres IDs obligatorios
      tipo_evento::text = 'DESPACHO'
      AND origen_despacho::text = 'AUTOMATICO_PLANTACION'
      AND destino_tipo::text = 'PLANTACION_CAMPANIA'
      AND subcampania_id IS NOT NULL
      AND campania_id IS NOT NULL
      AND registro_plantacion_id IS NOT NULL
    )
  );

-- Comentario actualizado
COMMENT ON COLUMN public.evento_lote_vivero.origen_despacho IS
  'Solo aplica a eventos DESPACHO. NULL para otros tipos de evento. MANUAL = despacho registrado desde Vivero. AUTOMATICO_PLANTACION = generado por el sistema desde M3 al plantar o reponer.';
