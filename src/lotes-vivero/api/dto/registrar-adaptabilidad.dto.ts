import {
  IsDateString,
  IsEnum,
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
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
