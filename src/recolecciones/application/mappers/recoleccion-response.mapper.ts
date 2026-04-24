import { EstadoRegistroPolicy } from '../../domain/policies/estado-registro.policy';
import type { EvaluacionElegibilidadInicioVivero } from '../../domain/policies/elegibilidad-inicio-vivero.policy';

export function mapRecoleccionToCanonicalResponse(
  recoleccion: any,
  evidencias: any[],
  elegibilidadVivero: EvaluacionElegibilidadInicioVivero,
) {
  const saldoActual = Number(
    recoleccion.saldo_actual ?? recoleccion.cantidad_inicial_canonica ?? 0,
  );
  const estadoOperativo = String(
    recoleccion.estado_operativo ?? (saldoActual > 0 ? 'ABIERTO' : 'CERRADO'),
  ).toUpperCase();
  const nombreCientifico =
    recoleccion.nombre_cientifico_snapshot ??
    recoleccion.planta?.nombre_cientifico ??
    null;
  const nombreComercial =
    recoleccion.nombre_comercial_snapshot ??
    recoleccion.planta?.nombre_comun_principal ??
    recoleccion.planta?.especie ??
    null;
  const variedad =
    recoleccion.variedad_snapshot ?? recoleccion.planta?.variedad ?? null;
  const fotos = evidencias.map((evidencia: any) => ({
    id: evidencia.id,
    url: evidencia.public_url,
    es_principal: evidencia.es_principal,
    orden: evidencia.orden,
    titulo: evidencia.titulo,
    descripcion: evidencia.descripcion,
    mime_type: evidencia.mime_type,
    tamano_bytes: evidencia.tamano_bytes,
  }));

  return {
    ...recoleccion,
    nombre_cientifico: nombreCientifico,
    nombre_comercial: nombreComercial,
    nombre_comun_principal: nombreComercial,
    variedad,
    saldo_actual: saldoActual,
    estado_operativo: estadoOperativo,
    estado_detalle: estadoOperativo,
    elegible_para_vivero: elegibilidadVivero.elegible,
    motivo_no_elegibilidad_para_vivero:
      elegibilidadVivero.motivo_no_elegibilidad,
    cantidad_solicitada_vivero_evaluada:
      elegibilidadVivero.cantidad_solicitada,
    evidencias,
    fotos,
    ...EstadoRegistroPolicy.getFlags(recoleccion.estado_registro),
  };
}
