-- Antecedente focal sintético de identidad; sólo para el runner desechable.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TYPE public.rol_usuario AS ENUM ('ADMIN','GENERAL','VALIDADOR','VOLUNTARIO');
CREATE TABLE public.organizacion(id BIGINT PRIMARY KEY,nombre TEXT,activo BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE public.usuario (
  id BIGSERIAL PRIMARY KEY, nombre TEXT NOT NULL, apellido TEXT,
  doc_identidad TEXT UNIQUE, wallet_address TEXT UNIQUE, contacto TEXT,
  organizacion TEXT, foto_perfil_url TEXT,
  rol public.rol_usuario NOT NULL DEFAULT 'GENERAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT DEFAULT '' UNIQUE, auth_id TEXT DEFAULT '', correo TEXT DEFAULT '' UNIQUE
);
\ir ../../supabase-webauthn-schema.sql
GRANT SELECT,INSERT,UPDATE,DELETE ON public.usuario,public.usuario_credencial,public.organizacion TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON public.usuario,public.usuario_credencial TO anon,authenticated;
INSERT INTO public.usuario(nombre,username,auth_id,correo,rol) VALUES
  ('Administrador legado','admin-legado','auth-admin-legado','','ADMIN'),
  ('Operador sin username',NULL,'auth-operador-legado',NULL,'GENERAL'),
  ('Voluntario legado','vol-legado','auth-vol-legado','legado@example.invalid','VOLUNTARIO');
INSERT INTO public.usuario_credencial(usuario_id,credential_id,public_key,algorithm,counter)
VALUES(1,'credencial-legada','clave-publica-sintetica','ES256',0);
\ir ../../migrations/064_pa_int02a_identidad_perfil.sql
\ir ../../migrations/065_pa_int02a_usuario_privilegios_residuales.sql
\ir ../../migrations/066_pa_int02a_privacidad_usuario_organizacion.sql
\ir ../../migrations/067_pa_int02a_postgrest_timeout.sql
ALTER SEQUENCE public.usuario_id_seq RESTART WITH 9007199254740993;
