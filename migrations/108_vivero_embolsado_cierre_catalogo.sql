-- T5: cierre aditivo del catálogo EMBOLSADO observado en pruebas el14/11/2026.
-- Sustituye sólo dos CHECKs, admitiendo los antecedentes exactos010,107 y la
-- variante documentada; no omite el preflight ni reescribe SQL ya aplicado.
-- Conserva NULL anterior019/095 y cero histórico; mantiene >=0 en MERMA/DESPACHO.
-- Lote/eventos/IDs/saldos/ACL/RPC/Storage no se modifican. Repetible tras108.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SET LOCAL search_path=pg_catalog,public;

CREATE TEMP TABLE pg_temp._r3_108_antes(
  tipo_evento public.tipo_evento_vivero,saldo_vivo_antes integer,saldo_vivo_despues integer,cantidad_afectada numeric
) ON COMMIT DROP;
ALTER TABLE pg_temp._r3_108_antes ADD CONSTRAINT requeridos CHECK (
  tipo_evento NOT IN ('EMBOLSADO','MERMA','DESPACHO')
  OR (saldo_vivo_antes IS NOT NULL AND saldo_vivo_despues IS NOT NULL)
);
ALTER TABLE pg_temp._r3_108_antes ADD CONSTRAINT consistente CHECK (
  tipo_evento<>'EMBOLSADO' OR (
    saldo_vivo_antes=0 AND cantidad_afectada IS NOT NULL AND cantidad_afectada=saldo_vivo_despues::numeric
  )
);
CREATE TEMP TABLE pg_temp._r3_108_despues(
  tipo_evento public.tipo_evento_vivero,saldo_vivo_antes integer,saldo_vivo_despues integer,
  cantidad_afectada numeric,unidad_medida_evento public.unidad_medida
) ON COMMIT DROP;
ALTER TABLE pg_temp._r3_108_despues ADD CONSTRAINT requeridos CHECK (
  tipo_evento NOT IN ('MERMA','DESPACHO')
  OR (saldo_vivo_antes IS NOT NULL AND saldo_vivo_despues IS NOT NULL)
);
-- Compatibilidad histórica explícita:010 podía registrar cero antes del
-- nacimiento. Se conserva ese dato; no se convierte cero en hora/saldo previo.
ALTER TABLE pg_temp._r3_108_despues ADD CONSTRAINT consistente CHECK (
  tipo_evento<>'EMBOLSADO' OR (
    (saldo_vivo_antes IS NULL OR saldo_vivo_antes=0)
    AND cantidad_afectada IS NOT NULL AND cantidad_afectada BETWEEN 1 AND 2147483647
    AND cantidad_afectada=trunc(cantidad_afectada)
    AND saldo_vivo_despues IS NOT NULL AND cantidad_afectada=saldo_vivo_despues::numeric
    AND unidad_medida_evento IS NOT NULL AND unidad_medida_evento='UNIDAD'
  )
);
CREATE TEMP TABLE pg_temp._r3_108_destino(
  tipo_evento public.tipo_evento_vivero,saldo_vivo_antes integer,saldo_vivo_despues integer,
  cantidad_afectada numeric,unidad_medida_evento public.unidad_medida
) ON COMMIT DROP;
ALTER TABLE pg_temp._r3_108_destino ADD CONSTRAINT requeridos CHECK (
  (tipo_evento='EMBOLSADO' AND saldo_vivo_antes IS NULL AND saldo_vivo_despues IS NOT NULL AND saldo_vivo_despues>=0)
  OR (tipo_evento IN ('MERMA','DESPACHO') AND saldo_vivo_antes IS NOT NULL AND saldo_vivo_despues IS NOT NULL
    AND saldo_vivo_antes>=0 AND saldo_vivo_despues>=0)
  OR tipo_evento NOT IN ('EMBOLSADO','MERMA','DESPACHO')
);
CREATE TEMP TABLE pg_temp._r3_108_cierre(
  tipo_evento public.tipo_evento_vivero,saldo_vivo_antes integer,saldo_vivo_despues integer,
  cantidad_afectada numeric,unidad_medida_evento public.unidad_medida
) ON COMMIT DROP;
ALTER TABLE pg_temp._r3_108_cierre ADD CONSTRAINT requeridos CHECK (
  tipo_evento NOT IN ('MERMA','DESPACHO')
  OR (saldo_vivo_antes IS NOT NULL AND saldo_vivo_despues IS NOT NULL
    AND saldo_vivo_antes>=0 AND saldo_vivo_despues>=0)
);

