-- T5: incorporación física de plantas vivas, tras 100 y 101 confirmada.
-- Extensión 1:1 del evento, sin inventario paralelo, backfill ni consumo M1.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ DECLARE c record; BEGIN
  IF to_regprocedure('public.m2_exigir_vivero(bigint,bigint)') IS NULL
    OR to_regprocedure('public.m1_recepcion_exigir_objeto(bigint,bigint)') IS NULL
    OR to_regprocedure('public.pa_d_cuenta(bigint)') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_enum WHERE enumtypid='public.tipo_evento_vivero'::regtype AND enumlabel='INCORPORACION') THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: requiere 095/100 y 101 confirmada'; END IF;
  FOR c IN SELECT * FROM (VALUES
    ('lote_vivero','id','bigint'),('lote_vivero','recoleccion_id','bigint'),('lote_vivero','vivero_id','bigint'),
    ('lote_vivero','planta_id','bigint'),('lote_vivero','saldo_vivo_actual','integer'),
    ('lote_vivero','plantas_vivas_iniciales','integer'),('lote_vivero','variedad_snapshot','text'),
    ('lote_vivero','created_at','date'),('evento_lote_vivero','created_at','date'),
    ('evento_lote_vivero','cantidad_afectada','numeric'),('m2_evidencia_contexto','evento','text')
  ) x(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||c.tabla)::regclass
      AND attname=c.columna AND atttypid=c.tipo::regtype AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: %.%',c.tabla,c.columna; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.evento_lote_vivero WHERE tipo_evento::text IN ('EMBOLSADO','INCORPORACION') GROUP BY lote_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: más de una base viva por lote'; END IF;
END $$;


-- Las operaciones M2 y la devolución parten exactamente de 095 (100 no las redefine).
-- En repetición se admite su cuerpo T5; cualquier otro drift exige revisión.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('fn_m3_devolver_asignacion_vivero','c2e1a0934239862d6a895019dd7491557191b270d136ad38f9925983602391c6','c2e1a0934239862d6a895019dd7491557191b270d136ad38f9925983602391c6'),
    ('fn_vivero_registrar_adaptabilidad','6f245160242fa3687f437abf04880f024f046e1f12cd156736f9ea1057e080a9','efb117beabdf0d6f829c1b975679569b307146fd2a6bd6b2fdd79e8698d601e0'),
    ('fn_vivero_registrar_despacho','b1fe67cd44632fb068946496be04998c9728abd46803f6e66b904f418e61545f','2a8f950a2af740c06c889ac361de341db4b444f20c9ab2c9eb252941f71d91b8'),
    ('fn_vivero_registrar_merma','65c94dc507e792b8fbaed3f03c9901c5f8080063d509f40746ce9b527f84dd79','4f0d97ae7dcef9f35ecd8d79733c8478376f1326258b95aa4ed0a3a5d9d4e325'),
    ('fn_vivero_asignar_stock_subcampania','9658563bdc0b98bd41c7cb03d18bd28de4eff2fefb32082e4c94f5fdaf861cb2','46ccc3bec635058a51fac028e2e9db18aa3240b62f15a596b53fe97805dcbff1')
  ) x(nombre,anterior,nuevo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=c.nombre AND p.prosecdef
      AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IN (c.anterior,c.nuevo)) THEN
      RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: cuerpo RPC %',c.nombre; END IF;
  END LOOP;
END $$;




-- Helpers de autoridad, fecha y evidencia vigentes; no aceptar un no-op de igual firma.
-- Fecha admite010 original y la definición aportada por Pablo el14/11/2026:
-- misma lógica sin el bloque TODO de comentarios. Sólo estas dos huellas exactas;
-- no se normalizan ni se aceptan cuerpos desconocidos. El helper no se redefine.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('public.m2_exigir_vivero(bigint,bigint)',ARRAY['dea018c1d8448bd360849c06ecc030d72241b5b4c1fde065dddf5ca89570caa3'],true),
    ('public.m2_acceso_efectivo(bigint,bigint)',ARRAY['c1470203e55fa6c2b511ab54a1223297c76bc125d4cbf12ce0c68e431fd3ad66'],true),
    ('public.m1_exigir_actor(bigint,boolean)',ARRAY['acb68521ae22771dc55e2cc0465d6988395bedf59391c1f7426e633d5cf34a3d'],true),
    ('public.pa_d_cuenta(bigint)',ARRAY['055c53cbd84b34a34fa6fd1e1734b54222b81e7cc80de17f0d74fca7252edd56'],false),
    ('public.fn_vivero_assert_fecha_operativa(date,date)',ARRAY['e62b14d2c5d963a0d9c49be78a766d1077e6b1219061da0449c99d825c3e7273','b0195755dbff0ec1d6da9518324884e654209936237dc9a0ce45c27b47c105a1'],false),
    ('public.m2_evidencias_exigir(bigint[],bigint,bigint,bigint,text)',ARRAY['4c6b099b1c67e18c17a7bc829734be833cd8d38d100d9ecb60508b4c2354a86e'],true),
    ('public.fn_subcampania_historial_prevent_mutation()',ARRAY['d8a06f5e3c465c27fc613260cca608d0150a72803ab2681bdfe4c7a7b5ecf443'],false)
  ) x(firma,huellas,definer) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(c.firma) AND prosecdef=c.definer
      AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=ANY(c.huellas)) THEN
      RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: antecedente crítico %',c.firma; END IF;
  END LOOP;
END $$;

-- INICIO PREFLIGHT T5 INSTALADA
-- Una instalación transaccional previa debe conservar sus protectores exactos.
CREATE TEMP TABLE pg_temp._t5_reaplicacion ON COMMIT DROP AS
  SELECT to_regclass('public.vivero_incorporacion') IS NOT NULL instalada;
DO $$ DECLARE c record; BEGIN
  IF NOT (SELECT instalada FROM pg_temp._t5_reaplicacion) THEN RETURN; END IF;
  FOR c IN SELECT * FROM (VALUES
    ('public.m2_incorporacion_integridad()','7b8273286e33fb0ad0f8f4b4b9a502964a4a88808a038c4602e9572ab1175423'),
    ('public.m2_incorporacion_conservar_lote()','4289a168f48509c1e45f36a895c67d71579a3b6e6883e09d4a2498b6116cb9a7'),
    ('public.m2_incorporacion_conservar_evento()','7962ab7afab5e4ff495f6a456012a9be8d1be8175d01695f891b65445740aefc'),
    ('public.m2_incorporacion_recibo(bigint)','aaeaa7a724d1475a71213040fceceaf8cb707592dbf288c6e1603eb477831a74'),
    ('public.m2_incorporacion_recuperar(bigint,uuid)','5671b16415d797010d24e7e595ae44eb561f9ffe88aad5d3b1681d82abe30121'),
    ('public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb)','f7aaa4b7e0c90599ec750291ec9b5d0232aa65e881f6cfc2e3fe5c56b5192936'),
    ('public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid)','2f2c67f6605b0c3f484362bfcead4c2235c0d47b8a8b0e62e6f691dec21ecac6'),
    ('public.m2_incorporacion_crear(bigint,uuid,jsonb)','a8c18b371af2ba8631f8e3f0dc36be63ca637a16828d9e83fc38ddeb4827025f')
  ) x(firma,huella) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(c.firma) AND prosecdef
      AND proconfig @> ARRAY['search_path=pg_catalog, public']
      AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=c.huella) THEN
      RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: protector %',c.firma; END IF;
  END LOOP;
  FOR c IN SELECT * FROM (VALUES
    ('lote_vivero','lote_incorporacion_integridad_t5','m2_incorporacion_integridad()',21,true),
    ('evento_lote_vivero','evento_incorporacion_integridad_t5','m2_incorporacion_integridad()',5,true),
    ('vivero_incorporacion','incorporacion_integridad_t5','m2_incorporacion_integridad()',5,true),
    ('vivero_incorporacion','incorporacion_inmutable_t5','fn_subcampania_historial_prevent_mutation()',58,false),
    ('lote_vivero','incorporacion_lote_conservar_t5','m2_incorporacion_conservar_lote()',27,false),
    ('evento_lote_vivero','incorporacion_evento_conservar_t5','m2_incorporacion_conservar_evento()',27,false)
  ) x(tabla,nombre,funcion,tipo,diferido) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('public.'||c.tabla)::regclass AND tgname=c.nombre
      AND tgfoid=('public.'||c.funcion)::regprocedure AND tgtype=c.tipo AND tgenabled='O'
      AND NOT tgisinternal AND tgdeferrable=c.diferido AND tginitdeferred=c.diferido
      AND tgqual IS NULL AND tgattr=''::int2vector) THEN
      RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: trigger %.%',c.tabla,c.nombre; END IF;
  END LOOP;
END $$;

CREATE TEMP TABLE pg_temp._t5_lote_check(recoleccion_id bigint,tipo_material_snapshot public.tipo_material_origen,
  cantidad_inicial_en_proceso numeric,unidad_medida_inicial public.unidad_medida,plantas_vivas_iniciales integer,saldo_vivo_actual integer) ON COMMIT DROP;
CREATE TEMP TABLE pg_temp._t5_evento_check(tipo_evento public.tipo_evento_vivero,cantidad_afectada numeric,
  unidad_medida_evento public.unidad_medida,saldo_vivo_antes integer,saldo_vivo_despues integer,
  origen_despacho public.origen_despacho_vivero,subcampania_id bigint,campania_id bigint,asignacion_id bigint) ON COMMIT DROP;
