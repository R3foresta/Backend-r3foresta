import { EstadoSubcampania } from '../enums/estado-subcampania.enum';

export class ActivacionPolicyError extends Error {}

export type MetaEspecieItem = {
  planta_id: number;
  porcentaje_objetivo: number;
  cantidad_objetivo: number;
};

export type ActivacionParams = {
  estadoActual: EstadoSubcampania;
  tienePoligono: boolean;
  tieneCoordinador: boolean;
  metaTotal: number;
  planEspecies: MetaEspecieItem[];
};

// Tolerancia numerica al comparar suma de porcentajes con 100.
// Los porcentajes pueden llegar como NUMERIC(5,2) desde la BD, por lo que
// aceptamos un error de rounding <= 0.01.
const PORCENTAJE_TOLERANCIA = 0.01;

export class ActivacionPolicy {
  static assertPuedeActivar(params: ActivacionParams): void {
    const {
      estadoActual,
      tienePoligono,
      tieneCoordinador,
      metaTotal,
      planEspecies,
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

    // RN-PLA-08 / RN-PLA-16: plan de metas por especie es obligatorio.
    // Se permite activar con 0% de stock asignado (RN-PLA-09): no se valida
    // ninguna reserva contra el plan aqui.
    if (!Array.isArray(planEspecies) || planEspecies.length === 0) {
      throw new ActivacionPolicyError(
        'El plan de metas por especie es obligatorio (≥1 especie). Cargarlo en PUT /subcampanias/:id/plan antes de activar.',
      );
    }

    const sumaPorcentaje = planEspecies.reduce(
      (acc, m) => acc + Number(m.porcentaje_objetivo ?? 0),
      0,
    );
    if (Math.abs(sumaPorcentaje - 100) > PORCENTAJE_TOLERANCIA) {
      throw new ActivacionPolicyError(
        `El plan por especie debe sumar 100% (suma actual: ${sumaPorcentaje}).`,
      );
    }

    const sumaCantidad = planEspecies.reduce(
      (acc, m) => acc + Number(m.cantidad_objetivo ?? 0),
      0,
    );
    if (sumaCantidad !== metaTotal) {
      throw new ActivacionPolicyError(
        `La suma de cantidad_objetivo del plan (${sumaCantidad}) no coincide con meta_total_arboles (${metaTotal}).`,
      );
    }
  }
}
