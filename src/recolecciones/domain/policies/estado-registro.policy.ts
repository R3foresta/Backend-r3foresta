import { EstadoRegistro } from '../enums/estado-registro.enum';

export type RecoleccionEstadoFlags = {
  can_edit: boolean;
  can_submit_for_validation: boolean;
  can_approve: boolean;
  can_reject: boolean;
};

export class EstadoRegistroPolicy {
  static normalizar(estadoRegistro: unknown): string {
    return String(estadoRegistro ?? '').trim().toUpperCase();
  }

  static getFlags(estadoRegistro: unknown): RecoleccionEstadoFlags {
    const estado = this.normalizar(estadoRegistro);

    return {
      can_edit:
        estado === EstadoRegistro.BORRADOR ||
        estado === EstadoRegistro.RECHAZADO,
      can_submit_for_validation: estado === EstadoRegistro.BORRADOR,
      can_approve: estado === EstadoRegistro.PENDIENTE_VALIDACION,
      can_reject: estado === EstadoRegistro.PENDIENTE_VALIDACION,
    };
  }
}
