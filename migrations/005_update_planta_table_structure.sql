-- Migración para actualizar la estructura de la tabla planta
-- Fecha: 2026-02-04
-- Descripción: Simplifica la estructura de planta con solo los campos necesarios
--              y agrega un índice único para prevenir duplicados por nombre_cientifico + variedad

-- Primero, hacer backup de los datos existentes (opcional pero recomendado)
-- CREATE TABLE planta_backup_20260204 AS SELECT * FROM public.planta;

-- Eliminar la tabla existente (CUIDADO: esto borrará todos los datos)
-- Si tienes datos importantes, considera hacer una migración más cuidadosa
DROP TABLE IF EXISTS public.planta CASCADE;

-- Crear la nueva tabla con la estructura simplificada
CREATE TABLE public.planta (
  id BIGSERIAL NOT NULL,
  especie TEXT NOT NULL,
  nombre_cientifico TEXT NOT NULL,
  variedad TEXT NOT NULL,
  tipo_planta TEXT NULL,
  tipo_planta_otro TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  nombre_comun_principal TEXT NULL,
  nombres_comunes TEXT NULL,
  imagen_url TEXT NULL,
  notas TEXT NULL,
  CONSTRAINT planta_pkey PRIMARY KEY (id),
  CONSTRAINT chk_tipo_planta_otro CHECK (
    (
      (tipo_planta IS DISTINCT FROM 'Otro'::TEXT)
      OR (
        (tipo_planta = 'Otro'::TEXT)
        AND (tipo_planta_otro IS NOT NULL)
        AND (
          LENGTH(
            TRIM(
              BOTH
              FROM
                tipo_planta_otro
            )
          ) > 0
        )
      )
    )
  )
) TABLESPACE pg_default;

-- Crear índice único para prevenir duplicados (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_planta_cientifico_variedad 
  ON public.planta 
  USING BTREE (LOWER(nombre_cientifico), LOWER(variedad)) 
  TABLESPACE pg_default;

-- Crear índice adicional para búsquedas
CREATE INDEX IF NOT EXISTS idx_planta_especie 
  ON public.planta 
  USING BTREE (especie) 
  TABLESPACE pg_default;

-- Agregar comentarios a la tabla y columnas
COMMENT ON TABLE public.planta IS 'Catálogo de especies de plantas para el sistema Reforesta';
COMMENT ON COLUMN public.planta.especie IS 'Nombre común de la especie';
COMMENT ON COLUMN public.planta.nombre_cientifico IS 'Nombre científico de la planta (ej: Swietenia macrophylla)';
COMMENT ON COLUMN public.planta.variedad IS 'Variedad específica de la planta';
COMMENT ON COLUMN public.planta.tipo_planta IS 'Clasificación del tipo de planta (Árbol, Arbusto, Hierba, Otro)';
COMMENT ON COLUMN public.planta.tipo_planta_otro IS 'Especificación cuando tipo_planta es "Otro"';
COMMENT ON COLUMN public.planta.nombre_comun_principal IS 'Nombre común principal en la región';
COMMENT ON COLUMN public.planta.nombres_comunes IS 'Otros nombres comunes, separados por comas';
COMMENT ON COLUMN public.planta.imagen_url IS 'URL de la imagen de la planta almacenada en Supabase Storage';
COMMENT ON COLUMN public.planta.notas IS 'Notas adicionales sobre la planta, manejo o recolección';

-- Habilitar Row Level Security (RLS) si es necesario
ALTER TABLE public.planta ENABLE ROW LEVEL SECURITY;

-- Crear políticas de RLS (ajustar según tus necesidades)
-- Permitir lectura a todos los usuarios autenticados
CREATE POLICY "Permitir lectura a todos" 
  ON public.planta 
  FOR SELECT 
  USING (true);

-- Permitir inserción solo a usuarios autenticados (ajustar según roles)
CREATE POLICY "Permitir inserción a usuarios autenticados" 
  ON public.planta 
  FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

-- Permitir actualización solo a usuarios autenticados
CREATE POLICY "Permitir actualización a usuarios autenticados" 
  ON public.planta 
  FOR UPDATE 
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Permitir eliminación solo a usuarios autenticados
CREATE POLICY "Permitir eliminación a usuarios autenticados" 
  ON public.planta 
  FOR DELETE 
  USING (auth.role() = 'authenticated');
