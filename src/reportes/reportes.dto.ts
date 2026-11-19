import {
  id,
  invalidInput,
  strictObject,
} from '../participacion/dto/comandos.dto';
import { fechaExacta } from '../participacion/dto/registro.dto';

const campos = [
  'desde',
  'hasta',
  'organizacion_id',
  'campania_id',
  'planta_id',
] as const;
export function parseFiltrosPlantaciones(value: unknown) {
  const query = strictObject(value, campos, 'query');
  const desde = fechaExacta(query.desde, 'desde');
  const hasta = fechaExacta(query.hasta, 'hasta');
  if (hasta < desde) invalidInput('hasta');
  return {
    desde,
    hasta,
    organizacion_id:
      query.organizacion_id === undefined
        ? null
        : id(query.organizacion_id, 'organizacion_id'),
    campania_id:
      query.campania_id === undefined
        ? null
        : id(query.campania_id, 'campania_id'),
    planta_id:
      query.planta_id === undefined ? null : id(query.planta_id, 'planta_id'),
  };
}
