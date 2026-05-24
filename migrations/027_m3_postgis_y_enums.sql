-- 027_m3_postgis_y_enums.sql
-- Modulo 3 (Plantacion) — base 1/6: habilita PostGIS y crea los enums M3.
-- Origen: tareas/modulo-2-integracion-modulo-3/11_db_modelado_m3_base.md (seccion 2.1 + 2.2).
-- Idempotente. Aplicar en orden 027 → 028 → 029 → 030 → 031 → 032.

-- =====================================================================
-- 1. Extension PostGIS
-- =====================================================================
-- Requerida para SUBCAMPANIA.poligono_geom y la funcion gps_dentro_poligono_con_tolerancia.
-- En Supabase puede requerir habilitacion previa desde el dashboard.

CREATE EXTENSION IF NOT EXISTS postgis;

-- =====================================================================
-- 2. Enums de subcampania
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tipo_subcampania' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.tipo_subcampania AS ENUM (
      'REFORESTACION',
      'ARBORIZACION',
      'FORESTACION'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'estado_subcampania' AND n.nspname = 'public'
  ) THEN
    -- PAUSADA y CANCELADA quedan reservadas, sin flujo en MVP.
    CREATE TYPE public.estado_subcampania AS ENUM (
      'BORRADOR',
      'ACTIVA',
      'COMPLETADA',
      'FINALIZADA_PARCIAL',
      'PAUSADA',
      'CANCELADA'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'fase_mantenimiento_subcampania' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.fase_mantenimiento_subcampania AS ENUM (
      'NO_APLICA',
      'MANTENIMIENTO_ACTIVO',
      'MONITOREO_HISTORICO'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'motivo_cierre_parcial' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.motivo_cierre_parcial AS ENUM (
      'FALTA_STOCK',
      'PROBLEMAS_CLIMATICOS',
      'CANCELACION_CONVENIO',
      'CONFLICTO_SOCIAL',
      'ACCESO_RESTRINGIDO',
      'CAMBIO_PRIORIDAD_INSTITUCIONAL',
      'RIESGO_OPERATIVO',
      'META_REDEFINIDA',
      'CIERRE_ADMINISTRATIVO',
      'OTRO'
    );
  END IF;
END $$;

-- =====================================================================
-- 3. Enums de equipo
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'rol_en_subcampania' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.rol_en_subcampania AS ENUM (
      'COORDINADOR',
      'OPERARIO'
    );
  END IF;
END $$;

-- =====================================================================
-- 4. Enums de eventos de plantacion
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'causa_mortandad_plantacion' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.causa_mortandad_plantacion AS ENUM (
      'SEQUIA',
      'EXCESO_AGUA',
      'HELADA',
      'GRANIZO',
      'PLAGA',
      'ENFERMEDAD',
      'SUELO_INADECUADO',
      'FALTA_MANTENIMIENTO',
      'DANO_MECANICO',
      'PASTOREO',
      'VANDALISMO',
      'INCENDIO',
      'COMPETENCIA_MALEZA',
      'TRASPLANTE_DEFICIENTE',
      'DESCONOCIDA',
      'OTRO'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'motivo_devolucion_plantacion' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.motivo_devolucion_plantacion AS ENUM (
      'SOBRANTE_OPERATIVO',
      'ERROR_PLANIFICACION',
      'CAMBIO_SUBCAMPANIA',
      'CIERRE_SUBCAMPANIA',
      'PROBLEMAS_CALIDAD_LOTE',
      'CONDICIONES_CAMPO_NO_APTAS',
      'ACCESO_RESTRINGIDO',
      'CANCELACION_ACTIVIDAD',
      'REASIGNACION_PRIORIDAD',
      'OTRO'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'tipo_evento_plantacion' AND n.nspname = 'public'
  ) THEN
    -- PLANTACION_INICIAL y REPOSICION NO van aqui: viven como filas en
    -- REGISTRO_PLANTACION con es_reposicion = false | true.
    CREATE TYPE public.tipo_evento_plantacion AS ENUM (
      'ASIGNACION_VIVERO',
      'DEVOLUCION_A_VIVERO',
      'MORTANDAD_REPORTADA'
    );
  END IF;
END $$;
