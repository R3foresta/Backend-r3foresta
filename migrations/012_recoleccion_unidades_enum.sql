-- 012_recoleccion_unidades_enum.sql
-- Objetivo:
-- - Cambiar recoleccion.unidad_canonica de text -> public.unidad_medida
-- - Cambiar recoleccion_movimiento.unidad_operativa de text -> public.unidad_medida
-- - Normalizar datos legacy antes del cast

BEGIN;

-- 0) Validar dependencias
DO $$
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion';
  END IF;

  IF to_regclass('public.recoleccion_movimiento') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion_movimiento';
  END IF;

  IF to_regtype('public.unidad_medida') IS NULL THEN
    RAISE EXCEPTION 'No existe el enum public.unidad_medida';
  END IF;
END;
$$;

-- 1) Validar que el enum tenga UNIDAD y G
DO $$
DECLARE
  has_unidad boolean;
  has_g boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'unidad_medida'
      AND e.enumlabel = 'UNIDAD'
  ) INTO has_unidad;

  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
      AND t.typname = 'unidad_medida'
      AND e.enumlabel = 'G'
  ) INTO has_g;

  IF NOT has_unidad OR NOT has_g THEN
    RAISE EXCEPTION
      'El enum public.unidad_medida debe contener exactamente (al menos) UNIDAD y G.';
  END IF;
END;
$$;

-- 2) Normalizar datos existentes (trim + uppercase + GR -> G)
UPDATE public.recoleccion
SET unidad_canonica = CASE
  WHEN unidad_canonica IS NULL THEN NULL
  WHEN upper(trim(unidad_canonica)) = 'GR' THEN 'G'
  ELSE upper(trim(unidad_canonica))
END
WHERE unidad_canonica IS NOT NULL;

UPDATE public.recoleccion_movimiento
SET unidad_operativa = CASE
  WHEN unidad_operativa IS NULL THEN NULL
  WHEN upper(trim(unidad_operativa)) = 'GR' THEN 'G'
  ELSE upper(trim(unidad_operativa))
END
WHERE unidad_operativa IS NOT NULL;

-- 3) Validar que no queden valores inválidos antes del cast
DO $$
DECLARE
  invalid_recoleccion bigint;
  invalid_mov bigint;
BEGIN
  SELECT COUNT(*)
  INTO invalid_recoleccion
  FROM public.recoleccion
  WHERE unidad_canonica IS NOT NULL
    AND unidad_canonica NOT IN ('UNIDAD', 'G');

  IF invalid_recoleccion > 0 THEN
    RAISE EXCEPTION
      'Hay % filas inválidas en recoleccion.unidad_canonica (solo se permite UNIDAD|G).',
      invalid_recoleccion;
  END IF;

  SELECT COUNT(*)
  INTO invalid_mov
  FROM public.recoleccion_movimiento
  WHERE unidad_operativa IS NOT NULL
    AND unidad_operativa NOT IN ('UNIDAD', 'G');

  IF invalid_mov > 0 THEN
    RAISE EXCEPTION
      'Hay % filas inválidas en recoleccion_movimiento.unidad_operativa (solo se permite UNIDAD|G).',
      invalid_mov;
  END IF;
END;
$$;

-- 4) Eliminar CHECKs legacy ligados a esas columnas (si existen)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public'
      AND t.relname = 'recoleccion'
      AND c.contype = 'c'
      AND a.attname = 'unidad_canonica'
  LOOP
    EXECUTE format('ALTER TABLE public.recoleccion DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public'
      AND t.relname = 'recoleccion_movimiento'
      AND c.contype = 'c'
      AND a.attname = 'unidad_operativa'
  LOOP
    EXECUTE format('ALTER TABLE public.recoleccion_movimiento DROP CONSTRAINT %I', r.conname);
  END LOOP;
END;
$$;

-- 5) Cambiar tipo de columnas a enum (solo si aún no son enum)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion'
      AND column_name = 'unidad_canonica'
      AND udt_name <> 'unidad_medida'
  ) THEN
    ALTER TABLE public.recoleccion
      ALTER COLUMN unidad_canonica TYPE public.unidad_medida
      USING unidad_canonica::public.unidad_medida;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recoleccion_movimiento'
      AND column_name = 'unidad_operativa'
      AND udt_name <> 'unidad_medida'
  ) THEN
    ALTER TABLE public.recoleccion_movimiento
      ALTER COLUMN unidad_operativa TYPE public.unidad_medida
      USING unidad_operativa::public.unidad_medida;
  END IF;
END;
$$;

-- 6) Endurecer nullability (si tu contrato lo requiere obligatorio)
ALTER TABLE public.recoleccion
  ALTER COLUMN unidad_canonica SET NOT NULL;

ALTER TABLE public.recoleccion_movimiento
  ALTER COLUMN unidad_operativa SET NOT NULL;

COMMIT;
