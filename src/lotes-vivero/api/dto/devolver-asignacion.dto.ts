import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MotivoDevolucionPlantacion } from '../../domain/enums/motivo-devolucion-plantacion.enum';

/**
 * Devolucion FISICA (parcial o total) de stock asignado al vivero (RF-VIV-12).
 * Aumenta cantidad_devuelta de la asignacion y el saldo_vivo_actual del lote
 * (RN-VIV-48). En MVP no exige evidencia fotografica.
 */
export class DevolverAsignacionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad_devuelta: number;

  @IsEnum(MotivoDevolucionPlantacion)
  motivo_devolucion: MotivoDevolucionPlantacion;

  /** Fecha del retorno fisico (YYYY-MM-DD). */
  @IsDateString()
  fecha_devolucion: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
