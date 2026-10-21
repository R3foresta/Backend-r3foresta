-- PA-T-INT07-BE02 parcial: persistencia privada, sin ejecutores ni APIs.
-- Antecedente estructural: 024/030/031/068 y columnas/snapshots de074.
-- No acredita075–081 ni catálogo remoto. No amplía operaciones de comando,
-- no crea mortandad, no escribe originales/consumos ni materializa filas.
-- Ausencia de overlay significa original vigente; materialización futura lazy
-- bajo cuentas -> ámbito -> comando -> permisos -> hechos -> asignaciones.
-- Este DDL no sustituye autorización, locks, conciliación ni recibo de futuras RPC.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ DECLARE t TEXT; r RECORD; sec TEXT; existentes INTEGER; BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'PA_INT07_ROLES_REQUERIDOS';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('registro_plantacion','id','bigint'),('registro_plantacion','subcampania_id','bigint'),
    ('registro_plantacion','revision_registro','bigint'),('registro_plantacion','es_reposicion','boolean'),
    ('registro_plantacion','registro_plantacion_origen_id','bigint'),
    ('registro_plantacion','cantidad_total_plantada','integer'),('registro_plantacion','observaciones','text'),
    ('registro_plantacion_coresponsable','id','bigint'),('registro_plantacion_coresponsable','usuario_id','bigint'),
    ('registro_plantacion_coresponsable','registro_plantacion_id','bigint'),
    ('registro_plantacion_coresponsable','nombre_snapshot','text'),
    ('registro_plantacion_coresponsable','afiliacion_snapshot','text'),
    ('registro_plantacion_coresponsable','afiliacion_estado','text'),
    ('registro_plantacion_coresponsable','afiliacion_tipo','text'),
    ('registro_plantacion_coresponsable','organizacion_id_snapshot','bigint'),
    ('registro_plantacion_detalle','id','bigint'),('registro_plantacion_detalle','registro_plantacion_id','bigint'),
    ('registro_plantacion_detalle','asignacion_id','bigint'),('registro_plantacion_detalle','lote_vivero_id','bigint'),
    ('registro_plantacion_detalle','planta_id','bigint'),('registro_plantacion_detalle','cantidad','integer'),
    ('evento_plantacion','id','bigint'),('evento_plantacion','subcampania_id','bigint'),
    ('evento_plantacion','registro_plantacion_id','bigint'),('evento_plantacion','cantidad_muerta_delta','integer'),
    ('asignacion_vivero_subcampania','id','bigint'),('asignacion_vivero_subcampania','subcampania_id','bigint'),
    ('asignacion_vivero_subcampania','lote_vivero_id','bigint'),('lote_vivero','planta_id','bigint'),
    ('participacion_comando','id','bigint'),('participacion_comando','actor_id','bigint'),
    ('participacion_comando','operacion','text'),('usuario','id','bigint'),
    ('subcampania','id','bigint'),('organizacion','id','bigint'),('planta','id','bigint')
  ) e(tabla,columna,tipo) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname=r.tabla AND c.relkind='r' AND a.attname=r.columna
      AND a.atttypid=r.tipo::regtype AND a.attnum>0 AND NOT a.attisdropped) THEN
      RAISE EXCEPTION 'PA_INT07_ANTECEDENTE_INCOMPLETO: %.%',r.tabla,r.columna;
    END IF;
  END LOOP;
  IF to_regtype('public.proposito_asignacion') IS NULL THEN RAISE EXCEPTION 'PA_INT07_PROPOSITO_REQUERIDO'; END IF;
  IF (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e
    WHERE e.enumtypid=to_regtype('public.proposito_asignacion')) IS DISTINCT FROM ARRAY['PLANTACION_INICIAL','REPOSICION']::text[]
    OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.asignacion_vivero_subcampania')
      AND attname='proposito' AND atttypid=to_regtype('public.proposito_asignacion') AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_enum e ON e.enumtypid=a.atttypid
      WHERE a.attrelid=to_regclass('public.evento_plantacion') AND a.attname='tipo_evento'
        AND NOT a.attisdropped AND e.enumlabel='MORTANDAD_REPORTADA') THEN
    RAISE EXCEPTION 'PA_INT07_ENUM_ANTECEDENTE_INCOMPATIBLE';
  END IF;
  SELECT count(*) INTO existentes FROM unnest(ARRAY['registro_plantacion_grupo_revision','registro_plantacion_correccion',
    'registro_plantacion_efectivo','evento_plantacion_efectivo','registro_plantacion_participante_efectivo',
    'registro_plantacion_consumo_credito','registro_plantacion_consumo_compensacion']) nombre
    WHERE to_regclass('public.'||nombre) IS NOT NULL;
  IF existentes NOT IN(0,7) THEN RAISE EXCEPTION 'PA_INT07_INSTALACION_PARCIAL_INCOMPATIBLE'; END IF;
  -- Memoria exclusivamente transaccional del preflight; no es un bypass de
  -- guardas de dominio ni un manifest persistente que pueda quedar desalineado.
  PERFORM set_config('pa_int07.reinstalacion',CASE WHEN existentes=7 THEN 'on' ELSE 'off' END,true);
  FOREACH t IN ARRAY ARRAY['registro_plantacion_grupo_revision','registro_plantacion_correccion',
    'registro_plantacion_efectivo','evento_plantacion_efectivo',
    'registro_plantacion_participante_efectivo','registro_plantacion_consumo_credito',
    'registro_plantacion_consumo_compensacion'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||t)
        AND relkind='r' AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
        AND relrowsecurity AND NOT relforcerowsecurity) THEN
        RAISE EXCEPTION 'PA_INT07_TABLA_PREEXISTENTE_INCOMPATIBLE: %',t;
      END IF;
      -- Un rerun no repara silenciosamente exposición/privilegios nuevos.
      IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.'||t)) THEN
        RAISE EXCEPTION 'PA_INT07_POLITICA_PREEXISTENTE_INCOMPATIBLE: %',t;
      END IF;
      FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') LOOP
        IF (r.rolname<>'service_role' AND has_any_column_privilege(r.rolname,'public.'||t,'SELECT'))
          OR has_any_column_privilege(r.rolname,'public.'||t,'INSERT')
          OR has_any_column_privilege(r.rolname,'public.'||t,'UPDATE')
          OR has_any_column_privilege(r.rolname,'public.'||t,'REFERENCES')
          OR has_table_privilege(r.rolname,'public.'||t,'DELETE,TRUNCATE,TRIGGER') THEN
          RAISE EXCEPTION 'PA_INT07_PRIVILEGIO_PREEXISTENTE_INCOMPATIBLE: %.%',r.rolname,t;
        END IF;
      END LOOP;
      IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||t)
        AND attname='id' AND attnum>0 AND NOT attisdropped) THEN
        sec:=pg_get_serial_sequence('public.'||t,'id');
        IF sec IS NOT NULL THEN
          FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('anon','authenticated','service_role') LOOP
            IF has_sequence_privilege(r.rolname,sec,'SELECT,UPDATE,USAGE') THEN
              RAISE EXCEPTION 'PA_INT07_SECUENCIA_PREEXISTENTE_INCOMPATIBLE: %.%',r.rolname,t;
            END IF;
          END LOOP;
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

