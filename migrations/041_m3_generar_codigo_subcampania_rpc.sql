-- 041_m3_generar_codigo_subcampania_rpc.sql
-- Genera codigo de trazabilidad para subcampanias: SUB-{NNN_local}-{codigo_campania}
-- donde NNN_local es el contador secuencial dentro de esa campania
-- (count de subcampanias no-deleted de esa campania + 1, atomico).
-- Depende de: 028 (campania), 029 (subcampania).

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
  SELECT codigo_trazabilidad INTO v_codigo_campania
  FROM public.campania WHERE id = p_campania_id;

  IF v_codigo_campania IS NULL THEN
    RAISE EXCEPTION 'CAMPANIA % no existe', p_campania_id;
  END IF;

  -- LOCK pesimista para evitar races: cuenta + 1 con bloqueo de fila.
  PERFORM 1 FROM public.campania WHERE id = p_campania_id FOR UPDATE;

  SELECT COUNT(*) + 1 INTO v_siguiente
  FROM public.subcampania
  WHERE campania_id = p_campania_id AND deleted_at IS NULL;

  RETURN 'SUB-' || lpad(v_siguiente::TEXT, 3, '0') || '-' || v_codigo_campania;
END $$;

COMMENT ON FUNCTION public.fn_generar_codigo_subcampania(INT) IS
  'Genera codigo SUB-NNN-CMP-YYYY-NNN. Llamar dentro de la transaccion que inserta la subcampania para garantizar atomicidad (usa FOR UPDATE sobre campania).';
