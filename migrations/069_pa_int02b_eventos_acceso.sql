-- PA-T-INT02-B: ejecutar y confirmar ANTES de 070. PostgreSQL no permite
-- consumir valores ENUM agregados hasta confirmar la transaccion que los crea.
-- No cambia filas, estados ni eventos anteriores.
BEGIN;
ALTER TYPE public.tipo_historial_subcampania ADD VALUE IF NOT EXISTS 'PERMISO_OTORGADO';
ALTER TYPE public.tipo_historial_subcampania ADD VALUE IF NOT EXISTS 'PERMISO_CAMBIADO';
ALTER TYPE public.tipo_historial_subcampania ADD VALUE IF NOT EXISTS 'PERMISO_RETIRADO';
ALTER TYPE public.tipo_historial_subcampania ADD VALUE IF NOT EXISTS 'ADMINISTRADOR_REEMPLAZADO';
COMMIT;
