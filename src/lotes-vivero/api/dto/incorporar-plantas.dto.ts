import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BigintId } from '../../../common/dto/bigint-id';
import {
  ModalidadIncorporacion,
  ProcedenciaIncorporacion,
} from '../../domain/policies/incorporacion.policy';
import { CrearEvidenciaPendienteViveroDto } from './crear-evidencia-pendiente-vivero.dto';

export class IncorporarPlantasDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Nueva clave sólo ADMIN global activo; conservar clave e intención ante incertidumbre. Replay propio CONFIRMADO y GET resultado sólo exigen cuenta activa aunque pierda ADMIN/M2.',
  })
  @IsUUID()
  solicitud_id: string;

  @ApiProperty({
    type: String,
    pattern: '^[1-9][0-9]*$',
    description: 'ID BIGINT exacto del vivero físico.',
  })
  @BigintId()
  vivero_id: string;

  @ApiProperty({ type: String, pattern: '^[1-9][0-9]*$' })
  @BigintId()
  planta_id: string;

  @ApiProperty({ enum: ModalidadIncorporacion })
  @IsEnum(ModalidadIncorporacion)
  modalidad: ModalidadIncorporacion;

  @ApiProperty({
    enum: ProcedenciaIncorporacion,
    description:
      'RECEPCION: COMPRA/DONACION. SALDO_INICIAL: las cuatro procedencias.',
  })
  @IsEnum(ProcedenciaIncorporacion)
  procedencia: ProcedenciaIncorporacion;

  @ApiProperty({
    format: 'date',
    description:
      'Día físico de recepción o conteo, dentro de la ventana operativa de 10 días inclusivos en America/La_Paz.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fecha_evento: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cantidad: number;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Texto histórico opcional; no demuestra origen biológico.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tercero_origen?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description:
      'Referencia textual no única. No adjuntar facturas como fotos.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  referencia_documental?: string;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'Antecedentes y límites; obligatorio si DESCONOCIDA.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observaciones?: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 5,
    uniqueItems: true,
    description: 'Fotos pendientes propias del mismo vivero y solicitud.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @BigintId(true)
  evidencia_ids: string[];
}

export class EvidenciasIncorporacionDto extends PickType(
  CrearEvidenciaPendienteViveroDto,
  ['titulo', 'descripcion', 'metadata', 'tomado_en', 'es_principal'] as const,
) {
  @ApiProperty({
    type: String,
    description:
      'Vivero físico del alta. El contexto se conserva antes de crear el lote.',
  })
  @BigintId()
  vivero_id: string;
}

export class ConsultarEvidenciasIncorporacionDto {
  @ApiProperty({
    type: String,
    description: 'Vivero físico del contexto pendiente propio.',
  })
  @BigintId()
  vivero_id: string;
}
