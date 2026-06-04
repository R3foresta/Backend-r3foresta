-- 044_fix_evidencia_principal_pendiente.sql
-- Evita que evidencias pendientes (entidad_id NULL/0) participen en la
-- unicidad de evidencia principal por entidad real.

UPDATE public.evidencias_trazabilidad ev
SET es_principal = FALSE
FROM public.tipos_entidad_evidencia te
WHERE ev.tipo_entidad_id = te.id
  AND UPPER(te.codigo) IN ('EVENTO_LOTE_VIVERO', 'REGISTRO_PLANTACION')
  AND ev.es_principal IS TRUE
  AND ev.eliminado_en IS NULL
  AND (ev.entidad_id IS NULL OR ev.entidad_id = 0);

DROP INDEX IF EXISTS public.ux_evidencia_principal_por_entidad;

CREATE UNIQUE INDEX ux_evidencia_principal_por_entidad
  ON public.evidencias_trazabilidad (tipo_entidad_id, entidad_id)
  WHERE es_principal IS TRUE
    AND eliminado_en IS NULL
    AND entidad_id IS NOT NULL
    AND entidad_id <> 0;