LOCK TABLE public.evento_lote_vivero IN ACCESS EXCLUSIVE MODE;
DO $preflight$
DECLARE f record; c record; previo text; posterior text; observado text; cierre text; actual text; validada boolean;
BEGIN
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(
    'public.fn_vivero_registrar_embolsado(bigint,date,bigint,integer,text,bigint[])');
  IF f.oid IS NULL OR encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')<>'fd072db314cef4d158e3e19eac9844bb055f47ceafc3ca9eb1963a4ca0c7acb9'
    OR NOT f.prosecdef OR NOT f.proretset OR f.prorettype<>'record'::regtype
    OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[] THEN
    RAISE EXCEPTION 'T5_EMBOLSADO_108_RPC_INCOMPATIBLE: cotejar095'; END IF;
  FOR c IN SELECT * FROM (VALUES
    ('chk_evento_lote_vivero_saldos_eventos_vivos_requeridos','requeridos'),
    ('chk_evento_lote_vivero_embolsado_consistente','consistente')
  ) x(nombre,referencia) LOOP
    SELECT pg_get_constraintdef(oid) INTO STRICT previo FROM pg_constraint
      WHERE conrelid='pg_temp._r3_108_antes'::regclass AND conname=c.referencia;
    SELECT pg_get_constraintdef(oid) INTO STRICT posterior FROM pg_constraint
      WHERE conrelid='pg_temp._r3_108_despues'::regclass AND conname=c.referencia;
    observado:=NULL; cierre:=NULL;
    IF c.referencia='requeridos' THEN
      SELECT pg_get_constraintdef(oid) INTO STRICT observado FROM pg_constraint
        WHERE conrelid='pg_temp._r3_108_destino'::regclass AND conname='requeridos';
      SELECT pg_get_constraintdef(oid) INTO STRICT cierre FROM pg_constraint
        WHERE conrelid='pg_temp._r3_108_cierre'::regclass AND conname='requeridos';
    END IF;
    SELECT pg_get_constraintdef(oid),convalidated INTO actual,validada FROM pg_constraint
      WHERE conrelid='public.evento_lote_vivero'::regclass AND conname=c.nombre AND contype='c' AND NOT connoinherit;
    IF actual IS NULL OR NOT (actual=previo OR actual=posterior OR actual IS NOT DISTINCT FROM observado OR actual IS NOT DISTINCT FROM cierre) OR NOT validada THEN
      RAISE EXCEPTION 'T5_EMBOLSADO_108_CHECK_INCOMPATIBLE: %',c.nombre; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.evento_lote_vivero WHERE tipo_evento='EMBOLSADO' AND (
    (saldo_vivo_antes IS NULL OR saldo_vivo_antes=0)
    AND cantidad_afectada IS NOT NULL AND cantidad_afectada BETWEEN 1 AND 2147483647
    AND cantidad_afectada=trunc(cantidad_afectada)
    AND saldo_vivo_despues IS NOT NULL AND cantidad_afectada=saldo_vivo_despues::numeric
    AND unidad_medida_evento IS NOT NULL AND unidad_medida_evento='UNIDAD'
  ) IS NOT TRUE) THEN RAISE EXCEPTION 'T5_EMBOLSADO_108_DATOS_INCOMPATIBLES: preservar y revisar sin reescritura'; END IF;
  IF EXISTS(SELECT 1 FROM public.evento_lote_vivero WHERE tipo_evento IN ('MERMA','DESPACHO') AND (
    saldo_vivo_antes IS NOT NULL AND saldo_vivo_despues IS NOT NULL
    AND saldo_vivo_antes>=0 AND saldo_vivo_despues>=0
  ) IS NOT TRUE) THEN RAISE EXCEPTION 'T5_EMBOLSADO_108_DATOS_INCOMPATIBLES: saldos MERMA/DESPACHO; preservar y revisar sin reescritura'; END IF;
END $preflight$;

ALTER TABLE public.evento_lote_vivero DROP CONSTRAINT chk_evento_lote_vivero_saldos_eventos_vivos_requeridos;
ALTER TABLE public.evento_lote_vivero ADD CONSTRAINT chk_evento_lote_vivero_saldos_eventos_vivos_requeridos CHECK (
  tipo_evento NOT IN ('MERMA','DESPACHO')
  OR (saldo_vivo_antes IS NOT NULL AND saldo_vivo_despues IS NOT NULL
    AND saldo_vivo_antes>=0 AND saldo_vivo_despues>=0)
);
ALTER TABLE public.evento_lote_vivero DROP CONSTRAINT chk_evento_lote_vivero_embolsado_consistente;
ALTER TABLE public.evento_lote_vivero ADD CONSTRAINT chk_evento_lote_vivero_embolsado_consistente CHECK (
  tipo_evento<>'EMBOLSADO' OR (
    (saldo_vivo_antes IS NULL OR saldo_vivo_antes=0)
    AND cantidad_afectada IS NOT NULL AND cantidad_afectada BETWEEN 1 AND 2147483647
    AND cantidad_afectada=trunc(cantidad_afectada)
    AND saldo_vivo_despues IS NOT NULL AND cantidad_afectada=saldo_vivo_despues::numeric
    AND unidad_medida_evento IS NOT NULL AND unidad_medida_evento='UNIDAD'
  )
);
COMMENT ON CONSTRAINT chk_evento_lote_vivero_saldos_eventos_vivos_requeridos ON public.evento_lote_vivero IS
  'MERMA y DESPACHO conservan saldos anterior/posterior obligatorios y no negativos; EMBOLSADO valida su nacimiento en el CHECK dedicado108.';
COMMENT ON CONSTRAINT chk_evento_lote_vivero_embolsado_consistente ON public.evento_lote_vivero IS
  'EMBOLSADO nace con cantidad entera positiva en UNIDAD y saldo posterior igual. NULL antes es el contrato019/095; cero se admite como representación legada010, sin reescribir hechos.';
COMMIT;
