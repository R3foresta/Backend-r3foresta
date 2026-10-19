import {
  id,
  invalidInput,
  strictObject,
} from '../participacion/dto/comandos.dto';
import { fechaExacta } from '../participacion/dto/registro.dto';

export type ImpactoQuery = {
  campania_id?: string;
  subcampania_id?: string;
  organizacion_id?: string;
  planta_id?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
  limite: number;
};

export function parseImpactoQuery(
  value: unknown,
  nivel: 'global' | 'campania' | 'subcampania' | 'registro' | 'propio',
): ImpactoQuery {
  const campos = nivel === 'registro' ? [] : ['cursor', 'limite'];
  if (nivel !== 'propio' && nivel !== 'registro') {
    campos.push('organizacion_id', 'planta_id', 'desde', 'hasta');
    if (nivel === 'global') campos.push('campania_id');
    if (nivel === 'global' || nivel === 'campania')
      campos.push('subcampania_id');
  }
  const query = strictObject(value, campos, 'query');
  const result: ImpactoQuery = { limite: 20 };
  for (const key of [
    'campania_id',
    'subcampania_id',
    'organizacion_id',
    'planta_id',
    'cursor',
  ] as const)
    if (query[key] !== undefined) result[key] = id(query[key], key);
  for (const key of ['desde', 'hasta'] as const)
    if (query[key] !== undefined) result[key] = fechaExacta(query[key]);
  if (result.desde && result.hasta && result.desde > result.hasta)
    invalidInput('hasta');
  if (query.limite !== undefined) {
    if (
      typeof query.limite !== 'string' ||
      !/^[1-9][0-9]{0,2}$/.test(query.limite) ||
      Number(query.limite) > 100
    )
      invalidInput('limite');
    result.limite = Number(query.limite);
  }
  return result;
}
