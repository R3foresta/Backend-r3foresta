import {
  id,
  invalidInput,
  strictObject,
} from '../participacion/dto/comandos.dto';
import { fechaExacta } from '../participacion/dto/registro.dto';

const camposPlantaciones = [
  'desde',
  'hasta',
  'organizacion_id',
  'campania_id',
  'planta_id',
] as const;
const camposVivero = ['planta_id', 'vivero_id'] as const;
const camposMovimientos = [
  ...camposVivero,
  'desde',
  'hasta',
  'pagina',
] as const;
const camposMermas = [...camposMovimientos, 'exportar'] as const;

function idOpcional(query: Record<string, unknown>, campo: string) {
  return query[campo] === undefined ? null : id(query[campo], campo);
}

function periodo(query: Record<string, unknown>) {
  const desde = fechaExacta(query.desde, 'desde');
  const hasta = fechaExacta(query.hasta, 'hasta');
  if (hasta < desde) invalidInput('hasta');
  return { desde, hasta };
}

function pagina(value: unknown) {
  if (value === undefined) return 1;
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,6}$/.test(value) ||
    Number(value) > 1_000_000
  )
    invalidInput('pagina');
  return Number(value);
}

export function parseFiltrosPlantaciones(value: unknown) {
  const query = strictObject(value, camposPlantaciones, 'query');
  return {
    ...periodo(query),
    organizacion_id: idOpcional(query, 'organizacion_id'),
    campania_id: idOpcional(query, 'campania_id'),
    planta_id: idOpcional(query, 'planta_id'),
  };
}

function ambitoVivero(query: Record<string, unknown>) {
  return {
    planta_id: idOpcional(query, 'planta_id'),
    vivero_id: idOpcional(query, 'vivero_id'),
  };
}

export function parseFiltrosVivero(value: unknown) {
  return ambitoVivero(strictObject(value, camposVivero, 'query'));
}

export function parseFiltrosMovimientosSemillas(value: unknown) {
  const query = strictObject(value, camposMovimientos, 'query');
  return {
    ...periodo(query),
    ...ambitoVivero(query),
    pagina: pagina(query.pagina),
  };
}

export function parseFiltrosMermas(value: unknown) {
  const query = strictObject(value, camposMermas, 'query');
  if (query.exportar !== undefined && query.exportar !== '1')
    invalidInput('exportar');
  const exportar = query.exportar === '1';
  const paginaSolicitada = pagina(query.pagina);
  if (exportar && paginaSolicitada !== 1) invalidInput('pagina');

  return {
    ...periodo(query),
    ...ambitoVivero(query),
    pagina: paginaSolicitada,
    exportar,
  };
}
