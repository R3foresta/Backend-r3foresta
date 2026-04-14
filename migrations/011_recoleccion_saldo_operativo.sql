-- 011_recoleccion_saldo_operativo.sql
-- Objetivo:
-- - materializar saldo_actual y estado_operativo en public.recoleccion
-- - mantener consistencia con public.recoleccion_movimiento
-- - preparar la base para consumo transaccional hacia vivero

-- Dependencias esperadas en el entorno:
-- - public.recoleccion
-- - public.recoleccion_movimiento

DO $$
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.recoleccion. Esta migracion requiere el esquema base de Recoleccion.';
  END IF;

  IF to_regclass('public.recoleccion_movimiento') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.recoleccion_movimiento. Esta migracion requiere el ledger append-only de movimientos.';
  END IF;
END;
$$;

-- =========================================================
-- ENUM: estado_operativo_recoleccion
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estado_operativo_recoleccion'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.estado_operativo_recoleccion AS ENUM (
      'ABIERTO',
      'CERRADO'
    );
  END IF;
END;
$$;

-- =========================================================
-- COLUMNAS NUEVAS
-- =========================================================

ALTER TABLE public.recoleccion
  ADD COLUMN IF NOT EXISTS saldo_actual NUMERIC,
  ADD COLUMN IF NOT EXISTS estado_operativo public.estado_operativo_recoleccion;

-- =========================================================
-- CONSTRAINTS MINIMAS
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_recoleccion_saldo_actual_no_negativo'
      AND conrelid = 'public.recoleccion'::regclass
  ) THEN
    ALTER TABLE public.recoleccion
      ADD CONSTRAINT chk_recoleccion_saldo_actual_no_negativo
      CHECK (saldo_actual >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_recoleccion_estado_operativo_consistente'
      AND conrelid = 'public.recoleccion'::regclass
  ) THEN
    ALTER TABLE public.recoleccion
      ADD CONSTRAINT chk_recoleccion_estado_operativo_consistente
      CHECK (
        (saldo_actual = 0 AND estado_operativo = 'CERRADO')
        OR (saldo_actual > 0 AND estado_operativo = 'ABIERTO')
      );
  END IF;
END;
$$;

