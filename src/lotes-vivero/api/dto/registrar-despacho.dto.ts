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
import { DestinoTipoVivero } from '../../domain/enums/destino-tipo-vivero.enum';

// TODO(vivero-mvp): DTO definido pero el endpoint no está implementado.
//   Spec: RF-VIV-05 (BLOQUEANTE MVP) — ver TODO en
//   vivero-eventos.service.ts:registrarDespacho.
//   Al implementar, validar contra el enum `DestinoTipoVivero` que está pendiente
//   de alineación con el spec (ver TODO en domain/enums/destino-tipo-vivero.enum.ts).
//   Falta también: `comunidad_destino_id` debería ser obligatorio cuando
//   `destino_tipo` implica una comunidad (RF-VIV-05 condicional).
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
  @MaxLength(500)
  destino_referencia: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  comunidad_destino_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;
}
