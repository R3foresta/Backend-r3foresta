-- 006_vivero_enums.sql
-- Objetivo: crear enums base del modulo vivero
-- Nota: no modifica tablas ni datos

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estado_lote_vivero'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.estado_lote_vivero AS ENUM (
      'ACTIVO',
      'FINALIZADO'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tipo_evento_vivero'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.tipo_evento_vivero AS ENUM (
      'INICIO',
      'EMBOLSADO',
      'ADAPTABILIDAD',
      'MERMA',
      'DESPACHO',
      'CIERRE_AUTOMATICO'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'motivo_cierre_lote'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.motivo_cierre_lote AS ENUM (
      'DESPACHO_TOTAL',
      'PERDIDA_TOTAL',
      'MIXTO'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'subetapa_adaptabilidad'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.subetapa_adaptabilidad AS ENUM (
      'SOMBRA',
      'MEDIA_SOMBRA',
      'SOL_DIRECTO'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'causa_merma_vivero'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.causa_merma_vivero AS ENUM (
      'PLAGA',
      'ENFERMEDAD',
      'SEQUIA',
      'DANO_FISICO',
      'MUERTE_NATURAL',
      'DESCARTE_CALIDAD',
      'OTRO'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'destino_tipo_vivero'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.destino_tipo_vivero AS ENUM (
      'PLANTACION_PROPIA',
      'DONACION_COMUNIDAD',
      'VENTA',
      'OTRO'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'unidad_medida'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.unidad_medida AS ENUM (
      'UNIDAD',
      'GR'
    );
  END IF;
END;
$$;
