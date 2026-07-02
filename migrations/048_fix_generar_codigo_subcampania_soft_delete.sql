-- 048_fix_generar_codigo_subcampania_soft_delete.sql
-- Corrige la RPC de generacion de codigo de subcampania para que nunca
-- reutilice codigos de trazabilidad, incluso si existen registros en
-- soft delete. El correlativo local pasa a ser MAX historico + 1 por
-- campania, sin filtrar deleted_at.
-- Depende de: 028 (campania), 029 (subcampania), 041 (RPC original).

DO $$ BEGIN
  IF to_regclass('public.subcampania') IS NULL THEN
    RAISE EXCEPTION 'No existe public.subcampania. Ejecuta la migracion 029 primero.';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.fn_generar_codigo_subcampania(INT);

CREATE FUNCTION public.fn_generar_codigo_subcampania(p_campania_id INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_codigo_campania TEXT;
  v_siguiente INT;
BEGIN
  SELECT codigo_trazabilidad
    INTO v_codigo_campania
  FROM public.campania
  WHERE id = p_campania_id;

  IF v_codigo_campania IS NULL THEN
    RAISE EXCEPTION 'CAMPANIA % no existe', p_campania_id;
  END IF;

  -- Lock pesimista por campania para serializar la generacion del correlativo.
  PERFORM 1
  FROM public.campania
  WHERE id = p_campania_id
  FOR UPDATE;

  SELECT COALESCE(
           MAX(
             CASE
               WHEN codigo_trazabilidad ~ '^SUB-[0-9]+-'
                 THEN split_part(codigo_trazabilidad, '-', 2)::INT
               ELSE NULL
             END
           ),
           0
         ) + 1
    INTO v_siguiente
  FROM public.subcampania
  WHERE campania_id = p_campania_id;

  RETURN 'SUB-' || lpad(v_siguiente::TEXT, 3, '0') || '-' || v_codigo_campania;
END $$;

COMMENT ON FUNCTION public.fn_generar_codigo_subcampania(INT) IS
  'Genera codigo SUB-NNN-CMP-YYYY-NNN usando el maximo correlativo historico por campania (incluye registros soft-deleted). Llamar dentro de la transaccion que inserta la subcampania para garantizar atomicidad (usa FOR UPDATE sobre campania).';