-- =========================================================
-- FUNCION PRINCIPAL DE RECALCULO
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_recoleccion_recalcular_saldo_operativo(
  p_recoleccion_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_cantidad_inicial NUMERIC;
  v_delta_total NUMERIC;
  v_saldo_actual NUMERIC;
  v_estado_operativo public.estado_operativo_recoleccion;
BEGIN
  IF p_recoleccion_id IS NULL THEN
    RAISE EXCEPTION 'p_recoleccion_id es obligatorio.';
  END IF;

  SELECT r.cantidad_inicial_canonica
  INTO v_cantidad_inicial
  FROM public.recoleccion r
  WHERE r.id = p_recoleccion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La recoleccion % no existe.', p_recoleccion_id;
  END IF;

  IF v_cantidad_inicial IS NULL THEN
    RAISE EXCEPTION
      'La recoleccion % no tiene cantidad_inicial_canonica materializada.',
      p_recoleccion_id;
  END IF;

  SELECT COALESCE(SUM(rm.delta), 0)
  INTO v_delta_total
  FROM public.recoleccion_movimiento rm
  WHERE rm.recoleccion_id = p_recoleccion_id;

  v_saldo_actual := v_cantidad_inicial + v_delta_total;

  IF v_saldo_actual < 0 THEN
    RAISE EXCEPTION
      'La recoleccion % quedaria con saldo negativo (cantidad_inicial_canonica=%, delta_total=%, saldo=%).',
      p_recoleccion_id,
      v_cantidad_inicial,
      v_delta_total,
      v_saldo_actual;
  END IF;

  v_estado_operativo := CASE
    WHEN v_saldo_actual = 0 THEN 'CERRADO'
    ELSE 'ABIERTO'
  END;

  UPDATE public.recoleccion
  SET saldo_actual = v_saldo_actual,
      estado_operativo = v_estado_operativo
  WHERE id = p_recoleccion_id;
END;
$$;

-- =========================================================
-- TRIGGER: hidratar al crear recoleccion
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_recoleccion_init_saldo_operativo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cantidad_inicial_canonica IS NULL THEN
    RAISE EXCEPTION 'cantidad_inicial_canonica es obligatoria.';
  END IF;

  NEW.saldo_actual := NEW.cantidad_inicial_canonica;
  NEW.estado_operativo := CASE
    WHEN NEW.saldo_actual = 0 THEN 'CERRADO'
    ELSE 'ABIERTO'
  END;

  IF NEW.saldo_actual < 0 THEN
    RAISE EXCEPTION 'saldo_actual no puede ser negativo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recoleccion_init_saldo_operativo ON public.recoleccion;

CREATE TRIGGER trg_recoleccion_init_saldo_operativo
BEFORE INSERT ON public.recoleccion
FOR EACH ROW
EXECUTE FUNCTION public.fn_recoleccion_init_saldo_operativo();

-- =========================================================
-- TRIGGER: recalcular si cambia la cantidad inicial canonica
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_recoleccion_sync_on_base_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.fn_recoleccion_recalcular_saldo_operativo(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recoleccion_sync_on_base_change ON public.recoleccion;

CREATE TRIGGER trg_recoleccion_sync_on_base_change
AFTER UPDATE OF cantidad_inicial_canonica ON public.recoleccion
FOR EACH ROW
WHEN (OLD.cantidad_inicial_canonica IS DISTINCT FROM NEW.cantidad_inicial_canonica)
EXECUTE FUNCTION public.fn_recoleccion_sync_on_base_change();

-- =========================================================
-- TRIGGER: recalcular ante cambios en el ledger de movimientos
-- =========================================================

CREATE OR REPLACE FUNCTION public.fn_recoleccion_movimiento_sync_saldo_operativo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(NEW.recoleccion_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.recoleccion_id IS DISTINCT FROM NEW.recoleccion_id THEN
      PERFORM public.fn_recoleccion_recalcular_saldo_operativo(OLD.recoleccion_id);
    END IF;

    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(NEW.recoleccion_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(OLD.recoleccion_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_recoleccion_movimiento_sync_saldo_operativo ON public.recoleccion_movimiento;

CREATE TRIGGER trg_recoleccion_movimiento_sync_saldo_operativo
AFTER INSERT OR UPDATE OR DELETE ON public.recoleccion_movimiento
FOR EACH ROW
EXECUTE FUNCTION public.fn_recoleccion_movimiento_sync_saldo_operativo();

-- =========================================================
-- BACKFILL DENTRO DE LA MIGRACION
-- =========================================================

DO $$
DECLARE
  v_recoleccion RECORD;
BEGIN
  FOR v_recoleccion IN
    SELECT id
    FROM public.recoleccion
    ORDER BY id
  LOOP
    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(v_recoleccion.id);
  END LOOP;
END;
$$;

-- =========================================================
-- ENDURECER COLUMNAS TRAS BACKFILL
-- =========================================================

ALTER TABLE public.recoleccion
  ALTER COLUMN saldo_actual SET NOT NULL,
  ALTER COLUMN estado_operativo SET NOT NULL;





-- =========================================================
-- Script rerunnable de backfill para saldo_actual y estado_operativo
-- Reutiliza la funcion materializada del schema operativo.
-- =========================================================
DO $$
DECLARE
  v_recoleccion RECORD;
BEGIN
  IF to_regclass('public.recoleccion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion.';
  END IF;

  IF to_regclass('public.recoleccion_movimiento') IS NULL THEN
    RAISE EXCEPTION 'No existe public.recoleccion_movimiento.';
  END IF;

  IF to_regprocedure('public.fn_recoleccion_recalcular_saldo_operativo(bigint)') IS NULL THEN
    RAISE EXCEPTION
      'No existe public.fn_recoleccion_recalcular_saldo_operativo(bigint). Ejecuta antes la migracion 011.';
  END IF;

  FOR v_recoleccion IN
    SELECT id
    FROM public.recoleccion
    ORDER BY id
  LOOP
    PERFORM public.fn_recoleccion_recalcular_saldo_operativo(v_recoleccion.id);
  END LOOP;
END;
$$;
