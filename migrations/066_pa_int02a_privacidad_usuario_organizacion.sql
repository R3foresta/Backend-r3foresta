-- PA-T-INT02-A: aplicar después de adaptar consumidores privados al backend.
-- Preflight de desarrollo 2026-10-14: 39 cuentas, RLS=false, sin vistas de usuario,
-- RPC consumidoras SECURITY INVOKER. No usa auth.uid(): JWT app sub=auth_id.
-- Inventario adicional: usuario_credencial tiene lectura/escritura pública; se cierra
-- junto con usuario para preservar la integridad de WebAuthn. Backend ya usa service_role.
-- No cambia filas, roles de cuenta, proyecciones públicas de Impacto ni 064/065.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
  IF to_regprocedure('public.pa_actor_verificar(text)') IS NULL OR
     to_regprocedure('public.pa_organizaciones_seleccionables(bigint,text,text,bigint,integer)') IS NULL THEN
    RAISE EXCEPTION 'APLICAR_064_ANTES_DE_066';
  END IF;
END $$;

REVOKE ALL PRIVILEGES ON TABLE public.usuario FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.usuario_credencial FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.organizacion FROM PUBLIC, anon, authenticated;
DO $$ DECLARE tabla TEXT; columnas TEXT; BEGIN
  FOREACH tabla IN ARRAY ARRAY['usuario','usuario_credencial','organizacion'] LOOP
    SELECT string_agg(quote_ident(attname),', ' ORDER BY attnum) INTO columnas
    FROM pg_attribute WHERE attrelid=format('public.%I',tabla)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated',columnas,columnas,columnas,tabla);
    IF tabla IN ('usuario','usuario_credencial') THEN
      EXECUTE format('REVOKE SELECT (%s) ON public.%I FROM PUBLIC, anon, authenticated',columnas,tabla);
    END IF;
    IF current_setting('server_version_num')::integer>=170000 THEN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM PUBLIC, anon, authenticated',tabla);
    END IF;
  END LOOP;
END $$;

-- Cierra cada sobrecarga de las RPC inventariadas, incluidas las invoker.
-- Evita que una función legada vuelva a ser una entrada pública tras otro GRANT.
DO $$ DECLARE f RECORD; BEGIN
  FOR f IN SELECT p.oid, p.oid::regprocedure::text AS firma
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.proname=ANY(ARRAY[
      'pa_actor_verificar','pa_perfil_leer','pa_perfil_actualizar',
      'pa_organizaciones_seleccionables','pa_perfil_foto_actualizar',
      'fn_campania_desactivar_sin_plantaciones','fn_subcampania_cancelar',
      'fn_subcampania_cancelar_interna','fn_subcampania_revisar_plan',
      'fn_m3_devolver_asignacion_vivero','fn_m3_registrar_plantacion',
      'fn_recoleccion_registrar_desecho','fn_vivero_asignar_stock_subcampania',
      'fn_vivero_crear_lote_desde_recoleccion','fn_vivero_registrar_adaptabilidad',
      'fn_vivero_registrar_descarte_pre_embolsado','fn_vivero_registrar_despacho',
      'fn_vivero_registrar_embolsado','fn_vivero_registrar_merma'
    ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.firma);
    -- No se amplían privilegios del servicio: el preflight debe confirmar su acceso.
    IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'SERVICE_ROLE_SIN_EXECUTE: %',f.firma;
    END IF;
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'EXECUTE_HEREDADO_REQUIERE_REVISION: %',f.firma;
    END IF;
  END LOOP;
END $$;

-- Ante drift, aborta íntegro: no declara privacidad si aparece una vista o definer
-- accesible. Revisar ese objeto y añadir un incremento concreto antes de continuar.
DO $$ DECLARE objeto RECORD; rol TEXT; tabla TEXT; BEGIN
  FOR objeto IN
    WITH RECURSIVE vistas AS (
      SELECT DISTINCT c.oid FROM pg_class c JOIN pg_rewrite rw ON rw.ev_class=c.oid
      JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass
      WHERE c.relkind IN ('v','m') AND d.refobjid IN ('public.usuario'::regclass,'public.usuario_credencial'::regclass)
      UNION
      SELECT c.oid FROM pg_class c JOIN pg_rewrite rw ON rw.ev_class=c.oid
      JOIN pg_depend d ON d.objid=rw.oid AND d.classid='pg_rewrite'::regclass
      JOIN vistas v ON v.oid=d.refobjid WHERE c.relkind IN ('v','m')
    ) SELECT oid FROM vistas
  LOOP
    IF has_any_column_privilege('anon',objeto.oid,'SELECT') OR has_any_column_privilege('authenticated',objeto.oid,'SELECT') THEN
      RAISE EXCEPTION 'VISTA_PRIVADA_PUBLICA_REQUIERE_REVISION: %',objeto.oid::regclass;
    END IF;
  END LOOP;
  FOR objeto IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
      AND p.prosrc ~* '\m(usuario|usuario_credencial|organizacion)\M'
  LOOP
    IF has_function_privilege('anon',objeto.oid,'EXECUTE') OR has_function_privilege('authenticated',objeto.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'DEFINER_PUBLICO_REQUIERE_REVISION: %',objeto.oid::regprocedure;
    END IF;
  END LOOP;
  FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(rol,'public.usuario','SELECT') OR has_any_column_privilege(rol,'public.usuario_credencial','SELECT') THEN
      RAISE EXCEPTION 'SELECT_USUARIO_RESIDUAL: %',rol;
    END IF;
    FOREACH tabla IN ARRAY ARRAY['public.usuario','public.usuario_credencial','public.organizacion'] LOOP
      IF has_any_column_privilege(rol,tabla,'INSERT') OR has_any_column_privilege(rol,tabla,'UPDATE') OR
         has_any_column_privilege(rol,tabla,'REFERENCES') OR has_table_privilege(rol,tabla,'DELETE') OR
         has_table_privilege(rol,tabla,'TRUNCATE') OR has_table_privilege(rol,tabla,'TRIGGER') THEN
        RAISE EXCEPTION 'ESCRITURA_RESIDUAL: % %',rol,tabla;
      END IF;
      IF current_setting('server_version_num')::integer>=170000 THEN
        IF has_table_privilege(rol,tabla,'MAINTAIN') THEN
          RAISE EXCEPTION 'MAINTAIN_RESIDUAL: % %',rol,tabla;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH tabla IN ARRAY ARRAY['public.usuario','public.usuario_credencial','public.organizacion'] LOOP
    FOREACH rol IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF NOT has_table_privilege('service_role',tabla,rol) THEN
        RAISE EXCEPTION 'SERVICE_ROLE_SIN_PRIVILEGIO: % %',tabla,rol;
      END IF;
    END LOOP;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'PRIVACIDAD_USUARIO_ORGANIZACION_CONFIRMADA' AS resultado;
