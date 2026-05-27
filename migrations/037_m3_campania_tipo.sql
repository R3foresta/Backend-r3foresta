-- 037_m3_campania_tipo.sql
-- Modulo 3 (Plantacion) — alinea CAMPANIA con SUBCAMPANIA: ahora la campania
-- padre define el tipo (REFORESTACION | ARBORIZACION | FORESTACION) que comparten
-- todas sus subcampanias. No se permite mezclar tipos dentro de una misma campania.
--
-- Origen: requerimiento RF-PLA-01 / RF-PLA-02 (plantacion-module/00_Requerimientos_Modulo_3_Plantacion.json,
-- plantacion-module/02_Procesos_Modulo_3_Plantacion.md §3.1 y §3.2, database/00_database_schema.md).
-- Depende de: 027 (enum tipo_subcampania) y 028 (tabla campania).
--
-- Las tablas estan creadas pero sin datos productivos (decision del usuario),
-- por eso se agrega la columna directamente NOT NULL sin backfill.
-- Idempotente.

DO $$
BEGIN
  IF to_regclass('public.campania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.campania. Ejecuta la migracion 028 primero.';
  END IF;

  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta la migracion 029 primero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tipo_subcampania' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'No existe el enum public.tipo_subcampania. Ejecuta la migracion 027 primero.';
  END IF;
END $$;

-- =====================================================================
-- 1. Columna CAMPANIA.tipo (NOT NULL, sin default)
-- =====================================================================
-- Se reusa el enum tipo_subcampania (no se crea uno nuevo): el dominio es
-- exactamente el mismo. NOT NULL obligatorio al crear; sin default para forzar
-- eleccion explicita del creador.
--
-- Como las tablas estan vacias, no hay backfill. Si en el futuro se aplica
-- esta migracion sobre datos existentes habra que cambiar el flujo a
-- ADD COLUMN nullable → UPDATE → SET NOT NULL.

ALTER TABLE public.campania
  ADD COLUMN IF NOT EXISTS tipo public.tipo_subcampania;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campania'
      AND column_name = 'tipo'
      AND is_nullable = 'YES'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.campania WHERE tipo IS NULL) THEN
      RAISE EXCEPTION
        'No se puede aplicar NOT NULL a campania.tipo: existen filas con tipo NULL. Backfillea primero.';
    END IF;
    ALTER TABLE public.campania ALTER COLUMN tipo SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.campania.tipo IS
  'Tipo de la campania. Todas las subcampanias heredan este valor; no se permite mezclar tipos dentro de una campania. Inmutable una vez que la campania tiene subcampanias (ver trigger trg_campania_tipo_inmutable).';

-- =====================================================================
-- 2. Trigger: SUBCAMPANIA.tipo debe coincidir con CAMPANIA.tipo
-- =====================================================================
-- PostgreSQL no soporta CHECK con subquery, asi que el invariante cross-table
-- se enforce por trigger BEFORE INSERT/UPDATE en subcampania.

CREATE OR REPLACE FUNCTION public.check_subcampania_tipo_coincide_campania()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo_campania public.tipo_subcampania;
BEGIN
  SELECT tipo INTO v_tipo_campania
  FROM public.campania
  WHERE id = NEW.campania_id;

  IF v_tipo_campania IS NULL THEN
    RAISE EXCEPTION 'CAMPANIA % no existe', NEW.campania_id;
  END IF;

  IF NEW.tipo <> v_tipo_campania THEN
    RAISE EXCEPTION 'SUBCAMPANIA.tipo (%) debe coincidir con CAMPANIA.tipo (%)',
      NEW.tipo, v_tipo_campania;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_subcampania_tipo_coincide ON public.subcampania;

CREATE TRIGGER trg_subcampania_tipo_coincide
BEFORE INSERT OR UPDATE OF tipo, campania_id ON public.subcampania
FOR EACH ROW
EXECUTE FUNCTION public.check_subcampania_tipo_coincide_campania();

-- =====================================================================
-- 3. Trigger: CAMPANIA.tipo es inmutable si ya hay subcampanias
-- =====================================================================
-- Mientras la campania este vacia (sin subcampanias) el tipo se puede
-- cambiar libremente. En cuanto exista al menos una subcampania, queda
-- congelado para no romper el invariante "todas las subcampanias comparten
-- el tipo de la campania".

CREATE OR REPLACE FUNCTION public.check_campania_tipo_inmutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.tipo IS DISTINCT FROM NEW.tipo
     AND EXISTS (SELECT 1 FROM public.subcampania WHERE campania_id = OLD.id) THEN
    RAISE EXCEPTION 'CAMPANIA.tipo es inmutable una vez que la campania tiene subcampanias';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_campania_tipo_inmutable ON public.campania;

CREATE TRIGGER trg_campania_tipo_inmutable
BEFORE UPDATE OF tipo ON public.campania
FOR EACH ROW
EXECUTE FUNCTION public.check_campania_tipo_inmutable();