CREATE TEMP TABLE pg_temp._t5_contexto_check(evento text,lote_id bigint,solicitud_id uuid) ON COMMIT DROP;
ALTER TABLE pg_temp._t5_lote_check ADD CONSTRAINT lote_vivero_camino_origen_t5 CHECK (
  (recoleccion_id IS NOT NULL AND tipo_material_snapshot IS NOT NULL
    AND cantidad_inicial_en_proceso IS NOT NULL AND cantidad_inicial_en_proceso>0 AND unidad_medida_inicial IS NOT NULL)
  OR (recoleccion_id IS NULL AND tipo_material_snapshot IS NULL AND cantidad_inicial_en_proceso IS NULL
    AND unidad_medida_inicial IS NULL AND plantas_vivas_iniciales IS NOT NULL AND plantas_vivas_iniciales>0
    AND saldo_vivo_actual IS NOT NULL AND saldo_vivo_actual>=0)
);
ALTER TABLE pg_temp._t5_evento_check ADD CONSTRAINT chk_evento_lote_vivero_saldo_no_incrementa CHECK(
  saldo_vivo_antes IS NULL OR saldo_vivo_despues IS NULL
  OR tipo_evento::text IN ('EMBOLSADO','INCORPORACION','DEVOLUCION_PLANTACION')
  OR saldo_vivo_despues<=saldo_vivo_antes
);
ALTER TABLE pg_temp._t5_evento_check ADD CONSTRAINT evento_incorporacion_saldo_t5 CHECK(
  tipo_evento::text<>'INCORPORACION' OR (
    cantidad_afectada IS NOT NULL AND cantidad_afectada BETWEEN 1 AND 2147483647
    AND cantidad_afectada=trunc(cantidad_afectada) AND unidad_medida_evento IS NOT NULL AND unidad_medida_evento='UNIDAD'
    AND saldo_vivo_antes IS NOT NULL AND saldo_vivo_antes=0
    AND saldo_vivo_despues IS NOT NULL AND saldo_vivo_despues=cantidad_afectada
    AND origen_despacho IS NULL AND subcampania_id IS NULL AND campania_id IS NULL AND asignacion_id IS NULL
  )
);
ALTER TABLE pg_temp._t5_contexto_check ADD CONSTRAINT m2_contexto_evento_t5 CHECK(
  evento IN ('INICIO','EMBOLSADO','INCORPORACION','ADAPTABILIDAD','MERMA','DESPACHO','DESCARTE_PRE_EMBOLSADO')
);
ALTER TABLE pg_temp._t5_contexto_check ADD CONSTRAINT m2_contexto_alta_t5 CHECK(
  (evento='INCORPORACION' AND lote_id IS NULL AND solicitud_id IS NOT NULL)
  OR (evento='INICIO' AND lote_id IS NULL AND solicitud_id IS NULL)
  OR (evento NOT IN ('INICIO','INCORPORACION') AND lote_id IS NOT NULL AND solicitud_id IS NULL)
);

DO $$ DECLARE c record; referencia text; actual text; BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('lote_vivero','_t5_lote_check','lote_vivero_camino_origen_t5'),
    ('evento_lote_vivero','_t5_evento_check','chk_evento_lote_vivero_saldo_no_incrementa'),
    ('evento_lote_vivero','_t5_evento_check','evento_incorporacion_saldo_t5'),
    ('m2_evidencia_contexto','_t5_contexto_check','m2_contexto_evento_t5'),
    ('m2_evidencia_contexto','_t5_contexto_check','m2_contexto_alta_t5')
  ) x(tabla,referencia,nombre) LOOP
    IF NOT (SELECT instalada FROM pg_temp._t5_reaplicacion) THEN CONTINUE; END IF;
    SELECT pg_get_constraintdef(oid) INTO STRICT referencia FROM pg_constraint
      WHERE conrelid=('pg_temp.'||c.referencia)::regclass AND conname=c.nombre;
    SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint
      WHERE conrelid=('public.'||c.tabla)::regclass AND conname=c.nombre AND convalidated;
    IF actual IS DISTINCT FROM referencia THEN RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: check %.%',c.tabla,c.nombre; END IF;
  END LOOP;
END $$;
-- FIN PREFLIGHT T5 INSTALADA


ALTER TABLE public.lote_vivero ALTER COLUMN recoleccion_id DROP NOT NULL,
  ALTER COLUMN tipo_material_snapshot DROP NOT NULL,
  ALTER COLUMN cantidad_inicial_en_proceso DROP NOT NULL,
  ALTER COLUMN unidad_medida_inicial DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.vivero_incorporacion (
  evento_id bigint PRIMARY KEY REFERENCES public.evento_lote_vivero(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  modalidad text NOT NULL CHECK(modalidad IN ('RECEPCION','SALDO_INICIAL')),
  procedencia text NOT NULL CHECK(procedencia IN ('COMPRA','DONACION','PRODUCCION_PROPIA','DESCONOCIDA')),
  tercero_origen text CHECK(tercero_origen IS NULL OR (tercero_origen=btrim(tercero_origen) AND char_length(tercero_origen) BETWEEN 1 AND 200)),
  referencia_documental text CHECK(referencia_documental IS NULL OR (referencia_documental=btrim(referencia_documental) AND char_length(referencia_documental) BETWEEN 1 AND 200)),
  solicitud_id uuid NOT NULL UNIQUE,
  huella_solicitud jsonb NOT NULL CHECK(jsonb_typeof(huella_solicitud)='object' AND huella_solicitud->>'version' IS NOT DISTINCT FROM '1'),
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(modalidad='SALDO_INICIAL' OR procedencia IN ('COMPRA','DONACION'))
);
COMMENT ON TABLE public.vivero_incorporacion IS 'T5: extensión inmutable 1:1 del evento INCORPORACION. Solo altas confirmadas, sin PREPARADO/rechazo durable.';
COMMENT ON COLUMN public.vivero_incorporacion.huella_solicitud IS 'Intención JSONB v1: IDs decimales exactos, fecha ISO, cantidad entera, textos btrim/NFC o null, IDs fotos únicos ordenados. No contiene datos duplicados fuera de la comparación de reintentos.';
COMMENT ON COLUMN public.vivero_incorporacion.registrado_en IS 'Sello real de confirmación nueva; no atribuye hora a created_at DATE legado ni a fecha_evento física.';

DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('evento_id','bigint',true),('modalidad','text',true),('procedencia','text',true),
    ('tercero_origen','text',false),('referencia_documental','text',false),('solicitud_id','uuid',true),
    ('huella_solicitud','jsonb',true),('registrado_en','timestamp with time zone',true)
  ) x(columna,tipo,obligatoria) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.vivero_incorporacion'::regclass
      AND attname=c.columna AND atttypid=c.tipo::regtype AND attnotnull=c.obligatoria AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: vivero_incorporacion.%',c.columna; END IF;
  END LOOP;
END $$;

CREATE TEMP TABLE pg_temp._t5_incorporacion_esperada (
  evento_id bigint PRIMARY KEY,
  modalidad text NOT NULL CHECK(modalidad IN ('RECEPCION','SALDO_INICIAL')),
  procedencia text NOT NULL CHECK(procedencia IN ('COMPRA','DONACION','PRODUCCION_PROPIA','DESCONOCIDA')),
  tercero_origen text CHECK(tercero_origen IS NULL OR (tercero_origen=btrim(tercero_origen) AND char_length(tercero_origen) BETWEEN 1 AND 200)),
  referencia_documental text CHECK(referencia_documental IS NULL OR (referencia_documental=btrim(referencia_documental) AND char_length(referencia_documental) BETWEEN 1 AND 200)),
  solicitud_id uuid NOT NULL UNIQUE,
  huella_solicitud jsonb NOT NULL CHECK(jsonb_typeof(huella_solicitud)='object' AND huella_solicitud->>'version' IS NOT DISTINCT FROM '1'),
  registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(modalidad='SALDO_INICIAL' OR procedencia IN ('COMPRA','DONACION'))
) ON COMMIT DROP;
DO $$ DECLARE esperados text[]; actuales text[]; a smallint; dest smallint; BEGIN
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='public.vivero_incorporacion'::regclass AND attnum>0 AND NOT attisdropped)<>8 THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: columnas incorporación'; END IF;
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO esperados
    FROM pg_constraint WHERE conrelid='pg_temp._t5_incorporacion_esperada'::regclass AND contype='c';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO actuales
    FROM pg_constraint WHERE conrelid='public.vivero_incorporacion'::regclass AND contype='c';
  IF actuales IS DISTINCT FROM esperados THEN RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: checks incorporación'; END IF;
  SELECT attnum INTO a FROM pg_attribute WHERE attrelid='public.vivero_incorporacion'::regclass AND attname='evento_id';
  SELECT attnum INTO dest FROM pg_attribute WHERE attrelid='public.evento_lote_vivero'::regclass AND attname='id';
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.vivero_incorporacion'::regclass AND contype='p'
      AND conkey=ARRAY[a] AND convalidated AND NOT condeferrable)<>1
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.vivero_incorporacion'::regclass AND contype='f'
      AND conkey=ARRAY[a] AND confrelid='public.evento_lote_vivero'::regclass AND confkey=ARRAY[dest]
      AND confdeltype='r' AND confupdtype='r' AND convalidated AND NOT condeferrable)<>1
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.vivero_incorporacion'::regclass AND contype='u'
      AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.vivero_incorporacion'::regclass AND attname='solicitud_id')]
      AND convalidated AND NOT condeferrable)<>1
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.vivero_incorporacion'::regclass AND contype IN ('p','f','u'))<>3 THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: PK/FK/UNIQUE incorporación'; END IF;
  IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
    WHERE a.attrelid='public.vivero_incorporacion'::regclass AND a.attname='registrado_en') IS DISTINCT FROM 'clock_timestamp()' THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: sello incorporación'; END IF;
END $$;

ALTER TABLE public.lote_vivero DROP CONSTRAINT IF EXISTS lote_vivero_camino_origen_t5;
ALTER TABLE public.lote_vivero ADD CONSTRAINT lote_vivero_camino_origen_t5 CHECK (
  (recoleccion_id IS NOT NULL AND tipo_material_snapshot IS NOT NULL
    AND cantidad_inicial_en_proceso IS NOT NULL AND cantidad_inicial_en_proceso>0 AND unidad_medida_inicial IS NOT NULL)
  OR (recoleccion_id IS NULL AND tipo_material_snapshot IS NULL AND cantidad_inicial_en_proceso IS NULL
    AND unidad_medida_inicial IS NULL AND plantas_vivas_iniciales IS NOT NULL AND plantas_vivas_iniciales>0
    AND saldo_vivo_actual IS NOT NULL AND saldo_vivo_actual>=0)
);
CREATE UNIQUE INDEX IF NOT EXISTS evento_lote_base_viva_unica_t5 ON public.evento_lote_vivero(lote_id)
  WHERE tipo_evento IN ('EMBOLSADO'::public.tipo_evento_vivero,'INCORPORACION'::public.tipo_evento_vivero);
