-- Migración: Crear bucket fotos_plantas
-- Descripción: Bucket público para almacenar imágenes del catálogo de plantas

-- Crear bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos_plantas', 'fotos_plantas', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas si existen
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Política única que permite todas las operaciones
CREATE POLICY "Public Access"
ON storage.objects FOR ALL
TO public
USING ( bucket_id = 'fotos_plantas' )
WITH CHECK ( bucket_id = 'fotos_plantas' );

-- =====================================================
-- Instrucciones:
-- 1. Ve a tu proyecto de Supabase
-- 2. Navega a SQL Editor
-- 3. Copia y pega este código
-- 4. Ejecuta el script
-- 5. Verifica en Storage > Buckets que aparezca "fotos_plantas"
-- =====================================================
