-- PA-T-INT02-D. Alcance local reducido autorizado por Pablo el16-10-2026:
-- diez tablas, una vista y cuatro catálogos. Sin RLS nuevo, datos o grants de servicio.
-- Cotejar preflight en destino; aplicación SQL remota no autorizada aquí.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
-- Solo consultas; no revoca ni concede objetos fuera del inventario autorizado.
DO $$ DECLARE t TEXT; r TEXT; perm TEXT; objeto RECORD; c TEXT;
 targets TEXT[]:=ARRAY['asignacion_vivero_subcampania','registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion','evidencias_trazabilidad','subcampania_equipo','subcampania','lote_vivero','evento_lote_vivero'];
BEGIN
 FOREACH t IN ARRAY targets LOOP
  IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'PA_D_RELACION_REQUERIDA: %',t; END IF;
  -- Se exige SELECT ya existente. FOR SHARE/UPDATE necesita UPDATE donde aplica.
  IF NOT has_table_privilege('service_role','public.'||t,'SELECT') THEN RAISE EXCEPTION 'PA_D_SERVICE_SIN_SELECT: %',t; END IF;
  FOREACH perm IN ARRAY CASE
   WHEN t IN('asignacion_vivero_subcampania','registro_plantacion','evidencias_trazabilidad','subcampania','lote_vivero') THEN ARRAY['INSERT','UPDATE']
   WHEN t='subcampania_equipo' THEN ARRAY['INSERT','DELETE'] ELSE ARRAY['INSERT'] END LOOP
   IF NOT has_table_privilege('service_role','public.'||t,perm) THEN RAISE EXCEPTION 'PA_D_SERVICE_SIN_PRIVILEGIO: % %',t,perm; END IF;
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['planta','tipo_planta','comunidad','division_administrativa'] LOOP
  IF t<>'tipo_planta' AND to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'PA_D_CATALOGO_REQUERIDO: %',t; END IF;
  IF to_regclass('public.'||t) IS NOT NULL THEN
   FOREACH perm IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
    IF NOT has_table_privilege('service_role','public.'||t,perm) THEN RAISE EXCEPTION 'PA_D_CATALOGO_SERVICE_SIN_PRIVILEGIO: % %',t,perm; END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF to_regclass('public.v_lote_vivero_saldos') IS NOT NULL AND NOT has_table_privilege('service_role','public.v_lote_vivero_saldos','SELECT') THEN RAISE EXCEPTION 'PA_D_SERVICE_SIN_VISTA'; END IF;
 -- Objetos fuera de080: únicamente verificar, nunca mutar por inferencia.
 FOREACH t IN ARRAY ARRAY['subcampania_meta_especie','campania','campania_organizacion','campania_estado','v_lote_vivero_saldos'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF t='subcampania_meta_especie' AND has_any_column_privilege(r,'public.'||t,'SELECT') THEN RAISE EXCEPTION 'PA_D_FUERA_ALCANCE_SELECT_PUBLICO: % %',t,r; END IF;
    IF has_any_column_privilege(r,'public.'||t,'INSERT') OR has_any_column_privilege(r,'public.'||t,'UPDATE') OR has_any_column_privilege(r,'public.'||t,'REFERENCES')
      OR has_table_privilege(r,'public.'||t,'DELETE') OR has_table_privilege(r,'public.'||t,'TRUNCATE') OR has_table_privilege(r,'public.'||t,'TRIGGER') THEN
      RAISE EXCEPTION 'PA_D_FUERA_ALCANCE_DML_PUBLICO: % %',t,r;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 FOR objeto IN WITH RECURSIVE dependientes AS (
  SELECT cl.oid FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=ANY(targets)
  UNION SELECT cl.oid FROM pg_class cl JOIN pg_rewrite rw ON rw.ev_class=cl.oid JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass JOIN dependientes prev ON prev.oid=d.refobjid WHERE cl.relkind IN('v','m')
 ) SELECT cl.oid,cl.relname FROM dependientes d JOIN pg_class cl ON cl.oid=d.oid WHERE cl.relkind IN('v','m') AND cl.oid IS DISTINCT FROM to_regclass('public.campania_estado')::oid AND cl.oid IS DISTINCT FROM to_regclass('public.v_lote_vivero_saldos')::oid LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_any_column_privilege(r,objeto.oid,'SELECT') OR has_any_column_privilege(r,objeto.oid,'INSERT') OR has_any_column_privilege(r,objeto.oid,'UPDATE') OR has_table_privilege(r,objeto.oid,'DELETE') THEN
    RAISE EXCEPTION 'PA_D_VISTA_PUBLICA_NO_AUTORIZADA: % %',objeto.oid::regclass,r;
   END IF;
  END LOOP;
 END LOOP;
 FOR objeto IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND (p.prosrc ~* '\m(usuario|subcampania|campania|registro_plantacion|asignacion_vivero_subcampania|lote_vivero|evidencias_trazabilidad)\M' OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania')) LOOP
  IF has_function_privilege('anon',objeto.oid,'EXECUTE') OR has_function_privilege('authenticated',objeto.oid,'EXECUTE') THEN RAISE EXCEPTION 'PA_D_DEFINER_PUBLICO_NO_AUTORIZADO: %',objeto.oid::regprocedure; END IF;
 END LOOP;
END $$;

DO $$ DECLARE t TEXT; cols TEXT; r TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['asignacion_vivero_subcampania','registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion','evidencias_trazabilidad','subcampania_equipo','subcampania','lote_vivero','evento_lote_vivero'] LOOP
  EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT (%s),INSERT (%s),UPDATE (%s),REFERENCES (%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,cols,t);
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_any_column_privilege(r,'public.'||t,'SELECT') OR has_any_column_privilege(r,'public.'||t,'INSERT') OR has_any_column_privilege(r,'public.'||t,'UPDATE') OR has_any_column_privilege(r,'public.'||t,'REFERENCES') OR has_table_privilege(r,'public.'||t,'DELETE') OR has_table_privilege(r,'public.'||t,'TRUNCATE') OR has_table_privilege(r,'public.'||t,'TRIGGER') THEN
    RAISE EXCEPTION 'PA_D_PRIVILEGIO_HEREDADO_REQUIERE_REVISION: % %',t,r;
   END IF;
  END LOOP;
 END LOOP;
 IF to_regclass('public.v_lote_vivero_saldos') IS NOT NULL THEN
  REVOKE SELECT ON public.v_lote_vivero_saldos FROM PUBLIC,anon,authenticated;
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid='public.v_lote_vivero_saldos'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT (%s) ON public.v_lote_vivero_saldos FROM PUBLIC,anon,authenticated',cols);
  IF has_any_column_privilege('anon','public.v_lote_vivero_saldos','SELECT') OR has_any_column_privilege('authenticated','public.v_lote_vivero_saldos','SELECT') THEN RAISE EXCEPTION 'PA_D_VISTA_GRANT_HEREDADO'; END IF;
 END IF;
 FOREACH t IN ARRAY ARRAY['planta','tipo_planta','comunidad','division_administrativa'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.%I FROM PUBLIC,anon,authenticated',t);
   SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=('public.'||t)::regclass AND attnum>0 AND NOT attisdropped;
   EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON TABLE public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,t);
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(r,'public.'||t,'INSERT') OR has_any_column_privilege(r,'public.'||t,'UPDATE') OR has_any_column_privilege(r,'public.'||t,'REFERENCES') OR has_table_privilege(r,'public.'||t,'DELETE') OR has_table_privilege(r,'public.'||t,'TRUNCATE') OR has_table_privilege(r,'public.'||t,'TRIGGER') THEN RAISE EXCEPTION 'PA_D_CATALOGO_HEREDADO_REQUIERE_REVISION: % %',t,r; END IF;
   END LOOP;
  END IF;
 END LOOP;
END $$;
-- Solo consultas; no revoca ni concede objetos fuera del inventario autorizado.
DO $$ DECLARE t TEXT; r TEXT; perm TEXT; objeto RECORD; c TEXT;
 targets TEXT[]:=ARRAY['asignacion_vivero_subcampania','registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion','evidencias_trazabilidad','subcampania_equipo','subcampania','lote_vivero','evento_lote_vivero'];
BEGIN
 FOREACH t IN ARRAY targets LOOP
  IF to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'PA_D_RELACION_REQUERIDA: %',t; END IF;
  -- Se exige SELECT ya existente. FOR SHARE/UPDATE necesita UPDATE donde aplica.
  IF NOT has_table_privilege('service_role','public.'||t,'SELECT') THEN RAISE EXCEPTION 'PA_D_SERVICE_SIN_SELECT: %',t; END IF;
  FOREACH perm IN ARRAY CASE
   WHEN t IN('asignacion_vivero_subcampania','registro_plantacion','evidencias_trazabilidad','subcampania','lote_vivero') THEN ARRAY['INSERT','UPDATE']
   WHEN t='subcampania_equipo' THEN ARRAY['INSERT','DELETE'] ELSE ARRAY['INSERT'] END LOOP
   IF NOT has_table_privilege('service_role','public.'||t,perm) THEN RAISE EXCEPTION 'PA_D_SERVICE_SIN_PRIVILEGIO: % %',t,perm; END IF;
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['planta','tipo_planta','comunidad','division_administrativa'] LOOP
  IF t<>'tipo_planta' AND to_regclass('public.'||t) IS NULL THEN RAISE EXCEPTION 'PA_D_CATALOGO_REQUERIDO: %',t; END IF;
  IF to_regclass('public.'||t) IS NOT NULL THEN
   FOREACH perm IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
    IF NOT has_table_privilege('service_role','public.'||t,perm) THEN RAISE EXCEPTION 'PA_D_CATALOGO_SERVICE_SIN_PRIVILEGIO: % %',t,perm; END IF;
   END LOOP;
  END IF;
 END LOOP;
 IF to_regclass('public.v_lote_vivero_saldos') IS NOT NULL AND NOT has_table_privilege('service_role','public.v_lote_vivero_saldos','SELECT') THEN RAISE EXCEPTION 'PA_D_SERVICE_SIN_VISTA'; END IF;
 -- Objetos fuera de080: únicamente verificar, nunca mutar por inferencia.
 FOREACH t IN ARRAY ARRAY['subcampania_meta_especie','campania','campania_organizacion','campania_estado','v_lote_vivero_saldos'] LOOP
  IF to_regclass('public.'||t) IS NOT NULL THEN
   FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF t='subcampania_meta_especie' AND has_any_column_privilege(r,'public.'||t,'SELECT') THEN RAISE EXCEPTION 'PA_D_FUERA_ALCANCE_SELECT_PUBLICO: % %',t,r; END IF;
    IF has_any_column_privilege(r,'public.'||t,'INSERT') OR has_any_column_privilege(r,'public.'||t,'UPDATE') OR has_any_column_privilege(r,'public.'||t,'REFERENCES')
      OR has_table_privilege(r,'public.'||t,'DELETE') OR has_table_privilege(r,'public.'||t,'TRUNCATE') OR has_table_privilege(r,'public.'||t,'TRIGGER') THEN
      RAISE EXCEPTION 'PA_D_FUERA_ALCANCE_DML_PUBLICO: % %',t,r;
    END IF;
   END LOOP;
  END IF;
 END LOOP;
 FOR objeto IN WITH RECURSIVE dependientes AS (
  SELECT cl.oid FROM pg_class cl JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='public' AND cl.relname=ANY(targets)
  UNION SELECT cl.oid FROM pg_class cl JOIN pg_rewrite rw ON rw.ev_class=cl.oid JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass JOIN dependientes prev ON prev.oid=d.refobjid WHERE cl.relkind IN('v','m')
 ) SELECT cl.oid,cl.relname FROM dependientes d JOIN pg_class cl ON cl.oid=d.oid WHERE cl.relkind IN('v','m') AND cl.oid IS DISTINCT FROM to_regclass('public.campania_estado')::oid AND cl.oid IS DISTINCT FROM to_regclass('public.v_lote_vivero_saldos')::oid LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_any_column_privilege(r,objeto.oid,'SELECT') OR has_any_column_privilege(r,objeto.oid,'INSERT') OR has_any_column_privilege(r,objeto.oid,'UPDATE') OR has_table_privilege(r,objeto.oid,'DELETE') THEN
    RAISE EXCEPTION 'PA_D_VISTA_PUBLICA_NO_AUTORIZADA: % %',objeto.oid::regclass,r;
   END IF;
  END LOOP;
 END LOOP;
 FOR objeto IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND (p.prosrc ~* '\m(usuario|subcampania|campania|registro_plantacion|asignacion_vivero_subcampania|lote_vivero|evidencias_trazabilidad)\M' OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania')) LOOP
  IF has_function_privilege('anon',objeto.oid,'EXECUTE') OR has_function_privilege('authenticated',objeto.oid,'EXECUTE') THEN RAISE EXCEPTION 'PA_D_DEFINER_PUBLICO_NO_AUTORIZADO: %',objeto.oid::regprocedure; END IF;
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
