import { EstadoSubcampania } from '../enums/estado-subcampania.enum';

export class TransicionEstadoPolicyError extends Error {}

const TRANSICIONES: Record<EstadoSubcampania, EstadoSubcampania[]> = {
  [EstadoSubcampania.BORRADOR]: [EstadoSubcampania.ACTIVA],
  [EstadoSubcampania.ACTIVA]: [
    EstadoSubcampania.COMPLETADA,
    EstadoSubcampania.FINALIZADA_PARCIAL,
  ],
  [EstadoSubcampania.COMPLETADA]: [],
  [EstadoSubcampania.FINALIZADA_PARCIAL]: [],
  [EstadoSubcampania.PAUSADA]: [],
  [EstadoSubcampania.CANCELADA]: [],
};

export class TransicionEstadoPolicy {
  static assertTransicionValida(
    actual: EstadoSubcampania,
    destino: EstadoSubcampania,
  ): void {
    const permitidos = TRANSICIONES[actual] ?? [];
    if (!permitidos.includes(destino)) {
      throw new TransicionEstadoPolicyError(
        `Transicion invalida de ${actual} a ${destino}.`,
      );
    }
  }
}
