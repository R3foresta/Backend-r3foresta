-- 040_m3_organizacion_tipo.sql
-- Modulo General — agrega el tipo de organizacion como campo obligatorio.
-- La tabla organizacion fue creada como placeholder en 028 y ampliada en 038
-- (logo_url + bucket Storage). Aqui se agrega el enum tipo_organizacion y la
-- columna tipo (NOT NULL). La tabla esta vacia, no se necesita backfill.
-- Depende de: 028_m3_campania.sql (tabla public.organizacion).
-- Idempotente.

DO $$
BEGIN
  IF to_regclass('public.organizacion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.organizacion. Ejecuta la migracion 028 primero.';
  END IF;
END $$;

-- =====================================================================
-- 1. Enum tipo_organizacion
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tipo_organizacion' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.tipo_organizacion AS ENUM (
      'ONG',
      'EMPRESA_PRIVADA',
      'EMPRESA_PUBLICA',
      'FUNDACION',
      'ETFs',
      'ALCALDIA',
      'ASOCIACION_CIUDADANA',
      'OTRO'
    );
  END IF;
END $$;

COMMENT ON TYPE public.tipo_organizacion IS
  'Clasifica el tipo de organizacion que puede asociarse a una campania de plantacion.';

-- =====================================================================
-- 2. Columna ORGANIZACION.tipo (NOT NULL, sin default)
-- =====================================================================
-- NOT NULL directo: la tabla esta vacia. Si en el futuro se aplica con
-- datos existentes, cambiar a ADD COLUMN nullable → UPDATE → SET NOT NULL.

ALTER TABLE public.organizacion
  ADD COLUMN IF NOT EXISTS tipo public.tipo_organizacion;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizacion'
      AND column_name = 'tipo'
      AND is_nullable = 'YES'
  ) THEN
    IF EXISTS (SELECT 1 FROM public.organizacion WHERE tipo IS NULL) THEN
      RAISE EXCEPTION
        'No se puede aplicar NOT NULL a organizacion.tipo: existen filas con tipo NULL. Backfillea primero.';
    END IF;
    ALTER TABLE public.organizacion ALTER COLUMN tipo SET NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.organizacion.tipo IS
  'Tipo de la organizacion. Obligatorio al crear. Ver enum tipo_organizacion.';
