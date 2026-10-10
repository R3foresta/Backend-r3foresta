-- Fixture exclusivamente para el cluster PostgreSQL aislado de esta suite.
-- Las tablas de plan, historial, asignaciones y registros, y las RPC de
-- asignacion/plantacion se cargan desde las migraciones reales del repositorio.
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE ROLE authenticated;

CREATE TYPE public.estado_subcampania AS ENUM (
  'BORRADOR', 'ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL', 'PAUSADA', 'CANCELADA'
);
CREATE TYPE public.rol_en_subcampania AS ENUM ('COORDINADOR', 'OPERARIO');
CREATE TYPE public.motivo_cierre_lote AS ENUM ('AGOTADO', 'MIXTO');
CREATE TYPE public.destino_tipo_vivero AS ENUM ('PLANTACION_CAMPANIA');
CREATE TYPE public.origen_despacho_vivero AS ENUM ('ASIGNACION_SUBCAMPANIA');
CREATE TYPE public.tipo_evento_plantacion AS ENUM ('ASIGNACION_VIVERO', 'DEVOLUCION_A_VIVERO');
CREATE TYPE public.tipo_evento_vivero AS ENUM ('EMBOLSADO', 'DESPACHO', 'DEVOLUCION_PLANTACION');
CREATE TYPE public.motivo_devolucion_plantacion AS ENUM (
  'SOBRANTE_OPERATIVO', 'ERROR_PLANIFICACION', 'CAMBIO_SUBCAMPANIA',
  'CIERRE_SUBCAMPANIA', 'PROBLEMAS_CALIDAD_LOTE', 'CONDICIONES_CAMPO_NO_APTAS',
  'ACCESO_RESTRINGIDO', 'CANCELACION_ACTIVIDAD', 'REASIGNACION_PRIORIDAD', 'OTRO'
);