-- La misma definición genera la tabla definitiva y una referencia efímera de
-- catálogo. La comparación EXCEPT detecta drift en columnas/defaults/CHECK/FK/
-- UNIQUE sin copiar datos ni confiar en IF NOT EXISTS o solo en nombres.
-- PostgreSQL no permite FK de tabla TEMP hacia tabla permanente: la referencia
-- usa un esquema privado nuevo, exclusivamente de esta transacción. Si ya
-- existe el nombre, CREATE falla; nunca se adopta ni borra un esquema previo.
DO $ddl$ DECLARE d RECORD; t TEXT; esperado TEXT; real_oid OID; esperado_oid OID;
  esquema_ref TEXT:='pa_int07_catalogo_'||pg_backend_pid();
BEGIN
  EXECUTE format('CREATE SCHEMA %I',esquema_ref);
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC,anon,authenticated,service_role',esquema_ref);
  FOR d IN SELECT * FROM (VALUES
    ('registro_plantacion_grupo_revision',$table$
      grupo_registro_id BIGINT PRIMARY KEY REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      revision_grupo BIGINT NOT NULL DEFAULT 0 CHECK(revision_grupo>=0)
    $table$),
    ('registro_plantacion_correccion',$table$
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      comando_interno_id BIGINT NOT NULL UNIQUE,
      actor_id BIGINT NOT NULL REFERENCES public.usuario(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      actor_nombre_snapshot TEXT,
      subcampania_id BIGINT NOT NULL REFERENCES public.subcampania(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      grupo_registro_id BIGINT NOT NULL REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      registro_plantacion_id BIGINT REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      evento_plantacion_id BIGINT REFERENCES public.evento_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      caso TEXT NOT NULL CHECK(caso IN('OBSERVACIONES','PARTICIPANTES','CANTIDAD','DUPLICADO','REGISTRO_ERRONEO','REPOSICION_ERRONEA','BAJA_ERRONEA')),
      motivo TEXT NOT NULL CHECK(char_length(motivo) BETWEEN 3 AND 1000 AND motivo=normalize(btrim(motivo),NFC)),
      anterior JSONB NOT NULL CHECK(jsonb_typeof(anterior)='object'),
      nuevo JSONB NOT NULL CHECK(jsonb_typeof(nuevo)='object'),
      revision_anterior BIGINT NOT NULL CHECK(revision_anterior>=0),
      revision_nueva BIGINT NOT NULL CHECK(revision_nueva=revision_anterior+1),
      revision_grupo_anterior BIGINT NOT NULL CHECK(revision_grupo_anterior>=0),
      revision_grupo_nueva BIGINT NOT NULL,
      referencia_registro_vigente_id BIGINT REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      referencia_revision_registro BIGINT,
      referencia_revision_grupo BIGINT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      FOREIGN KEY(comando_interno_id,actor_id) REFERENCES public.participacion_comando(id,actor_id) ON UPDATE RESTRICT ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      CHECK(anterior<>nuevo),
      CHECK((caso='BAJA_ERRONEA' AND evento_plantacion_id IS NOT NULL AND registro_plantacion_id IS NULL)
        OR (caso<>'BAJA_ERRONEA' AND registro_plantacion_id IS NOT NULL AND evento_plantacion_id IS NULL)),
      CHECK(revision_grupo_nueva=revision_grupo_anterior+CASE WHEN caso IN('OBSERVACIONES','PARTICIPANTES') THEN 0 ELSE 1 END),
      CHECK(COALESCE((caso='DUPLICADO' AND referencia_registro_vigente_id IS NOT NULL
        AND referencia_registro_vigente_id<>registro_plantacion_id AND referencia_revision_registro>=0 AND referencia_revision_grupo>=0)
        OR (caso<>'DUPLICADO' AND referencia_registro_vigente_id IS NULL
          AND referencia_revision_registro IS NULL AND referencia_revision_grupo IS NULL),false))
    $table$),
    ('registro_plantacion_efectivo',$table$
      registro_plantacion_id BIGINT PRIMARY KEY REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      subcampania_id BIGINT NOT NULL REFERENCES public.subcampania(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK(estado IN('VIGENTE','REVERTIDO')),
      cantidad_efectiva INTEGER NOT NULL,
      observaciones_efectivas TEXT,
      ultima_correccion_id BIGINT REFERENCES public.registro_plantacion_correccion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      CHECK((estado='VIGENTE' AND cantidad_efectiva>0) OR (estado='REVERTIDO' AND cantidad_efectiva=0 AND ultima_correccion_id IS NOT NULL))
    $table$),
    ('evento_plantacion_efectivo',$table$
      evento_plantacion_id BIGINT PRIMARY KEY REFERENCES public.evento_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      grupo_registro_id BIGINT NOT NULL REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      subcampania_id BIGINT NOT NULL REFERENCES public.subcampania(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      estado TEXT NOT NULL DEFAULT 'VIGENTE' CHECK(estado IN('VIGENTE','REVERTIDO')),
      cantidad_muerta_efectiva INTEGER NOT NULL,
      revision_evento BIGINT NOT NULL DEFAULT 0 CHECK(revision_evento>=0),
      ultima_correccion_id BIGINT REFERENCES public.registro_plantacion_correccion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      CHECK((estado='VIGENTE' AND cantidad_muerta_efectiva>0) OR (estado='REVERTIDO' AND cantidad_muerta_efectiva=0 AND ultima_correccion_id IS NOT NULL))
    $table$),
    ('registro_plantacion_participante_efectivo',$table$
      registro_plantacion_id BIGINT NOT NULL REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      usuario_id BIGINT NOT NULL REFERENCES public.usuario(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      coresponsable_original_id BIGINT UNIQUE REFERENCES public.registro_plantacion_coresponsable(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      estado TEXT NOT NULL DEFAULT 'PRESENTE' CHECK(estado IN('PRESENTE','RETIRADO')),
      procedencia TEXT NOT NULL CHECK(procedencia IN('ORIGINAL','ALTA_CORRECCION','RESTAURACION')),
      nombre_snapshot TEXT,
      afiliacion_snapshot TEXT,
      afiliacion_estado TEXT NOT NULL DEFAULT 'HISTORICA_NO_DISPONIBLE',
      afiliacion_tipo TEXT,
      organizacion_id_snapshot BIGINT REFERENCES public.organizacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      snapshot_capturado_en TIMESTAMPTZ,
      correccion_incorporacion_id BIGINT REFERENCES public.registro_plantacion_correccion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      ultima_correccion_id BIGINT REFERENCES public.registro_plantacion_correccion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      PRIMARY KEY(registro_plantacion_id,usuario_id),
      CHECK(COALESCE((afiliacion_estado='DECLARADA' AND afiliacion_snapshot IS NOT NULL AND btrim(afiliacion_snapshot)<>''
        AND ((afiliacion_tipo='ORGANIZACION_REGISTRADA' AND organizacion_id_snapshot IS NOT NULL)
          OR (afiliacion_tipo='OTRA' AND organizacion_id_snapshot IS NULL)))
        OR (afiliacion_estado IN('NO_DECLARADA','HISTORICA_NO_DISPONIBLE')
          AND afiliacion_snapshot IS NULL AND afiliacion_tipo IS NULL AND organizacion_id_snapshot IS NULL),false)),
      CHECK((coresponsable_original_id IS NOT NULL AND correccion_incorporacion_id IS NULL AND snapshot_capturado_en IS NULL)
        OR (coresponsable_original_id IS NULL AND correccion_incorporacion_id IS NOT NULL AND snapshot_capturado_en IS NOT NULL AND procedencia<>'ORIGINAL')),
      CHECK(estado<>'RETIRADO' OR ultima_correccion_id IS NOT NULL)
    $table$),
    ('registro_plantacion_consumo_credito',$table$
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      registro_plantacion_id BIGINT NOT NULL REFERENCES public.registro_plantacion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      asignacion_id BIGINT NOT NULL REFERENCES public.asignacion_vivero_subcampania(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      planta_id BIGINT NOT NULL REFERENCES public.planta(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      proposito public.proposito_asignacion NOT NULL,
      cantidad INTEGER NOT NULL CHECK(cantidad>0),
      detalle_original_id BIGINT UNIQUE REFERENCES public.registro_plantacion_detalle(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      correccion_id BIGINT REFERENCES public.registro_plantacion_correccion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      revision_origen BIGINT NOT NULL DEFAULT 0 CHECK(revision_origen>=0),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(correccion_id,asignacion_id,planta_id),
      CHECK((detalle_original_id IS NOT NULL AND correccion_id IS NULL AND revision_origen=0)
        OR (detalle_original_id IS NULL AND correccion_id IS NOT NULL AND revision_origen>0))
    $table$),
    ('registro_plantacion_consumo_compensacion',$table$
      id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      credito_id BIGINT NOT NULL REFERENCES public.registro_plantacion_consumo_credito(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      correccion_id BIGINT NOT NULL REFERENCES public.registro_plantacion_correccion(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      cantidad INTEGER NOT NULL CHECK(cantidad>0),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      UNIQUE(correccion_id,credito_id)
    $table$)
  ) definiciones(nombre,cuerpo) LOOP
    t:=d.nombre;
    -- Identificadores de referencia cortos para no truncar a63 caracteres.
    esperado:='pa_int07_e_'||substr(md5(t),1,12);
    EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (%s)',t,d.cuerpo);
    EXECUTE format('CREATE TABLE %I.%I (%s)',esquema_ref,esperado,d.cuerpo);
    real_oid:=to_regclass('public.'||t); esperado_oid:=to_regclass(esquema_ref||'.'||esperado);
    IF EXISTS(
      WITH columnas AS (
        SELECT a.attrelid, a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,
          pg_get_expr(ad.adbin,ad.adrelid) defecto
        FROM pg_attribute a LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
        WHERE a.attrelid IN(real_oid,esperado_oid) AND a.attnum>0 AND NOT a.attisdropped),
      real AS(SELECT attnum,attname,atttypid,atttypmod,attnotnull,attidentity,attgenerated,defecto FROM columnas WHERE attrelid=real_oid),
      esperado AS(SELECT attnum,attname,atttypid,atttypmod,attnotnull,attidentity,attgenerated,defecto FROM columnas WHERE attrelid=esperado_oid)
      (SELECT * FROM real EXCEPT SELECT * FROM esperado) UNION ALL (SELECT * FROM esperado EXCEPT SELECT * FROM real)
    ) OR EXISTS(
      -- El constraint trigger diferido (contype=t) se instala y coteja aparte.
      -- Los CHECK/FK/PK/UNIQUE permanecen íntegros en este manifest.
      WITH real AS(SELECT contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid) def
        FROM pg_constraint WHERE conrelid=real_oid AND contype<>'t'),
      esperado AS(SELECT contype,convalidated,condeferrable,condeferred,pg_get_constraintdef(oid) def
        FROM pg_constraint WHERE conrelid=esperado_oid AND contype<>'t')
      (SELECT * FROM real EXCEPT SELECT * FROM esperado) UNION ALL (SELECT * FROM esperado EXCEPT SELECT * FROM real)
    ) THEN RAISE EXCEPTION 'PA_INT07_ESTRUCTURA_INCOMPATIBLE: %',t; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $ddl$;

-- Helpers de integridad, sin función invocable de corrección. Prosrc y metadata
-- existentes se cotejan antes de crear: no reemplazar un helper desconocido.
DO $install$ DECLARE v RECORD; v_proc RECORD; rol TEXT; BEGIN
  FOR v IN SELECT * FROM (VALUES
    ('pa_int07_persistencia_conservar',$body$
BEGIN
  RAISE EXCEPTION 'PA_INT07_CONSERVACION_OBLIGATORIA' USING ERRCODE='23514';
END
$body$),
    ('pa_int07_persistencia_validar',$body$
DECLARE
  r public.registro_plantacion%ROWTYPE; g public.registro_plantacion%ROWTYPE;
  e public.evento_plantacion%ROWTYPE; c public.registro_plantacion_correccion%ROWTYPE;
  d public.registro_plantacion_detalle%ROWTYPE; a public.asignacion_vivero_subcampania%ROWTYPE;
  participante public.registro_plantacion_coresponsable%ROWTYPE;
  credito public.registro_plantacion_consumo_credito%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='registro_plantacion_grupo_revision' THEN
    SELECT * INTO g FROM public.registro_plantacion WHERE id=NEW.grupo_registro_id;
    IF g.id IS NULL OR g.es_reposicion THEN RAISE EXCEPTION 'PA_INT07_GRUPO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    IF (TG_OP='INSERT' AND NEW.revision_grupo<>0)
      OR (TG_OP='UPDATE' AND ((NEW.grupo_registro_id IS DISTINCT FROM OLD.grupo_registro_id)
        OR NEW.revision_grupo<>OLD.revision_grupo+1)) THEN
      RAISE EXCEPTION 'PA_INT07_REVISION_GRUPO_INVALIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  ELSIF TG_TABLE_NAME='registro_plantacion_correccion' THEN
    SELECT * INTO g FROM public.registro_plantacion WHERE id=NEW.grupo_registro_id;
    IF g.id IS NULL OR g.es_reposicion OR g.subcampania_id<>NEW.subcampania_id THEN
      RAISE EXCEPTION 'PA_INT07_AMBITO_GRUPO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    IF NEW.registro_plantacion_id IS NOT NULL THEN
      SELECT * INTO r FROM public.registro_plantacion WHERE id=NEW.registro_plantacion_id;
      IF r.id IS NULL OR r.subcampania_id<>NEW.subcampania_id
        OR (CASE WHEN r.es_reposicion THEN r.registro_plantacion_origen_id ELSE r.id END)<>g.id
        OR (NEW.caso IN('CANTIDAD','DUPLICADO','REGISTRO_ERRONEO') AND r.es_reposicion)
        OR (NEW.caso='REPOSICION_ERRONEA' AND NOT r.es_reposicion) THEN
        RAISE EXCEPTION 'PA_INT07_OBJETO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO e FROM public.evento_plantacion WHERE id=NEW.evento_plantacion_id;
      IF e.id IS NULL OR e.tipo_evento::text<>'MORTANDAD_REPORTADA'
        OR e.subcampania_id<>NEW.subcampania_id OR e.registro_plantacion_id IS DISTINCT FROM g.id THEN
        RAISE EXCEPTION 'PA_INT07_EVENTO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.caso='DUPLICADO' AND NOT EXISTS(SELECT 1 FROM public.registro_plantacion ref
      WHERE ref.id=NEW.referencia_registro_vigente_id AND NOT ref.es_reposicion
        AND ref.subcampania_id=NEW.subcampania_id) THEN
      RAISE EXCEPTION 'PA_INT07_REFERENCIA_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    -- Actor/operación/terminal se validan al commit: el futuro ejecutor puede
    -- insertar historia antes de fijar el recibo dentro de la misma transacción.
    RETURN NEW;
  ELSIF TG_TABLE_NAME='evento_plantacion_efectivo' THEN
    SELECT * INTO e FROM public.evento_plantacion WHERE id=NEW.evento_plantacion_id;
    SELECT * INTO g FROM public.registro_plantacion WHERE id=NEW.grupo_registro_id;
    IF e.id IS NULL OR g.id IS NULL OR g.es_reposicion OR e.tipo_evento::text<>'MORTANDAD_REPORTADA'
      OR e.registro_plantacion_id IS DISTINCT FROM g.id OR e.subcampania_id<>NEW.subcampania_id
      OR g.subcampania_id<>NEW.subcampania_id THEN
      RAISE EXCEPTION 'PA_INT07_EVENTO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND ((NEW.evento_plantacion_id,NEW.grupo_registro_id,NEW.subcampania_id)
      IS DISTINCT FROM (OLD.evento_plantacion_id,OLD.grupo_registro_id,OLD.subcampania_id)
      OR OLD.estado='REVERTIDO' OR NEW.revision_evento<>OLD.revision_evento+1
      OR NEW.ultima_correccion_id IS NOT DISTINCT FROM OLD.ultima_correccion_id) THEN
      RAISE EXCEPTION 'PA_INT07_EVENTO_TRANSICION_INVALIDA' USING ERRCODE='23514'; END IF;
    IF NEW.ultima_correccion_id IS NULL THEN
      IF TG_OP<>'INSERT' OR NEW.estado<>'VIGENTE' OR NEW.revision_evento<>0
        OR NEW.cantidad_muerta_efectiva IS DISTINCT FROM e.cantidad_muerta_delta THEN
        RAISE EXCEPTION 'PA_INT07_EVENTO_BASE_INVALIDA' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO c FROM public.registro_plantacion_correccion WHERE id=NEW.ultima_correccion_id;
      IF c.id IS NULL OR c.evento_plantacion_id IS DISTINCT FROM e.id OR c.caso<>'BAJA_ERRONEA'
        OR c.revision_nueva<>NEW.revision_evento OR NEW.estado<>'REVERTIDO' THEN
        RAISE EXCEPTION 'PA_INT07_EVENTO_CORRECCION_INVALIDA' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO r FROM public.registro_plantacion WHERE id=NEW.registro_plantacion_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'PA_INT07_REGISTRO_REQUERIDO' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='registro_plantacion_efectivo' THEN
    IF r.subcampania_id<>NEW.subcampania_id THEN RAISE EXCEPTION 'PA_INT07_AMBITO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND ((NEW.registro_plantacion_id,NEW.subcampania_id)
      IS DISTINCT FROM (OLD.registro_plantacion_id,OLD.subcampania_id)
      OR OLD.estado='REVERTIDO' OR NEW.ultima_correccion_id IS NOT DISTINCT FROM OLD.ultima_correccion_id) THEN
      RAISE EXCEPTION 'PA_INT07_REGISTRO_TRANSICION_INVALIDA' USING ERRCODE='23514'; END IF;
    IF NEW.ultima_correccion_id IS NULL THEN
      IF TG_OP<>'INSERT' OR NEW.estado<>'VIGENTE' OR NEW.cantidad_efectiva<>r.cantidad_total_plantada
        OR NEW.observaciones_efectivas IS DISTINCT FROM r.observaciones THEN
        RAISE EXCEPTION 'PA_INT07_REGISTRO_BASE_INVALIDA' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO c FROM public.registro_plantacion_correccion WHERE id=NEW.ultima_correccion_id;
      IF c.id IS NULL OR c.registro_plantacion_id IS DISTINCT FROM r.id
        OR c.revision_nueva<>r.revision_registro
        OR (NEW.estado='REVERTIDO' AND c.caso NOT IN('DUPLICADO','REGISTRO_ERRONEO','REPOSICION_ERRONEA'))
        OR (NEW.estado='VIGENTE' AND c.caso NOT IN('OBSERVACIONES','PARTICIPANTES','CANTIDAD')) THEN
        RAISE EXCEPTION 'PA_INT07_REGISTRO_CORRECCION_INVALIDA' USING ERRCODE='23514'; END IF;
      IF c.caso='OBSERVACIONES' THEN
        IF NEW.observaciones_efectivas IS NOT NULL AND (char_length(NEW.observaciones_efectivas)>2000
          OR NEW.observaciones_efectivas<>normalize(btrim(NEW.observaciones_efectivas),NFC)) THEN
          RAISE EXCEPTION 'PA_INT07_OBSERVACIONES_NUEVAS_INVALIDAS' USING ERRCODE='23514'; END IF;
        IF NEW.cantidad_efectiva IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.cantidad_efectiva ELSE r.cantidad_total_plantada END) THEN
          RAISE EXCEPTION 'PA_INT07_OBSERVACIONES_CANTIDAD_INMUTABLE' USING ERRCODE='23514'; END IF;
      ELSIF NEW.observaciones_efectivas IS DISTINCT FROM (CASE WHEN TG_OP='UPDATE' THEN OLD.observaciones_efectivas ELSE r.observaciones END) THEN
        RAISE EXCEPTION 'PA_INT07_OBSERVACIONES_NO_EDITABLES' USING ERRCODE='23514';
      END IF;
      IF c.caso='PARTICIPANTES' AND NEW.cantidad_efectiva IS DISTINCT FROM
        (CASE WHEN TG_OP='UPDATE' THEN OLD.cantidad_efectiva ELSE r.cantidad_total_plantada END) THEN
        RAISE EXCEPTION 'PA_INT07_PARTICIPANTES_CANTIDAD_INMUTABLE' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='registro_plantacion_participante_efectivo' THEN
    IF NEW.usuario_id=r.responsable_id THEN RAISE EXCEPTION 'PA_INT07_RESPONSABLE_INMUTABLE' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND ((NEW.registro_plantacion_id,NEW.usuario_id,NEW.coresponsable_original_id,
      NEW.nombre_snapshot,NEW.afiliacion_snapshot,NEW.afiliacion_estado,NEW.afiliacion_tipo,
      NEW.organizacion_id_snapshot,NEW.snapshot_capturado_en,NEW.correccion_incorporacion_id)
      IS DISTINCT FROM (OLD.registro_plantacion_id,OLD.usuario_id,OLD.coresponsable_original_id,
      OLD.nombre_snapshot,OLD.afiliacion_snapshot,OLD.afiliacion_estado,OLD.afiliacion_tipo,
      OLD.organizacion_id_snapshot,OLD.snapshot_capturado_en,OLD.correccion_incorporacion_id)
      OR NEW.estado=OLD.estado OR NEW.ultima_correccion_id IS NOT DISTINCT FROM OLD.ultima_correccion_id
      OR (OLD.estado='RETIRADO' AND (NEW.estado<>'PRESENTE' OR NEW.procedencia<>'RESTAURACION'))
      OR (OLD.estado='PRESENTE' AND NEW.procedencia<>OLD.procedencia)) THEN
      RAISE EXCEPTION 'PA_INT07_PARTICIPANTE_TRANSICION_INVALIDA' USING ERRCODE='23514'; END IF;
    IF NEW.coresponsable_original_id IS NOT NULL THEN
      SELECT * INTO participante FROM public.registro_plantacion_coresponsable WHERE id=NEW.coresponsable_original_id;
      IF participante.id IS NULL OR (participante.registro_plantacion_id,participante.usuario_id,
        participante.nombre_snapshot,participante.afiliacion_snapshot,participante.afiliacion_estado,
        participante.afiliacion_tipo,participante.organizacion_id_snapshot)
        IS DISTINCT FROM (NEW.registro_plantacion_id,NEW.usuario_id,NEW.nombre_snapshot,
        NEW.afiliacion_snapshot,NEW.afiliacion_estado,NEW.afiliacion_tipo,NEW.organizacion_id_snapshot) THEN
        RAISE EXCEPTION 'PA_INT07_SNAPSHOT_ORIGINAL_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    ELSIF TG_OP='INSERT' THEN
      IF NEW.procedencia<>'ALTA_CORRECCION' OR NEW.estado<>'PRESENTE'
        OR NEW.afiliacion_estado<>'HISTORICA_NO_DISPONIBLE'
        OR NEW.correccion_incorporacion_id IS DISTINCT FROM NEW.ultima_correccion_id THEN
        RAISE EXCEPTION 'PA_INT07_ALTA_HISTORICA_INVALIDA' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW.ultima_correccion_id IS NULL THEN
      IF TG_OP<>'INSERT' OR NEW.procedencia<>'ORIGINAL' OR NEW.estado<>'PRESENTE' THEN
        RAISE EXCEPTION 'PA_INT07_PARTICIPANTE_BASE_INVALIDA' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO c FROM public.registro_plantacion_correccion WHERE id=NEW.ultima_correccion_id;
      IF c.id IS NULL OR c.registro_plantacion_id IS DISTINCT FROM r.id OR c.caso<>'PARTICIPANTES'
        OR (NEW.coresponsable_original_id IS NULL AND TG_OP='INSERT' AND NEW.snapshot_capturado_en IS DISTINCT FROM c.creado_en) THEN
        RAISE EXCEPTION 'PA_INT07_PARTICIPANTE_CORRECCION_INVALIDA' USING ERRCODE='23514'; END IF;
    END IF;
    -- Actividad actual del participante no es elegibilidad de un hecho pasado.
  ELSIF TG_TABLE_NAME='registro_plantacion_consumo_credito' THEN
    SELECT * INTO a FROM public.asignacion_vivero_subcampania WHERE id=NEW.asignacion_id;
    IF a.id IS NULL OR a.subcampania_id<>r.subcampania_id OR a.proposito IS DISTINCT FROM NEW.proposito
      OR NEW.proposito::text<>(CASE WHEN r.es_reposicion THEN 'REPOSICION' ELSE 'PLANTACION_INICIAL' END)
      OR NOT EXISTS(SELECT 1 FROM public.lote_vivero l WHERE l.id=a.lote_vivero_id AND l.planta_id=NEW.planta_id) THEN
      RAISE EXCEPTION 'PA_INT07_CREDITO_AMBITO_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    IF NEW.detalle_original_id IS NOT NULL THEN
      SELECT * INTO d FROM public.registro_plantacion_detalle WHERE id=NEW.detalle_original_id;
      IF d.id IS NULL OR (d.registro_plantacion_id,d.asignacion_id,d.planta_id,d.cantidad,d.lote_vivero_id)
        IS DISTINCT FROM (NEW.registro_plantacion_id,NEW.asignacion_id,NEW.planta_id,NEW.cantidad,a.lote_vivero_id) THEN
        RAISE EXCEPTION 'PA_INT07_CREDITO_ORIGINAL_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT * INTO c FROM public.registro_plantacion_correccion WHERE id=NEW.correccion_id;
      IF c.id IS NULL OR c.registro_plantacion_id IS DISTINCT FROM r.id OR c.caso<>'CANTIDAD'
        OR c.revision_nueva<>NEW.revision_origen OR r.es_reposicion THEN
        RAISE EXCEPTION 'PA_INT07_CREDITO_CORRECCION_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END
$body$),
    ('pa_int07_persistencia_terminal',$body$
DECLARE v_operacion TEXT;
BEGIN
  v_operacion:=CASE NEW.caso WHEN 'OBSERVACIONES' THEN 'CORREGIR_OBSERVACIONES_PLANTACION'
    WHEN 'PARTICIPANTES' THEN 'CORREGIR_PARTICIPANTES_PLANTACION'
    WHEN 'CANTIDAD' THEN 'CORREGIR_CANTIDAD_PLANTACION'
    WHEN 'BAJA_ERRONEA' THEN 'REVERTIR_BAJA_PLANTACION' ELSE 'REVERTIR_REGISTRO_PLANTACION' END;
  IF NOT EXISTS(SELECT 1 FROM public.participacion_comando pc WHERE pc.id=NEW.comando_interno_id
    AND pc.actor_id=NEW.actor_id AND pc.operacion=v_operacion AND pc.estado='CONFIRMADO') THEN
    RAISE EXCEPTION 'PA_INT07_COMANDO_TERMINAL_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$body$),
    ('pa_int07_compensacion_validar',$body$
DECLARE credito public.registro_plantacion_consumo_credito%ROWTYPE;
  c public.registro_plantacion_correccion%ROWTYPE; liberado BIGINT;
BEGIN
  -- Futuro ejecutor debe prebloquear ámbito/hechos/asignaciones antes de esta
  -- etapa de ledger. El lock evita que dos débitos lean el mismo pendiente.
  SELECT * INTO credito FROM public.registro_plantacion_consumo_credito WHERE id=NEW.credito_id FOR UPDATE;
  SELECT * INTO c FROM public.registro_plantacion_correccion WHERE id=NEW.correccion_id;
  IF credito.id IS NULL OR c.id IS NULL OR c.registro_plantacion_id IS DISTINCT FROM credito.registro_plantacion_id
    OR c.caso NOT IN('CANTIDAD','DUPLICADO','REGISTRO_ERRONEO','REPOSICION_ERRONEA')
    OR c.revision_nueva<=credito.revision_origen THEN
    RAISE EXCEPTION 'PA_INT07_COMPENSACION_ORIGEN_INCOMPATIBLE' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(cantidad),0) INTO liberado FROM public.registro_plantacion_consumo_compensacion WHERE credito_id=credito.id;
  IF NEW.cantidad>credito.cantidad-liberado THEN RAISE EXCEPTION 'PA_INT07_COMPENSACION_EXCESIVA' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END
$body$)
  ) helpers(nombre,cuerpo) LOOP
    IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v.nombre) THEN
      IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname=v.nombre)<>1 THEN
        RAISE EXCEPTION 'PA_INT07_HELPER_OVERLOAD_INCOMPATIBLE: %',v.nombre; END IF;
      SELECT q.* INTO v_proc FROM pg_proc q JOIN pg_namespace n ON n.oid=q.pronamespace
        WHERE n.nspname='public' AND q.proname=v.nombre;
      IF v_proc.pronargs<>0 OR v_proc.prorettype<>'trigger'::regtype OR v_proc.prosrc<>v.cuerpo
        OR v_proc.prosecdef OR v_proc.provolatile<>'v' OR v_proc.prokind<>'f'
        OR v_proc.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
        OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']::text[]
        OR v_proc.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) THEN
        RAISE EXCEPTION 'PA_INT07_HELPER_INCOMPATIBLE: %',v.nombre; END IF;
      FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_function_privilege(rol,v_proc.oid,'EXECUTE') THEN
          RAISE EXCEPTION 'PA_INT07_HELPER_PRIVILEGIO_PREEXISTENTE: %',v.nombre;
        END IF;
      END LOOP;
    ELSE
      IF current_setting('pa_int07.reinstalacion')='on' THEN
        RAISE EXCEPTION 'PA_INT07_HELPER_AUSENTE: %',v.nombre; END IF;
      EXECUTE format('CREATE FUNCTION public.%I() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS %L',v.nombre,v.cuerpo);
    END IF;
  END LOOP;
END $install$;

DO $$ DECLARE t TEXT; row_tipo INTEGER; row_fn TEXT; tr RECORD; BEGIN
  FOREACH t IN ARRAY ARRAY['registro_plantacion_grupo_revision','registro_plantacion_correccion',
    'registro_plantacion_efectivo','evento_plantacion_efectivo','registro_plantacion_participante_efectivo',
    'registro_plantacion_consumo_credito','registro_plantacion_consumo_compensacion'] LOOP
    row_tipo:=CASE WHEN t IN('registro_plantacion_correccion','registro_plantacion_consumo_credito','registro_plantacion_consumo_compensacion') THEN 7 ELSE 23 END;
    row_fn:=CASE WHEN t='registro_plantacion_consumo_compensacion' THEN 'pa_int07_compensacion_validar' ELSE 'pa_int07_persistencia_validar' END;
    IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||t) AND NOT tgisinternal
      AND tgname NOT IN('pa_int07_validar','pa_int07_conservar')
      AND NOT (t='registro_plantacion_correccion' AND tgname='pa_int07_terminal')) THEN RAISE EXCEPTION 'PA_INT07_TRIGGER_AJENO: %',t; END IF;
    FOR tr IN SELECT * FROM (VALUES('pa_int07_validar',row_tipo,row_fn),
      ('pa_int07_conservar',CASE WHEN row_tipo=7 THEN 58 ELSE 42 END,'pa_int07_persistencia_conservar')) e(nombre,tipo,funcion) LOOP
      IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||t) AND tgname=tr.nombre) THEN
        IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||t) AND tgname=tr.nombre
          AND tgtype=tr.tipo AND tgfoid=to_regprocedure('public.'||tr.funcion||'()')
          AND tgenabled='O' AND NOT tgisinternal AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector) THEN
          RAISE EXCEPTION 'PA_INT07_TRIGGER_INCOMPATIBLE: %.%',t,tr.nombre; END IF;
      ELSE
        IF current_setting('pa_int07.reinstalacion')='on' THEN
          RAISE EXCEPTION 'PA_INT07_TRIGGER_AUSENTE: %.%',t,tr.nombre; END IF;
        EXECUTE format('CREATE TRIGGER %I BEFORE %s ON public.%I FOR EACH %s EXECUTE FUNCTION public.%I()',
          tr.nombre,CASE WHEN tr.nombre='pa_int07_validar' THEN CASE WHEN row_tipo=7 THEN 'INSERT' ELSE 'INSERT OR UPDATE' END
            ELSE CASE WHEN row_tipo=7 THEN 'UPDATE OR DELETE OR TRUNCATE' ELSE 'DELETE OR TRUNCATE' END END,
          t,CASE WHEN tr.nombre='pa_int07_validar' THEN 'ROW' ELSE 'STATEMENT' END,tr.funcion);
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.registro_plantacion_correccion'::regclass AND tgname='pa_int07_terminal') THEN
    IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.registro_plantacion_correccion'::regclass
      AND tgname='pa_int07_terminal' AND tgtype=5 AND tgenabled='O' AND NOT tgisinternal
      AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector
      AND tgfoid='public.pa_int07_persistencia_terminal()'::regprocedure
      AND EXISTS(SELECT 1 FROM pg_constraint q WHERE q.oid=tgconstraint AND q.contype='t'
        AND q.conrelid='public.registro_plantacion_correccion'::regclass AND q.condeferrable AND q.condeferred)) THEN
      RAISE EXCEPTION 'PA_INT07_TERMINAL_TRIGGER_INCOMPATIBLE'; END IF;
  ELSE
    IF current_setting('pa_int07.reinstalacion')='on' THEN RAISE EXCEPTION 'PA_INT07_TERMINAL_TRIGGER_AUSENTE'; END IF;
    CREATE CONSTRAINT TRIGGER pa_int07_terminal AFTER INSERT ON public.registro_plantacion_correccion
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pa_int07_persistencia_terminal();
  END IF;
