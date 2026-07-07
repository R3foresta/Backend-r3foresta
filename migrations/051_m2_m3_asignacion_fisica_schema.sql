-- 051_m2_m3_asignacion_fisica_schema.sql
-- Tarea M2-M3-01: alinea la BD con el contrato vigente M2 Vivero -> M3 Plantacion
-- (r3foresta-docs/90-contratos-integracion/02_contrato_vivero_a_plantacion.md).
--
-- Cambio de modelo: ASIGNACION_VIVERO_SUBCAMPANIA deja de ser reserva logica y pasa
-- a ser ENTREGA FISICA (RN-VIV-47). Esta migracion prepara enums, columnas, FKs,
-- CHECKs y la vista de saldos. Las RPCs se reescriben en 052-055.
--
-- Decisiones tomadas (2026-07-06):
--   - AUTOMATICO_PLANTACION queda BLOQUEADO para nuevas escrituras (RN-VIV-55).
--     El CHECK nuevo se crea NOT VALID: las filas historicas no se re-validan,
--     pero cualquier INSERT/UPDATE nuevo con AUTOMATICO_PLANTACION falla.
--   - Se agrega el tipo de evento M2 DEVOLUCION_PLANTACION (entrada fisica al
--     vivero por devolucion desde M3, RN-VIV-48) para que el historial del lote
--     explique los aumentos de saldo.
--
-- NOTA Supabase: los CHECKs comparan con ::text para evitar el error 55P04
-- ("unsafe use of new value") cuando ALTER TYPE ADD VALUE y el uso del valor
-- caen en la misma transaccion del SQL Editor (mismo workaround que 023).
--
-- Depende de: 007, 010, 023, 024, 025, 029, 030, 045.

-- =====================================================================
-- 0. Precondiciones
-- =====================================================================
DO $$
BEGIN
  IF to_regclass('public.evento_lote_vivero') IS NULL THEN
    RAISE EXCEPTION 'No existe public.evento_lote_vivero. Ejecuta antes la migracion 007.';
  END IF;
  IF to_regclass('public.asignacion_vivero_subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.asignacion_vivero_subcampania. Ejecuta antes la migracion 024.';
  END IF;
  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta antes la migracion 029.';
  END IF;
  IF to_regclass('public.campania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.campania. Ejecuta antes la migracion 028.';
  END IF;
  IF to_regclass('public.registro_plantacion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.registro_plantacion. Ejecuta antes la migracion 030.';
  END IF;
END $$;

-- =====================================================================
-- 1. Nuevos valores de enum
-- =====================================================================

-- Origen de despacho para la salida fisica por asignacion a subcampania.
ALTER TYPE public.origen_despacho_vivero ADD VALUE IF NOT EXISTS 'ASIGNACION_SUBCAMPANIA';

-- Entrada fisica al vivero por devolucion desde Plantacion (RN-VIV-48).
ALTER TYPE public.tipo_evento_vivero ADD VALUE IF NOT EXISTS 'DEVOLUCION_PLANTACION';

-- =====================================================================
-- 2. Columna asignacion_id en evento_lote_vivero
--    Vincula el evento M2 (DESPACHO por asignacion o DEVOLUCION_PLANTACION)
--    con la asignacion fisica que lo origino.
-- =====================================================================
ALTER TABLE public.evento_lote_vivero
  ADD COLUMN IF NOT EXISTS asignacion_id BIGINT;

COMMENT ON COLUMN public.evento_lote_vivero.asignacion_id IS
  'FK a asignacion_vivero_subcampania. Obligatoria en DESPACHO con origen ASIGNACION_SUBCAMPANIA y en DEVOLUCION_PLANTACION. NULL en el resto.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evento_lote_vivero_asignacion_fk'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT evento_lote_vivero_asignacion_fk
      FOREIGN KEY (asignacion_id)
      REFERENCES public.asignacion_vivero_subcampania (id)
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS evento_lote_vivero_asignacion_idx
  ON public.evento_lote_vivero (asignacion_id)
  WHERE asignacion_id IS NOT NULL;

-- =====================================================================
-- 3. FKs reales hacia M3 (pendientes desde la 023)
--    NOT VALID: no re-valida data legada; se aplica a filas nuevas.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evento_lote_vivero_subcampania_fk'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT evento_lote_vivero_subcampania_fk
      FOREIGN KEY (subcampania_id)
      REFERENCES public.subcampania (id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evento_lote_vivero_campania_fk'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT evento_lote_vivero_campania_fk
      FOREIGN KEY (campania_id)
      REFERENCES public.campania (id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'evento_lote_vivero_registro_plantacion_fk'
      AND conrelid = 'public.evento_lote_vivero'::regclass
  ) THEN
    ALTER TABLE public.evento_lote_vivero
      ADD CONSTRAINT evento_lote_vivero_registro_plantacion_fk
      FOREIGN KEY (registro_plantacion_id)
      REFERENCES public.registro_plantacion (id)
      NOT VALID;
  END IF;

  -- Confirmacion idempotente de la FK creada en 045.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asignacion_vivero_subcampania_subcampania_fk'
      AND conrelid = 'public.asignacion_vivero_subcampania'::regclass
  ) THEN
    ALTER TABLE public.asignacion_vivero_subcampania
      ADD CONSTRAINT asignacion_vivero_subcampania_subcampania_fk
      FOREIGN KEY (subcampania_id)
      REFERENCES public.subcampania (id)
      NOT VALID;
  END IF;
END $$;

-- =====================================================================
-- 4. CHECK de consistencia nuevo para evento_lote_vivero
--    Reemplaza el de la 025. Ramas:
--      a) Evento que no es DESPACHO ni DEVOLUCION_PLANTACION:
--         origen_despacho y campos M2<->M3 en NULL.
--      b) DESPACHO + MANUAL: sin referencias M3, destino <> PLANTACION_CAMPANIA.
--      c) DESPACHO + ASIGNACION_SUBCAMPANIA (asignacion fisica, RN-VIV-47/54):
--         destino = PLANTACION_CAMPANIA, subcampania_id, campania_id y
--         asignacion_id obligatorios, registro_plantacion_id NULL, UNIDAD.
--      d) DEVOLUCION_PLANTACION (entrada fisica, RN-VIV-48):
--         sin origen_despacho ni destino, asignacion_id y subcampania_id
--         obligatorios, UNIDAD.
--    NO existe rama para AUTOMATICO_PLANTACION: emitirlo queda bloqueado
--    (RN-VIV-55). NOT VALID preserva las filas legadas sin re-validarlas.
-- =====================================================================
ALTER TABLE public.evento_lote_vivero
  DROP CONSTRAINT IF EXISTS evento_lote_vivero_origen_despacho_consistency_chk;

