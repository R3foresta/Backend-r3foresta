-- Solo para una base vacía AISLADA. Datos y ACL sintéticos; no cargar .env.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
ALTER ROLE service_role BYPASSRLS;
CREATE TYPE public.rol_usuario AS ENUM ('ADMIN','GENERAL','VALIDADOR','VOLUNTARIO');
CREATE TABLE public.organizacion (
  id BIGINT PRIMARY KEY, nombre TEXT NOT NULL, activo BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE public.usuario (
  id BIGINT PRIMARY KEY, auth_id TEXT, username TEXT, nombre TEXT,
  apellido TEXT, organizacion TEXT, rol public.rol_usuario NOT NULL DEFAULT 'GENERAL',
  doc_identidad TEXT UNIQUE, wallet_address TEXT UNIQUE, contacto TEXT, foto_perfil_url TEXT
);
INSERT INTO public.organizacion VALUES
  (9007199254740993, 'Bosque Vivo', true), (2, 'Entidad suspendida', false),
  (11, 'Bosque Verde', true), (12, repeat('Z', 2000), true),
  (13, U&'A\0301rbol', true), (14, 'Árbol', true);
INSERT INTO public.usuario(id,auth_id,username,nombre,apellido,organizacion,rol) VALUES
  (9007199254740995, 'admin', 'admin', 'Admin', NULL, NULL, 'ADMIN'),
  (2, 'general', 'general', 'General', 'G', repeat('L', 180), 'GENERAL'),
  (3, 'vol', 'vol', 'Voluntario', NULL, NULL, 'VOLUNTARIO'),
  (6, 'validator', 'validator', 'Validador', NULL, NULL, 'VALIDADOR');
UPDATE public.usuario SET doc_identidad='DOCUMENTO_OCUPADO' WHERE id=2;
GRANT SELECT, UPDATE, INSERT, DELETE ON public.usuario, public.organizacion TO service_role;
-- ACL/RLS permisivas preexistentes: la migración debe cerrar escritura pública.
GRANT INSERT, UPDATE, DELETE ON public.usuario TO anon, authenticated;
GRANT INSERT(id,auth_id,rol), UPDATE(rol) ON public.usuario TO PUBLIC;
ALTER TABLE public.usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_publica ON public.usuario FOR ALL TO anon, authenticated USING(true) WITH CHECK(true);
CREATE TABLE public.pa_int02a_fixture_marker (fixture TEXT PRIMARY KEY);
INSERT INTO public.pa_int02a_fixture_marker VALUES('SINTETICO_AISLADO');
\ir ../../migrations/064_pa_int02a_identidad_perfil.sql
