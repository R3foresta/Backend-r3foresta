-- 033_m3_seed_tipo_entidad_registro_plantacion.sql
-- Seed 'REGISTRO_PLANTACION' en tipos_entidad_evidencia para que las evidencias
-- subidas durante el flujo de Modulo 3 puedan vincularse atomicamente a la
-- entidad REGISTRO_PLANTACION (tarea 03).
--
-- Las fotos de un REGISTRO_PLANTACION NO viven sobre el evento DESPACHO
-- automatico generado (tipo_entidad = EVENTO_LOTE_VIVERO). Viven sobre el
-- registro mismo, y el frontend que muestre el historial del lote debe
-- buscar evidencias por registro_plantacion_id del DESPACHO automatico.
--
-- Idempotente: solo inserta si no existe; si existe, lo reactiva.

DO $$
BEGIN
  IF to_regclass('public.tipos_entidad_evidencia') IS NULL THEN
    RAISE EXCEPTION 'No existe public.tipos_entidad_evidencia.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tipos_entidad_evidencia
    WHERE UPPER(codigo) = 'REGISTRO_PLANTACION'
  ) THEN
    INSERT INTO public.tipos_entidad_evidencia (codigo, descripcion, activo)
    VALUES (
      'REGISTRO_PLANTACION',
      'Registro de plantacion del Modulo 3 (M3): grupo de plantas plantado en una subcampania',
      TRUE
    );
  ELSE
    UPDATE public.tipos_entidad_evidencia
    SET activo = TRUE
    WHERE UPPER(codigo) = 'REGISTRO_PLANTACION';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
