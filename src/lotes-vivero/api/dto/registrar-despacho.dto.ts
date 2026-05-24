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
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DestinoTipoVivero } from '../../domain/enums/destino-tipo-vivero.enum';

export class RegistrarDespachoDto {
  @IsDateString()
  fecha_evento: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  cantidad_afectada: number;

  @IsEnum(DestinoTipoVivero)
  destino_tipo: DestinoTipoVivero;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  destino_referencia: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  comunidad_destino_id?: number;

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Se requiere al menos una evidencia para DESPACHO',
  })
  @IsInt({ each: true })
  evidencia_ids: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