END $$;

DO $$ DECLARE x RECORD; t TEXT; real_oid OID; esperado_oid OID;
  esquema_ref TEXT:='pa_int07_catalogo_'||pg_backend_pid();
BEGIN
  FOR x IN SELECT * FROM (VALUES
    ('pa_int07_correccion_registro_idx','registro_plantacion_correccion','registro_plantacion_id,id','registro_plantacion_id IS NOT NULL',false),
    ('pa_int07_correccion_evento_idx','registro_plantacion_correccion','evento_plantacion_id,id','evento_plantacion_id IS NOT NULL',false),
    ('pa_int07_correccion_registro_revision_uq','registro_plantacion_correccion','registro_plantacion_id,revision_nueva','registro_plantacion_id IS NOT NULL',true),
    ('pa_int07_correccion_evento_revision_uq','registro_plantacion_correccion','evento_plantacion_id,revision_nueva','evento_plantacion_id IS NOT NULL',true),
    ('pa_int07_correccion_grupo_revision_uq','registro_plantacion_correccion','grupo_registro_id,revision_grupo_nueva','caso NOT IN(''OBSERVACIONES'',''PARTICIPANTES'')',true),
    ('pa_int07_correccion_grupo_idx','registro_plantacion_correccion','grupo_registro_id,id',NULL,false),
    ('pa_int07_correccion_referencia_idx','registro_plantacion_correccion','referencia_registro_vigente_id','referencia_registro_vigente_id IS NOT NULL',false),
    ('pa_int07_participante_usuario_idx','registro_plantacion_participante_efectivo','usuario_id,registro_plantacion_id','estado=''PRESENTE''',false),
    ('pa_int07_credito_registro_idx','registro_plantacion_consumo_credito','registro_plantacion_id,planta_id,id',NULL,false),
    ('pa_int07_credito_asignacion_idx','registro_plantacion_consumo_credito','asignacion_id,id',NULL,false),
    ('pa_int07_compensacion_credito_idx','registro_plantacion_consumo_compensacion','credito_id,id',NULL,false)
  ) indices(nombre,tabla,columnas,predicado,unico) LOOP
    IF current_setting('pa_int07.reinstalacion')='on' AND NOT EXISTS(SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indexrelid=c.oid
      WHERE n.nspname='public' AND c.relname=x.nombre AND i.indrelid=to_regclass('public.'||x.tabla)) THEN
      RAISE EXCEPTION 'PA_INT07_INDICE_AUSENTE: %',x.nombre; END IF;
    EXECUTE format('CREATE %s INDEX IF NOT EXISTS %I ON public.%I (%s)%s',CASE WHEN x.unico THEN 'UNIQUE' ELSE '' END,x.nombre,x.tabla,x.columnas,
      CASE WHEN x.predicado IS NULL THEN '' ELSE ' WHERE '||x.predicado END);
    EXECUTE format('CREATE %s INDEX %I ON %I.%I (%s)%s',CASE WHEN x.unico THEN 'UNIQUE' ELSE '' END,x.nombre,esquema_ref,'pa_int07_e_'||substr(md5(x.tabla),1,12),x.columnas,
      CASE WHEN x.predicado IS NULL THEN '' ELSE ' WHERE '||x.predicado END);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['registro_plantacion_grupo_revision','registro_plantacion_correccion',
    'registro_plantacion_efectivo','evento_plantacion_efectivo','registro_plantacion_participante_efectivo',
    'registro_plantacion_consumo_credito','registro_plantacion_consumo_compensacion'] LOOP
    real_oid:=to_regclass('public.'||t);
    esperado_oid:=to_regclass(esquema_ref||'.pa_int07_e_'||substr(md5(t),1,12));
    IF (SELECT count(*) FROM pg_index WHERE indrelid=real_oid)<>(SELECT count(*) FROM pg_index WHERE indrelid=esperado_oid)
      OR EXISTS(WITH indices AS (
        SELECT i.indrelid,i.indisunique,i.indisprimary,i.indisexclusion,i.indisvalid,i.indisready,i.indislive,
          i.indimmediate,i.indnkeyatts,i.indnatts,i.indkey::text,i.indcollation::text,i.indclass::text,i.indoption::text,
          pg_get_expr(i.indexprs,i.indrelid) expresiones,pg_get_expr(i.indpred,i.indrelid) predicado,c.relam
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid IN(real_oid,esperado_oid)),
      real AS(SELECT indisunique,indisprimary,indisexclusion,indisvalid,indisready,indislive,indimmediate,
        indnkeyatts,indnatts,indkey,indcollation,indclass,indoption,expresiones,predicado,relam FROM indices WHERE indrelid=real_oid),
      esperado AS(SELECT indisunique,indisprimary,indisexclusion,indisvalid,indisready,indislive,indimmediate,
        indnkeyatts,indnatts,indkey,indcollation,indclass,indoption,expresiones,predicado,relam FROM indices WHERE indrelid=esperado_oid)
      (SELECT * FROM real EXCEPT SELECT * FROM esperado) UNION ALL (SELECT * FROM esperado EXCEPT SELECT * FROM real)) THEN
      RAISE EXCEPTION 'PA_INT07_INDICES_INCOMPATIBLES: %',t;
    END IF;
  END LOOP;
