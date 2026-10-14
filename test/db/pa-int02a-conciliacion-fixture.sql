-- Base vacía AISLADA: reproduce conteos y manifest del diagnóstico con datos sintéticos.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE TYPE public.rol_usuario AS ENUM('ADMIN','GENERAL','VALIDADOR','VOLUNTARIO');
CREATE TYPE public.tipo_organizacion AS ENUM('SINTETICA');
CREATE TABLE public.organizacion(
  id BIGINT PRIMARY KEY,nombre TEXT NOT NULL UNIQUE,activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logo_url TEXT,tipo public.tipo_organizacion NOT NULL
);
CREATE TABLE public.usuario(
  id BIGSERIAL PRIMARY KEY,nombre TEXT NOT NULL,doc_identidad TEXT UNIQUE,
  wallet_address TEXT UNIQUE CHECK(wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  organizacion TEXT,contacto TEXT,rol public.rol_usuario NOT NULL DEFAULT 'GENERAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),username TEXT DEFAULT '' UNIQUE,
  auth_id TEXT DEFAULT '',correo TEXT DEFAULT '' UNIQUE,
  apellido TEXT CHECK(length(apellido)<=30),foto_perfil_url TEXT
);
CREATE TABLE public.usuario_credencial(
  id BIGINT PRIMARY KEY,usuario_id BIGINT NOT NULL REFERENCES public.usuario(id)
);
CREATE TABLE public.pa_int02a_historia_fixture(
  id BIGINT PRIMARY KEY,usuario_id BIGINT NOT NULL REFERENCES public.usuario(id),detalle TEXT NOT NULL
);
CREATE TABLE public.pa_int02a_conciliacion_marker(fixture TEXT PRIMARY KEY);
INSERT INTO public.pa_int02a_conciliacion_marker VALUES('SINTETICO_AISLADO');
INSERT INTO public.usuario(id,nombre,rol,auth_id,username,correo,organizacion)
SELECT i,'Fixture '||i,
  CASE WHEN i IN(2,7) THEN 'VOLUNTARIO' WHEN i BETWEEN 9 AND 13 THEN 'ADMIN' ELSE 'GENERAL' END::public.rol_usuario,
  CASE WHEN i<=8 THEN '' ELSE 'fixture_'||i END,
  'fixture_username_'||i,'fixture_'||i||'@example.invalid','Legado '||i
FROM generate_series(1,39) i;
INSERT INTO public.organizacion VALUES(1,'Catálogo sintético',true,now(),now(),NULL,'SINTETICA');
INSERT INTO public.usuario_credencial VALUES(1,1);
INSERT INTO public.pa_int02a_historia_fixture
SELECT i,i,'Historia sintética '||i FROM generate_series(1,39) i;
GRANT ALL ON public.usuario,public.organizacion TO anon,authenticated,service_role;
GRANT USAGE ON SEQUENCE public.usuario_id_seq TO service_role;