ALTER TABLE public.evento_lote_vivero
  ADD CONSTRAINT evento_lote_vivero_origen_despacho_consistency_chk
  CHECK (
    (
      tipo_evento::text NOT IN ('DESPACHO', 'DEVOLUCION_PLANTACION')
      AND origen_despacho IS NULL
      AND subcampania_id IS NULL
      AND campania_id IS NULL
      AND registro_plantacion_id IS NULL
      AND asignacion_id IS NULL
    )
    OR (
      tipo_evento::text = 'DESPACHO'
      AND origen_despacho::text = 'MANUAL'
      AND destino_tipo::text <> 'PLANTACION_CAMPANIA'
      AND subcampania_id IS NULL
      AND campania_id IS NULL
      AND registro_plantacion_id IS NULL
      AND asignacion_id IS NULL
    )
    OR (
      tipo_evento::text = 'DESPACHO'
      AND origen_despacho::text = 'ASIGNACION_SUBCAMPANIA'
      AND destino_tipo::text = 'PLANTACION_CAMPANIA'
      AND subcampania_id IS NOT NULL
      AND campania_id IS NOT NULL
      AND asignacion_id IS NOT NULL
      AND registro_plantacion_id IS NULL
      AND unidad_medida_evento::text = 'UNIDAD'
    )
    OR (
      tipo_evento::text = 'DEVOLUCION_PLANTACION'
      AND origen_despacho IS NULL
      AND destino_tipo IS NULL
      AND asignacion_id IS NOT NULL
      AND subcampania_id IS NOT NULL
      AND registro_plantacion_id IS NULL
      AND unidad_medida_evento::text = 'UNIDAD'
      AND cantidad_afectada IS NOT NULL
    )
  )
  NOT VALID;

COMMENT ON COLUMN public.evento_lote_vivero.origen_despacho IS
  'Solo aplica a eventos DESPACHO. MANUAL = despacho registrado desde Vivero hacia destino distinto de subcampania. ASIGNACION_SUBCAMPANIA = salida fisica por asignacion a subcampania de M3 (flujo vigente). AUTOMATICO_PLANTACION = LEGADO, bloqueado para nuevas escrituras (RN-VIV-55).';

COMMENT ON COLUMN public.evento_lote_vivero.registro_plantacion_id IS
  'LEGADO: solo poblado por los antiguos despachos AUTOMATICO_PLANTACION. El flujo vigente no vincula eventos M2 a registros de plantacion (RN-VIV-52).';

-- =====================================================================
-- 5. registro_plantacion_detalle.evento_lote_vivero_despacho_id queda legado
--    (ya es nullable; las plantaciones nuevas lo dejan NULL — RN-VIV-52).
-- =====================================================================
COMMENT ON COLUMN public.registro_plantacion_detalle.evento_lote_vivero_despacho_id IS
  'LEGADO: FK al despacho AUTOMATICO_PLANTACION del flujo anterior. Las plantaciones del flujo vigente lo dejan NULL porque plantar no genera eventos M2 (RN-VIV-52).';

-- =====================================================================
-- 6. Vista de saldos fisica (reemplaza la identidad de reserva logica)
--    RN-VIV-57: dos familias de saldo, sin derivar "disponible = vivo - asignado".
--    DROP + CREATE porque cambia el set de columnas.
-- =====================================================================
DROP VIEW IF EXISTS public.v_lote_vivero_saldos;

CREATE VIEW public.v_lote_vivero_saldos AS
SELECT
  lv.id                 AS lote_id,
  -- Saldo fisico: plantas vivas que siguen dentro del vivero.
  lv.saldo_vivo_actual,
  -- Stock ya entregado a subcampanias y aun disponible para consumo en M3.
  -- NO representa plantas dentro del vivero (RN-VIV-47/57).
  COALESCE(
    SUM(a.saldo_asignado_disponible) FILTER (WHERE a.estado = 'ACTIVA'), 0
  )                     AS saldo_asignado_subcampanias
FROM public.lote_vivero lv
LEFT JOIN public.asignacion_vivero_subcampania a ON a.lote_vivero_id = lv.id
GROUP BY lv.id, lv.saldo_vivo_actual;

COMMENT ON VIEW public.v_lote_vivero_saldos IS
  'Saldos del contrato fisico M2-M3: saldo_vivo_actual = plantas fisicamente en vivero; saldo_asignado_subcampanias = stock entregado a subcampanias con saldo disponible. La identidad antigua saldo_vivo_disponible_asignacion (vivo - asignado) NO aplica al flujo vigente.';

NOTIFY pgrst, 'reload schema';