CREATE TABLE public.usuario (id BIGINT PRIMARY KEY, nombre TEXT, rol TEXT);
CREATE TABLE public.planta (
  id BIGINT PRIMARY KEY, especie TEXT, nombre_cientifico TEXT, variedad TEXT
);
CREATE TABLE public.division_administrativa (id BIGINT PRIMARY KEY, nombre TEXT);
CREATE TABLE public.subcampania (
  id BIGINT PRIMARY KEY,
  campania_id BIGINT NOT NULL DEFAULT 1,
  estado public.estado_subcampania NOT NULL DEFAULT 'ACTIVA',
  zona_id BIGINT NOT NULL DEFAULT 1,
  nombre TEXT NOT NULL DEFAULT 'Subcampania de prueba',
  codigo_trazabilidad TEXT NOT NULL UNIQUE,
  meta_total_arboles INTEGER NOT NULL CHECK (meta_total_arboles > 0),
  tolerancia_gps_metros INTEGER NOT NULL DEFAULT 50,
  total_plantado_inicial INTEGER NOT NULL DEFAULT 0,
  total_repuesto INTEGER NOT NULL DEFAULT 0,
  total_muerto_acumulado INTEGER NOT NULL DEFAULT 0,
  saldo_vivo_actual INTEGER GENERATED ALWAYS AS (
    total_plantado_inicial + total_repuesto - total_muerto_acumulado
  ) STORED,
  fecha_cierre_operativo TIMESTAMPTZ,
  fecha_fin_mantenimiento DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT NOT NULL REFERENCES public.usuario(id),
  updated_by BIGINT NOT NULL REFERENCES public.usuario(id),
  deleted_at TIMESTAMPTZ,
  deleted_by BIGINT REFERENCES public.usuario(id)
);
CREATE TABLE public.subcampania_equipo (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subcampania_id BIGINT NOT NULL REFERENCES public.subcampania(id),
  usuario_id BIGINT NOT NULL REFERENCES public.usuario(id),
  rol public.rol_en_subcampania NOT NULL
);
CREATE TABLE public.lote_vivero (
  id BIGINT PRIMARY KEY,
  planta_id BIGINT NOT NULL REFERENCES public.planta(id),
  codigo_trazabilidad TEXT NOT NULL,
  estado_lote TEXT NOT NULL DEFAULT 'ACTIVO',
  saldo_vivo_actual INTEGER NOT NULL,
  nombre_cientifico_snapshot TEXT,
  nombre_comercial_snapshot TEXT,
  motivo_cierre public.motivo_cierre_lote,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE public.evento_lote_vivero (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lote_id BIGINT REFERENCES public.lote_vivero(id),
  tipo_evento public.tipo_evento_vivero,
  fecha_evento DATE,
  responsable_id BIGINT REFERENCES public.usuario(id),
  cantidad_afectada INTEGER,
  unidad_medida_evento TEXT,
  destino_tipo public.destino_tipo_vivero,
  destino_referencia TEXT,
  comunidad_destino_id BIGINT,
  origen_despacho public.origen_despacho_vivero,
  subcampania_id BIGINT,
  campania_id BIGINT,
  registro_plantacion_id BIGINT,
  asignacion_id BIGINT,
  saldo_vivo_antes INTEGER,
  saldo_vivo_despues INTEGER,
  observaciones TEXT
);
CREATE TABLE public.evento_plantacion (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo_evento public.tipo_evento_plantacion,
  subcampania_id BIGINT,
  asignacion_id BIGINT,
  fecha_evento TIMESTAMPTZ,
  responsable_id BIGINT,
  observaciones TEXT,
  cantidad_asignada_evento INTEGER,
  cantidad_devuelta INTEGER,
  motivo_devolucion public.motivo_devolucion_plantacion,
  created_by BIGINT
);
CREATE TABLE public.tipos_entidad_evidencia (
  id BIGINT PRIMARY KEY, codigo TEXT, activo BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE public.evidencias_trazabilidad (
  id BIGINT PRIMARY KEY,
  tipo_entidad_id BIGINT,
  entidad_id BIGINT DEFAULT 0,
  eliminado_en TIMESTAMPTZ,
  codigo_trazabilidad TEXT,
  actualizado_en TIMESTAMPTZ,
  actualizado_por_usuario_id BIGINT
);

-- El fixture no necesita PostGIS: solo aisla la validacion GPS, que no cambia
-- en ADR-PLA-05. Conserva las RPC reales que gestionan metas, stock y registros.
CREATE FUNCTION public.gps_dentro_poligono_con_tolerancia(BIGINT, NUMERIC, NUMERIC)
RETURNS TABLE (dentro BOOLEAN, distancia_m NUMERIC)
LANGUAGE sql AS $$ SELECT TRUE, 0::NUMERIC $$;

CREATE FUNCTION public.fn_vivero_assert_fecha_operativa(DATE, DATE)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF $1 < $2 OR $1 > CURRENT_DATE THEN
    RAISE EXCEPTION 'Fecha operativa invalida.';
  END IF;
END $$;

CREATE FUNCTION public.fn_vivero_cerrar_lote_si_corresponde(BIGINT, BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.lote_vivero
  SET estado_lote = 'FINALIZADO', motivo_cierre = 'AGOTADO'
  WHERE id = $1 AND saldo_vivo_actual = 0;
END $$;

INSERT INTO public.usuario VALUES
  (1, 'Admin global', 'ADMIN'), (2, 'Coordinador', 'GENERAL'),
  (3, 'Admin autor original', 'ADMIN');
INSERT INTO public.planta VALUES
  (1, 'Especie original', 'Planta original', 'Original'),
  (2, 'Especie agregada', 'Planta nueva', 'Nueva'),
  (3, 'Especie sin uso', 'Planta sin uso', 'Sin uso');
INSERT INTO public.division_administrativa VALUES (1, 'Zona de prueba');
INSERT INTO public.tipos_entidad_evidencia VALUES
  (1, 'EVENTO_LOTE_VIVERO', TRUE), (2, 'REGISTRO_PLANTACION', TRUE);
