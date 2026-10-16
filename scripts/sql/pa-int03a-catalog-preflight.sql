-- Solo lectura: ejecutar en el destino identificado antes de instalar 074–076.
-- No publica filas de usuario, evidencias ni credenciales. El resultado local
-- no acredita origen remoto ni aplicación de las migraciones.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'postgresql',current_setting('server_version'),
  'zona_sesion',current_setting('TimeZone'),
  'postgis',(SELECT extversion FROM pg_extension WHERE extname='postgis'),
  'columnas',(SELECT jsonb_agg(jsonb_build_object('tabla',table_name,'columna',column_name,
    'tipo',data_type,'nullable',is_nullable) ORDER BY table_name,ordinal_position)
    FROM information_schema.columns WHERE table_schema='public' AND table_name IN(
      'registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable',
      'asignacion_vivero_subcampania','participacion_comando','participacion_carga','participacion_carga_generacion')),
  'funciones',(SELECT jsonb_agg(jsonb_build_object('firma',p.oid::regprocedure::text,
    'md5_definicion',md5(pg_get_functiondef(p.oid)),
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'pa\_%' ESCAPE '\' OR p.proname IN(
      'fn_vivero_asignar_stock_subcampania','fn_registrar_plantacion_fisica',
      'gps_dentro_poligono_con_tolerancia'))),
  'rls',(SELECT jsonb_agg(jsonb_build_object('tabla',c.relname,'rls',c.relrowsecurity,
    'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
    'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT')) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN('participacion_comando','participacion_carga','participacion_carga_generacion')),
  'stock_sin_dia_conciliado',CASE WHEN EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='asignacion_vivero_subcampania' AND column_name='fecha_entrega_operativa')
    THEN 'consultar agregados después de instalar074; no convertir timestamp automáticamente'
    ELSE 'columna pendiente de074; no inventariada por esta consulta' END
);
-- La consulta es deliberadamente separada: falla explícitamente si Storage no
-- existe en el destino. No aceptar un bucket público ni políticas abiertas.
SELECT id,public,file_size_limit,allowed_mime_types
FROM storage.buckets WHERE id='participacion_evidencias';
SELECT policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
ROLLBACK;
