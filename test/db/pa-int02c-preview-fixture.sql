-- SINTETICO_LOCAL_INT02C. Sólo para el launcher privado pa-int02c-preview.py.
\set ON_ERROR_STOP on
-- La instalación incluye antecedente mínimo post-067, no PostGIS/Storage.
-- Rechazar antes de crear o vaciar nada si no es la DB nueva sin TCP.
DO $$ BEGIN
  IF current_database()<>'pa_int02c_preview' OR current_setting('listen_addresses')<>''
    OR inet_server_addr() IS NOT NULL THEN
    RAISE EXCEPTION 'PREVIEW_REQUIERE_CLUSTER_LOCAL_AISLADO';
  END IF;
END $$;
\ir pa-int02c-fixture.sql

-- Quitar las personas/hechos del antecedente de pruebas, aún antes de 068–073.
-- El clúster acaba de crearse; no se usa esta fixture sobre un catálogo ajeno.
ALTER TABLE public.subcampania_historial DISABLE TRIGGER subcampania_historial_prevent_mutation_trg;
TRUNCATE public.registro_plantacion_coresponsable, public.evento_plantacion,
  public.asignacion_vivero_subcampania, public.registro_plantacion,
  public.subcampania_historial, public.subcampania_equipo, public.subcampania,
  public.usuario, public.organizacion, public.campania RESTART IDENTITY;
ALTER TABLE public.subcampania_historial ENABLE TRIGGER subcampania_historial_prevent_mutation_trg;

INSERT INTO public.organizacion(id,nombre) VALUES(600,'Organización ficticia INT02C');
INSERT INTO public.campania(id,nombre) VALUES(600,'Demostración local de acceso');
INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo,correo,organizacion_id) VALUES
  (600,'preview-admin','Administradora central','preview-admin','ADMIN',true,'admin@example.invalid',NULL),
  (601,'preview-admin2','Segundo administrador central','preview-admin2','ADMIN',true,'admin2@example.invalid',NULL),
  (602,'preview-gestora','Gestora propia','preview-gestora','VOLUNTARIO',true,'gestora@example.invalid',600),
  (603,'preview-plantador','José Plantador','preview-plantador','VOLUNTARIO',true,'plantador@example.invalid',600),
  (604,'preview-voluntario','Voluntario sin permiso','preview-voluntario','VOLUNTARIO',true,'voluntario@example.invalid',NULL),
  (605,'preview-inactivo','Cuenta inactiva','preview-inactivo','ADMIN',false,'inactivo@example.invalid',NULL),
  (606,'preview-gestor-ajeno','Gestor de otro ámbito','preview-gestor-ajeno','VOLUNTARIO',true,'ajeno@example.invalid',NULL),
  (607,'preview-logistica','Responsable de logística','preview-logistica','GENERAL',true,'logistica@example.invalid',NULL);
-- Las RPC reales inicializan administradores antes de fijar estados cerrados.
INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by) VALUES
  (600,600,'Norte propia','ACTIVA','PREVIEW600',600,600),
  (601,600,'Sur ajena','ACTIVA','PREVIEW601',600,600),
  (602,600,'Cerrada con administrador','ACTIVA','PREVIEW602',600,600),
  (603,600,'Borrador','BORRADOR','PREVIEW603',600,600),
  (604,600,'Cancelada con administrador','ACTIVA','PREVIEW604',600,600),
  (605,600,'Pausada reservada','ACTIVA','PREVIEW605',600,600);
INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by)
  VALUES(600,607,'COORDINADOR',600);
CREATE TABLE public.pa_int02c_preview_marker(fixture TEXT PRIMARY KEY);
INSERT INTO public.pa_int02c_preview_marker VALUES('SINTETICO_LOCAL_INT02C');

-- Adaptador de transporte exclusivo de este clúster. Preserva código y detalle
-- SQL como PostgREST; no convierte errores desconocidos en rechazo durable.
CREATE FUNCTION public.pa_preview_fixture_transport(p_sql TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_result JSONB; v_code TEXT; v_details TEXT;
BEGIN
  EXECUTE p_sql INTO v_result;
  RETURN jsonb_build_object('data',v_result,'error',NULL);
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE,v_details=PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',v_code,'details',v_details));
END $$;
REVOKE ALL ON FUNCTION public.pa_preview_fixture_transport(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pa_preview_fixture_transport(TEXT) TO service_role;
