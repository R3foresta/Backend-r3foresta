-- T5: consumo atribuido al lote original y procedencia mínima propia.
-- Requiere 102 y la autorización efectiva propia de 085. No modifica hechos,
-- consumos, LIFO, stock ni fotografías públicas. No hace backfill de snapshots.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE r RECORD; f RECORD; rol TEXT;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('registro_plantacion_detalle','id','bigint'),
    ('registro_plantacion_detalle','registro_plantacion_id','bigint'),
    ('registro_plantacion_detalle','asignacion_id','bigint'),
    ('registro_plantacion_detalle','lote_vivero_id','bigint'),
    ('registro_plantacion_detalle','planta_id','bigint'),
    ('registro_plantacion_detalle','cantidad','integer'),
    ('registro_plantacion_detalle','nombre_cientifico_snapshot','text'),
    ('registro_plantacion_detalle','nombre_comercial_snapshot','text'),
    ('registro_plantacion_detalle','variedad_snapshot','text'),
    ('asignacion_vivero_subcampania','fecha_entrega_operativa','date'),
    ('lote_vivero','variedad_snapshot','text'),
    ('lote_vivero','recoleccion_id','bigint'),
    ('vivero_incorporacion','evento_id','bigint'),
    ('vivero_incorporacion','modalidad','text'),
    ('vivero_incorporacion','procedencia','text')
  ) x(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||r.tabla)
      AND attname=r.columna AND atttypid=r.tipo::regtype AND NOT attisdropped) THEN
      RAISE EXCEPTION 'T5_M3_ANTECEDENTE_INCOMPATIBLE: %.%',r.tabla,r.columna;
    END IF;
  END LOOP;
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure('public.pa_p_relacion_propia(bigint,bigint)');
  IF f.oid IS NULL OR md5(f.prosrc)<>'16a0dd4f889f8b3661915a34f98ce422'
    OR f.prosecdef OR f.provolatile<>'s' OR f.prorettype<>'jsonb'::regtype
    OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[] THEN
    RAISE EXCEPTION 'T5_M3_RELACION_PROPIA_085_INCOMPATIBLE';
  END IF;
  IF to_regprocedure('public.pa_lecturas_actor(bigint,text)') IS NULL
    OR to_regprocedure('public.pa_r_error(integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'T5_M3_LECTURAS_ANTECEDENTE_AUSENTE';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('public.t5_detalle_snapshot_lote()','7e5ecc45b2b894f0d34147c2ee21359f','trigger'),
    ('public.pa_registro_procedencia_propia_leer(bigint,text,bigint)','3bd2bcc4a4c1b23db24ac31cddf5bdfc','jsonb')
  ) x(firma,huella,retorno) LOOP
    SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(r.firma);
    IF f.oid IS NOT NULL THEN
      IF md5(f.prosrc)<>r.huella OR f.prosecdef OR f.prokind<>'f'
        OR f.prorettype<>r.retorno::regtype OR f.provolatile<>'v' OR f.proretset
        OR f.proisstrict OR f.proleakproof OR f.proparallel<>'u' OR f.pronargdefaults<>0
        OR f.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
        OR f.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
        OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public','lock_timeout=5s','statement_timeout=30s']::text[] THEN
        RAISE EXCEPTION 'T5_M3_FUNCION_INCOMPATIBLE: %',r.firma;
      END IF;
      IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') THEN
        RAISE EXCEPTION 'T5_M3_FUNCION_PUBLICA: %',r.firma;
      END IF;
      FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_function_privilege(rol,f.oid,'EXECUTE') THEN
          RAISE EXCEPTION 'T5_M3_FUNCION_EXPUESTA: %.%',rol,r.firma;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  SELECT * INTO f FROM pg_proc WHERE oid=to_regprocedure(
    'public.fn_m3_registrar_plantacion(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])');
  IF f.oid IS NULL OR md5(f.prosrc)<>'dc6938d1a1ec8cec18aad46ccaf6ecb0' OR f.prosecdef
    OR f.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp','lock_timeout=5s','statement_timeout=30s']::text[]
      AND f.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp','lock_timeout=5s','statement_timeout=30s','TimeZone=America/La_Paz']::text[] THEN
    RAISE EXCEPTION 'T5_M3_REGISTRO_INTERNO_077_INCOMPATIBLE';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.registro_plantacion_detalle'::regclass
    AND tgname='t5_detalle_snapshot_lote_trg' AND (tgfoid IS DISTINCT FROM to_regprocedure('public.t5_detalle_snapshot_lote()')
      OR tgtype<>7 OR tgenabled<>'O' OR tgconstraint<>0 OR tgqual IS NOT NULL OR tgnargs<>0)) THEN
    RAISE EXCEPTION 'T5_M3_TRIGGER_INCOMPATIBLE';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.t5_detalle_snapshot_lote()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v RECORD; v_hoy DATE:=(transaction_timestamp() AT TIME ZONE 'America/La_Paz')::date;
