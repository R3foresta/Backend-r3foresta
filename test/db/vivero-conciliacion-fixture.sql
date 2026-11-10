-- Datos sintéticos para 097. La prueba envejece estas filas tras registrar
-- movimientos y recepciones bajo las reglas vigentes en su momento.
ALTER TYPE public.tipo_movimiento_recoleccion ADD VALUE 'CORRECCION';
ALTER TYPE public.tipo_movimiento_recoleccion ADD VALUE 'AJUSTE_MIGRACION';

INSERT INTO public.recoleccion(
  id, usuario_id, fecha, estado_registro, codigo_trazabilidad, tipo_material,
  ubicacion_id, vivero_id, metodo_id, planta_id, unidad_canonica,
  cantidad_inicial_canonica, nombre_cientifico_snapshot, nombre_comercial_snapshot,
  variedad_snapshot, nombre_comunidad_snapshot, nombre_recolector_snapshot,
  usuario_validacion_id, fecha_validacion
)
SELECT i, 21, CURRENT_DATE,
  CASE WHEN i IN (209, 210, 211) THEN 'PENDIENTE_VALIDACION'
       ELSE 'VALIDADO' END::public.estado_registro_recoleccion,
  'CH-ORIGEN-' || i, 'SEMILLA', 1,
  CASE WHEN i IN (225,226,9007199254741001) THEN 2 ELSE 1 END,
  1, 1, 'G', CASE WHEN i=201 THEN 100.0001 ELSE 100 END,
  'Especie sintética', 'Tara', 'común', 'Zona', 'Autor M1',
  CASE WHEN i NOT IN (209, 210, 211) THEN 4 END,
  CASE WHEN i NOT IN (209, 210, 211) THEN CURRENT_DATE END
FROM (SELECT generate_series(201,234)::bigint AS i
      UNION ALL SELECT unnest(ARRAY[9007199254741000,9007199254741001]::bigint[])) origenes;

INSERT INTO public.evidencias_trazabilidad(
  tipo_entidad_id, entidad_id, bucket, ruta_archivo, tipo_archivo,
  mime_type, creado_por_usuario_id
)
SELECT 1, r.id, 'recoleccion_fotos', 'origen-ch/' || r.id || '/' || n,
  'FOTO', 'image/jpeg', 21
FROM public.recoleccion r CROSS JOIN generate_series(1,2) n
WHERE r.id BETWEEN 201 AND 234 OR r.id IN (9007199254741000,9007199254741001);
