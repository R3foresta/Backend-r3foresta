import { BadRequestException, Injectable } from '@nestjs/common';
import { EstadoRegistro } from './enums/estado-registro.enum';

export interface RecoleccionOperativaSnapshot {
  id?: number | string | null;
  estado_registro?: string | null;
  estado_operativo?: string | null;
  saldo_actual?: number | string | null;
  cantidad_inicial_canonica?: number | string | null;
  planta_id?: number | string | null;
}

export interface EvaluacionElegibilidadInicioVivero {
  elegible: boolean;
  motivo_no_elegibilidad: string | null;
  cantidad_solicitada: number | null;
  saldo_actual: number;
  estado_operativo: 'ABIERTO' | 'CERRADO';
}

@Injectable()
export class RecoleccionElegibilidadService {
  evaluarRecoleccionElegibleParaInicioVivero(
    recoleccion: RecoleccionOperativaSnapshot,
    cantidadSolicitada?: number | null,
  ): EvaluacionElegibilidadInicioVivero {
    const saldoActual = this.normalizarSaldoActual(recoleccion);
    const estadoOperativo = this.normalizarEstadoOperativo(
      recoleccion,
      saldoActual,
    );
    const estadoRegistro = String(
      recoleccion.estado_registro ?? '',
    ).toUpperCase();
    const plantaId = this.normalizarPlantaId(recoleccion.planta_id);
    const cantidadEvaluada = this.normalizarCantidadSolicitada(cantidadSolicitada);

    if (estadoRegistro !== EstadoRegistro.VALIDADO) {
      return this.crearResultado(
        false,
        'La recoleccion no esta validada.',
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (estadoOperativo !== 'ABIERTO') {
      return this.crearResultado(
        false,
        'La recoleccion esta cerrada para consumo hacia vivero.',
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (plantaId === null) {
      return this.crearResultado(
        false,
        'La recoleccion no tiene planta asociada.',
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (cantidadEvaluada !== null) {
      if (cantidadEvaluada > saldoActual) {
        return this.crearResultado(
          false,
          'La recoleccion no tiene saldo suficiente para la cantidad solicitada.',
          cantidadEvaluada,
          saldoActual,
          estadoOperativo,
        );
      }

      return this.crearResultado(
        true,
        null,
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (saldoActual <= 0) {
      return this.crearResultado(
        false,
        'La recoleccion no tiene saldo disponible para iniciar un lote de vivero.',
        null,
        saldoActual,
        estadoOperativo,
      );
    }

    return this.crearResultado(true, null, null, saldoActual, estadoOperativo);
  }

  validarRecoleccionElegibleParaInicioVivero(
    recoleccion: RecoleccionOperativaSnapshot,
    cantidadSolicitada: number,
  ): EvaluacionElegibilidadInicioVivero {
    const cantidadNormalizada = this.assertCantidadSolicitadaValida(
      cantidadSolicitada,
    );
    const evaluacion = this.evaluarRecoleccionElegibleParaInicioVivero(
      recoleccion,
      cantidadNormalizada,
    );

    if (!evaluacion.elegible) {
      throw new BadRequestException(evaluacion.motivo_no_elegibilidad);
    }

    return evaluacion;
  }

  private assertCantidadSolicitadaValida(cantidadSolicitada: number) {
    const cantidad = this.normalizarCantidadSolicitada(cantidadSolicitada);

    if (cantidad === null) {
      throw new BadRequestException(
        'La cantidad solicitada para vivero debe ser mayor a 0.',
      );
    }

    return cantidad;
  }

  private normalizarSaldoActual(recoleccion: RecoleccionOperativaSnapshot) {
    const saldo = Number(
      recoleccion.saldo_actual ?? recoleccion.cantidad_inicial_canonica ?? 0,
    );
    return Number.isFinite(saldo) ? saldo : 0;
  }

  private normalizarEstadoOperativo(
    recoleccion: RecoleccionOperativaSnapshot,
    saldoActual: number,
  ): 'ABIERTO' | 'CERRADO' {
    const estado = String(
      recoleccion.estado_operativo ??
        (saldoActual > 0 ? 'ABIERTO' : 'CERRADO'),
    ).toUpperCase();

    return estado === 'CERRADO' ? 'CERRADO' : 'ABIERTO';
  }

  private normalizarPlantaId(plantaId: number | string | null | undefined) {
    const parsed = Number(plantaId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private normalizarCantidadSolicitada(
    cantidadSolicitada?: number | null,
  ): number | null {
    if (cantidadSolicitada === undefined || cantidadSolicitada === null) {
      return null;
    }

    const cantidad = Number(cantidadSolicitada);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return null;
    }

    return cantidad;
  }

  private crearResultado(
    elegible: boolean,
    motivoNoElegibilidad: string | null,
    cantidadSolicitada: number | null,
    saldoActual: number,
    estadoOperativo: 'ABIERTO' | 'CERRADO',
  ): EvaluacionElegibilidadInicioVivero {
    return {
      elegible,
      motivo_no_elegibilidad: motivoNoElegibilidad,
      cantidad_solicitada: cantidadSolicitada,
      saldo_actual: saldoActual,
      estado_operativo: estadoOperativo,
    };
  }
}
