-- CONCILIACIÓN CON ESCRITURA, previa a 064. Entorno de desarrollo identificado.
-- Manifest revisado: 2026-10-13 20:51:56 UTC. IDs 1..8, sin passkeys/FK a auth_id.
-- Roles: 2 y 7 VOLUNTARIO; 1,3,4,5,6,8 GENERAL. Los ocho auth_id están vacíos.
-- Solo reemplaza esos auth_id vacíos por pa_legacy_<id>. Un cambio de manifest
-- o una cuenta vacía adicional ABORTA todo. Repetir tras éxito produce 0 cambios.
-- No crea passkeys ni cuentas, ni cambia PK, rol, actividad, revisión o perfil.
-- Cualquier identidad no vacía duplicada/credencial/colisión/FK a auth_id ABORTA todo.
-- Ejecutar el archivo completo; el resultado se emite después de COMMIT.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Bloquear escritores evita que se agregue una passkey después de comprobarla.
-- Orden técnico: cuentas, después credenciales. No hay HTTP bajo estos locks.
LOCK TABLE public.usuario IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.usuario_credencial IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE pa_int02a_auth_esperadas ON COMMIT DROP AS
SELECT usuario_id,rol_global,'pa_legacy_' || usuario_id::text AS auth_id_nuevo
FROM (VALUES
  (1::bigint,'GENERAL'),(2,'VOLUNTARIO'),(3,'GENERAL'),(4,'GENERAL'),
  (5,'GENERAL'),(6,'GENERAL'),(7,'VOLUNTARIO'),(8,'GENERAL')
) AS manifest(usuario_id,rol_global);
CREATE TEMP TABLE pa_int02a_auth_conciliacion ON COMMIT PRESERVE ROWS AS
SELECT u.id AS usuario_id,u.rol::text AS rol_global,
       'VACIO'::text AS estado_anterior,e.auth_id_nuevo
FROM public.usuario u JOIN pg_temp.pa_int02a_auth_esperadas e ON e.usuario_id=u.id
WHERE u.auth_id IS NOT NULL AND btrim(u.auth_id)='' ORDER BY u.id;

DO $$ DECLARE v_actualizadas BIGINT; v_esperadas BIGINT; BEGIN
  IF EXISTS(SELECT 1 FROM public.usuario WHERE auth_id IS NOT NULL AND btrim(auth_id)<>''
    GROUP BY auth_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'IDENTIDAD_DUPLICADA_NO_VACIA_REQUIERE_REVISION';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.pa_int02a_auth_conciliacion WHERE usuario_id<=0) THEN
    RAISE EXCEPTION 'ID_LEGADO_NO_POSITIVO_REQUIERE_REVISION';
  END IF;
  IF EXISTS(SELECT 1 FROM public.usuario_credencial c
    JOIN pg_temp.pa_int02a_auth_conciliacion m ON m.usuario_id=c.usuario_id) THEN
    RAISE EXCEPTION 'CUENTA_CON_CREDENCIAL_REQUIERE_REVISION';
  END IF;
  IF EXISTS(SELECT 1 FROM public.usuario u
    JOIN pg_temp.pa_int02a_auth_conciliacion m ON m.auth_id_nuevo=u.auth_id AND m.usuario_id<>u.id) THEN
    RAISE EXCEPTION 'IDENTIFICADOR_LEGADO_OCUPADO';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint con
    WHERE con.contype='f' AND con.confrelid='public.usuario'::regclass AND
    (SELECT attnum FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attname='auth_id')=ANY(con.confkey)) THEN
    RAISE EXCEPTION 'FK_AUTH_ID_REQUIERE_REVISION';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.pa_int02a_auth_esperadas e
    LEFT JOIN public.usuario u ON u.id=e.usuario_id
    WHERE u.id IS NULL OR u.rol::text IS DISTINCT FROM e.rol_global OR u.auth_id IS NULL
      OR (btrim(u.auth_id)<>'' AND u.auth_id IS DISTINCT FROM e.auth_id_nuevo)) THEN
    RAISE EXCEPTION 'MANIFEST_IDENTIDAD_CAMBIADO_REQUIERE_REVISION';
  END IF;
  IF EXISTS(SELECT 1 FROM public.usuario u
    WHERE (u.auth_id IS NULL OR btrim(u.auth_id)='') AND
      NOT EXISTS(SELECT 1 FROM pg_temp.pa_int02a_auth_esperadas e WHERE e.usuario_id=u.id)) THEN
    RAISE EXCEPTION 'IDENTIDAD_AFECTADA_FUERA_DEL_MANIFEST';
  END IF;
  SELECT count(*) INTO v_esperadas FROM pg_temp.pa_int02a_auth_conciliacion;
  UPDATE public.usuario u SET auth_id=m.auth_id_nuevo
    FROM pg_temp.pa_int02a_auth_conciliacion m
    WHERE u.id=m.usuario_id AND u.rol::text=m.rol_global
      AND (u.auth_id IS NULL OR btrim(u.auth_id)='');
  GET DIAGNOSTICS v_actualizadas=ROW_COUNT;
  IF v_actualizadas<>v_esperadas OR
     EXISTS(SELECT 1 FROM public.usuario WHERE auth_id IS NULL OR btrim(auth_id)='') OR
     EXISTS(SELECT 1 FROM public.usuario GROUP BY auth_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'CONCILIACION_INCOMPLETA';
  END IF;
  IF EXISTS(SELECT 1 FROM public.usuario u JOIN pg_temp.pa_int02a_auth_conciliacion m ON m.usuario_id=u.id
    WHERE u.rol::text IS DISTINCT FROM m.rol_global) THEN
    RAISE EXCEPTION 'AUTORIDAD_NO_CONSERVADA';
  END IF;
END $$;
COMMIT;

SELECT jsonb_build_object(
  'resultado','CONCILIACION_CONFIRMADA',
  'cuentas_actualizadas',(SELECT count(*) FROM pg_temp.pa_int02a_auth_conciliacion),
  'manifest',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'usuario_id',usuario_id::text,'rol_global',rol_global,'estado_anterior',estado_anterior,
    'auth_id_nuevo',auth_id_nuevo) ORDER BY usuario_id)
    FROM pg_temp.pa_int02a_auth_conciliacion),'[]'::jsonb),
  'observado_en',current_timestamp
) AS conciliacion;
DROP TABLE pg_temp.pa_int02a_auth_conciliacion;
