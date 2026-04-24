import { BadRequestException } from '@nestjs/common';
import { EstadoRegistro } from '../enums/estado-registro.enum';
import { EvidenciaCompletitudPolicy } from './evidencia-completitud.policy';

export interface RecoleccionOperativaSnapshot {
  id?: number | string | null;
  estado_registro?: string | null;
  estado_operativo?: string | null;
  saldo_actual?: number | string | null;
  cantidad_inicial_canonica?: number | string | null;
  planta_id?: number | string | null;
  tipo_material?: string | null;
  fotos_count?: number | string | null;
  latitud?: number | string | null;
  longitud?: number | string | null;
}

export interface EvaluacionElegibilidadInicioVivero {
  elegible: boolean;
  motivo_no_elegibilidad: string | null;
  cantidad_solicitada: number | null;
  saldo_actual: number;
  estado_operativo: 'ABIERTO' | 'CERRADO';
}

interface EstadoOperativoResuelto {
  estadoOperativo: 'ABIERTO' | 'CERRADO';
  esEstadoValido: boolean;
}

export class ElegibilidadInicioViveroPolicy {
  static evaluar(
    recoleccion: RecoleccionOperativaSnapshot,
    cantidadSolicitada?: number | null,
  ): EvaluacionElegibilidadInicioVivero {
    const saldoActual = this.normalizarSaldoActual(recoleccion);
    const { estadoOperativo, esEstadoValido } = this.resolverEstadoOperativo(
      recoleccion,
      saldoActual,
    );
    const estadoRegistro = String(
      recoleccion.estado_registro ?? '',
    ).toUpperCase();
    const plantaId = this.normalizarPlantaId(recoleccion.planta_id);
    const cantidadEvaluada =
      this.normalizarCantidadSolicitada(cantidadSolicitada);
    const tipoMaterial = String(recoleccion.tipo_material ?? '').trim();
    const fotosCount = Number(recoleccion.fotos_count ?? 0);

    if (estadoRegistro !== EstadoRegistro.VALIDADO) {
      return this.crearResultado(
        false,
        'La recoleccion no esta validada.',
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (!esEstadoValido) {
      return this.crearResultado(
        false,
        'La recoleccion tiene un estado_operativo invalido.',
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

    if (!tipoMaterial) {
      return this.crearResultado(
        false,
        'La recoleccion no tiene tipo_material definido.',
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (!Number.isFinite(fotosCount) || fotosCount < 2) {
      return this.crearResultado(
        false,
        'La recoleccion no tiene evidencia minima completa.',
        cantidadEvaluada,
        saldoActual,
        estadoOperativo,
      );
    }

    if (
      !EvidenciaCompletitudPolicy.tieneUbicacionValida({
        latitud: recoleccion.latitud,
        longitud: recoleccion.longitud,
      })
    ) {
      return this.crearResultado(
        false,
        'La recoleccion no tiene ubicacion valida para iniciar vivero.',
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

  static validar(
    recoleccion: RecoleccionOperativaSnapshot,
    cantidadSolicitada: number,
  ): EvaluacionElegibilidadInicioVivero {
    const cantidadNormalizada =
      this.assertCantidadSolicitadaValida(cantidadSolicitada);
    const evaluacion = this.evaluar(recoleccion, cantidadNormalizada);

    if (!evaluacion.elegible) {
      throw new BadRequestException(evaluacion.motivo_no_elegibilidad);
    }

    return evaluacion;
  }

  private static assertCantidadSolicitadaValida(cantidadSolicitada: number) {
    const cantidad = this.normalizarCantidadSolicitada(cantidadSolicitada);

    if (cantidad === null) {
      throw new BadRequestException(
        'La cantidad solicitada para vivero debe ser mayor a 0.',
      );
    }

    return cantidad;
  }

  private static normalizarSaldoActual(
    recoleccion: RecoleccionOperativaSnapshot,
  ) {
    const saldo = Number(
      recoleccion.saldo_actual ?? recoleccion.cantidad_inicial_canonica ?? 0,
    );
    return Number.isFinite(saldo) ? saldo : 0;
  }

  private static resolverEstadoOperativo(
    recoleccion: RecoleccionOperativaSnapshot,
    saldoActual: number,
  ): EstadoOperativoResuelto {
    if (
      recoleccion.estado_operativo === undefined ||
      recoleccion.estado_operativo === null
    ) {
      return {
        estadoOperativo: saldoActual > 0 ? 'ABIERTO' : 'CERRADO',
        esEstadoValido: true,
      };
    }

    const estado = String(recoleccion.estado_operativo).toUpperCase();

    if (estado === 'ABIERTO' || estado === 'CERRADO') {
      return {
        estadoOperativo: estado,
        esEstadoValido: true,
      };
    }

    return {
      estadoOperativo: 'CERRADO',
      esEstadoValido: false,
    };
  }

  private static normalizarPlantaId(
    plantaId: number | string | null | undefined,
  ) {
    const parsed = Number(plantaId);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  private static normalizarCantidadSolicitada(
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

  private static crearResultado(
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
