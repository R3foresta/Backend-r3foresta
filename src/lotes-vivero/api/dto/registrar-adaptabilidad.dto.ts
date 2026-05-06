import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SubetapaAdaptabilidad } from '../../domain/enums/subetapa-adaptabilidad.enum';

export class RegistrarAdaptabilidadDto {
  @IsDateString()
  fecha_evento: string;

  @IsEnum(SubetapaAdaptabilidad)
  subetapa_destino: SubetapaAdaptabilidad;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  evidencia_ids?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
