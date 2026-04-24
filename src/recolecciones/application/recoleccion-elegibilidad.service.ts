import { Injectable } from '@nestjs/common';
import {
  ElegibilidadInicioViveroPolicy,
  type EvaluacionElegibilidadInicioVivero,
  type RecoleccionOperativaSnapshot,
} from '../domain/policies/elegibilidad-inicio-vivero.policy';

export type {
  EvaluacionElegibilidadInicioVivero,
  RecoleccionOperativaSnapshot,
} from '../domain/policies/elegibilidad-inicio-vivero.policy';

@Injectable()
export class RecoleccionElegibilidadService {
  evaluarRecoleccionElegibleParaInicioVivero(
    recoleccion: RecoleccionOperativaSnapshot,
    cantidadSolicitada?: number | null,
  ): EvaluacionElegibilidadInicioVivero {
    return ElegibilidadInicioViveroPolicy.evaluar(
      recoleccion,
      cantidadSolicitada,
    );
  }

  validarRecoleccionElegibleParaInicioVivero(
    recoleccion: RecoleccionOperativaSnapshot,
    cantidadSolicitada: number,
  ): EvaluacionElegibilidadInicioVivero {
    return ElegibilidadInicioViveroPolicy.validar(
      recoleccion,
      cantidadSolicitada,
    );
  }
}
