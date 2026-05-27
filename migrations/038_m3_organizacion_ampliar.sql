-- 038_m3_organizacion_ampliar.sql
-- Modulo General (preparacion para Plantacion) — amplia tabla ORGANIZACION:
--   1. Agrega columna logo_url para foto/logo de la organizacion (Supabase Storage o IPFS).
--   2. Provisiona el bucket 'organizaciones' en Supabase Storage con sus politicas.
-- Origen: requerimiento RF-PLA-01 / RF-PLA-02; la tabla organizacion fue creada
--   como placeholder minimo en 028_m3_campania.sql y se amplia aqui.
-- Depende de: 028_m3_campania.sql (tabla public.organizacion).
-- Idempotente.

DO $$
BEGIN
  IF to_regclass('public.organizacion') IS NULL THEN
    RAISE EXCEPTION 'No existe public.organizacion. Ejecuta la migracion 028 primero.';
  END IF;
END $$;

-- =====================================================================
-- 1. Columna ORGANIZACION.logo_url
-- =====================================================================
-- Guarda la URL publica del logo o foto institucional de la organizacion.
-- Puede apuntar a un objeto del bucket 'organizaciones' de Supabase Storage
-- o a un hash IPFS via gateway (mismo patron que fotos_plantas y recoleccion_fotos).
-- Nullable: las organizaciones existentes pueden no tener logo todavia.

ALTER TABLE public.organizacion
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN public.organizacion.logo_url IS
  'URL publica del logo o foto institucional de la organizacion. Apunta a un objeto del bucket "organizaciones" en Supabase Storage o a un gateway IPFS. Nullable. El backend la persiste despues de subir el archivo via supabase.storage.from("organizaciones").upload().';

-- =====================================================================
-- 2. Bucket "organizaciones" en Supabase Storage
-- =====================================================================
-- Almacena logos e imagenes de organizaciones.
-- Publico: los logos son visibles sin autenticacion (misma convencion
-- que el bucket fotos_plantas creado en 002/004).
--
-- NOTA: ejecutar este bloque en el SQL Editor de Supabase con permisos
-- sobre el schema storage (service_role o superuser). Si el bucket ya
-- existe, ON CONFLICT DO NOTHING evita el error.

INSERT INTO storage.buckets (id, name, public)
VALUES ('organizaciones', 'organizaciones', true)
ON CONFLICT (id) DO NOTHING;

-- Las politicas se recrean con DROP + CREATE para que sean idempotentes.
DROP POLICY IF EXISTS "Permitir lectura de logos organizaciones"    ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload de logos organizaciones"     ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar logos organizaciones"      ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar logos organizaciones"    ON storage.objects;

CREATE POLICY "Permitir lectura de logos organizaciones"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'organizaciones' );

CREATE POLICY "Permitir upload de logos organizaciones"
ON storage.objects FOR INSERT
TO public
WITH CHECK ( bucket_id = 'organizaciones' );

CREATE POLICY "Permitir eliminar logos organizaciones"
ON storage.objects FOR DELETE
TO public
USING ( bucket_id = 'organizaciones' );

CREATE POLICY "Permitir actualizar logos organizaciones"
ON storage.objects FOR UPDATE
TO public
USING ( bucket_id = 'organizaciones' )
WITH CHECK ( bucket_id = 'organizaciones' );

-- =====================================================================
-- Uso desde el backend
-- =====================================================================
-- Servicio que maneje el logo de la organizacion:
--   1. Subir archivo a Supabase Storage:
--        await supabase.storage.from('organizaciones').upload(path, file)
--   2. Obtener URL publica y persistir en organizacion.logo_url:
--        await supabase.from('organizacion').update({ logo_url: url }).eq('id', id)
-- Ver patron equivalente en src/lotes-vivero/application/vivero-evidencias.service.ts
-- =====================================================================
