-- T5: proyección exacta de IDs de las operaciones M2/M3 existentes.
-- Admite antecedente095 o102; no cambia reglas/locks/efectos ni crea comandos.
-- Las RPC originales se ejecutan una sola vez y conservan su transacción.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE t5_105_funciones(firma text,fuentes text[],huella_wrapper text) ON COMMIT DROP;
INSERT INTO t5_105_funciones VALUES
('public.fn_vivero_registrar_adaptabilidad(bigint,date,bigint,public.subetapa_adaptabilidad,text,bigint[])',ARRAY['bf582a3a943472a93e66c847effbf1db','e2c1b0737bc1391a9eba90d1395e8512'],'6242deea4e467a12d67de8887836d444'),
('public.fn_vivero_registrar_merma(bigint,date,bigint,integer,public.causa_merma_vivero,text,bigint[])',ARRAY['89c3885f9472c4836e74aa8ea4fba3b5','e166a531d883e07e11d1d85ed13f0dd5'],'9ef3d18f813e5ece3411d5a97f88581a'),
('public.fn_vivero_registrar_despacho(bigint,date,bigint,integer,public.destino_tipo_vivero,text,bigint,text,bigint[])',ARRAY['aa32d6e1d3de3c7fecad7c19e515be38','aafcd56dd38cad2cc561ddaa92633599'],'de38172afb3e1830329d6e2be27224ba'),
('public.fn_vivero_asignar_stock_subcampania(bigint,bigint,integer,public.proposito_asignacion,bigint,date,bigint[],text)',ARRAY['3caacdce9b588955fb3e86984d3cb5ca','460b1f299bd3d54b9d6aeacc2df94d93'],'3aa1d1853fd38fc92ce13de38b1a6657'),
('public.fn_m3_devolver_asignacion_vivero(bigint,integer,public.motivo_devolucion_plantacion,bigint,date,text)',ARRAY['ebf69f3e7781dd1aa499bd2279d9f589'],'dc540a7669b6ee3e611a6eccb6af291c');
DO $preflight$
DECLARE r RECORD; p RECORD; firma_exacto TEXT; rol TEXT;
BEGIN
  FOR r IN SELECT * FROM pg_temp.t5_105_funciones LOOP
    SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.firma);
    IF p.oid IS NULL OR NOT (md5(p.prosrc)=ANY(r.fuentes)) OR NOT p.prosecdef
      OR NOT p.proretset OR p.prorettype<>'record'::regtype
      OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') THEN
      RAISE EXCEPTION 'T5_IDS_ANTECEDENTE_INCOMPATIBLE: %',r.firma;
    END IF;
    firma_exacto:=replace(r.firma,'(','_exacto(');
    SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(firma_exacto);
    IF p.oid IS NOT NULL THEN
      IF md5(p.prosrc)<>r.huella_wrapper OR NOT p.prosecdef OR NOT p.proretset
        OR p.prorettype<>'record'::regtype OR p.prokind<>'f' OR p.provolatile<>'v'
        OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
        OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='sql')
        OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
        OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s','TimeZone=America/La_Paz']::text[] THEN
        RAISE EXCEPTION 'T5_IDS_WRAPPER_INCOMPATIBLE: %',firma_exacto;
      END IF;
      IF EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
        RAISE EXCEPTION 'T5_IDS_WRAPPER_PUBLICO: %',firma_exacto;
      END IF;
      FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_function_privilege(rol,p.oid,'EXECUTE') THEN
          RAISE EXCEPTION 'T5_IDS_WRAPPER_EXPUESTO: %.%',rol,firma_exacto;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $preflight$;

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_adaptabilidad_exacto(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_subetapa_destino public.subetapa_adaptabilidad,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
) RETURNS TABLE (
  evento_adaptabilidad_id TEXT,
  lote_vivero_id TEXT,
  codigo_trazabilidad TEXT,
  subetapa_destino public.subetapa_adaptabilidad,
  saldo_vivo_actual INTEGER,
  evidencia_ids_vinculadas TEXT[]
) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
  SELECT r.evento_adaptabilidad_id::text,
    r.lote_vivero_id::text,
    r.codigo_trazabilidad,
    r.subetapa_destino,
    r.saldo_vivo_actual,
    r.evidencia_ids_vinculadas::text[]
  FROM public.fn_vivero_registrar_adaptabilidad(p_lote_id,p_fecha_evento,p_responsable_id,p_subetapa_destino,p_observaciones,p_evidencia_ids) r
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_merma_exacto(
  p_lote_id          BIGINT,
  p_fecha_evento     DATE,
  p_responsable_id   BIGINT,
  p_cantidad_perdida INTEGER,
  p_causa_merma      public.causa_merma_vivero,
  p_observaciones    TEXT     DEFAULT NULL,
  p_evidencia_ids    BIGINT[] DEFAULT NULL
) RETURNS TABLE (
  evento_merma_id TEXT,
  lote_vivero_id TEXT,
  codigo_trazabilidad TEXT,
  cantidad_perdida INTEGER,
  causa_merma public.causa_merma_vivero,
  saldo_vivo_antes INTEGER,
  saldo_vivo_despues INTEGER,
  evidencia_ids_vinculadas TEXT[],
  lote_finalizado BOOLEAN,
  motivo_cierre public.motivo_cierre_lote
) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
  SELECT r.evento_merma_id::text,
    r.lote_vivero_id::text,
    r.codigo_trazabilidad,
    r.cantidad_perdida,
    r.causa_merma,
    r.saldo_vivo_antes,
    r.saldo_vivo_despues,
    r.evidencia_ids_vinculadas::text[],
    r.lote_finalizado,
    r.motivo_cierre
  FROM public.fn_vivero_registrar_merma(p_lote_id,p_fecha_evento,p_responsable_id,p_cantidad_perdida,p_causa_merma,p_observaciones,p_evidencia_ids) r
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_despacho_exacto(
  p_lote_id              BIGINT,
  p_fecha_evento         DATE,
  p_responsable_id       BIGINT,
  p_cantidad_despachada  INTEGER,
  p_destino_tipo         public.destino_tipo_vivero,
  p_destino_referencia   TEXT,
  p_comunidad_destino_id BIGINT   DEFAULT NULL,
  p_observaciones        TEXT     DEFAULT NULL,
  p_evidencia_ids        BIGINT[] DEFAULT NULL
) RETURNS TABLE (
  evento_despacho_id TEXT,
  lote_vivero_id TEXT,
  codigo_trazabilidad TEXT,
  cantidad_despachada INTEGER,
  destino_tipo public.destino_tipo_vivero,
  destino_referencia TEXT,
  comunidad_destino_id TEXT,
  saldo_vivo_antes INTEGER,
  saldo_vivo_despues INTEGER,
  evidencia_ids_vinculadas TEXT[],
  lote_finalizado BOOLEAN,
  motivo_cierre public.motivo_cierre_lote
) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
  SELECT r.evento_despacho_id::text,
    r.lote_vivero_id::text,
    r.codigo_trazabilidad,
    r.cantidad_despachada,
    r.destino_tipo,
    r.destino_referencia,
    r.comunidad_destino_id::text,
    r.saldo_vivo_antes,
    r.saldo_vivo_despues,
    r.evidencia_ids_vinculadas::text[],
    r.lote_finalizado,
    r.motivo_cierre
  FROM public.fn_vivero_registrar_despacho(p_lote_id,p_fecha_evento,p_responsable_id,p_cantidad_despachada,p_destino_tipo,p_destino_referencia,p_comunidad_destino_id,p_observaciones,p_evidencia_ids) r