BEGIN
  -- Los ejecutores 075/077 ya bloquearon asignaciones. No se añaden locks
  -- en orden inverso. La relación y los snapshots del lote son inmutables.
  SELECT lv.id,lv.nombre_cientifico_snapshot,lv.nombre_comercial_snapshot,lv.variedad_snapshot,
    lv.recoleccion_id,lv.fecha_inicio,a.fecha_entrega_operativa,r.fecha_plantacion INTO v
    FROM public.lote_vivero lv
    JOIN public.asignacion_vivero_subcampania a ON a.lote_vivero_id=lv.id
    JOIN public.registro_plantacion r ON r.subcampania_id=a.subcampania_id
    WHERE lv.id=NEW.lote_vivero_id AND a.id=NEW.asignacion_id
      AND r.id=NEW.registro_plantacion_id AND lv.planta_id=NEW.planta_id;
  IF v.id IS NULL THEN
    RAISE EXCEPTION 'T5_M3_DETALLE_ORIGEN_INCOMPATIBLE' USING ERRCODE='23514';
  END IF;
  -- El DATE físico conservado desde 076 prima sobre el cast de un timestamp.
  -- Nuevas incorporaciones no admiten stock sin día de entrega conocido.
  IF v.fecha_plantacion<v_hoy-10 OR v.fecha_plantacion>v_hoy
    OR (v.fecha_entrega_operativa IS NOT NULL AND v.fecha_plantacion<v.fecha_entrega_operativa)
    OR (v.recoleccion_id IS NULL AND (v.fecha_entrega_operativa IS NULL OR v.fecha_plantacion<v.fecha_inicio)) THEN
    RAISE EXCEPTION 'T5_M3_FECHA_CONSUMO_INCOMPATIBLE' USING ERRCODE='23514';
  END IF;
  NEW.nombre_cientifico_snapshot:=v.nombre_cientifico_snapshot;
  NEW.nombre_comercial_snapshot:=v.nombre_comercial_snapshot;
  NEW.variedad_snapshot:=v.variedad_snapshot;
  RETURN NEW;
END $$;

DO $trigger$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.registro_plantacion_detalle'::regclass
    AND tgname='t5_detalle_snapshot_lote_trg') THEN
    CREATE TRIGGER t5_detalle_snapshot_lote_trg BEFORE INSERT ON public.registro_plantacion_detalle
      FOR EACH ROW EXECUTE FUNCTION public.t5_detalle_snapshot_lote();
  END IF;
END $trigger$;

CREATE OR REPLACE FUNCTION public.pa_registro_procedencia_propia_leer(
  p_actor_id BIGINT,p_auth_id TEXT,p_registro_id BIGINT
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public
SET lock_timeout='5s' SET statement_timeout='30s' AS $$
DECLARE v public.registro_plantacion%ROWTYPE; v_consumos JSONB;
BEGIN
  -- Cuenta activa antes de leer/revelar el registro. La audiencia es la propia
  -- de 085; ADMIN sin relación tampoco obtiene acceso por esta ruta.
  PERFORM public.pa_lecturas_actor(p_actor_id,p_auth_id);
  SELECT * INTO v FROM public.registro_plantacion WHERE id=p_registro_id FOR SHARE;
  IF v.id IS NULL OR jsonb_array_length(coalesce(public.pa_p_relacion_propia(p_actor_id,p_registro_id),'[]'::jsonb))=0 THEN
    PERFORM public.pa_r_error(404,'RECURSO_NO_VISIBLE','El recurso no está disponible.');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'detalle_id',d.id::text,'asignacion_id',d.asignacion_id::text,
    'lote_vivero_id',d.lote_vivero_id::text,'codigo_lote',l.codigo_trazabilidad,
    'planta_id',d.planta_id::text,'cantidad',d.cantidad,
    'nombre_cientifico_snapshot',d.nombre_cientifico_snapshot,
    'nombre_comercial_snapshot',d.nombre_comercial_snapshot,'variedad_snapshot',d.variedad_snapshot,
    'origen',jsonb_build_object(
      'tipo',CASE WHEN i.evento_id IS NOT NULL THEN 'INCORPORACION'
        WHEN l.recoleccion_id IS NOT NULL THEN 'RECOLECCION' ELSE 'HISTORICO_SIN_ORIGEN' END,
      'recoleccion_id',l.recoleccion_id::text,'modalidad',i.modalidad,'procedencia',i.procedencia)
    ) ORDER BY d.id),'[]'::jsonb) INTO v_consumos
  FROM public.registro_plantacion_detalle d JOIN public.lote_vivero l ON l.id=d.lote_vivero_id
    LEFT JOIN public.evento_lote_vivero e ON e.lote_id=l.id AND e.tipo_evento='INCORPORACION'
    LEFT JOIN public.vivero_incorporacion i ON i.evento_id=e.id
  WHERE d.registro_plantacion_id=v.id;
  RETURN jsonb_build_object('data',jsonb_build_object('registro_plantacion_id',v.id::text,
    'cantidad_total_plantada',v.cantidad_total_plantada,'criterio_atribucion','CONSUMOS_PERSISTIDOS',
    'consumos',v_consumos),
    'observado_en',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

-- La inicial 075 ya fija La Paz explícitamente. La reposición interna 077
-- valida su fecha en el mismo día operativo, sin modificar selección ni saldos.
ALTER FUNCTION public.fn_m3_registrar_plantacion(BIGINT,BOOLEAN,BIGINT,DATE,BIGINT,NUMERIC,NUMERIC,TEXT,BIGINT[],JSONB,BIGINT[])
  SET TimeZone='America/La_Paz';

REVOKE ALL ON FUNCTION public.t5_detalle_snapshot_lote(),
  public.pa_registro_procedencia_propia_leer(BIGINT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.t5_detalle_snapshot_lote(),
  public.pa_registro_procedencia_propia_leer(BIGINT,TEXT,BIGINT) TO service_role;
COMMENT ON FUNCTION public.t5_detalle_snapshot_lote() IS
  'T5: detalles nuevos heredan identidad vegetal del lote, sin catálogo vivo ni backfill.';
COMMENT ON FUNCTION public.pa_registro_procedencia_propia_leer(BIGINT,TEXT,BIGINT) IS
  'T5: procedencia mínima del consumo persistido para autor/participante efectivo activo; sin ficha/fotos M2. Atribución registrada, no prueba de selección física de lote.';
COMMIT;
