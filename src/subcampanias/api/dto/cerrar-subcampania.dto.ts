import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MotivoCierreParcial } from '../../domain/enums/motivo-cierre-parcial.enum';

export enum EstadoFinalSubcampania {
  COMPLETADA = 'COMPLETADA',
  FINALIZADA_PARCIAL = 'FINALIZADA_PARCIAL',
}

export class CerrarSubcampaniaDto {
  @IsEnum(EstadoFinalSubcampania)
  estado_final: EstadoFinalSubcampania;

  @IsDateString()
  fecha_cierre_operativo: string;

  @IsDateString()
  fecha_fin_mantenimiento: string;

  @IsOptional()
  @IsEnum(MotivoCierreParcial)
  motivo_cierre_parcial?: MotivoCierreParcial;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observaciones_cierre?: string;
}
