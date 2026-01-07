import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  MaxLength,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateUbicacionDto } from './create-ubicacion.dto';
import { CreatePlantaDto } from './create-planta.dto';
import { TipoMaterial } from '../enums/tipo-material.enum';
import { EstadoRecoleccion } from '../enums/estado-recoleccion.enum';

export class CreateRecoleccionDto {
  @IsNotEmpty({ message: 'La fecha es requerida' })
  @IsDateString({}, { message: 'La fecha debe ser válida' })
  fecha: string;

  @IsOptional()
  @IsString()
  nombre_cientifico?: string;

  @IsOptional()
  @IsString()
  nombre_comercial?: string;

  @IsNotEmpty({ message: 'La cantidad es requerida' })
  @IsNumber({}, { message: 'La cantidad debe ser un número' })
  @Min(0.01, { message: 'La cantidad debe ser mayor a 0' })
  cantidad: number;

  @IsNotEmpty({ message: 'La unidad es requerida' })
  @IsString()
  unidad: string;

  @IsNotEmpty({ message: 'El tipo de material es requerido' })
  @IsEnum(TipoMaterial, {
    message: 'El tipo de material debe ser SEMILLA, ESTACA, PLANTULA o INJERTO',
  })
  tipo_material: TipoMaterial;

  @IsOptional()
  @IsEnum(EstadoRecoleccion, {
    message:
      'El estado debe ser ALMACENADO, EN_PROCESO, UTILIZADO o DESCARTADO',
  })
  estado?: EstadoRecoleccion;

  @IsNotEmpty({ message: 'El campo especie_nueva es requerido' })
  @IsBoolean({ message: 'especie_nueva debe ser verdadero o falso' })
  especie_nueva: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'Las observaciones no pueden superar 1000 caracteres',
  })
  observaciones?: string;

  @IsNotEmpty({ message: 'La ubicación es requerida' })
  @ValidateNested()
  @Type(() => CreateUbicacionDto)
  ubicacion: CreateUbicacionDto;

  @IsOptional()
  @IsNumber()
  vivero_id?: number;

  @IsNotEmpty({ message: 'El método de recolección es requerido' })
  @IsNumber()
  metodo_id: number;

  @IsOptional()
  @IsNumber()
  planta_id?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePlantaDto)
  nueva_planta?: CreatePlantaDto;
}
