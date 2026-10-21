-- Cierre aditivo compatible con el catálogo constatado el 2026-10-20.
-- Sustituye el paso 080 en ese destino (sin afirmar que 080 fue aplicada) y admite
-- también un destino donde 080 ya cerró su inventario. No modifica 080 ni datos.
-- Secuencia de recuperación: 074–079 cotejadas -> 083 -> 081/082. Antes de ejecutar,
-- ambos consumidores (backend local y Render de desarrollo) deben usar cliente
-- privado en los objetos que se cierran; desplegar código no acredita este SQL.
-- Comunidad es opcional: el catálogo actual representa comunidades mediante
-- division_administrativa. Si existe public.comunidad, se comprueba y se cierra
-- su escritura; no se inventa una tabla/vista para satisfacer el preflight de 080.
-- No añade GRANT, roles, RLS, funciones, secuencias ni políticas. Solo REVOKE de
-- PUBLIC/anon/authenticated dentro del manifiesto; conserva servicio y SELECT
-- existente de las superficies de solo lectura, incluso grants por columna.
-- La vista territorial cotejada conserva SELECT; se verifica su definición,
-- firma y bases antes de cerrar sus permisos adicionales.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $cierre$
DECLARE
  privadas TEXT[]:=ARRAY['asignacion_vivero_subcampania','registro_plantacion',
    'registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion',
    'evidencias_trazabilidad','subcampania_equipo','subcampania','lote_vivero','evento_lote_vivero',
    'subcampania_meta_especie','v_lote_vivero_saldos'];
  solo_lectura TEXT[]:=ARRAY['campania','campania_organizacion','campania_estado',
    'planta','division_administrativa','tipo_planta','comunidad','v_ubicacion_enriquecida'];
  opcionales TEXT[]:=ARRAY['tipo_planta','comunidad','v_lote_vivero_saldos','v_ubicacion_enriquecida'];
  catalogos TEXT[]:=ARRAY['planta','division_administrativa','tipo_planta','comunidad'];
  audiencias OID[]; nombre TEXT; rol TEXT; permiso TEXT; lista TEXT; patron TEXT;
  objeto RECORD; columna RECORD; funcion RECORD; fase INTEGER;
  antes JSONB; actual JSONB; metadatos_roles JSONB; roles_antes JSONB; firma_ubicacion TEXT[];
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'PA_SUPERFICIE_COMPAT_ROLES_REQUERIDOS'; END IF;
  SELECT ARRAY[0::oid]||array_agg(oid ORDER BY oid) INTO audiencias FROM pg_roles WHERE rolname IN('anon','authenticated');

  FOREACH nombre IN ARRAY privadas||solo_lectura LOOP
    IF to_regclass('public.'||nombre) IS NULL THEN
      IF nombre=ANY(opcionales) THEN CONTINUE; END IF;
      RAISE EXCEPTION 'PA_D_RELACION_REQUERIDA: %',nombre;
    END IF;
    SELECT c.* INTO objeto FROM pg_class c WHERE c.oid=to_regclass('public.'||nombre);
    IF (nombre IN('campania_estado','v_lote_vivero_saldos','v_ubicacion_enriquecida') AND objeto.relkind NOT IN('v','m'))
      OR (nombre NOT IN('campania_estado','v_lote_vivero_saldos','v_ubicacion_enriquecida') AND objeto.relkind NOT IN('r','p')) THEN
      RAISE EXCEPTION 'PA_SUPERFICIE_COMPAT_TIPO_INCOMPATIBLE: %',nombre; END IF;
    IF nombre='v_ubicacion_enriquecida' THEN
      -- Huella de pg_get_viewdef(...,true), cotejada en PG17.6 y con el ADR002.
      -- No es una excepción por nombre: una variante requiere nuevo cotejo.
      IF objeto.relkind<>'v' OR coalesce(cardinality(objeto.reloptions),0)<>0
        OR md5(pg_get_viewdef(objeto.oid,true))<>'606333c9b255ffb8548c93b4a3cec319'
        OR pg_relation_is_updatable(objeto.oid,true)<>0
        OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=objeto.oid AND rulename<>'_RETURN')
        OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=objeto.oid AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'PA_SUPERFICIE_COMPAT_UBICACION_REQUIERE_COTEJO';
      END IF;
      SELECT array_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum)
        INTO firma_ubicacion FROM pg_attribute a
        WHERE a.attrelid=objeto.oid AND a.attnum>0 AND NOT a.attisdropped;
      IF firma_ubicacion IS DISTINCT FROM ARRAY['id:bigint','ubicacion_id:bigint','nombre:text',
        'referencia:text','latitud:numeric(9,6)','longitud:numeric(9,6)','precision_m:integer',
        'fuente:text','pais_id:bigint','pais_codigo_iso2:character(2)','pais_nombre:text',
        'division_id:bigint','division_ruta:jsonb'] THEN
        RAISE EXCEPTION 'PA_SUPERFICIE_COMPAT_UBICACION_FIRMA_INCOMPATIBLE';
      END IF;
      IF (WITH RECURSIVE bases(oid) AS (
        SELECT objeto.oid UNION SELECT d.refobjid FROM bases b
        JOIN pg_rewrite rw ON rw.ev_class=b.oid JOIN pg_depend d ON d.objid=rw.oid
          AND d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
        JOIN pg_class c ON c.oid=d.refobjid WHERE c.relkind IN('r','p','v','m','f')
      ) SELECT count(*)<>4 OR coalesce(bool_or(n.nspname<>'public' OR c.relkind NOT IN('r','p')
          OR c.relname NOT IN('ubicacion','pais','division_administrativa','division_tipo')),false)
        FROM bases b JOIN pg_class c ON c.oid=b.oid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE b.oid<>objeto.oid) THEN
        RAISE EXCEPTION 'PA_SUPERFICIE_COMPAT_UBICACION_BASES_INCOMPATIBLES';
      END IF;
    END IF;
    IF NOT has_table_privilege('service_role',objeto.oid,'SELECT') THEN
      RAISE EXCEPTION 'PA_D_SERVICE_SIN_SELECT: %',nombre; END IF;
    FOREACH permiso IN ARRAY CASE
      WHEN nombre=ANY(catalogos) OR nombre IN('asignacion_vivero_subcampania','registro_plantacion',
        'evidencias_trazabilidad','subcampania','lote_vivero','campania') THEN ARRAY['INSERT','UPDATE']
      WHEN nombre='campania_organizacion' THEN ARRAY['INSERT','DELETE']
      WHEN nombre='subcampania_meta_especie' THEN ARRAY['INSERT','UPDATE','DELETE']
      WHEN nombre='subcampania_equipo' THEN ARRAY['INSERT','DELETE']
      WHEN nombre IN('registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion','evento_lote_vivero') THEN ARRAY['INSERT']
      ELSE ARRAY[]::text[] END LOOP
      IF NOT has_table_privilege('service_role',objeto.oid,permiso) THEN
        RAISE EXCEPTION 'PA_D_SERVICE_SIN_PRIVILEGIO: % %',nombre,permiso; END IF;
    END LOOP;
  END LOOP;

  -- No cerrar por inferencia vistas/definers ajenos: desconocidos públicos
  -- bloquean toda la transacción para revisión explícita, como en 080.
  -- SELECT ajeno sobre solo lectura se conserva; escrituras ajenas sobre
  -- cualquier raíz y lecturas de una raíz privada requieren revisión.
  FOR objeto IN WITH RECURSIVE dependientes(oid,privada) AS (
    SELECT c.oid,c.relname=ANY(privadas) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(privadas||solo_lectura)
    UNION SELECT rw.ev_class,previa.privada FROM dependientes previa JOIN pg_depend d
      ON d.refclassid='pg_class'::regclass AND d.refobjid=previa.oid AND d.classid='pg_rewrite'::regclass
      JOIN pg_rewrite rw ON rw.oid=d.objid JOIN pg_class c ON c.oid=rw.ev_class AND c.relkind IN('v','m')
  ) SELECT c.oid,c.relname,n.nspname,bool_or(d.privada) AS privada FROM dependientes d JOIN pg_class c ON c.oid=d.oid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('v','m')
      AND NOT(n.nspname='public' AND c.relname=ANY(privadas||solo_lectura))
      GROUP BY c.oid,c.relname,n.nspname LOOP
    FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF (objeto.privada AND has_any_column_privilege(rol,objeto.oid,'SELECT')) OR has_any_column_privilege(rol,objeto.oid,'INSERT')
        OR has_any_column_privilege(rol,objeto.oid,'UPDATE') OR has_table_privilege(rol,objeto.oid,'DELETE') THEN
        RAISE EXCEPTION 'PA_D_VISTA_PUBLICA_NO_AUTORIZADA: %.% %',objeto.nspname,objeto.relname,rol; END IF;
    END LOOP;
  END LOOP;
  -- Heurística de catálogo: no demuestra ausencia de SQL dinámico u otros
  -- escritores; esos candidatos deben cotejarse en sesión privada del destino.
  patron:='\m('||array_to_string(privadas||solo_lectura||ARRAY['usuario'],'|')||')\M';
  FOR funcion IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND (p.prosrc ~* patron
        OR p.proname IN('fn_generar_codigo_campania','fn_generar_codigo_subcampania')) LOOP
    IF has_function_privilege('anon',funcion.oid,'EXECUTE') OR has_function_privilege('authenticated',funcion.oid,'EXECUTE') THEN
      RAISE EXCEPTION 'PA_D_DEFINER_PUBLICO_NO_AUTORIZADO: %',funcion.oid::regprocedure; END IF;
  END LOOP;

  FOR fase IN 1..2 LOOP
    -- Snapshot solo de catálogo, no de filas. Normalizar ACL NULL mediante el
    -- default distingue derechos implícitos del owner de una ACL vacía explícita.
    WITH relaciones AS (
      SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(privadas||solo_lectura)
    ) SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'nombre',r.relname,'owner',r.relowner,
      'tipo',r.relkind,'rls',r.relrowsecurity,'rls_forzada',r.relforcerowsecurity,
      'acl_otros',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
        FROM aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL ELSE coalesce(r.relacl,acldefault('r',r.relowner)) END) a
        WHERE NOT(a.grantee=ANY(audiencias))),
      'columnas_otros',(SELECT coalesce(jsonb_agg(jsonb_build_object('columna',c.attnum,'acl',
        (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
          FROM aclexplode(CASE WHEN cardinality(c.attacl)=0 THEN NULL ELSE c.attacl END) a
          WHERE NOT(a.grantee=ANY(audiencias)))) ORDER BY c.attnum),'[]'::jsonb)
        FROM pg_attribute c WHERE c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped),
      'select_tabla',CASE WHEN r.relname=ANY(solo_lectura) THEN
        (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee),'[]'::jsonb)
          FROM aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL ELSE coalesce(r.relacl,acldefault('r',r.relowner)) END) a
          WHERE a.privilege_type='SELECT') ELSE NULL END,
      'select_columnas',CASE WHEN r.relname=ANY(solo_lectura) THEN
        (SELECT coalesce(jsonb_agg(jsonb_build_object('columna',c.attnum,'acl',
          (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee),'[]'::jsonb)
            FROM aclexplode(CASE WHEN cardinality(c.attacl)=0 THEN NULL ELSE c.attacl END) a WHERE a.privilege_type='SELECT')) ORDER BY c.attnum),'[]'::jsonb)
          FROM pg_attribute c WHERE c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped) ELSE NULL END,
      'servicio_tabla',(SELECT jsonb_agg(jsonb_build_object('privilegio',a.privilege_type,
        'concedido',has_table_privilege('service_role',r.oid,a.privilege_type)) ORDER BY a.privilege_type)
        FROM aclexplode(acldefault('r',r.relowner)) a),
      'servicio_columna',(SELECT coalesce(jsonb_agg(jsonb_build_object('columna',c.attnum,'privilegio',p.privilegio,
        'concedido',has_column_privilege('service_role',r.oid,c.attnum,p.privilegio)) ORDER BY c.attnum,p.privilegio),'[]'::jsonb)
        FROM pg_attribute c CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilegio)
        WHERE c.attrelid=r.oid AND c.attnum>0 AND NOT c.attisdropped)) ORDER BY r.oid) INTO actual FROM relaciones r;
    SELECT jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_object('oid',oid,'rolsuper',rolsuper,
      'rolinherit',rolinherit,'rolbypassrls',rolbypassrls) ORDER BY oid) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')),
      'membresias',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.member,m.roleid),'[]'::jsonb) FROM pg_auth_members m)) INTO metadatos_roles;
    IF fase=1 THEN
      antes:=actual; roles_antes:=metadatos_roles;
      FOR objeto IN SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=ANY(privadas||solo_lectura) ORDER BY c.oid LOOP
        -- acldefault incluye todos los privilegios disponibles en este PostgreSQL:
        -- PG17 añade MAINTAIN. No se codifica un token que falle en PG14.
        SELECT string_agg(a.privilege_type,',' ORDER BY a.privilege_type) INTO lista
          FROM aclexplode(acldefault('r',objeto.relowner)) a
          WHERE objeto.relname=ANY(privadas) OR a.privilege_type<>'SELECT';
        EXECUTE format('REVOKE %s ON TABLE public.%I FROM PUBLIC,anon,authenticated',lista,objeto.relname);
        FOR columna IN SELECT c.attname,a.privilege_type FROM pg_attribute c
          CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(c.attacl)=0 THEN NULL ELSE c.attacl END) a
          WHERE c.attrelid=objeto.oid AND c.attnum>0 AND NOT c.attisdropped
            AND (objeto.relname=ANY(privadas) OR a.privilege_type<>'SELECT')
          GROUP BY c.attnum,c.attname,a.privilege_type ORDER BY c.attnum,a.privilege_type LOOP
          EXECUTE format('REVOKE %s (%I) ON TABLE public.%I FROM PUBLIC,anon,authenticated',
            columna.privilege_type,columna.attname,objeto.relname);
        END LOOP;
      END LOOP;
    ELSIF actual IS DISTINCT FROM antes OR metadatos_roles IS DISTINCT FROM roles_antes THEN
      RAISE EXCEPTION 'PA_SUPERFICIE_COMPAT_PRESERVACION_FALLIDA';
    END IF;
  END LOOP;

  FOR objeto IN SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY(privadas||solo_lectura) ORDER BY c.oid LOOP
    FOR permiso IN SELECT a.privilege_type FROM aclexplode(acldefault('r',objeto.relowner)) a
      WHERE objeto.relname=ANY(privadas) OR a.privilege_type<>'SELECT' LOOP
      FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_table_privilege(rol,objeto.oid,permiso) THEN
          RAISE EXCEPTION 'PA_D_PRIVILEGIO_HEREDADO_REQUIERE_REVISION: % % %',rol,objeto.relname,permiso; END IF;
      END LOOP;
    END LOOP;
    FOREACH permiso IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
      IF objeto.relname=ANY(solo_lectura) AND permiso='SELECT' THEN CONTINUE; END IF;
      FOREACH rol IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF has_any_column_privilege(rol,objeto.oid,permiso) THEN
          RAISE EXCEPTION 'PA_D_PRIVILEGIO_COLUMNA_HEREDADO_REQUIERE_REVISION: % % %',rol,objeto.relname,permiso; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $cierre$;

NOTIFY pgrst,'reload schema';
COMMIT;
