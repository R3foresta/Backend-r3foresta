-- 008_vivero_indexes.sql
-- Indices y unicidad estructural para modulo vivero

-- =========================================================
-- INDICES: lote_vivero
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_lote_vivero_recoleccion_id
  ON public.lote_vivero (recoleccion_id);

CREATE INDEX IF NOT EXISTS idx_lote_vivero_vivero_id
  ON public.lote_vivero (vivero_id);

CREATE INDEX IF NOT EXISTS idx_lote_vivero_estado_lote
  ON public.lote_vivero (estado_lote);

-- Nota:
-- codigo_trazabilidad ya esta cubierto por UNIQUE,
-- por lo tanto no creamos un indice extra aqui.

-- =========================================================
-- INDICES: evento_lote_vivero
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_evento_lote_vivero_lote_fecha
  ON public.evento_lote_vivero (lote_id, fecha_evento);

CREATE INDEX IF NOT EXISTS idx_evento_lote_vivero_tipo_evento
  ON public.evento_lote_vivero (tipo_evento);

CREATE INDEX IF NOT EXISTS idx_evento_lote_vivero_responsable_id
  ON public.evento_lote_vivero (responsable_id);

-- =========================================================
-- RESTRICCION ESTRUCTURAL:
-- Solo un EMBOLSADO por lote
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_evento_lote_vivero_un_embolsado_por_lote
  ON public.evento_lote_vivero (lote_id)
  WHERE tipo_evento = 'EMBOLSADO'::public.tipo_evento_vivero;
