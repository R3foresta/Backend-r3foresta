import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoOrganizacion } from '../enums/tipo-organizacion.enum';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

function transformOptionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    if (n === 'true' || n === '1') return true;
    if (n === 'false' || n === '0') return false;
  }
  return value;
}

export class CrearOrganizacionDto {
  @ApiProperty({
    description: 'Nombre de la organizacion. Unico (case-insensitive).',
    example: 'Fundacion Verde Andina',
    minLength: 2,
    maxLength: 200,
  })
  @Transform(trim)
  @IsString({ message: 'nombre debe ser texto' })
  @IsNotEmpty({ message: 'nombre es requerido' })
  @MinLength(2, { message: 'nombre debe tener al menos 2 caracteres' })
  @MaxLength(200, { message: 'nombre no puede superar 200 caracteres' })
  nombre: string;

  @ApiProperty({
    enum: TipoOrganizacion,
    example: TipoOrganizacion.ONG,
    description: 'Clasificacion de la organizacion (enum tipo_organizacion).',
  })
  @IsEnum(TipoOrganizacion, {
    message: 'tipo no es un valor valido del enum tipo_organizacion',
  })
  tipo: TipoOrganizacion;

  @ApiPropertyOptional({
    description: 'Si false, la organizacion queda archivada. Default true.',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => transformOptionalBoolean(value))
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;
}
