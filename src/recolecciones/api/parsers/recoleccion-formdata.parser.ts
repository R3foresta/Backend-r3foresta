import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import * as qs from 'qs';
import { CreateRecoleccionDto } from '../dto/create-recoleccion.dto';
import { UpdateDraftDto } from '../dto/update-draft.dto';

@Injectable()
export class RecoleccionFormDataParser {
  async parseCreateBody(bodyRaw: any): Promise<CreateRecoleccionDto> {
    const parsedBody = this.parseBodyRaw(bodyRaw);
    this.applyLegacyFieldAliases(parsedBody);

    if (parsedBody.ubicacion) {
      this.assertNoLegacyUbicacionFields(parsedBody.ubicacion);
    }

    this.normalizeNumericFields(parsedBody);
    return this.validateDto(CreateRecoleccionDto, parsedBody);
  }

  async parseUpdateDraftBody(bodyRaw: any): Promise<UpdateDraftDto> {
    const parsedBody = this.parseBodyRaw(bodyRaw);
    this.applyLegacyFieldAliases(parsedBody);

    if (parsedBody.ubicacion) {
      this.assertNoLegacyUbicacionFields(parsedBody.ubicacion);
    }

    this.normalizeNumericFields(parsedBody);
    return this.validateDto(UpdateDraftDto, parsedBody);
  }

  private async validateDto<T extends object>(
    dtoClass: new () => T,
    parsedBody: any,
  ): Promise<T> {
    const dto = plainToInstance(dtoClass, parsedBody);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const messages = this.collectValidationMessages(errors).join('; ');
      throw new BadRequestException(`Validación fallida: ${messages}`);
    }

    return dto;
  }

  private parseBodyRaw(bodyRaw: any): any {
    if (!bodyRaw) {
      return {};
    }

    if (typeof bodyRaw === 'string') {
      return this.parsePotentialJsonFields(qs.parse(bodyRaw));
    }

    if (typeof bodyRaw === 'object') {
      const entries = Object.entries(bodyRaw);
      const hasBracketNotation = entries.some(([key]) => key.includes('['));

      if (hasBracketNotation) {
        const queryString = entries
          .map(
            ([key, value]) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(this.valueToString(value))}`,
          )
          .join('&');

        return this.parsePotentialJsonFields(qs.parse(queryString));
      }

      return this.parsePotentialJsonFields(bodyRaw);
    }

    return {};
  }

  private parsePotentialJsonFields(parsedBody: any): any {
    if (
      parsedBody &&
      typeof parsedBody === 'object' &&
      typeof parsedBody.ubicacion === 'string'
    ) {
      const rawUbicacion = String(parsedBody.ubicacion).trim();
      if (rawUbicacion.startsWith('{') && rawUbicacion.endsWith('}')) {
        try {
          parsedBody.ubicacion = JSON.parse(rawUbicacion);
        } catch {
          // Se deja tal cual para que class-validator devuelva el error de contrato.
        }
      }
    }

    return parsedBody;
  }

  private valueToString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private applyLegacyFieldAliases(parsedBody: any): void {
    if (!parsedBody || typeof parsedBody !== 'object') {
      return;
    }

    if (
      parsedBody.cantidad_inicial_canonica === undefined &&
      parsedBody.cantidadInicialCanonica !== undefined
    ) {
      parsedBody.cantidad_inicial_canonica = parsedBody.cantidadInicialCanonica;
    }

    if (
      parsedBody.unidad_canonica === undefined &&
      parsedBody.unidadCanonica !== undefined
    ) {
      parsedBody.unidad_canonica = parsedBody.unidadCanonica;
    }

    if (
      parsedBody.tipo_material === undefined &&
      parsedBody.tipoMaterial !== undefined
    ) {
      parsedBody.tipo_material = parsedBody.tipoMaterial;
    }

    if (
      parsedBody.metodo_id === undefined &&
      parsedBody.metodoId !== undefined
    ) {
      parsedBody.metodo_id = parsedBody.metodoId;
    }

    if (
      parsedBody.vivero_id === undefined &&
      parsedBody.viveroId !== undefined
    ) {
      parsedBody.vivero_id = parsedBody.viveroId;
    }

    if (parsedBody.planta_id === undefined) {
      if (parsedBody.plantaId !== undefined) {
        parsedBody.planta_id = parsedBody.plantaId;
      } else if (
        parsedBody.planta &&
        typeof parsedBody.planta === 'object' &&
        parsedBody.planta.id !== undefined
      ) {
        parsedBody.planta_id = parsedBody.planta.id;
      } else if (
        parsedBody.planta !== undefined &&
        (typeof parsedBody.planta === 'string' ||
          typeof parsedBody.planta === 'number')
      ) {
        parsedBody.planta_id = parsedBody.planta;
      }
    }
  }

  private normalizeNumericFields(parsedBody: any): void {
    this.normalizeUpdateDraftNumericFields(parsedBody);

    const ubicacion = parsedBody.ubicacion;
    if (
      !ubicacion ||
      typeof ubicacion !== 'object' ||
      Array.isArray(ubicacion)
    ) {
      return;
    }

    for (const field of [
      'latitud',
      'longitud',
      'pais_id',
      'division_id',
      'precision_m',
    ]) {
      const value = ubicacion[field];
      // No convertir valores vacíos, null o booleanos en coordenadas válidas (0/1).
      if (typeof value === 'number') {
        continue;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        ubicacion[field] = Number(value);
      }
    }
  }

  private normalizeUpdateDraftNumericFields(parsedBody: any): void {
    if (parsedBody.cantidad_inicial_canonica !== undefined) {
      parsedBody.cantidad_inicial_canonica = Number(
        parsedBody.cantidad_inicial_canonica,
      );
    }
    if (parsedBody.vivero_id !== undefined) {
      parsedBody.vivero_id = Number(parsedBody.vivero_id);
    }
    if (parsedBody.metodo_id !== undefined) {
      parsedBody.metodo_id = Number(parsedBody.metodo_id);
    }
    if (parsedBody.planta_id !== undefined) {
      parsedBody.planta_id = Number(parsedBody.planta_id);
    }
  }

  private assertNoLegacyUbicacionFields(
    ubicacion: Record<string, unknown>,
  ): void {
    const legacyFields = [
      'pais',
      'departamento',
      'provincia',
      'municipio',
      'comunidad',
      'zona',
    ];
    const foundLegacyField = legacyFields.find(
      (field) => ubicacion[field] !== undefined,
    );

    if (foundLegacyField) {
      throw new BadRequestException(
        `El campo legacy ubicacion.${foundLegacyField} ya no se soporta. Usa pais_id/division_id/nombre/referencia/latitud/longitud/precision_m/fuente.`,
      );
    }
  }

  private collectValidationMessages(errors: ValidationError[]): string[] {
    const messages: string[] = [];

    for (const error of errors) {
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children && error.children.length > 0) {
        messages.push(...this.collectValidationMessages(error.children));
      }
    }

    return messages;
  }
}
