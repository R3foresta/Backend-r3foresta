-- 022_planta_soft_delete.sql
-- Habilita soft-delete y trazabilidad de actualizacion en planta.
-- Idempotente (IF NOT EXISTS) para que pueda aplicarse en ambientes que
-- ya tengan columnas parciales.

ALTER TABLE public.planta
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.planta
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.planta.activo IS
  'Soft delete: false oculta la planta del listado por defecto pero conserva las referencias en recolecciones y lotes-vivero.';
COMMENT ON COLUMN public.planta.updated_at IS
  'Marca temporal de la ultima actualizacion del registro de planta.';

-- Trigger para mantener updated_at en sincronia
CREATE OR REPLACE FUNCTION public.set_planta_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_planta_set_updated_at ON public.planta;
CREATE TRIGGER trg_planta_set_updated_at
  BEFORE UPDATE ON public.planta
  FOR EACH ROW
  EXECUTE FUNCTION public.set_planta_updated_at();

-- Indice para filtros frecuentes activo=true
CREATE INDEX IF NOT EXISTS idx_planta_activo ON public.planta (activo);

-- =========================================================
-- TODO: drift de tipo_planta
-- =========================================================
-- La migracion 005 define planta.tipo_planta como TEXT con CHECK constraint.
-- El codigo actual (plantas.service.ts, recoleccion-consultas.service.ts) usa
-- una FK tipo_planta_id hacia una tabla tipo_planta que NO existe en este
-- repositorio de migraciones. El ALTER se hizo directo en Supabase.
--
-- Tarea pendiente: agregar migracion 023_tipo_planta_table_alignment.sql que
-- (a) cree CREATE TABLE IF NOT EXISTS public.tipo_planta (...)
-- (b) ALTER TABLE planta ADD COLUMN IF NOT EXISTS tipo_planta_id BIGINT REFERENCES tipo_planta(id)
-- (c) elimine las columnas legacy tipo_planta TEXT y tipo_planta_otro TEXT si
--     ya no son usadas (verificar antes con el equipo).
-- Confirmar el schema real de Supabase antes de redactarla.