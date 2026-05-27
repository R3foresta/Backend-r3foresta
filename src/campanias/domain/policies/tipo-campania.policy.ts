import { TipoCampania } from '../enums/tipo-campania.enum';

export class TipoCampaniaPolicyError extends Error {}

export class TipoCampaniaPolicy {
  static assertValido(tipo: string): void {
    if (!Object.values(TipoCampania).includes(tipo as TipoCampania)) {
      throw new TipoCampaniaPolicyError(
        `tipo debe ser uno de: ${Object.values(TipoCampania).join(', ')}.`,
      );
    }
  }
}