CREATE TEMP TABLE pg_temp._t5_base_esperada(lote_id bigint,tipo_evento public.tipo_evento_vivero) ON COMMIT DROP;
CREATE UNIQUE INDEX _t5_base_esperada_idx ON pg_temp._t5_base_esperada(lote_id)
  WHERE tipo_evento IN ('EMBOLSADO'::public.tipo_evento_vivero,'INCORPORACION'::public.tipo_evento_vivero);
DO $$ DECLARE esperado record; actual record; BEGIN
  SELECT i.indisunique,i.indisvalid,i.indisready,i.indimmediate,i.indnkeyatts,i.indnatts,i.indclass,i.indoption,i.indcollation,
    pg_get_expr(i.indpred,i.indrelid) predicado INTO STRICT esperado FROM pg_index i WHERE indexrelid='pg_temp._t5_base_esperada_idx'::regclass;
  SELECT i.indisunique,i.indisvalid,i.indisready,i.indimmediate,i.indnkeyatts,i.indnatts,i.indclass,i.indoption,i.indcollation,
    pg_get_expr(i.indpred,i.indrelid) predicado INTO actual FROM pg_index i WHERE indexrelid='public.evento_lote_base_viva_unica_t5'::regclass
    AND i.indrelid='public.evento_lote_vivero'::regclass
    AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey) WITH ORDINALITY k(n,ord)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.n)=ARRAY['lote_id']::name[];
  IF actual IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: índice base viva'; END IF;
END $$;

ALTER TABLE public.evento_lote_vivero DROP CONSTRAINT IF EXISTS chk_evento_lote_vivero_saldo_no_incrementa;
ALTER TABLE public.evento_lote_vivero ADD CONSTRAINT chk_evento_lote_vivero_saldo_no_incrementa CHECK(
  saldo_vivo_antes IS NULL OR saldo_vivo_despues IS NULL
  OR tipo_evento::text IN ('EMBOLSADO','INCORPORACION','DEVOLUCION_PLANTACION')
  OR saldo_vivo_despues<=saldo_vivo_antes
);
ALTER TABLE public.evento_lote_vivero DROP CONSTRAINT IF EXISTS evento_incorporacion_saldo_t5;
ALTER TABLE public.evento_lote_vivero ADD CONSTRAINT evento_incorporacion_saldo_t5 CHECK(
  tipo_evento::text<>'INCORPORACION' OR (
    cantidad_afectada IS NOT NULL AND cantidad_afectada BETWEEN 1 AND 2147483647
    AND cantidad_afectada=trunc(cantidad_afectada) AND unidad_medida_evento IS NOT NULL AND unidad_medida_evento='UNIDAD'
    AND saldo_vivo_antes IS NOT NULL AND saldo_vivo_antes=0
    AND saldo_vivo_despues IS NOT NULL AND saldo_vivo_despues=cantidad_afectada
    AND origen_despacho IS NULL AND subcampania_id IS NULL AND campania_id IS NULL AND asignacion_id IS NULL
  )
);

-- La foto puede preceder al lote. Solicitud distingue altas simultáneas del mismo actor/vivero.
ALTER TABLE public.m2_evidencia_contexto ADD COLUMN IF NOT EXISTS solicitud_id uuid;
ALTER TABLE public.m2_evidencia_contexto DROP CONSTRAINT IF EXISTS m2_evidencia_contexto_evento_check;
ALTER TABLE public.m2_evidencia_contexto DROP CONSTRAINT IF EXISTS m2_evidencia_contexto_check;
ALTER TABLE public.m2_evidencia_contexto DROP CONSTRAINT IF EXISTS m2_contexto_evento_t5;
ALTER TABLE public.m2_evidencia_contexto DROP CONSTRAINT IF EXISTS m2_contexto_alta_t5;
ALTER TABLE public.m2_evidencia_contexto ADD CONSTRAINT m2_contexto_evento_t5 CHECK(
  evento IN ('INICIO','EMBOLSADO','INCORPORACION','ADAPTABILIDAD','MERMA','DESPACHO','DESCARTE_PRE_EMBOLSADO')
);
ALTER TABLE public.m2_evidencia_contexto ADD CONSTRAINT m2_contexto_alta_t5 CHECK(
  (evento='INCORPORACION' AND lote_id IS NULL AND solicitud_id IS NOT NULL)
  OR (evento='INICIO' AND lote_id IS NULL AND solicitud_id IS NULL)
  OR (evento NOT IN ('INICIO','INCORPORACION') AND lote_id IS NOT NULL AND solicitud_id IS NULL)
);

-- Los constraint triggers no validan retroactivamente filas ya presentes.
-- Rechazar un origen/base previo incompatible; nunca fabricar su extensión.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.evento_lote_vivero e JOIN public.lote_vivero l ON l.id=e.lote_id
    LEFT JOIN public.vivero_incorporacion i ON i.evento_id=e.id
    WHERE e.tipo_evento='INCORPORACION' AND (i.evento_id IS NULL OR l.recoleccion_id IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public.vivero_incorporacion i JOIN public.evento_lote_vivero e ON e.id=i.evento_id
      WHERE e.tipo_evento<>'INCORPORACION')
    OR EXISTS(SELECT 1 FROM public.lote_vivero l WHERE l.recoleccion_id IS NULL AND (
      NOT EXISTS(SELECT 1 FROM public.evento_lote_vivero e JOIN public.vivero_incorporacion i ON i.evento_id=e.id
        WHERE e.lote_id=l.id AND e.tipo_evento='INCORPORACION' AND e.responsable_id=l.responsable_id
          AND e.cantidad_afectada=l.plantas_vivas_iniciales AND e.fecha_evento=l.fecha_inicio
          AND (i.procedencia<>'DESCONOCIDA' OR nullif(btrim(e.observaciones),'') IS NOT NULL))
      OR EXISTS(SELECT 1 FROM public.evento_lote_vivero e WHERE e.lote_id=l.id
        AND e.tipo_evento IN ('INICIO','EMBOLSADO','DESCARTE_PRE_EMBOLSADO')))) THEN
    RAISE EXCEPTION 'T5_CATALOGO_INCOMPATIBLE: datos de base viva/procedencia'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_integridad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE lid bigint; l public.lote_vivero; e public.evento_lote_vivero; i public.vivero_incorporacion;
BEGIN
  IF TG_TABLE_NAME='lote_vivero' THEN lid:=NEW.id;
  ELSIF TG_TABLE_NAME='evento_lote_vivero' THEN lid:=NEW.lote_id;
  ELSE SELECT lote_id INTO lid FROM public.evento_lote_vivero WHERE id=NEW.evento_id; END IF;
  SELECT * INTO l FROM public.lote_vivero WHERE id=lid;
  IF TG_TABLE_NAME='vivero_incorporacion' THEN
    IF NOT EXISTS(SELECT 1 FROM public.evento_lote_vivero WHERE id=NEW.evento_id AND tipo_evento='INCORPORACION') THEN
      RAISE EXCEPTION 'EXTENSION_REQUIERE_EVENTO_INCORPORACION' USING ERRCODE='23514'; END IF;
  END IF;
  IF l.recoleccion_id IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.evento_lote_vivero WHERE lote_id=lid AND tipo_evento='INCORPORACION') THEN
      RAISE EXCEPTION 'INCORPORACION_NO_ADMITE_RECOLECCION' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO e FROM public.evento_lote_vivero WHERE lote_id=lid AND tipo_evento='INCORPORACION';
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.evento_lote_vivero WHERE lote_id=lid AND tipo_evento IN ('INICIO','EMBOLSADO','DESCARTE_PRE_EMBOLSADO')) THEN
    RAISE EXCEPTION 'BASE_VIVA_INCORPORACION_INVALIDA' USING ERRCODE='23514'; END IF;
  SELECT * INTO i FROM public.vivero_incorporacion WHERE evento_id=e.id;
  IF NOT FOUND OR e.responsable_id IS DISTINCT FROM l.responsable_id
    OR e.cantidad_afectada IS DISTINCT FROM l.plantas_vivas_iniciales::numeric
    OR e.fecha_evento IS DISTINCT FROM l.fecha_inicio
    OR (i.procedencia='DESCONOCIDA' AND nullif(btrim(e.observaciones),'') IS NULL) THEN
    RAISE EXCEPTION 'EXTENSION_INCORPORACION_INCONSISTENTE' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='vivero_incorporacion' THEN
    IF NEW.evento_id<>e.id THEN RAISE EXCEPTION 'EXTENSION_REQUIERE_EVENTO_INCORPORACION' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS lote_incorporacion_integridad_t5 ON public.lote_vivero;
CREATE CONSTRAINT TRIGGER lote_incorporacion_integridad_t5 AFTER INSERT OR UPDATE ON public.lote_vivero
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.m2_incorporacion_integridad();
DROP TRIGGER IF EXISTS evento_incorporacion_integridad_t5 ON public.evento_lote_vivero;
CREATE CONSTRAINT TRIGGER evento_incorporacion_integridad_t5 AFTER INSERT ON public.evento_lote_vivero
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.m2_incorporacion_integridad();
DROP TRIGGER IF EXISTS incorporacion_integridad_t5 ON public.vivero_incorporacion;
CREATE CONSTRAINT TRIGGER incorporacion_integridad_t5 AFTER INSERT ON public.vivero_incorporacion
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.m2_incorporacion_integridad();

