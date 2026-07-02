import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CausaDescartePreEmbolsado } from '../../domain/enums/causa-descarte-pre-embolsado.enum';
import { UnidadMedidaVivero } from '../../domain/enums/unidad-medida-vivero.enum';

export class RegistrarDescartePreEmbolsadoDto {
  @IsDateString()
  fecha_evento: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  cantidad_material_afectado: number;

  @IsEnum(UnidadMedidaVivero)
  unidad_medida_evento: UnidadMedidaVivero;

  @IsEnum(CausaDescartePreEmbolsado)
  causa_descarte_pre_embolsado: CausaDescartePreEmbolsado;

  @IsArray()
  @ArrayMinSize(1, {
    message: 'Se requiere al menos una evidencia para DESCARTE_PRE_EMBOLSADO',
  })
  @ArrayUnique({ message: 'evidencia_ids no debe contener IDs duplicados' })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  evidencia_ids: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
