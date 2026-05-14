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

// Nota: `evidencia_ids` es opcional a propósito.
// Spec: RN-VIV-26 / RF-VIV-06 dicen que ADAPTABILIDAD es el único evento del MVP
// donde la evidencia NO es obligatoria. INICIO, EMBOLSADO, MERMA y DESPACHO sí
// la exigen. No marcar como requerida sin coordinar con docs.
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
