-- 063_subcampania_plan_lectura_backend.sql
-- Depende de 062. Todos los roles de usuario pueden leer el plan a través
-- del backend, que verifica el JWT y la existencia del usuario de la sesión.
-- Evita que la RPC de lectura pública eluda esa verificación.
-- No modifica planes, saldos ni historial. Es idempotente.

REVOKE ALL ON FUNCTION public.fn_subcampania_obtener_plan(BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_subcampania_obtener_plan(BIGINT)
  TO service_role;

COMMENT ON FUNCTION public.fn_subcampania_obtener_plan(BIGINT) IS
  'Snapshot coherente del plan. Lectura a través del backend service_role para cualquier usuario con sesión JWT válida; sin restricción de rol de usuario.';

NOTIFY pgrst, 'reload schema';
