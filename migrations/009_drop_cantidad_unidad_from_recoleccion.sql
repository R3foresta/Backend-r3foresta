-- Migración: deprecar columnas legacy de la tabla recoleccion
-- Estas columnas fueron reemplazadas por campos canónicos o por la relación con planta

-- 1. Quitar NOT NULL de cantidad/unidad (reemplazadas por cantidad_inicial_canonica/unidad_canonica)
ALTER TABLE recoleccion
  ALTER COLUMN cantidad DROP NOT NULL,
  ALTER COLUMN unidad DROP NOT NULL;

-- 2. Quitar NOT NULL de nombre_cientifico/nombre_comercial (ahora vienen de la relación planta)
ALTER TABLE recoleccion
  ALTER COLUMN nombre_cientifico DROP NOT NULL,
  ALTER COLUMN nombre_comercial DROP NOT NULL;

-- Una vez confirmado que el backend ya no las usa, ejecutar para eliminar definitivamente:
-- ALTER TABLE recoleccion
--   DROP COLUMN cantidad,
--   DROP COLUMN unidad,
--   DROP COLUMN nombre_cientifico,
--   DROP COLUMN nombre_comercial;
