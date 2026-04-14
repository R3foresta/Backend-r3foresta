-- Migración: eliminar columnas cantidad y unidad de la tabla recoleccion
-- Estas columnas fueron reemplazadas por cantidad_inicial_canonica y unidad_canonica

ALTER TABLE recoleccion
  ALTER COLUMN cantidad DROP NOT NULL,
  ALTER COLUMN unidad DROP NOT NULL;

-- Una vez confirmado que el backend ya no las usa, ejecutar:
-- ALTER TABLE recoleccion DROP COLUMN cantidad;
-- ALTER TABLE recoleccion DROP COLUMN unidad;
