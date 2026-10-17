-- SINTETICO_AISLADO_INT02D. Amplía A con columnas operativas reales de 027/029/031/047.
CREATE TYPE public.motivo_devolucion_plantacion AS ENUM (
      'SOBRANTE_OPERATIVO',
      'ERROR_PLANIFICACION',
      'CAMBIO_SUBCAMPANIA',
      'CIERRE_SUBCAMPANIA',
      'PROBLEMAS_CALIDAD_LOTE',
      'CONDICIONES_CAMPO_NO_APTAS',
      'ACCESO_RESTRINGIDO',
      'CANCELACION_ACTIVIDAD',
      'REASIGNACION_PRIORIDAD',
      'OTRO'
    );
CREATE TYPE public.tipo_evento_vivero AS ENUM('EMBOLSADO','DESPACHO','DEVOLUCION_PLANTACION');
CREATE TYPE public.fase_mantenimiento_subcampania AS ENUM (
      'NO_APLICA',
      'MANTENIMIENTO_ACTIVO',
      'MONITOREO_HISTORICO'
    );
CREATE TYPE public.motivo_cierre_parcial AS ENUM (
      'FALTA_STOCK',
      'PROBLEMAS_CLIMATICOS',
      'CANCELACION_CONVENIO',
      'CONFLICTO_SOCIAL',
      'ACCESO_RESTRINGIDO',
      'CAMBIO_PRIORIDAD_INSTITUCIONAL',
      'RIESGO_OPERATIVO',
      'META_REDEFINIDA',
      'CIERRE_ADMINISTRATIVO',
      'OTRO'
    );
ALTER TYPE public.tipo_evento_plantacion ADD VALUE IF NOT EXISTS 'DEVOLUCION_A_VIVERO';
CREATE TYPE public.tipo_subcampania AS ENUM('REFORESTACION','ARBORIZACION','FORESTACION');
ALTER TABLE public.subcampania ADD COLUMN tipo public.tipo_subcampania NOT NULL DEFAULT 'REFORESTACION';
ALTER TABLE public.campania ADD COLUMN deleted_by BIGINT,ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now(),ADD COLUMN updated_by BIGINT;
ALTER TABLE public.subcampania ADD COLUMN descripcion TEXT,ADD COLUMN fecha_estimada_inicio DATE,ADD COLUMN fecha_estimada_fin DATE,
 ADD COLUMN observaciones_cierre TEXT,ADD COLUMN area_hectareas NUMERIC(12,4),ADD COLUMN nombre_coordinador_snapshot TEXT,
 ADD COLUMN nombres_organizaciones_snapshot TEXT[],ADD COLUMN fase_mantenimiento public.fase_mantenimiento_subcampania NOT NULL DEFAULT 'NO_APLICA',
 ADD COLUMN motivo_cierre_parcial public.motivo_cierre_parcial;
CREATE TABLE public.campania_organizacion(campania_id BIGINT REFERENCES public.campania(id),organizacion_id BIGINT REFERENCES public.organizacion(id),PRIMARY KEY(campania_id,organizacion_id));
ALTER TABLE public.subcampania_meta_especie ADD COLUMN created_at TIMESTAMPTZ DEFAULT now(),ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now(),ADD COLUMN created_by BIGINT,ADD COLUMN updated_by BIGINT;
ALTER TABLE public.evidencias_trazabilidad ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}',ADD COLUMN storage_object_id TEXT,
 ADD COLUMN titulo TEXT,ADD COLUMN descripcion TEXT,ADD COLUMN orden INTEGER NOT NULL DEFAULT 0,ADD COLUMN tomado_en TIMESTAMPTZ,
 ADD COLUMN eliminado_por_usuario_id BIGINT;
ALTER TYPE public.motivo_cierre_lote ADD VALUE IF NOT EXISTS 'MIXTO';
ALTER TYPE public.motivo_cierre_lote ADD VALUE IF NOT EXISTS 'PERDIDA_TOTAL';
ALTER TABLE public.lote_vivero ADD COLUMN responsable_id BIGINT;
ALTER TABLE public.evento_lote_vivero ADD COLUMN motivo_cierre_calculado public.motivo_cierre_lote,ADD COLUMN ref_evento_trigger_id BIGINT;
-- FKs reales de051: también adquieren locks implícitos al insertar eventos.
-- El antecedente mínimo de INT03-A solo había creado las columnas BIGINT.
ALTER TABLE public.evento_lote_vivero
 ADD CONSTRAINT evento_lote_vivero_subcampania_fk FOREIGN KEY(subcampania_id) REFERENCES public.subcampania(id) NOT VALID,
 ADD CONSTRAINT evento_lote_vivero_campania_fk FOREIGN KEY(campania_id) REFERENCES public.campania(id) NOT VALID,
 ADD CONSTRAINT evento_lote_vivero_registro_plantacion_fk FOREIGN KEY(registro_plantacion_id) REFERENCES public.registro_plantacion(id) NOT VALID;
