-- Antecedente focal para el contrato HTTP086 del backend actual.
-- No acredita instalación082 ni materialización/correcciones INT07.
ALTER TABLE public.planta ADD COLUMN IF NOT EXISTS nombre_comun_principal text,
  ADD COLUMN IF NOT EXISTS imagen_url text;
CREATE TABLE public.registro_plantacion_consumo_credito (
  id bigint PRIMARY KEY, registro_plantacion_id bigint NOT NULL,
  correccion_id bigint, planta_id bigint NOT NULL, cantidad integer NOT NULL
);
CREATE TABLE public.registro_plantacion_consumo_compensacion (
  credito_id bigint NOT NULL, cantidad integer NOT NULL
);
GRANT SELECT ON public.registro_plantacion_consumo_credito,
  public.registro_plantacion_consumo_compensacion TO service_role;
\ir ../../migrations/086_pa_contexto_registro_avance_especie.sql
