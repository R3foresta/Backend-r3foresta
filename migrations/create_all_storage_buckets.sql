-- =====================================================
-- Script SQL COMPLETO para crear todos los buckets de almacenamiento
-- =====================================================
-- Ejecuta este script en el SQL Editor de Supabase
-- para crear todos los buckets necesarios con sus políticas
-- =====================================================

-- =====================================================
-- Script SQL COMPLETO para crear todos los buckets de almacenamiento
-- =====================================================
-- Ejecuta este script en el SQL Editor de Supabase
-- para crear todos los buckets necesarios con sus políticas
-- =====================================================

-- ==================== BUCKET 1: fotos_plantas ====================
-- Bucket para almacenar imágenes del catálogo de plantas
-- ===================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos_plantas', 'fotos_plantas', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Permitir lectura de fotos plantas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de fotos plantas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar fotos plantas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar fotos plantas" ON storage.objects;

-- Crear políticas
CREATE POLICY "Permitir lectura de fotos plantas"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'fotos_plantas' );

CREATE POLICY "Permitir upload de fotos plantas"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'fotos_plantas' );

CREATE POLICY "Permitir eliminar fotos plantas"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'fotos_plantas' );

CREATE POLICY "Permitir actualizar fotos plantas"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'fotos_plantas' )
WITH CHECK ( bucket_id = 'fotos_plantas' );


-- ==================== BUCKET 2: RECOLECCION_FOTOS ====================
-- Bucket para almacenar fotos de recolecciones (mayúsculas)
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('RECOLECCION_FOTOS', 'RECOLECCION_FOTOS', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Permitir lectura de fotos recoleccion mayus" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de fotos recoleccion mayus" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar fotos recoleccion mayus" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar fotos recoleccion mayus" ON storage.objects;

-- Crear políticas
CREATE POLICY "Permitir lectura de fotos recoleccion mayus"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'RECOLECCION_FOTOS' );

CREATE POLICY "Permitir upload de fotos recoleccion mayus"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'RECOLECCION_FOTOS' );

CREATE POLICY "Permitir eliminar fotos recoleccion mayus"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'RECOLECCION_FOTOS' );

CREATE POLICY "Permitir actualizar fotos recoleccion mayus"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'RECOLECCION_FOTOS' )
WITH CHECK ( bucket_id = 'RECOLECCION_FOTOS' );


-- ==================== BUCKET 3: recoleccion_fotos ====================
-- Bucket para almacenar fotos de recolecciones (minúsculas)
-- Usado actualmente en el código de recolecciones.service.ts
-- =====================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('recoleccion_fotos', 'recoleccion_fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Permitir lectura de fotos recoleccion minus" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de fotos recoleccion minus" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar fotos recoleccion minus" ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar fotos recoleccion minus" ON storage.objects;

-- Crear políticas
CREATE POLICY "Permitir lectura de fotos recoleccion minus"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'recoleccion_fotos' );

CREATE POLICY "Permitir upload de fotos recoleccion minus"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'recoleccion_fotos' );

CREATE POLICY "Permitir eliminar fotos recoleccion minus"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'recoleccion_fotos' );

CREATE POLICY "Permitir actualizar fotos recoleccion minus"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'recoleccion_fotos' )
WITH CHECK ( bucket_id = 'recoleccion_fotos' );


-- =====================================================
-- ✅ VERIFICACIÓN
-- =====================================================
-- Ejecuta esto después para verificar que se crearon correctamente:

-- Ver todos los buckets creados
SELECT id, name, public, created_at 
FROM storage.buckets 
WHERE id IN ('fotos_plantas', 'RECOLECCION_FOTOS', 'recoleccion_fotos');

-- Ver todas las políticas de storage
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
ORDER BY policyname;

-- =====================================================
-- 📝 NOTAS IMPORTANTES
-- =====================================================
-- 1. Todos los buckets son PÚBLICOS (public = true)
-- 2. Las políticas permiten acceso completo (SELECT, INSERT, UPDATE, DELETE)
-- 3. Si necesitas restricciones, modifica las políticas después
-- 4. El bucket 'recoleccion_fotos' es el que usa actualmente el código
-- =====================================================