-- Sin edición/borrado del hecho confirmado, su clave o los snapshots de origen.
DROP TRIGGER IF EXISTS incorporacion_inmutable_t5 ON public.vivero_incorporacion;
CREATE TRIGGER incorporacion_inmutable_t5 BEFORE UPDATE OR DELETE OR TRUNCATE ON public.vivero_incorporacion
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_subcampania_historial_prevent_mutation();
CREATE OR REPLACE FUNCTION public.m2_incorporacion_conservar_lote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.recoleccion_id IS NULL AND (TG_OP='DELETE' OR
    (to_jsonb(NEW)-ARRAY['saldo_vivo_actual','subetapa_actual','estado_lote','motivo_cierre','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['saldo_vivo_actual','subetapa_actual','estado_lote','motivo_cierre','updated_at'])) THEN
    RAISE EXCEPTION 'INCORPORACION_HECHO_INMUTABLE' USING ERRCODE='23514'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS incorporacion_lote_conservar_t5 ON public.lote_vivero;
CREATE TRIGGER incorporacion_lote_conservar_t5 BEFORE UPDATE OR DELETE ON public.lote_vivero
  FOR EACH ROW EXECUTE FUNCTION public.m2_incorporacion_conservar_lote();
CREATE OR REPLACE FUNCTION public.m2_incorporacion_conservar_evento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.tipo_evento='INCORPORACION' OR EXISTS(SELECT 1 FROM public.lote_vivero WHERE id=OLD.lote_id AND recoleccion_id IS NULL) THEN
    RAISE EXCEPTION 'INCORPORACION_EVENTO_INMUTABLE' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.tipo_evento='INCORPORACION' OR EXISTS(SELECT 1 FROM public.lote_vivero WHERE id=NEW.lote_id AND recoleccion_id IS NULL) THEN
      RAISE EXCEPTION 'INCORPORACION_EVENTO_INMUTABLE' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DROP TRIGGER IF EXISTS incorporacion_evento_conservar_t5 ON public.evento_lote_vivero;
CREATE TRIGGER incorporacion_evento_conservar_t5 BEFORE UPDATE OR DELETE ON public.evento_lote_vivero
  FOR EACH ROW EXECUTE FUNCTION public.m2_incorporacion_conservar_evento();

CREATE OR REPLACE FUNCTION public.m2_incorporacion_recibo(p_evento_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('estado','CONFIRMADO','data',jsonb_build_object(
    'solicitud_id',i.solicitud_id,'lote_vivero_id',l.id::text,'evento_incorporacion_id',e.id::text,
    'codigo_trazabilidad',l.codigo_trazabilidad,'vivero_id',l.vivero_id::text,'planta_id',l.planta_id::text,
    'modalidad',i.modalidad,'procedencia',i.procedencia,'tercero_origen',i.tercero_origen,
    'referencia_documental',i.referencia_documental,'fecha_evento',e.fecha_evento,
    'cantidad',e.cantidad_afectada::integer,'saldo_vivo_antes',e.saldo_vivo_antes,'saldo_vivo_despues',e.saldo_vivo_despues,
    'observaciones',e.observaciones,'evidencia_ids_vinculadas',i.huella_solicitud->'evidencia_ids',
    'nombre_cientifico_snapshot',l.nombre_cientifico_snapshot,'nombre_comercial_snapshot',l.nombre_comercial_snapshot,
    'variedad_snapshot',l.variedad_snapshot,'nombre_responsable_snapshot',l.nombre_responsable_snapshot,
    'registrado_en',to_char(i.registrado_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
  FROM public.vivero_incorporacion i JOIN public.evento_lote_vivero e ON e.id=i.evento_id
    JOIN public.lote_vivero l ON l.id=e.lote_id WHERE i.evento_id=p_evento_id
$$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_recuperar(p_actor_id bigint,p_solicitud_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE e public.evento_lote_vivero;
BEGIN
  PERFORM public.pa_d_cuenta(p_actor_id);
  IF p_solicitud_id IS NULL THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA' USING ERRCODE='22023'; END IF;
  SELECT ev.* INTO e FROM public.vivero_incorporacion i JOIN public.evento_lote_vivero ev ON ev.id=i.evento_id
    WHERE i.solicitud_id=p_solicitud_id;
  -- No se revela la existencia ni datos de una clave ajena.
  IF NOT FOUND THEN RETURN jsonb_build_object('estado','SIN_RESULTADO'); END IF;
  IF e.responsable_id<>p_actor_id THEN RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
  RETURN public.m2_incorporacion_recibo(e.id);
END $$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_evidencias_preparar(
  p_actor_id bigint,p_vivero_id bigint,p_solicitud_id uuid,p_fotos jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE f jsonb; tipo bigint; eid bigint; ids jsonb:='[]';
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_solicitud_id IS NULL OR jsonb_typeof(p_fotos) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_fotos) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'CONTEXTO_INCORPORACION_INVALIDO' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('m2.incorporacion:'||p_solicitud_id::text,0));
  IF EXISTS(SELECT 1 FROM public.vivero_incorporacion WHERE solicitud_id=p_solicitud_id) THEN
    RAISE EXCEPTION 'SOLICITUD_YA_CONFIRMADA' USING ERRCODE='23505'; END IF;
  PERFORM 1 FROM public.vivero WHERE id=p_vivero_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VIVERO_NO_DISPONIBLE' USING ERRCODE='22023'; END IF;
  SELECT t.id INTO STRICT tipo FROM public.tipos_entidad_evidencia t WHERE upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo;
  FOR f IN SELECT value FROM jsonb_array_elements(p_fotos) LOOP
    IF coalesce(f->>'ruta_archivo','') NOT LIKE 'vivero/incorporaciones/'||p_actor_id||'/'||p_solicitud_id||'/%'
      OR coalesce(f->>'mime_type','') NOT IN ('image/jpeg','image/png','image/webp','image/heic','image/heif')
      OR coalesce((f->>'tamano_bytes')::bigint,0) NOT BETWEEN 1 AND 15728640 THEN
      RAISE EXCEPTION 'FOTO_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
    INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,storage_object_id,
      tipo_archivo,mime_type,tamano_bytes,hash_sha256,titulo,descripcion,metadata,es_principal,orden,tomado_en,creado_por_usuario_id)
    VALUES(tipo,0,'vivero_incorporaciones',f->>'ruta_archivo',(f->>'storage_object_id')::uuid,'FOTO',f->>'mime_type',
      (f->>'tamano_bytes')::bigint,f->>'hash_sha256',f->>'titulo',f->>'descripcion',coalesce(f->'metadata','{}'::jsonb),
      false,jsonb_array_length(ids),(f->>'tomado_en')::timestamptz,p_actor_id) RETURNING id INTO eid;
    INSERT INTO public.m2_evidencia_contexto(evidencia_id,vivero_id,lote_id,evento,actor_id,solicitud_id)
      VALUES(eid,p_vivero_id,NULL,'INCORPORACION',p_actor_id,p_solicitud_id);
    ids:=ids||jsonb_build_array(eid::text);
  END LOOP;
  RETURN ids;
END $$;


CREATE OR REPLACE FUNCTION public.m2_incorporacion_evidencias_leer(
  p_actor_id bigint,p_vivero_id bigint,p_solicitud_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
BEGIN
  PERFORM public.m2_exigir_vivero(p_actor_id,p_vivero_id);
  IF p_solicitud_id IS NULL THEN RAISE EXCEPTION 'SOLICITUD_INVALIDA' USING ERRCODE='22023'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id::text,'bucket',e.bucket,
      'ruta_archivo',e.ruta_archivo,'mime_type',e.mime_type,'tipo_archivo',e.tipo_archivo,
      'es_principal',e.es_principal,'orden',e.orden) ORDER BY e.id)
    FROM public.m2_evidencia_contexto c JOIN public.evidencias_trazabilidad e ON e.id=c.evidencia_id
    JOIN public.tipos_entidad_evidencia t ON t.id=e.tipo_entidad_id
    WHERE c.actor_id=p_actor_id AND c.vivero_id=p_vivero_id AND c.solicitud_id=p_solicitud_id
      AND c.evento='INCORPORACION' AND c.lote_id IS NULL AND e.creado_por_usuario_id=p_actor_id
      AND e.bucket='vivero_incorporaciones' AND coalesce(e.entidad_id,0)=0 AND e.eliminado_en IS NULL
      AND upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo),'[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.m2_incorporacion_crear(p_actor_id bigint,p_solicitud_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
DECLARE h jsonb; i public.vivero_incorporacion; e public.evento_lote_vivero; p public.planta;
  viv bigint; pid bigint; cantidad integer; fecha date; modo text; origen text; tercero text; referencia text; notas text;
  fotos bigint[]; eid bigint; lid bigint; evento bigint; codigo text; actor_nombre text; tipo bigint;
BEGIN
  -- Replay propio solo exige cuenta activa; una nueva escritura exige autoridad M2 vigente.
  PERFORM public.pa_d_cuenta(p_actor_id);
  IF p_solicitud_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload) k WHERE k NOT IN
      ('vivero_id','planta_id','modalidad','procedencia','fecha_evento','cantidad','tercero_origen','referencia_documental','observaciones','evidencia_ids')) THEN
    RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
  BEGIN
    IF (p_payload->>'vivero_id') !~ '^[1-9][0-9]*$' OR (p_payload->>'planta_id') !~ '^[1-9][0-9]*$'
      OR (p_payload->>'cantidad') !~ '^[1-9][0-9]*$' OR (p_payload->>'fecha_evento') !~ '^\d{4}-\d{2}-\d{2}$'
      OR jsonb_typeof(p_payload->'evidencia_ids') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_payload->'evidencia_ids') NOT BETWEEN 1 AND 5
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'evidencia_ids') x WHERE x !~ '^[1-9][0-9]*$') THEN
      RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
    viv:=(p_payload->>'vivero_id')::bigint; pid:=(p_payload->>'planta_id')::bigint;
    cantidad:=(p_payload->>'cantidad')::integer; fecha:=(p_payload->>'fecha_evento')::date;
    SELECT array_agg(DISTINCT x::bigint ORDER BY x::bigint) INTO fotos FROM jsonb_array_elements_text(p_payload->'evidencia_ids') x;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023';
  END;
  modo:=p_payload->>'modalidad'; origen:=p_payload->>'procedencia';
  tercero:=nullif(normalize(btrim(p_payload->>'tercero_origen'),NFC),'');
  referencia:=nullif(normalize(btrim(p_payload->>'referencia_documental'),NFC),'');
  notas:=nullif(normalize(btrim(p_payload->>'observaciones'),NFC),'');
  IF viv IS NULL OR pid IS NULL OR cantidad IS NULL OR fecha IS NULL OR modo IS NULL OR origen IS NULL
    OR modo NOT IN ('RECEPCION','SALDO_INICIAL') OR origen NOT IN ('COMPRA','DONACION','PRODUCCION_PROPIA','DESCONOCIDA')
    OR (modo='RECEPCION' AND origen NOT IN ('COMPRA','DONACION'))
    OR (origen='DESCONOCIDA' AND notas IS NULL) OR char_length(tercero)>200 OR char_length(referencia)>200 OR char_length(notas)>1000
    OR cardinality(fotos) IS DISTINCT FROM jsonb_array_length(p_payload->'evidencia_ids')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['tercero_origen','referencia_documental','observaciones']) k
      WHERE p_payload ? k AND jsonb_typeof(p_payload->k) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'INTENCION_INCORPORACION_INVALIDA' USING ERRCODE='22023'; END IF;
  h:=jsonb_build_object('version',1,'vivero_id',viv::text,'planta_id',pid::text,'modalidad',modo,'procedencia',origen,
    'fecha_evento',fecha,'cantidad',cantidad,'tercero_origen',tercero,'referencia_documental',referencia,'observaciones',notas,
    'evidencia_ids',(SELECT jsonb_agg(x::text ORDER BY x) FROM unnest(fotos) x));
  PERFORM pg_advisory_xact_lock(hashtextextended('m2.incorporacion:'||p_solicitud_id::text,0));
  SELECT * INTO i FROM public.vivero_incorporacion WHERE solicitud_id=p_solicitud_id;
  IF FOUND THEN
    SELECT * INTO STRICT e FROM public.evento_lote_vivero WHERE id=i.evento_id;
    IF e.responsable_id<>p_actor_id THEN RAISE EXCEPTION 'CAPACIDAD_INSUFICIENTE' USING ERRCODE='42501'; END IF;
    IF i.huella_solicitud IS DISTINCT FROM h THEN RAISE EXCEPTION 'SOLICITUD_INTENCION_DISTINTA' USING ERRCODE='23505'; END IF;
    RETURN public.m2_incorporacion_recibo(e.id);
  END IF;
  PERFORM public.m2_exigir_vivero(p_actor_id,viv);
  -- SALDO_INICIAL registra el conteo actual. No abre fechas antiguas ni producción nueva libre.
  PERFORM public.fn_vivero_assert_fecha_operativa(fecha,NULL);
  SELECT * INTO p FROM public.planta WHERE id=pid AND activo FOR SHARE;
  IF NOT FOUND OR nullif(btrim(p.nombre_cientifico),'') IS NULL THEN
    RAISE EXCEPTION 'PLANTA_NO_DISPONIBLE' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.vivero WHERE id=viv;
  IF NOT FOUND THEN RAISE EXCEPTION 'VIVERO_NO_DISPONIBLE' USING ERRCODE='22023'; END IF;
  SELECT nullif(btrim(concat_ws(' ',nullif(btrim(u.nombre),''),nullif(btrim(u.apellido),''))),'')
    INTO actor_nombre FROM public.usuario u WHERE u.id=p_actor_id;
  SELECT t.id INTO STRICT tipo FROM public.tipos_entidad_evidencia t WHERE upper(t.codigo)='EVENTO_LOTE_VIVERO' AND t.activo;
  codigo:='VIV-INC-'||replace(p_solicitud_id::text,'-','');
  INSERT INTO public.lote_vivero(recoleccion_id,planta_id,vivero_id,responsable_id,
    nombre_cientifico_snapshot,nombre_comercial_snapshot,tipo_material_snapshot,variedad_snapshot,
    nombre_comunidad_origen_snapshot,nombre_responsable_snapshot,fecha_inicio,cantidad_inicial_en_proceso,
    unidad_medida_inicial,plantas_vivas_iniciales,saldo_vivo_actual,codigo_trazabilidad)
  VALUES(NULL,pid,viv,p_actor_id,btrim(p.nombre_cientifico),coalesce(nullif(btrim(p.nombre_comun_principal),''),btrim(p.nombre_cientifico)),
    NULL,nullif(btrim(p.variedad),''),NULL,actor_nombre,fecha,NULL,NULL,cantidad,cantidad,codigo) RETURNING id INTO lid;
  -- Lote recién creado -> fotos ASC. Contextos de otra solicitud/actor/vivero nunca se aceptan.
  FOREACH eid IN ARRAY fotos LOOP
    PERFORM 1 FROM public.evidencias_trazabilidad ev JOIN public.m2_evidencia_contexto c ON c.evidencia_id=ev.id
      WHERE ev.id=eid AND ev.tipo_entidad_id=tipo AND ev.eliminado_en IS NULL AND coalesce(ev.entidad_id,0)=0
        AND ev.creado_por_usuario_id=p_actor_id AND ev.bucket='vivero_incorporaciones'
        AND c.actor_id=p_actor_id AND c.vivero_id=viv AND c.lote_id IS NULL
        AND c.evento='INCORPORACION' AND c.solicitud_id=p_solicitud_id FOR UPDATE OF ev;
    IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCIA_FUERA_DE_AMBITO' USING ERRCODE='42501'; END IF;
  END LOOP;
  INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,
    unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues,observaciones)
  VALUES(lid,'INCORPORACION',fecha,p_actor_id,cantidad,'UNIDAD',0,cantidad,notas) RETURNING id INTO evento;
  INSERT INTO public.vivero_incorporacion(evento_id,modalidad,procedencia,tercero_origen,referencia_documental,solicitud_id,huella_solicitud)
    VALUES(evento,modo,origen,tercero,referencia,p_solicitud_id,h);
  UPDATE public.evidencias_trazabilidad SET entidad_id=evento,codigo_trazabilidad=codigo,
    actualizado_en=CURRENT_DATE,actualizado_por_usuario_id=p_actor_id WHERE id=ANY(fotos);
  RETURN public.m2_incorporacion_recibo(evento);
