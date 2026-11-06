import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  commandId,
  id,
  invalidInput,
  revision,
  strictObject,
} from '../../../participacion/dto/comandos.dto';

export const M1_OPERACIONES = [
  'OTORGAR_ACCESO_RECOLECCION',
  'RETIRAR_ACCESO_RECOLECCION',
] as const;
export type M1Operacion = (typeof M1_OPERACIONES)[number];
export type M1Intencion = {
  usuario_destino_id: string;
  revision_esperada: string;
  motivo: string;
};

export const M1_COMANDO_SCHEMA: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['comando_id', 'revision_esperada', 'motivo'],
  properties: {
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
      description: 'Revisión M1 independiente del rol; máximo BIGINT.',
    },
    motivo: {
      type: 'string',
      minLength: 3,
      maxLength: 1000,
      description: 'Trim y normalización NFC antes de registrar la intención.',
    },
  },
};
export function parseM1Comando(user: unknown, value: unknown) {
  const body = strictObject(value, [
    'comando_id',
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
      revision_esperada: revision(body.revision_esperada),
      motivo,
    },
  };
}
export function parseM1Query(value: unknown) {
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
