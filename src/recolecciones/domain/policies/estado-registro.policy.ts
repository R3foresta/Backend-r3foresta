import { EstadoRegistro } from '../enums/estado-registro.enum';

export type RecoleccionEstadoFlags = {
  can_edit: boolean;
  can_submit_for_validation: boolean;
};

export class EstadoRegistroPolicy {
  static normalizar(estadoRegistro: unknown): string {
    return String(estadoRegistro ?? '')
      .trim()
      .toUpperCase();
  }

  static getFlags(estadoRegistro: unknown): RecoleccionEstadoFlags {
    const estado = this.normalizar(estadoRegistro);

    return {
      can_edit:
        estado === EstadoRegistro.BORRADOR ||
        estado === EstadoRegistro.RECHAZADO,
      can_submit_for_validation: estado === EstadoRegistro.BORRADOR,
    };
  }
}
