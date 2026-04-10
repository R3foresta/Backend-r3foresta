-- =====================================================
-- Script SQL para crear bucket RECOLECCION_FOTOS en Supabase
-- =====================================================

-- 1. Crear el bucket público para fotos de recolecciones
INSERT INTO storage.buckets (id, name, public)
VALUES ('RECOLECCION_FOTOS', 'RECOLECCION_FOTOS', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Permitir lectura de fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar fotos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar fotos" ON storage.objects;

-- 2. Política para permitir lectura pública (SELECT)
CREATE POLICY "Permitir lectura de fotos"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'RECOLECCION_FOTOS' );

-- 3. Política para permitir inserción pública (INSERT/UPLOAD)
CREATE POLICY "Permitir upload de fotos"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'RECOLECCION_FOTOS' );

-- 4. Política para permitir eliminación pública (DELETE)
CREATE POLICY "Permitir eliminar fotos"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'RECOLECCION_FOTOS' );

-- 5. Política para permitir actualización pública (UPDATE)
CREATE POLICY "Permitir actualizar fotos"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'RECOLECCION_FOTOS' )
WITH CHECK ( bucket_id = 'RECOLECCION_FOTOS' );

-- =====================================================
-- Instrucciones:
-- 1. Ve a tu proyecto de Supabase
-- 2. Navega a SQL Editor
-- 3. Copia y pega este código
-- 4. Ejecuta el script
-- 5. Verifica en Storage > Buckets que aparezca "RECOLECCION_FOTOS"
-- =====================================================

-- =====================================================
-- NOTA: Si el código ya usa "recoleccion_fotos" (minúsculas)
-- también puedes crear ese bucket:
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('recoleccion_fotos', 'recoleccion_fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas existentes si existen
DROP POLICY IF EXISTS "Permitir lectura de fotos recoleccion" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de fotos recoleccion" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar fotos recoleccion" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar fotos recoleccion" ON storage.objects;

-- Crear políticas
CREATE POLICY "Permitir lectura de fotos recoleccion"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'recoleccion_fotos' );

CREATE POLICY "Permitir upload de fotos recoleccion"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'recoleccion_fotos' );

CREATE POLICY "Permitir eliminar fotos recoleccion"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'recoleccion_fotos' );

CREATE POLICY "Permitir actualizar fotos recoleccion"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'recoleccion_fotos' )
WITH CHECK ( bucket_id = 'recoleccion_fotos' );