ALTER TABLE public.evento_plantacion ADD COLUMN cantidad_devuelta INT,ADD COLUMN motivo_devolucion public.motivo_devolucion_plantacion;
GRANT ALL ON public.campania_organizacion,public.campania,public.subcampania_meta_especie TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE OR REPLACE FUNCTION public.fn_subcampania_obtener_plan(
  p_subcampania_id BIGINT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'subcampania_id', s.id,
    'estado', s.estado,
    'meta_total_arboles', s.meta_total_arboles,
    'plan_revision', s.plan_revision,
    'metas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'planta_id', m.planta_id,
        'porcentaje_objetivo', m.porcentaje_objetivo,
        'cantidad_objetivo', m.cantidad_objetivo,
        'planta', jsonb_build_object(
          'id', p.id,
          'especie', p.especie,
          'nombre_cientifico', p.nombre_cientifico
        )
      ) ORDER BY m.planta_id)
      FROM public.subcampania_meta_especie m
      JOIN public.planta p ON p.id = m.planta_id
      WHERE m.subcampania_id = s.id
    ), '[]'::jsonb)
  )
  FROM public.subcampania s
  WHERE s.id = p_subcampania_id AND s.deleted_at IS NULL;
$$;
CREATE OR REPLACE FUNCTION public.fn_vivero_cerrar_lote_si_corresponde(
  p_lote_id BIGINT,
  p_evento_trigger_id BIGINT
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo_actual INTEGER;
  v_tuvo_despacho BOOLEAN;
  v_tuvo_merma BOOLEAN;
  v_motivo public.motivo_cierre_lote;
  v_responsable_id BIGINT;
  v_fecha_cierre DATE;
BEGIN
  SELECT saldo_vivo_actual
  INTO v_saldo_actual
  FROM public.lote_vivero
  WHERE id = p_lote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El lote % no existe.', p_lote_id;
  END IF;

  IF v_saldo_actual IS NULL OR v_saldo_actual <> 0 THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'DESPACHO'
  ) INTO v_tuvo_despacho;

  SELECT EXISTS (
    SELECT 1
    FROM public.evento_lote_vivero
    WHERE lote_id = p_lote_id
      AND tipo_evento = 'MERMA'
  ) INTO v_tuvo_merma;

  IF v_tuvo_despacho AND v_tuvo_merma THEN
    v_motivo := 'MIXTO';
  ELSIF v_tuvo_despacho THEN
    v_motivo := 'DESPACHO_TOTAL';
  ELSE
    v_motivo := 'PERDIDA_TOTAL';
  END IF;

  UPDATE public.lote_vivero
  SET estado_lote = 'FINALIZADO',
      motivo_cierre = v_motivo
  WHERE id = p_lote_id
    AND estado_lote <> 'FINALIZADO';

  SELECT COALESCE(ev.responsable_id, lv.responsable_id),
         COALESCE(ev.fecha_evento, CURRENT_DATE)
  INTO v_responsable_id, v_fecha_cierre
  FROM public.lote_vivero lv
  LEFT JOIN public.evento_lote_vivero ev
    ON ev.id = p_evento_trigger_id
  WHERE lv.id = p_lote_id;

  INSERT INTO public.evento_lote_vivero (
    lote_id,
    tipo_evento,
    fecha_evento,
    responsable_id,
    motivo_cierre_calculado,
    ref_evento_trigger_id,
    observaciones
  )
  SELECT
    lv.id,
    'CIERRE_AUTOMATICO',
    v_fecha_cierre,
    v_responsable_id,
    v_motivo,
    p_evento_trigger_id,
    'Cierre automatico por saldo vivo igual a 0'
  FROM public.lote_vivero lv
  WHERE lv.id = p_lote_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.evento_lote_vivero ev
      WHERE ev.lote_id = p_lote_id
        AND ev.tipo_evento = 'CIERRE_AUTOMATICO'
    );
END;
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Superficies y grants adversarios sintéticos del inventario fijo080.
CREATE TABLE public.tipo_planta(id BIGINT PRIMARY KEY,nombre TEXT);
CREATE TABLE public.comunidad(id BIGINT PRIMARY KEY,nombre TEXT);
GRANT ALL ON public.tipo_planta,public.comunidad TO service_role;
CREATE VIEW public.v_lote_vivero_saldos AS SELECT id,saldo_vivo_actual FROM public.lote_vivero;
CREATE VIEW public.campania_estado AS SELECT c.id AS campania_id,
 CASE WHEN EXISTS(SELECT 1 FROM public.subcampania s WHERE s.campania_id=c.id AND s.estado='ACTIVA' AND s.deleted_at IS NULL) THEN 'ACTIVA' ELSE 'BORRADOR' END AS estado_derivado FROM public.campania c;
GRANT SELECT ON public.v_lote_vivero_saldos,public.campania_estado TO service_role;
GRANT SELECT ON public.campania_estado TO PUBLIC,anon,authenticated;
GRANT ALL ON public.asignacion_vivero_subcampania,public.registro_plantacion,public.registro_plantacion_detalle,
 public.registro_plantacion_coresponsable,public.evento_plantacion,public.evidencias_trazabilidad,public.subcampania_equipo,
 public.subcampania,public.lote_vivero,public.evento_lote_vivero TO PUBLIC,anon,authenticated;
GRANT SELECT(id),UPDATE(nombre) ON public.subcampania TO PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_lote_vivero_saldos TO PUBLIC,anon,authenticated;
GRANT SELECT(id) ON public.v_lote_vivero_saldos TO PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.planta,public.tipo_planta,public.comunidad,public.division_administrativa TO PUBLIC,anon,authenticated;
