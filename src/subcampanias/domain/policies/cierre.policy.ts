import { EstadoSubcampania } from '../enums/estado-subcampania.enum';
import { MotivoCierreParcial } from '../enums/motivo-cierre-parcial.enum';

export class CierrePolicyError extends Error {}

export type CierreParams = {
  estadoFinal: string;
  fechaCierreOperativo: string | null | undefined;
  fechaFinMantenimiento: string | null | undefined;
  motivoCierreParcial?: string | null;
};

const ESTADOS_FINALES_VALIDOS = new Set<string>([
  EstadoSubcampania.COMPLETADA,
  EstadoSubcampania.FINALIZADA_PARCIAL,
]);

export class CierrePolicy {
  static assertValido(params: CierreParams): void {
    const {
      estadoFinal,
      fechaCierreOperativo,
      fechaFinMantenimiento,
      motivoCierreParcial,
    } = params;

    if (!ESTADOS_FINALES_VALIDOS.has(estadoFinal)) {
      throw new CierrePolicyError(
        `estado_final debe ser COMPLETADA o FINALIZADA_PARCIAL. Recibido: ${estadoFinal}.`,
      );
    }

    if (!fechaCierreOperativo || !fechaFinMantenimiento) {
      throw new CierrePolicyError(
        'fecha_cierre_operativo y fecha_fin_mantenimiento son requeridas para cerrar.',
      );
    }

    if (new Date(fechaFinMantenimiento) < new Date(fechaCierreOperativo)) {
      throw new CierrePolicyError(
        'fecha_fin_mantenimiento no puede ser anterior a fecha_cierre_operativo.',
      );
    }

    if (estadoFinal === EstadoSubcampania.FINALIZADA_PARCIAL) {
      if (!motivoCierreParcial) {
        throw new CierrePolicyError(
          'motivo_cierre_parcial es requerido para cerrar como FINALIZADA_PARCIAL.',
        );
      }

      if (
        !Object.values(MotivoCierreParcial).includes(
          motivoCierreParcial as MotivoCierreParcial,
        )
      ) {
        throw new CierrePolicyError(
          `motivo_cierre_parcial invalido. Valores permitidos: ${Object.values(
            MotivoCierreParcial,
          ).join(', ')}.`,
        );
      }
    }
  }
}
