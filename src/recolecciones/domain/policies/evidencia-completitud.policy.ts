import { BadRequestException } from '@nestjs/common';

export type RecoleccionFotoInput = {
  mimetype?: string;
  size?: number;
  originalname?: string;
  buffer?: Buffer;
};

export type RecoleccionCompletitudInput = {
  fecha?: unknown;
  tipo_material?: unknown;
  planta_id?: unknown;
  metodo_id?: unknown;
  vivero_id?: unknown;
  cantidad_inicial_canonica?: unknown;
  unidad_canonica?: unknown;
  latitud?: unknown;
  longitud?: unknown;
  fotos_count?: unknown;
};

export class EvidenciaCompletitudPolicy {
  static validarFotos(
    files: RecoleccionFotoInput[],
    options: { minCount?: number; maxCount?: number; requireBuffer?: boolean },
  ): void {
    const minCount = options.minCount ?? 0;
    const maxCount = options.maxCount ?? 5;

    if (files.length < minCount) {
      throw new BadRequestException(
        `Se requieren al menos ${minCount} fotos para crear una recolección`,
      );
    }

    if (files.length > maxCount) {
      throw new BadRequestException(`Máximo ${maxCount} fotos permitidas`);
    }

    for (const file of files) {
      if (options.requireBuffer && !Buffer.isBuffer(file.buffer)) {
        throw new BadRequestException(
          'No se pudieron procesar las fotos enviadas. Verifica que el endpoint use multipart/form-data correctamente.',
        );
      }

      const mimeType = String(file.mimetype ?? '').trim().toLowerCase();
      const formato = mimeType.split('/')[1]?.toUpperCase();

      if (!formato || !['JPG', 'JPEG', 'PNG'].includes(formato)) {
        throw new BadRequestException(
          `Formato ${formato || 'DESCONOCIDO'} no permitido. Solo JPG, JPEG, PNG`,
        );
      }

      if (Number(file.size ?? 0) > 5242880) {
        throw new BadRequestException(
          `Archivo ${file.originalname || 'sin_nombre'} supera 5MB`,
        );
      }
    }
  }

  static assertCompletaParaValidacion(
    recoleccion: RecoleccionCompletitudInput,
  ): void {
    this.assertPresent(recoleccion.fecha, 'fecha');
    this.assertPresent(recoleccion.tipo_material, 'tipo_material');
    this.assertPositiveInteger(recoleccion.planta_id, 'planta_id');
    this.assertPositiveInteger(recoleccion.metodo_id, 'metodo_id');
    this.assertPositiveInteger(recoleccion.vivero_id, 'vivero_id');
    this.assertPositiveNumber(
      recoleccion.cantidad_inicial_canonica,
      'cantidad_inicial_canonica',
    );
    this.assertPresent(recoleccion.unidad_canonica, 'unidad_canonica');
    this.assertLatitud(recoleccion.latitud);
    this.assertLongitud(recoleccion.longitud);

    const fotosCount = Number(recoleccion.fotos_count ?? 0);
    if (!Number.isFinite(fotosCount) || fotosCount < 2) {
      throw new BadRequestException(
        'Para solicitar validación se requieren al menos 2 fotos.',
      );
    }
  }

  static tieneUbicacionValida(input: {
    latitud?: unknown;
    longitud?: unknown;
  }): boolean {
    return (
      this.isNumberInRange(input.latitud, -90, 90) &&
      this.isNumberInRange(input.longitud, -180, 180)
    );
  }

  private static assertPresent(value: unknown, fieldName: string): void {
    if (value === null || value === undefined || String(value).trim() === '') {
      throw new BadRequestException(`${fieldName} es requerido para validar.`);
    }
  }

  private static assertPositiveInteger(value: unknown, fieldName: string): void {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} es requerido para validar.`);
    }
  }

  private static assertPositiveNumber(value: unknown, fieldName: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${fieldName} debe ser mayor a 0.`);
    }
  }

  private static assertLatitud(value: unknown): void {
    if (!this.isNumberInRange(value, -90, 90)) {
      throw new BadRequestException(
        'latitud es requerida para validar y debe estar en rango [-90, 90].',
      );
    }
  }

  private static assertLongitud(value: unknown): void {
    if (!this.isNumberInRange(value, -180, 180)) {
      throw new BadRequestException(
        'longitud es requerida para validar y debe estar en rango [-180, 180].',
      );
    }
  }

  private static isNumberInRange(
    value: unknown,
    min: number,
    max: number,
  ): boolean {
    if (value === null || value === undefined || String(value).trim() === '') {
      return false;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max;
  }
}
