import { EstadoSubcampania } from '../enums/estado-subcampania.enum';

export class EdicionPorEstadoPolicyError extends Error {}

const CAMPOS_BORRADOR = new Set<string>([
  'nombre',
  'descripcion',
  'zona_id',
  'meta_total_arboles',
  'fecha_estimada_inicio',
  'fecha_estimada_fin',
  'tolerancia_gps_metros',
]);

const CAMPOS_ACTIVA = new Set<string>([
  'descripcion',
  'fecha_estimada_fin',
  'tolerancia_gps_metros',
]);

const CAMPOS_CERRADA = new Set<string>(['observaciones_cierre']);

export class EdicionPorEstadoPolicy {
  static filtrarCamposPermitidos(
    estadoActual: EstadoSubcampania,
    dtoFields: string[],
  ): Set<string> {
    const permitidos = this.getCamposPermitidos(estadoActual);
    const resultado = new Set<string>();
    for (const campo of dtoFields) {
      if (permitidos.has(campo)) resultado.add(campo);
    }
    return resultado;
  }

  static getCamposPermitidos(estadoActual: EstadoSubcampania): Set<string> {
    switch (estadoActual) {
      case EstadoSubcampania.BORRADOR:
        return new Set(CAMPOS_BORRADOR);
      case EstadoSubcampania.ACTIVA:
        return new Set(CAMPOS_ACTIVA);
      case EstadoSubcampania.COMPLETADA:
      case EstadoSubcampania.FINALIZADA_PARCIAL:
        return new Set(CAMPOS_CERRADA);
      default:
        return new Set<string>();
    }
  }

  static assertCamposPermitidos(
    estadoActual: EstadoSubcampania,
    dtoFields: string[],
  ): void {
    const permitidos = this.getCamposPermitidos(estadoActual);
    const rechazados = dtoFields.filter((c) => !permitidos.has(c));
    if (rechazados.length > 0) {
      throw new EdicionPorEstadoPolicyError(
        `Los siguientes campos no son editables en estado ${estadoActual}: ${rechazados.join(
          ', ',
        )}.`,
      );
    }
  }
}