$$;

CREATE OR REPLACE FUNCTION public.fn_vivero_asignar_stock_subcampania_exacto(
  p_lote_vivero_id        BIGINT,
  p_subcampania_id        BIGINT,
  p_cantidad_asignada     INT,
  p_proposito             public.proposito_asignacion,
  p_usuario_asignacion_id BIGINT,
  p_fecha_asignacion      DATE,
  p_evidencia_ids         BIGINT[],
  p_observaciones         TEXT DEFAULT NULL
) RETURNS TABLE (
  asignacion_id TEXT,
  evento_lote_vivero_id TEXT,
  evento_plantacion_id TEXT,
  lote_vivero_id TEXT,
  codigo_trazabilidad_lote TEXT,
  subcampania_id TEXT,
  campania_id TEXT,
  proposito public.proposito_asignacion,
  estado_asignacion public.estado_asignacion_vivero,
  cantidad_asignada INT,
  saldo_vivo_antes INT,
  saldo_vivo_despues INT,
  evidencia_ids_vinculadas TEXT[],
  lote_finalizado BOOLEAN,
  motivo_cierre public.motivo_cierre_lote
) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
  SELECT r.asignacion_id::text,
    r.evento_lote_vivero_id::text,
    r.evento_plantacion_id::text,
    r.lote_vivero_id::text,
    r.codigo_trazabilidad_lote,
    r.subcampania_id::text,
    r.campania_id::text,
    r.proposito,
    r.estado_asignacion,
    r.cantidad_asignada,
    r.saldo_vivo_antes,
    r.saldo_vivo_despues,
    r.evidencia_ids_vinculadas::text[],
    r.lote_finalizado,
    r.motivo_cierre
  FROM public.fn_vivero_asignar_stock_subcampania(p_lote_vivero_id,p_subcampania_id,p_cantidad_asignada,p_proposito,p_usuario_asignacion_id,p_fecha_asignacion,p_evidencia_ids,p_observaciones) r
