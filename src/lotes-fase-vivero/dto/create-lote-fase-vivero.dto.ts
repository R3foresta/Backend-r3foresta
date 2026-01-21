import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  Min,
  IsInt,
  IsArray,
  ArrayNotEmpty,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoteFaseViveroEstado } from '../enums/lote-fase-vivero-estado.enum';

export class CreateLoteFaseViveroDto {
  @IsNotEmpty({ message: 'El codigo de trazabilidad es requerido' })
  @IsString({ message: 'El codigo de trazabilidad debe ser texto' })
  codigo_trazabilidad: string;

  @IsOptional()
  @IsNumber({}, { message: 'planta_id debe ser un numero' })
  @Type(() => Number)
  planta_id?: number;

  @IsNotEmpty({ message: 'vivero_id es requerido' })
  @IsNumber({}, { message: 'vivero_id debe ser un numero' })
  @Type(() => Number)
  vivero_id: number;

  @IsNotEmpty({ message: 'responsable_id es requerido' })
  @IsNumber({}, { message: 'responsable_id debe ser un numero' })
  @Type(() => Number)
  responsable_id: number;

  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser valida' })
  fecha_inicio?: string;

  @IsNotEmpty({ message: 'La cantidad inicial es requerida' })
  @IsInt({ message: 'La cantidad inicial debe ser un entero' })
  @Min(1, { message: 'La cantidad inicial debe ser mayor a 0' })
  @Type(() => Number)
  cantidad_inicio: number;

  @IsOptional()
  @IsEnum(LoteFaseViveroEstado, {
    message:
      'El estado debe ser INICIO, EMBOLSADO, SOMBRA, LISTA_PLANTAR o SALIDA_VIVERO',
  })
  estado?: LoteFaseViveroEstado;

  @IsNotEmpty({ message: 'Las recolecciones son requeridas' })
  @IsArray({ message: 'recoleccion_ids debe ser un arreglo' })
  @ArrayNotEmpty({ message: 'recoleccion_ids no puede estar vacio' })
  @IsNumber({}, { each: true, message: 'recoleccion_ids debe ser numerico' })
  @Type(() => Number)
  recoleccion_ids: number[];

  @IsOptional()
  @IsString({ message: 'observaciones debe ser texto' })
  @MaxLength(2000, {
    message: 'observaciones no puede superar 2000 caracteres',
  })
  observaciones?: string;

  @IsOptional()
  @IsDateString({}, { message: 'created_at debe ser una fecha valida' })
  created_at?: string;
}
