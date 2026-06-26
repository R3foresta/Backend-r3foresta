import { EstadoSubcampania } from '../enums/estado-subcampania.enum';

export class ActivacionPolicyError extends Error {}

export type ActivacionParams = {
  estadoActual: EstadoSubcampania;
  tienePoligono: boolean;
  tieneCoordinador: boolean;
  metaTotal: number;
  totalReservado?: number;
};

export class ActivacionPolicy {
  static assertPuedeActivar(params: ActivacionParams): void {
    const {
      estadoActual,
      tienePoligono,
      tieneCoordinador,
      metaTotal,
      totalReservado,
    } = params;

    if (estadoActual !== EstadoSubcampania.BORRADOR) {
      throw new ActivacionPolicyError(
        `Solo se puede activar una subcampaña en estado BORRADOR (estado actual: ${estadoActual}).`,
      );
    }

    if (!tienePoligono) {
      throw new ActivacionPolicyError(
        'La subcampaña no tiene polígono definido. Setear poligono antes de activar.',
      );
    }

    if (!tieneCoordinador) {
      throw new ActivacionPolicyError(
        'La subcampaña no tiene un COORDINADOR asignado al equipo.',
      );
    }

    if (!Number.isFinite(metaTotal) || metaTotal <= 0) {
      throw new ActivacionPolicyError(
        'meta_total_arboles debe ser mayor a 0 para activar.',
      );
    }

    if (totalReservado !== undefined && totalReservado <= 0) {
      throw new ActivacionPolicyError(
        'La subcampaña no tiene reservas activas de vivero. Reservar stock antes de activar.',
      );
    }

    if (
      totalReservado !== undefined &&
      Number.isFinite(metaTotal) &&
      totalReservado < metaTotal
    ) {
      throw new ActivacionPolicyError(
        `Las reservas activas (${totalReservado}) no cubren la meta_total_arboles (${metaTotal}).`,
      );
    }
  }
}