$$;

CREATE OR REPLACE FUNCTION public.fn_m3_devolver_asignacion_vivero_exacto(
  p_asignacion_id          BIGINT,
  p_cantidad_devuelta      INT,
  p_motivo_devolucion      public.motivo_devolucion_plantacion,
  p_usuario_devolucion_id  BIGINT,
  p_fecha_devolucion       DATE,
  p_observaciones          TEXT DEFAULT NULL
) RETURNS TABLE (
  asignacion_id TEXT,
  estado_asignacion public.estado_asignacion_vivero,
  cantidad_devuelta_delta INT,
  cantidad_devuelta_total INT,
  saldo_asignado_disponible INT,
  lote_vivero_id TEXT,
  saldo_vivo_antes INT,
  saldo_vivo_despues INT,
  lote_reabierto BOOLEAN,
  evento_lote_vivero_id TEXT,
  evento_plantacion_id TEXT
) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$
  SELECT r.asignacion_id::text,
    r.estado_asignacion,
    r.cantidad_devuelta_delta,
    r.cantidad_devuelta_total,
    r.saldo_asignado_disponible,
    r.lote_vivero_id::text,
    r.saldo_vivo_antes,
    r.saldo_vivo_despues,
    r.lote_reabierto,
    r.evento_lote_vivero_id::text,
    r.evento_plantacion_id::text
  FROM public.fn_m3_devolver_asignacion_vivero(p_asignacion_id,p_cantidad_devuelta,p_motivo_devolucion,p_usuario_devolucion_id,p_fecha_devolucion,p_observaciones) r
$$;

DO $acl$
DECLARE r RECORD; firma TEXT; rol TEXT;
BEGIN
  FOR r IN SELECT * FROM pg_temp.t5_105_funciones LOOP
    firma:=replace(r.firma,'(','_exacto(');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',firma);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',firma);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(rol,to_regprocedure(firma),'EXECUTE') THEN
        RAISE EXCEPTION 'T5_IDS_PRIVILEGIO_HEREDADO: %.%',rol,firma;
      END IF;
    END LOOP;
    EXECUTE format('COMMENT ON FUNCTION %s IS %L',firma,
      'T5: mismos efectos y autoridad de la RPC vigente; IDs TEXT y arrays TEXT[] antes del transporte JSON. No crea motor ni ejecuta dos veces.');
  END LOOP;
END $acl$;
NOTIFY pgrst,'reload schema';
COMMIT;
