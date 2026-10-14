-- PA-T-INT02-A. Incremento posterior a 064 aplicada, según catálogo de desarrollo.
-- ACL observada 2026-10-13 21:07:17 UTC: anon/authenticated conservan rDxtm.
-- Revoca TRUNCATE, REFERENCES, TRIGGER y MAINTAIN de usuario para roles públicos.
-- Ejecutar completo; la comprobación de privilegios se realiza antes de COMMIT.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$ BEGIN
  IF to_regclass('public.usuario') IS NULL OR
     to_regprocedure('public.pa_actor_verificar(text)') IS NULL OR
     to_regprocedure('public.pa_perfil_leer(bigint,text)') IS NULL OR
     to_regprocedure('public.pa_perfil_actualizar(bigint,text,boolean,text,boolean,text,boolean,bigint,text,jsonb)') IS NULL OR
     to_regprocedure('public.pa_organizaciones_seleccionables(bigint,text,text,bigint,integer)') IS NULL OR
     to_regprocedure('public.pa_perfil_foto_actualizar(bigint,text,text)') IS NULL THEN
    RAISE EXCEPTION 'APLICAR_064_ANTES_DE_065';
  END IF;
END $$;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.usuario FROM PUBLIC, anon, authenticated;
DO $$ DECLARE v_columnas TEXT; BEGIN
  SELECT string_agg(quote_ident(attname),', ' ORDER BY attnum) INTO v_columnas
  FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE REFERENCES (%s) ON public.usuario FROM PUBLIC, anon, authenticated',v_columnas);
  -- MAINTAIN existe desde PostgreSQL 17; EXECUTE permite ensayos aislados en 14.
  IF current_setting('server_version_num')::integer>=170000 THEN
    EXECUTE 'REVOKE MAINTAIN ON TABLE public.usuario FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

DO $$ DECLARE v_rol TEXT; BEGIN
  FOREACH v_rol IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_any_column_privilege(v_rol,'public.usuario','INSERT') OR
       has_any_column_privilege(v_rol,'public.usuario','UPDATE') OR
       has_any_column_privilege(v_rol,'public.usuario','REFERENCES') OR
       has_table_privilege(v_rol,'public.usuario','DELETE') OR
       has_table_privilege(v_rol,'public.usuario','TRUNCATE') OR
       has_table_privilege(v_rol,'public.usuario','TRIGGER') THEN
      RAISE EXCEPTION 'PRIVILEGIO_RESIDUAL_REQUIERE_REVISION: %',v_rol;
    END IF;
    IF current_setting('server_version_num')::integer>=170000 THEN
      IF has_table_privilege(v_rol,'public.usuario','MAINTAIN') THEN
        RAISE EXCEPTION 'MAINTAIN_RESIDUAL_REQUIERE_REVISION: %',v_rol;
      END IF;
    END IF;
  END LOOP;
END $$;
COMMIT;

SELECT jsonb_build_object(
  'resultado','PERMISOS_RESIDUALES_CONFIRMADOS',
  'observado_en',current_timestamp,
  'servidor',current_setting('server_version'),
  'cuentas',(SELECT count(*) FROM public.usuario),
  'roles',(SELECT jsonb_agg(jsonb_build_object('rol',rol,'cuentas',cuentas) ORDER BY rol)
    FROM (SELECT rol::text AS rol,count(*) AS cuentas FROM public.usuario GROUP BY rol) r),
  'usuario_privilegios',(SELECT jsonb_agg(jsonb_build_object(
    'rol',rolname,'select',has_any_column_privilege(oid,'public.usuario','SELECT'),
    'insert',has_any_column_privilege(oid,'public.usuario','INSERT'),
    'update',has_any_column_privilege(oid,'public.usuario','UPDATE'),
    'delete',has_table_privilege(oid,'public.usuario','DELETE'),
    'truncate',has_table_privilege(oid,'public.usuario','TRUNCATE'),
    'references',has_any_column_privilege(oid,'public.usuario','REFERENCES'),
    'trigger',has_table_privilege(oid,'public.usuario','TRIGGER'),
    'maintain',CASE WHEN current_setting('server_version_num')::integer>=170000
      THEN has_table_privilege(oid,'public.usuario','MAINTAIN') ELSE NULL END
    ) ORDER BY rolname) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))
) AS verificacion_065;
