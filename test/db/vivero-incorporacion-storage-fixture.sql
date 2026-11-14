-- Antecedente sintético focal para 104/T5. No representa el servicio Storage HTTP.
CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;

CREATE TABLE storage.buckets(
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  type text NOT NULL DEFAULT 'STANDARD'
);
CREATE TABLE storage.objects(
  id uuid PRIMARY KEY,
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets, storage.objects
  TO anon, authenticated, service_role;

-- Políticas deliberadamente abiertas para demostrar el efecto de las
-- restricciones aun con permisos globales anteriores.
CREATE POLICY fixture_storage_abierto ON storage.buckets
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY fixture_storage_abierto ON storage.objects
  FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
INSERT INTO storage.buckets(id,name,public)
VALUES ('publico_fixture','publico_fixture',true),
       ('privado_fixture','privado_fixture',false);
INSERT INTO storage.objects(id,bucket_id,name)
VALUES ('00000000-0000-4000-8000-000000000001','publico_fixture','publico.jpg'),
       ('00000000-0000-4000-8000-000000000002','privado_fixture','privado.jpg');

