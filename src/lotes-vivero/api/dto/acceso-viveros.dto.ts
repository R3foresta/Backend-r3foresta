import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  commandId,
  id,
  invalidInput,
  revision,
  strictObject,
} from '../../../participacion/dto/comandos.dto';

export const M2_OPERACIONES = [
  'OTORGAR_ACCESO_VIVERO',
  'RETIRAR_ACCESO_VIVERO',
] as const;
export type M2Operacion = (typeof M2_OPERACIONES)[number];
export type M2Intencion = {
  usuario_destino_id: string;
  vivero_id: string;
  revision_esperada: string;
  motivo: string;
};

export const M2_COMANDO_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['comando_id', 'vivero_id', 'revision_esperada', 'motivo'],
  properties: {
    vivero_id: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 19 },
    comando_id: {
      type: 'string',
      format: 'uuid',
      pattern:
        '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
      description: 'Conservar ante timeout y recuperación.',
    },
    revision_esperada: {
      type: 'string',
      pattern: '^(0|[1-9][0-9]*)$',
      maxLength: 19,
      example: '0',
      description: 'Revisión M2 independiente del rol; máximo BIGINT.',
    },
    motivo: {
      type: 'string',
      minLength: 3,
      maxLength: 1000,
      description: 'Trim y normalización NFC antes de registrar la intención.',
    },
  },
};
export function parseM2Comando(user: unknown, value: unknown) {
  const body = strictObject(value, [
    'comando_id',
    'vivero_id',
    'revision_esperada',
    'motivo',
  ]);
  if (typeof body.motivo !== 'string') invalidInput('motivo');
  const motivo = body.motivo.trim().normalize('NFC');
  if ([...motivo].length < 3 || [...motivo].length > 1000)
    invalidInput('motivo');
  return {
    comando_id: commandId(body.comando_id),
    payload: {
      usuario_destino_id: id(user, 'usuario_id'),
      vivero_id: id(body.vivero_id, 'vivero_id'),
      revision_esperada: revision(body.revision_esperada),
      motivo,
    },
  };
}
export function parseM2Query(value: unknown) {
  const query = strictObject(value, ['antes_de_id', 'limite'], 'query');
  const limite = query.limite === undefined ? 20 : Number(query.limite);
  if (
    !Number.isInteger(limite) ||
    limite < 1 ||
    limite > 50 ||
    (query.limite !== undefined &&
      (typeof query.limite !== 'string' || !/^[1-9][0-9]*$/.test(query.limite)))
  )
    invalidInput('limite');
  return {
    antes_de_id:
      query.antes_de_id === undefined
        ? null
        : id(query.antes_de_id, 'antes_de_id'),
    limite,
  };
}