END $$;

-- Continuidad M2: mismas cuentas/ámbitos/locks/saldos; solo amplía la base viva habilitante.
CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_adaptabilidad(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_subetapa_destino public.subetapa_adaptabilidad,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_adaptabilidad_id  BIGINT,
  lote_vivero_id           BIGINT,
  codigo_trazabilidad      TEXT,
  subetapa_destino         public.subetapa_adaptabilidad,
  saldo_vivo_actual        INTEGER,
  evidencia_ids_vinculadas BIGINT[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz'
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_subetapa_destino IS NULL THEN
    RAISE EXCEPTION 'subetapa_destino es obligatoria.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias (son opcionales)
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL THEN
    v_evidencia_ids := ARRAY[]::BIGINT[];
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.subetapa_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote (RN-VIV-25)
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'ADAPTABILIDAD');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar ADAPTABILIDAD.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que EMBOLSADO ya existe y obtener su fecha (RN-VIV-10)
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento IN ('EMBOLSADO','INCORPORACION');

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene una base viva EMBOLSADO o INCORPORACION registrada. ADAPTABILIDAD requiere base viva previa (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Validar que el saldo vivo esta materializado (debe existir tras EMBOLSADO)
  -- -----------------------------------------------------------------------
  IF v_lote.saldo_vivo_actual IS NULL THEN
    RAISE EXCEPTION
      'El lote % tiene base viva, pero saldo_vivo_actual esta NULL. No se puede registrar ADAPTABILIDAD.',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO (solo si hay evidencias)
  -- -----------------------------------------------------------------------
  IF v_evidencias_solicitadas > 0 THEN
    SELECT te.id
    INTO v_tipo_entidad_evento_id
    FROM public.tipos_entidad_evidencia te
    WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
      AND te.activo = TRUE
    LIMIT 1;

    IF v_tipo_entidad_evento_id IS NULL THEN
      RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
    END IF;

    -- -----------------------------------------------------------------------
    -- 10. Validar que las evidencias existen, no estan eliminadas y son pendientes
    -- -----------------------------------------------------------------------
    WITH locked_evidencias AS (
      SELECT ev.id, ev.eliminado_en, ev.entidad_id
      FROM public.evidencias_trazabilidad ev
      WHERE ev.id = ANY(v_evidencia_ids)
      FOR UPDATE
    )
    SELECT COUNT(*)
    INTO v_evidencias_validas
    FROM locked_evidencias ev
    WHERE ev.eliminado_en IS NULL
      AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

    IF v_evidencias_validas <> v_evidencias_solicitadas THEN
      RAISE EXCEPTION
        'Todas las evidencias de ADAPTABILIDAD deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento ADAPTABILIDAD
  -- ADAPTABILIDAD no modifica saldo vivo: saldo_vivo_antes = saldo_vivo_despues = saldo_vivo_actual
  -- created_at usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    created_at,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    subetapa_destino,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'ADAPTABILIDAD',
    p_fecha_evento,
    CURRENT_DATE,
    p_responsable_id,
    v_lote.saldo_vivo_actual,
    'UNIDAD',
    p_subetapa_destino,
    v_lote.saldo_vivo_actual,
    v_lote.saldo_vivo_actual,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar subetapa_actual en LOTE_VIVERO
  -- updated_at usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    subetapa_actual = p_subetapa_destino,
    updated_at      = CURRENT_DATE
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento (solo si se enviaron)
  -- actualizado_en usa CURRENT_DATE porque la columna es DATE (migracion 015).
  -- -----------------------------------------------------------------------
  IF v_evidencias_solicitadas > 0 THEN
    UPDATE public.evidencias_trazabilidad
    SET
      tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = CURRENT_DATE,
      actualizado_por_usuario_id = p_responsable_id
    WHERE id = ANY(v_evidencia_ids);
  END IF;

  -- -----------------------------------------------------------------------
  -- 14. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_adaptabilidad_id  := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  subetapa_destino         := p_subetapa_destino;
  saldo_vivo_actual        := v_lote.saldo_vivo_actual;
  evidencia_ids_vinculadas := v_evidencia_ids;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_despacho(
  p_lote_id              BIGINT,
  p_fecha_evento         DATE,
  p_responsable_id       BIGINT,
  p_cantidad_despachada  INTEGER,
  p_destino_tipo         public.destino_tipo_vivero,
  p_destino_referencia   TEXT,
  p_comunidad_destino_id BIGINT   DEFAULT NULL,
  p_observaciones        TEXT     DEFAULT NULL,
  p_evidencia_ids        BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_despacho_id        BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad       TEXT,
  cantidad_despachada       INTEGER,
  destino_tipo              public.destino_tipo_vivero,
  destino_referencia        TEXT,
  comunidad_destino_id      BIGINT,
  saldo_vivo_antes          INTEGER,
  saldo_vivo_despues        INTEGER,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz'
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
  v_saldo_antes            INTEGER;
  v_saldo_despues          INTEGER;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_destino_referencia     TEXT;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_cantidad_despachada IS NULL OR p_cantidad_despachada < 1 THEN
    RAISE EXCEPTION 'cantidad_despachada debe ser un entero mayor o igual a 1.';
  END IF;

  IF p_destino_tipo IS NULL THEN
    RAISE EXCEPTION 'destino_tipo es obligatorio.';
  END IF;

  -- Bloqueo explicito: PLANTACION_CAMPANIA esta reservado para despachos automaticos
  -- generados desde el Modulo 3. Casteo a TEXT para evitar la dependencia con el
  -- valor de enum recien agregado (mismo workaround que en migracion 023).
  IF p_destino_tipo::TEXT = 'PLANTACION_CAMPANIA' THEN
    RAISE EXCEPTION
      'destino_tipo PLANTACION_CAMPANIA esta reservado para despachos automaticos generados desde Modulo 3. Use el endpoint correspondiente.';
  END IF;

  v_destino_referencia := NULLIF(BTRIM(COALESCE(p_destino_referencia, '')), '');
  IF v_destino_referencia IS NULL THEN
    RAISE EXCEPTION 'destino_referencia es obligatorio y no puede ser vacio.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Validar comunidad_destino_id (si fue enviado, debe existir)
  -- -----------------------------------------------------------------------
  IF p_comunidad_destino_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.division_administrativa
      WHERE id = p_comunidad_destino_id
    ) THEN
      RAISE EXCEPTION
        'comunidad_destino_id % no existe en division_administrativa.',
        p_comunidad_destino_id;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 4. Normalizar y deduplicar evidencias (obligatorio para DESPACHO MANUAL)
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'DESPACHO requiere al menos una evidencia obligatoria (RN-VIV-23).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 5. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.fecha_inicio,
    lv.motivo_cierre
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Validar estado del lote
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'DESPACHO');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar DESPACHO.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Verificar que EMBOLSADO ya existe y obtener su fecha (RN-VIV-10)
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento IN ('EMBOLSADO','INCORPORACION');

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene una base viva EMBOLSADO o INCORPORACION registrada. DESPACHO requiere base viva previa (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 8. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 9. Validar saldo vivo disponible
  -- -----------------------------------------------------------------------
  v_saldo_antes := v_lote.saldo_vivo_actual;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo materializado. Verifique la base viva EMBOLSADO o INCORPORACION.',
      p_lote_id;
  END IF;

  IF p_cantidad_despachada > v_saldo_antes THEN
    RAISE EXCEPTION
      'El despacho (%) no puede exceder el saldo vivo disponible (%) del lote %.',
      p_cantidad_despachada,
      v_saldo_antes,
      p_lote_id;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_despachada;

  -- -----------------------------------------------------------------------
  -- 10. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Validar que las evidencias existen, no estan eliminadas y son pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de DESPACHO deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 12. Insertar evento DESPACHO MANUAL
  --     origen_despacho = 'MANUAL' explicito (la 025 quito el default).
  --     subcampania_id / campania_id / registro_plantacion_id quedan NULL
  --     (CHECK constraint evento_lote_vivero_origen_despacho_consistency_chk).
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    destino_tipo,
    destino_referencia,
    comunidad_destino_id,
    origen_despacho,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'DESPACHO',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_despachada,
    'UNIDAD',
    p_destino_tipo,
    v_destino_referencia,
    p_comunidad_destino_id,
    'MANUAL'::public.origen_despacho_vivero,
    v_saldo_antes,
    v_saldo_despues,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 13. Actualizar saldo_vivo_actual en LOTE_VIVERO
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    saldo_vivo_actual = v_saldo_despues,
    updated_at        = NOW()
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 14. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 15. Activar cierre automatico si el saldo llego a 0
  -- -----------------------------------------------------------------------
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------------
  -- 16. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_despacho_id       := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  cantidad_despachada      := p_cantidad_despachada;
  destino_tipo             := p_destino_tipo;
  destino_referencia       := v_destino_referencia;
  comunidad_destino_id     := p_comunidad_destino_id;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_merma(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_cantidad_perdida INTEGER,
  p_causa_merma      public.causa_merma_vivero,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
)
RETURNS TABLE (
  evento_merma_id          BIGINT,
  lote_vivero_id           BIGINT,
  codigo_trazabilidad      TEXT,
  cantidad_perdida         INTEGER,
  causa_merma              public.causa_merma_vivero,
  saldo_vivo_antes         INTEGER,
  saldo_vivo_despues       INTEGER,
  evidencia_ids_vinculadas BIGINT[],
  lote_finalizado          BOOLEAN,
  motivo_cierre            public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz'
AS $$
DECLARE
  v_lote                   RECORD;
  v_evento_id              BIGINT;
  v_tipo_entidad_evento_id BIGINT;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_fecha_embolsado        DATE;
  v_saldo_antes            INTEGER;
  v_saldo_despues          INTEGER;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
BEGIN
  PERFORM public.m1_exigir_actor(p_responsable_id,false);
  -- -----------------------------------------------------------------------
  -- 1. Validaciones de parametros obligatorios
  -- -----------------------------------------------------------------------
  IF p_lote_id IS NULL THEN
    RAISE EXCEPTION 'lote_id es obligatorio.';
  END IF;

  IF p_responsable_id IS NULL THEN
    RAISE EXCEPTION 'responsable_id es obligatorio.';
  END IF;

  IF p_fecha_evento IS NULL THEN
    RAISE EXCEPTION 'fecha_evento es obligatoria.';
  END IF;

  IF p_cantidad_perdida IS NULL OR p_cantidad_perdida < 1 THEN
    RAISE EXCEPTION 'cantidad_perdida debe ser un entero mayor o igual a 1.';
  END IF;

  IF p_causa_merma IS NULL THEN
    RAISE EXCEPTION 'causa_merma es obligatoria.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 2. Validar que el responsable existe en usuario
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario
    WHERE id = p_responsable_id
  ) THEN
    RAISE EXCEPTION 'El responsable % no existe en la tabla usuario.', p_responsable_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 3. Normalizar y deduplicar evidencias
  -- -----------------------------------------------------------------------
  SELECT ARRAY_AGG(DISTINCT evidencia_id ORDER BY evidencia_id)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS evidencia_id
  WHERE evidencia_id IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION 'MERMA requiere al menos una evidencia obligatoria (RF-VIV-03).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 4. Leer y bloquear el lote
  -- -----------------------------------------------------------------------
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.saldo_vivo_actual,
    lv.fecha_inicio,
    lv.motivo_cierre
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote de vivero % no existe.', p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 5. Validar estado del lote
  -- -----------------------------------------------------------------------
  PERFORM public.m2_exigir_vivero(p_responsable_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_responsable_id,v_lote.vivero_id,p_lote_id,'MERMA');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'El lote % no esta ACTIVO (estado actual: %). No se puede registrar MERMA.',
      p_lote_id,
      v_lote.estado_lote;
  END IF;

  -- -----------------------------------------------------------------------
  -- 6. Verificar que EMBOLSADO ya existe y obtener su fecha
  -- -----------------------------------------------------------------------
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_id
    AND elv.tipo_evento IN ('EMBOLSADO','INCORPORACION');

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene una base viva EMBOLSADO o INCORPORACION registrada. MERMA requiere base viva previa (RN-VIV-10).',
      p_lote_id;
  END IF;

  -- -----------------------------------------------------------------------
  -- 7. Validar fecha_evento (>= fecha_embolsado, <= hoy, max 10 dias atras)
  -- -----------------------------------------------------------------------
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_evento, v_fecha_embolsado);

  -- -----------------------------------------------------------------------
  -- 8. Validar contra el saldo vivo FISICO del lote.
  --    El stock asignado a subcampanias ya salio del vivero: la merma del
  --    lote NUNCA lee ni modifica asignaciones (contrato 8.1).
  -- -----------------------------------------------------------------------
  v_saldo_antes := v_lote.saldo_vivo_actual;

  IF v_saldo_antes IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo materializado. Verifique la base viva EMBOLSADO o INCORPORACION.',
      p_lote_id;
  END IF;

  IF p_cantidad_perdida > v_saldo_antes THEN
    RAISE EXCEPTION
      'La merma (%) no puede exceder el saldo vivo fisico (%) del lote %.',
      p_cantidad_perdida,
      v_saldo_antes,
      p_lote_id;
  END IF;

  v_saldo_despues := v_saldo_antes - p_cantidad_perdida;

  -- -----------------------------------------------------------------------
  -- 9. Obtener tipo_entidad_id para EVENTO_LOTE_VIVERO
  -- -----------------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 10. Validar que las evidencias existen, no estan eliminadas y son pendientes
  -- -----------------------------------------------------------------------
  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de MERMA deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------------
  -- 11. Insertar evento MERMA (sin metadata de afectacion de asignaciones)
  -- -----------------------------------------------------------------------
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    causa_merma,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_id,
    'MERMA',
    p_fecha_evento,
    p_responsable_id,
    p_cantidad_perdida,
    'UNIDAD',
    p_causa_merma,
    v_saldo_antes,
    v_saldo_despues,
    p_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- -----------------------------------------------------------------------
  -- 12. Actualizar saldo_vivo_actual en LOTE_VIVERO
  -- -----------------------------------------------------------------------
  UPDATE public.lote_vivero
  SET
    saldo_vivo_actual = v_saldo_despues,
    updated_at        = NOW()
  WHERE id = p_lote_id;

  -- -----------------------------------------------------------------------
  -- 13. Vincular evidencias al evento recien creado
  -- -----------------------------------------------------------------------
  UPDATE public.evidencias_trazabilidad
  SET
    tipo_entidad_id            = v_tipo_entidad_evento_id,
    entidad_id                 = v_evento_id,
    codigo_trazabilidad        = v_lote.codigo_trazabilidad,
    actualizado_en             = NOW(),
    actualizado_por_usuario_id = p_responsable_id
  WHERE id = ANY(v_evidencia_ids);

  -- -----------------------------------------------------------------------
  -- 14. Activar cierre automatico si el saldo llego a 0
  -- -----------------------------------------------------------------------
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------------
  -- 15. Retornar resultado
  -- -----------------------------------------------------------------------
  evento_merma_id          := v_evento_id;
  lote_vivero_id           := p_lote_id;
  codigo_trazabilidad      := v_lote.codigo_trazabilidad;
  cantidad_perdida         := p_cantidad_perdida;
  causa_merma              := p_causa_merma;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_asignar_stock_subcampania(
  p_lote_vivero_id        BIGINT,
  p_subcampania_id        BIGINT,
  p_cantidad_asignada     INT,
  p_proposito             public.proposito_asignacion,
  p_usuario_asignacion_id BIGINT,
  p_fecha_asignacion      DATE,
  p_evidencia_ids         BIGINT[],
  p_observaciones         TEXT DEFAULT NULL
)
RETURNS TABLE (
  asignacion_id             BIGINT,
  evento_lote_vivero_id     BIGINT,
  evento_plantacion_id      BIGINT,
  lote_vivero_id            BIGINT,
  codigo_trazabilidad_lote  TEXT,
  subcampania_id            BIGINT,
  campania_id               BIGINT,
  proposito                 public.proposito_asignacion,
  estado_asignacion         public.estado_asignacion_vivero,
  cantidad_asignada         INT,
  saldo_vivo_antes          INT,
  saldo_vivo_despues        INT,
  evidencia_ids_vinculadas  BIGINT[],
  lote_finalizado           BOOLEAN,
  motivo_cierre             public.motivo_cierre_lote
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz'
AS $$
DECLARE
  v_lote                   RECORD;
  v_subcampania            RECORD;
  v_usuario_rol            TEXT;
  v_es_coordinador         BOOLEAN;
  v_fecha_embolsado        DATE;
  v_evidencia_ids          BIGINT[];
  v_evidencias_solicitadas INTEGER;
  v_evidencias_validas     INTEGER;
  v_tipo_entidad_evento_id BIGINT;
  v_asignacion_id          BIGINT;
  v_evento_id              BIGINT;
  v_evento_plantacion_id   BIGINT;
  v_saldo_antes            INT;
  v_saldo_despues          INT;
  v_lote_finalizado        BOOLEAN := FALSE;
  v_motivo_cierre          public.motivo_cierre_lote;
  v_destino_referencia     TEXT;
  v_observaciones          TEXT;
  v_campania_id            BIGINT;
BEGIN
  v_usuario_rol:=public.pa_d_cuenta(p_usuario_asignacion_id);
  IF v_usuario_rol NOT IN ('ADMIN','GENERAL','VALIDADOR') THEN RAISE EXCEPTION 'AUTORIDAD_INTERNA_REQUERIDA' USING ERRCODE='PT403'; END IF;
  -- -----------------------------------------------------------------
  -- 1. Guards de parametros
  -- -----------------------------------------------------------------
  IF p_lote_vivero_id IS NULL THEN
    RAISE EXCEPTION 'lote_vivero_id es obligatorio.';
  END IF;

  IF p_subcampania_id IS NULL THEN
    RAISE EXCEPTION 'subcampania_id es obligatorio.';
  END IF;

  IF p_cantidad_asignada IS NULL OR p_cantidad_asignada <= 0 THEN
    RAISE EXCEPTION 'cantidad_asignada debe ser un entero mayor a 0.';
  END IF;

  IF p_proposito IS NULL THEN
    RAISE EXCEPTION 'proposito es obligatorio (PLANTACION_INICIAL | REPOSICION).';
  END IF;

  IF p_usuario_asignacion_id IS NULL THEN
    RAISE EXCEPTION 'usuario_asignacion_id es obligatorio.';
  END IF;

  IF p_fecha_asignacion IS NULL THEN
    RAISE EXCEPTION 'fecha_asignacion es obligatoria.';
  END IF;

  v_observaciones := NULLIF(BTRIM(COALESCE(p_observaciones, '')), '');

  -- Evidencia de entrega obligatoria (RN-VIV-54).
  SELECT ARRAY_AGG(DISTINCT eid ORDER BY eid)
  INTO v_evidencia_ids
  FROM UNNEST(COALESCE(p_evidencia_ids, ARRAY[]::BIGINT[])) AS eid
  WHERE eid IS NOT NULL;

  IF v_evidencia_ids IS NULL OR CARDINALITY(v_evidencia_ids) = 0 THEN
    RAISE EXCEPTION
      'La asignacion fisica requiere al menos una evidencia de entrega/salida (RN-VIV-54).';
  END IF;

  v_evidencias_solicitadas := CARDINALITY(v_evidencia_ids);

  -- -----------------------------------------------------------------
  -- 2. Campaña antes de subcampaña. La FK de evento_lote_vivero toma
  -- KEY SHARE sobre campaña al insertar; tomarlo tarde invertiría el orden
  -- frente a desactivación masiva (campaña UPDATE -> subcampañas UPDATE).
  -- Cuenta -> campaña -> subcampaña -> asignaciones -> lote -> evidencias.
  -- -----------------------------------------------------------------
  SELECT s.campania_id INTO v_campania_id FROM public.subcampania s
  WHERE s.id=p_subcampania_id AND s.deleted_at IS NULL;
  PERFORM 1 FROM public.campania c WHERE c.id=v_campania_id FOR SHARE;
  SELECT s.id, s.estado, s.zona_id, s.campania_id, s.codigo_trazabilidad
  INTO v_subcampania
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subcampania % no encontrada o eliminada.', p_subcampania_id;
  END IF;
  IF v_subcampania.campania_id IS DISTINCT FROM v_campania_id THEN
    RAISE EXCEPTION 'AMBITO_MODIFICADO' USING ERRCODE='PT409';
  END IF;

  IF v_subcampania.estado IN ('BORRADOR', 'CANCELADA') THEN
    RAISE EXCEPTION
      'No se puede asignar a una subcampania en estado %.',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'PLANTACION_INICIAL' AND v_subcampania.estado <> 'ACTIVA' THEN
    RAISE EXCEPTION
      'PLANTACION_INICIAL solo se permite con la subcampania ACTIVA (estado actual: %).',
      v_subcampania.estado;
  END IF;

  IF p_proposito = 'REPOSICION'
     AND v_subcampania.estado NOT IN ('ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL') THEN
    RAISE EXCEPTION
      'REPOSICION solo se permite con la subcampania en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: %).',
      v_subcampania.estado;
  END IF;

  -- -----------------------------------------------------------------
  -- 3. Leer y bloquear el lote (el lock serializa asignaciones concurrentes)
  -- -----------------------------------------------------------------
  PERFORM 1 FROM public.asignacion_vivero_subcampania av
    WHERE av.subcampania_id=p_subcampania_id AND av.lote_vivero_id=p_lote_vivero_id
    ORDER BY av.id FOR UPDATE;
  SELECT
    lv.id,
    lv.vivero_id,
    lv.codigo_trazabilidad,
    lv.estado_lote,
    lv.planta_id,
    lv.saldo_vivo_actual
  INTO v_lote
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_vivero_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote de vivero % no encontrado.', p_lote_vivero_id;
  END IF;

  PERFORM public.m2_exigir_vivero(p_usuario_asignacion_id,v_lote.vivero_id);
  PERFORM public.m2_evidencias_exigir(p_evidencia_ids,p_usuario_asignacion_id,v_lote.vivero_id,p_lote_vivero_id,'DESPACHO');
  IF v_lote.estado_lote IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION
      'No se puede asignar desde un lote en estado %. Solo lotes ACTIVOS (RN-VIV-61).',
      v_lote.estado_lote;
  END IF;

  -- EMBOLSADO previo obligatorio (RN-VIV-61).
  SELECT MIN(elv.fecha_evento)
  INTO v_fecha_embolsado
  FROM public.evento_lote_vivero elv
  WHERE elv.lote_id = p_lote_vivero_id
    AND elv.tipo_evento IN ('EMBOLSADO','INCORPORACION');

  IF v_fecha_embolsado IS NULL THEN
    RAISE EXCEPTION
      'El lote % no tiene base viva EMBOLSADO o INCORPORACION. El material en proceso no es entregable (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  IF v_lote.saldo_vivo_actual IS NULL OR v_lote.saldo_vivo_actual <= 0 THEN
    RAISE EXCEPTION
      'El lote % no tiene saldo vivo fisico disponible (RN-VIV-61).',
      p_lote_vivero_id;
  END IF;

  -- Validacion FISICA: contra el saldo del lote, sin restar asignaciones
  -- previas (ya descontaron el saldo al entregarse — RN-VIV-47/57).
  IF p_cantidad_asignada > v_lote.saldo_vivo_actual THEN
    RAISE EXCEPTION
      'La cantidad a asignar (%) excede el saldo vivo fisico del lote % (%).',
      p_cantidad_asignada,
      p_lote_vivero_id,
      v_lote.saldo_vivo_actual;
  END IF;

  -- Fecha operativa coherente con la vida del lote.
  PERFORM public.fn_vivero_assert_fecha_operativa(p_fecha_asignacion, v_fecha_embolsado);

  -- -----------------------------------------------------------------
  -- 4. Permisos: ADMIN global o COORDINADOR de la subcampania
  -- -----------------------------------------------------------------
  SELECT UPPER(u.rol::text)
  INTO v_usuario_rol
  FROM public.usuario u
  WHERE u.id = p_usuario_asignacion_id;

  IF v_usuario_rol IS NULL THEN
    RAISE EXCEPTION 'El usuario % no existe.', p_usuario_asignacion_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subcampania_equipo se
    WHERE se.subcampania_id = p_subcampania_id
      AND se.usuario_id = p_usuario_asignacion_id
      AND se.rol = 'COORDINADOR'::public.rol_en_subcampania
  ) INTO v_es_coordinador;

  IF v_usuario_rol <> 'ADMIN' AND NOT v_es_coordinador THEN
    RAISE EXCEPTION
      'Solo ADMIN o el COORDINADOR operario del vivero pueden registrar la asignacion fisica.' USING ERRCODE='42501';
  END IF;

  -- Guard de plan antes de cualquier entrega fisica. La subcampania ya
  -- esta bloqueada: usa el mismo plan y especie que validara la plantacion
  -- inicial (053). REPOSICION conserva su contrato de grupo origen.
  IF p_proposito = 'PLANTACION_INICIAL' AND NOT EXISTS (
    SELECT 1
    FROM public.subcampania_meta_especie sme
    WHERE sme.subcampania_id = p_subcampania_id
      AND sme.planta_id = v_lote.planta_id
  ) THEN
    RAISE EXCEPTION
      'La especie del lote (planta_id %) no esta en el plan de especies de la subcampania %. No se puede asignar para PLANTACION_INICIAL.',
      v_lote.planta_id,
      p_subcampania_id;
  END IF;

  -- -----------------------------------------------------------------
  -- 5. Validar evidencias (existen, no eliminadas, pendientes)
  -- -----------------------------------------------------------------
  SELECT te.id
  INTO v_tipo_entidad_evento_id
  FROM public.tipos_entidad_evidencia te
  WHERE UPPER(te.codigo) = 'EVENTO_LOTE_VIVERO'
    AND te.activo = TRUE
  LIMIT 1;

  IF v_tipo_entidad_evento_id IS NULL THEN
    RAISE EXCEPTION 'No existe tipo_entidad_evidencia activo para EVENTO_LOTE_VIVERO.';
  END IF;

  WITH locked_evidencias AS (
    SELECT ev.id, ev.eliminado_en, ev.entidad_id, ev.creado_por_usuario_id, ev.tipo_entidad_id, ev.bucket
    FROM public.evidencias_trazabilidad ev
    WHERE ev.id = ANY(v_evidencia_ids)
    ORDER BY ev.id FOR UPDATE
  )
  SELECT COUNT(*)
  INTO v_evidencias_validas
  FROM locked_evidencias ev
  WHERE ev.eliminado_en IS NULL
    AND (ev.entidad_id IS NULL OR ev.entidad_id = 0)
    AND ev.creado_por_usuario_id=p_usuario_asignacion_id
    AND ev.tipo_entidad_id=v_tipo_entidad_evento_id
    AND ev.bucket<>'participacion_evidencias';

  IF v_evidencias_validas <> v_evidencias_solicitadas THEN
    RAISE EXCEPTION
      'Todas las evidencias de la asignacion deben existir, no estar eliminadas y no estar vinculadas a otra entidad.';
  END IF;

  -- -----------------------------------------------------------------
  -- 6. Efectos atomicos
  -- -----------------------------------------------------------------
  v_saldo_antes   := v_lote.saldo_vivo_actual;
  v_saldo_despues := v_saldo_antes - p_cantidad_asignada;

  -- 6.1 Asignacion (entrega fisica).
  INSERT INTO public.asignacion_vivero_subcampania (
    lote_vivero_id,
    subcampania_id,
    cantidad_asignada,
    proposito,
    usuario_asignacion_id,
    fecha_asignacion,
    fecha_entrega_operativa
  )
  VALUES (
    p_lote_vivero_id,
    p_subcampania_id,
    p_cantidad_asignada,
    p_proposito,
    p_usuario_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_fecha_asignacion
  )
  RETURNING id INTO v_asignacion_id;

  v_destino_referencia :=
    'ASG-' || v_asignacion_id::TEXT || '-' || v_subcampania.codigo_trazabilidad;

  -- 6.2 Evento M2 de salida fisica por asignacion (RN-VIV-47/54).
  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    cantidad_afectada,
    unidad_medida_evento,
    destino_tipo,
    destino_referencia,
    comunidad_destino_id,
    origen_despacho,
    subcampania_id,
    campania_id,
    registro_plantacion_id,
    asignacion_id,
    saldo_vivo_antes,
    saldo_vivo_despues,
    observaciones
  )
  VALUES (
    p_lote_vivero_id,
    'DESPACHO',
    p_fecha_asignacion,
    p_usuario_asignacion_id,
    p_cantidad_asignada,
    'UNIDAD',
    'PLANTACION_CAMPANIA'::public.destino_tipo_vivero,
    v_destino_referencia,
    v_subcampania.zona_id,
    'ASIGNACION_SUBCAMPANIA'::public.origen_despacho_vivero,
    p_subcampania_id,
    v_subcampania.campania_id,
    NULL,
    v_asignacion_id,
    v_saldo_antes,
    v_saldo_despues,
    v_observaciones
  )
  RETURNING id INTO v_evento_id;

  -- 6.3 Descuento fisico del saldo del lote.
  UPDATE public.lote_vivero
  SET saldo_vivo_actual = v_saldo_despues,
      updated_at        = NOW()
  WHERE id = p_lote_vivero_id;

  -- 6.4 Vincular evidencias al evento M2.
  UPDATE public.evidencias_trazabilidad
  SET tipo_entidad_id            = v_tipo_entidad_evento_id,
      entidad_id                 = v_evento_id,
      codigo_trazabilidad        = v_lote.codigo_trazabilidad,
      actualizado_en             = NOW(),
      actualizado_por_usuario_id = p_usuario_asignacion_id
  WHERE id = ANY(v_evidencia_ids);

  -- 6.5 Evento M3 para la linea de tiempo de la subcampania.
  INSERT INTO public.evento_plantacion (
    tipo_evento,
    subcampania_id,
    asignacion_id,
    fecha_evento,
    responsable_id,
    observaciones,
    cantidad_asignada_evento,
    created_by
  )
  VALUES (
    'ASIGNACION_VIVERO'::public.tipo_evento_plantacion,
    p_subcampania_id,
    v_asignacion_id,
    p_fecha_asignacion::TIMESTAMPTZ,
    p_usuario_asignacion_id,
    v_observaciones,
    p_cantidad_asignada,
    p_usuario_asignacion_id
  )
  RETURNING id INTO v_evento_plantacion_id;

  -- 6.6 Cierre automatico si el saldo fisico llego a 0.
  IF v_saldo_despues = 0 THEN
    PERFORM public.fn_vivero_cerrar_lote_si_corresponde(p_lote_vivero_id, v_evento_id);

    SELECT lv.motivo_cierre
    INTO v_motivo_cierre
    FROM public.lote_vivero lv
    WHERE lv.id = p_lote_vivero_id;

    v_lote_finalizado := TRUE;
  END IF;

  -- -----------------------------------------------------------------
  -- 7. Resultado
  -- -----------------------------------------------------------------
  asignacion_id            := v_asignacion_id;
  evento_lote_vivero_id    := v_evento_id;
  evento_plantacion_id     := v_evento_plantacion_id;
  lote_vivero_id           := p_lote_vivero_id;
  codigo_trazabilidad_lote := v_lote.codigo_trazabilidad;
  subcampania_id           := p_subcampania_id;
  campania_id              := v_subcampania.campania_id;
  proposito                := p_proposito;
  estado_asignacion        := 'ACTIVA'::public.estado_asignacion_vivero;
  cantidad_asignada        := p_cantidad_asignada;
  saldo_vivo_antes         := v_saldo_antes;
  saldo_vivo_despues       := v_saldo_despues;
  evidencia_ids_vinculadas := v_evidencia_ids;
  lote_finalizado          := v_lote_finalizado;
  motivo_cierre            := v_motivo_cierre;

  RETURN NEXT;
