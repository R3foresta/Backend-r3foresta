import { BigintId } from '../../../common/dto/bigint-id';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsDateString,
  IsEnum,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { UnidadMedidaVivero } from '../../domain/enums/unidad-medida-vivero.enum';

export const CANTIDAD_INICIO_DECIMAL = /^(0|[1-9][0-9]{0,23})(\.[0-9]{1,6})?$/;

function esCantidadInicio(value: unknown): boolean {
  if (typeof value === 'string') {
    return CANTIDAD_INICIO_DECIMAL.test(value) && /[1-9]/.test(value);
  }
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0.000001 &&
    (Number.isInteger(value) ||
      CANTIDAD_INICIO_DECIMAL.test(String(value)))
  );
}

export class CrearLoteViveroDto {
  @BigintId()
  recoleccion_id: number | string;

  @BigintId()
  vivero_id: number | string;

  @IsDateString()
  fecha_inicio: string;

  @IsDateString()
  fecha_evento: string;

  @ValidateBy({
    name: 'cantidadInicioVivero',
    validator: {
      validate: esCantidadInicio,
      defaultMessage: () =>
        'La cantidad inicial debe ser positiva y tener hasta 6 decimales.',
    },
  })
  cantidad_inicial_en_proceso: number | string;

  @IsEnum(UnidadMedidaVivero)
  unidad_medida_inicial: UnidadMedidaVivero;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @BigintId(true)
  evidencia_ids: (number | string)[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
