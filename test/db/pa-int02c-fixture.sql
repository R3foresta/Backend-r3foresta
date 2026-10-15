-- SINTETICO_AISLADO_INT02C. Antecedente mínimo; nunca catálogo remoto.
-- Conserva datos legados INT02B y añade lo que consumen las lecturas v1.
\ir pa-int02b-fixture.sql
ALTER TABLE public.usuario ADD COLUMN correo TEXT;
CREATE TABLE public.campania (
  id BIGINT PRIMARY KEY, nombre TEXT NOT NULL, deleted_at TIMESTAMPTZ
);
INSERT INTO public.campania(id,nombre) VALUES (1,'Campaña sintética INT02C');
GRANT SELECT ON public.campania, public.subcampania_equipo TO service_role;
-- Funciones reales de identidad/perfil necesarias para Guard y regresión HTTP.
-- Aplicar aquí no representa reconstrucción de 001–067.
\ir ../../migrations/064_pa_int02a_identidad_perfil.sql
CREATE TABLE public.pa_int02c_fixture_marker(fixture TEXT PRIMARY KEY);
INSERT INTO public.pa_int02c_fixture_marker VALUES('SINTETICO_AISLADO_INT02C');
