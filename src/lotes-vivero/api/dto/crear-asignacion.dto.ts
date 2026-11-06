import { BigintId } from '../../../common/dto/bigint-id';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PropositoAsignacion } from '../../domain/enums/proposito-asignacion.enum';

/**
 * Asignacion FISICA de stock de un lote de vivero a una subcampania (RF-VIV-11).
 * La entrega descuenta LOTE_VIVERO.saldo_vivo_actual y exige evidencia propia
 * de la salida/entrega (RN-VIV-47, RN-VIV-54).
 */
export class CrearAsignacionDto {
  @BigintId()
  subcampania_id: number | string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad_asignada: number;

  @IsEnum(PropositoAsignacion)
  proposito: PropositoAsignacion;

  /** Fecha de la entrega fisica (YYYY-MM-DD). */
  @IsDateString()
  fecha_asignacion: string;

  /** Evidencias pendientes (pre-subidas) que respaldan la entrega. Minimo 1. */
  @IsArray()
  @ArrayMinSize(1)
  @BigintId(true)
  evidencia_ids: (number | string)[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