END $$;

-- Sin DML ni USAGE de secuencias para servicio en este corte parcial. SELECT
-- privado puede usarse con BYPASSRLS del servicio; no se añade policy pública.
DO $$ DECLARE t TEXT; columnas TEXT; sec TEXT; rol TEXT; f RECORD; BEGIN
  FOREACH t IN ARRAY ARRAY['registro_plantacion_grupo_revision','registro_plantacion_correccion',
    'registro_plantacion_efectivo','evento_plantacion_efectivo','registro_plantacion_participante_efectivo',
    'registro_plantacion_consumo_credito','registro_plantacion_consumo_compensacion'] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
      WHERE attrelid=to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE SELECT (%s),INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role',t);
    sec:=CASE WHEN t IN('registro_plantacion_correccion','registro_plantacion_consumo_credito',
      'registro_plantacion_consumo_compensacion') THEN pg_get_serial_sequence('public.'||t,'id') ELSE NULL END;
    IF sec IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC,anon,authenticated,service_role',sec);
      FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF has_sequence_privilege(rol,sec,'SELECT,UPDATE,USAGE') THEN
          RAISE EXCEPTION 'PA_INT07_SECUENCIA_PRIVILEGIO_HEREDADO: %.%',rol,t; END IF;
      END LOOP;
    END IF;
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF (rol<>'service_role' AND has_any_column_privilege(rol,'public.'||t,'SELECT'))
        OR has_any_column_privilege(rol,'public.'||t,'INSERT')
        OR has_any_column_privilege(rol,'public.'||t,'UPDATE')
        OR has_any_column_privilege(rol,'public.'||t,'REFERENCES')
        OR has_table_privilege(rol,'public.'||t,'DELETE,TRUNCATE,TRIGGER') THEN
        RAISE EXCEPTION 'PA_INT07_PRIVILEGIO_HEREDADO: %.%',rol,t; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('public.'||t)) THEN
      RAISE EXCEPTION 'PA_INT07_POLITICA_NO_ADMITIDA: %',t; END IF;
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('pa_int07_persistencia_conservar','pa_int07_persistencia_validar','pa_int07_persistencia_terminal','pa_int07_compensacion_validar') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.firma);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_function_privilege(rol,f.firma,'EXECUTE') THEN RAISE EXCEPTION 'PA_INT07_HELPER_PRIVILEGIO_HEREDADO: %',rol; END IF;
    END LOOP;
  END LOOP;
END $$;
DO $$ DECLARE esquema_ref TEXT:='pa_int07_catalogo_'||pg_backend_pid(); BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=esquema_ref
    AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
    RAISE EXCEPTION 'PA_INT07_ESQUEMA_REFERENCIA_INCOMPATIBLE'; END IF;
  EXECUTE format('DROP SCHEMA %I CASCADE',esquema_ref);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
