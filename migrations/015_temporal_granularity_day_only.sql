-- 015_temporal_granularity_day_only.sql
-- Objetivo:
-- - Estandarizar granularidad temporal a nivel DIA para campos tecnicos y de sellado
-- - Mantener campos operativos declarados por usuario en DATE (ya existentes)
--
-- Nota importante:
-- - Esta migracion TRUNCA hora/minuto/segundo de columnas timestamp a DATE.
-- - La conversion de timestamptz usa timezone de negocio: America/La_Paz.

DO $$
BEGIN
  -- Helper temporal para convertir columnas timestamp -> date si existen.
  -- Se elimina al final de la migracion.
  CREATE OR REPLACE FUNCTION public.fn_cast_temporal_column_to_date(
    p_table_name TEXT,
    p_column_name TEXT,
    p_set_default_current_date BOOLEAN DEFAULT FALSE,
    p_drop_default BOOLEAN DEFAULT FALSE
  )
  RETURNS void
  LANGUAGE plpgsql
  AS $fn$
  DECLARE
    v_data_type TEXT;
  BEGIN
    SELECT c.data_type
    INTO v_data_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = p_table_name
      AND c.column_name = p_column_name;

    -- Columna no existe en este entorno -> no-op.
    IF v_data_type IS NULL THEN
      RETURN;
    END IF;

    IF v_data_type = 'timestamp with time zone' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE DATE USING ((%I AT TIME ZONE ''America/La_Paz'')::date)',
        p_table_name,
        p_column_name,
        p_column_name
      );
    ELSIF v_data_type = 'timestamp without time zone' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE DATE USING (%I::date)',
        p_table_name,
        p_column_name,
        p_column_name
      );
    ELSIF v_data_type = 'date' THEN
      -- ya alineado
      NULL;
    ELSE
      RAISE EXCEPTION
        'La columna %.% tiene tipo %, no es convertible con esta migracion.',
        p_table_name,
        p_column_name,
        v_data_type;
    END IF;

    IF p_set_default_current_date THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT CURRENT_DATE',
        p_table_name,
        p_column_name
      );
    ELSIF p_drop_default THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT',
        p_table_name,
        p_column_name
      );
    END IF;
  END;
  $fn$;
END;
$$;

-- =========================================================
-- RECOLECCION (auditoria y sellado)
-- =========================================================
SELECT public.fn_cast_temporal_column_to_date('recoleccion', 'created_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('recoleccion', 'updated_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('recoleccion', 'fecha_validacion', FALSE, TRUE);

-- Soportar ambos nombres de soft delete para distintos entornos.
SELECT public.fn_cast_temporal_column_to_date('recoleccion', 'eliminado_en', FALSE, TRUE);
SELECT public.fn_cast_temporal_column_to_date('recoleccion', 'deleted_at', FALSE, TRUE);

-- =========================================================
-- RECOLECCION_MOVIMIENTO / RECOLECCION_HISTORIAL (append-only)
-- =========================================================
SELECT public.fn_cast_temporal_column_to_date('recoleccion_movimiento', 'created_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('recoleccion_historial', 'created_at', TRUE, FALSE);

-- =========================================================
-- VIVERO
-- =========================================================
SELECT public.fn_cast_temporal_column_to_date('lote_vivero', 'created_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('lote_vivero', 'updated_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('evento_lote_vivero', 'created_at', TRUE, FALSE);

-- Ajustar trigger de lote_vivero.updated_at para granularidad de dia.
CREATE OR REPLACE FUNCTION public.fn_lote_vivero_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_DATE;
  RETURN NEW;
END;
$$;

-- =========================================================
-- EVIDENCIAS (si existen columnas temporales en este entorno)
-- =========================================================
SELECT public.fn_cast_temporal_column_to_date('evidencias_trazabilidad', 'created_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('evidencias_trazabilidad', 'updated_at', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('evidencias_trazabilidad', 'deleted_at', FALSE, TRUE);
SELECT public.fn_cast_temporal_column_to_date('evidencias_trazabilidad', 'creado_en', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('evidencias_trazabilidad', 'actualizado_en', TRUE, FALSE);
SELECT public.fn_cast_temporal_column_to_date('evidencias_trazabilidad', 'eliminado_en', FALSE, TRUE);

-- =========================================================
-- RECOLECCION_FOTO (legacy si existe)
-- =========================================================
SELECT public.fn_cast_temporal_column_to_date('recoleccion_foto', 'created_at', TRUE, FALSE);

-- Limpiar helper temporal
DROP FUNCTION IF EXISTS public.fn_cast_temporal_column_to_date(TEXT, TEXT, BOOLEAN, BOOLEAN);

NOTIFY pgrst, 'reload schema';