END;
$$;

-- Devolución explícita conserva su RPC095; fecha física siempre según el día de Bolivia.
ALTER FUNCTION public.fn_m3_devolver_asignacion_vivero(bigint,integer,public.motivo_devolucion_plantacion,bigint,date,text)
  SET TimeZone='America/La_Paz';

ALTER TABLE public.vivero_incorporacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vivero_incorporacion FROM PUBLIC,anon,authenticated,service_role;
-- Lectura privada del servicio para proyecciones de lotes ya autorizadas en servidor.
GRANT SELECT ON public.vivero_incorporacion TO service_role;
DO $$ DECLARE f record; c record; BEGIN
  FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.vivero_incorporacion'::regclass
    AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.vivero_incorporacion FROM PUBLIC,anon,authenticated,service_role',c.attname);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure firma,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'm2_incorporacion_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.m2_incorporacion_crear(bigint,uuid,jsonb),
  public.m2_incorporacion_recuperar(bigint,uuid),
  public.m2_incorporacion_evidencias_preparar(bigint,bigint,uuid,jsonb),
  public.m2_incorporacion_evidencias_leer(bigint,bigint,uuid) TO service_role;
-- Preservar EXECUTE privado previo al redefinir las cuatro operaciones M2.
REVOKE ALL ON FUNCTION public.fn_vivero_registrar_adaptabilidad(bigint,date,bigint,public.subetapa_adaptabilidad,text,bigint[]),
  public.fn_vivero_registrar_despacho(bigint,date,bigint,integer,public.destino_tipo_vivero,text,bigint,text,bigint[]),
  public.fn_vivero_registrar_merma(bigint,date,bigint,integer,public.causa_merma_vivero,text,bigint[]),
  public.fn_vivero_asignar_stock_subcampania(bigint,bigint,integer,public.proposito_asignacion,bigint,date,bigint[],text)
  FROM PUBLIC,anon,authenticated;

DO $$ DECLARE rol text; BEGIN
  FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(rol,'public.vivero_incorporacion','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(rol,'public.vivero_incorporacion','DELETE,TRUNCATE,TRIGGER')
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'm2_incorporacion_%' AND has_function_privilege(rol,p.oid,'EXECUTE')) THEN
      RAISE EXCEPTION 'T5_ACL_INCOMPATIBLE: %',rol; END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role','public.vivero_incorporacion','SELECT')
    OR has_any_column_privilege('service_role','public.vivero_incorporacion','INSERT,UPDATE,REFERENCES')
    OR has_table_privilege('service_role','public.vivero_incorporacion','DELETE,TRUNCATE,TRIGGER')
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.vivero_incorporacion'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'T5_ACL_INCOMPATIBLE: servicio/tabla'; END IF;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
