import { id, revision } from '../../dto/comandos.dto';
import { coordenada, fechaExacta } from '../../dto/registro.dto';

export function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error();
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== keys.length ||
    keys.some((key) => !(key in row))
  )
    throw new Error();
  return row;
}
export function check(condition: unknown): asserts condition {
  if (!condition) throw new Error();
}
export function instant(value: unknown): string {
  check(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
  return value;
}
function text(value: unknown, nullable = false) {
  check(typeof value === 'string' || (nullable && value === null));
}
function integer(value: unknown, min = 0) {
  check(
    typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= min &&
      value <= 2147483647,
  );
}
function list(value: unknown, min: number, max: number): unknown[] {
  check(Array.isArray(value) && value.length >= min && value.length <= max);
  return value;
}
export function personaMinima(value: unknown) {
  const row = exact(value, ['usuario_id', 'nombre', 'organizacion']);
  id(row.usuario_id);
  text(row.nombre);
  text(row.organizacion, true);
  return row as {
    usuario_id: string;
    nombre: string;
    organizacion: string | null;
  };
}
export function contextoRegistro(
  value: unknown,
  actorId: string,
  scope: string,
) {
  const row = exact(value, [
    'subcampania',
    'actor',
    'disponibilidad',
    'especies',
    'reglas',
  ]);
  const sub = exact(row.subcampania, [
    'id',
    'campania_id',
    'nombre',
    'campania_nombre',
    'estado',
    'plan_revision',
    'meta_total_arboles',
    'poligono',
  ]);
  check(id(sub.id) === scope);
  id(sub.campania_id);
  text(sub.nombre);
  text(sub.campania_nombre);
  check(sub.estado === 'ACTIVA');
  revision(sub.plan_revision);
  integer(sub.meta_total_arboles, 1);
  const polygon = exact(sub.poligono, ['type', 'coordinates']);
  check(polygon.type === 'Polygon');
  list(polygon.coordinates, 1, 10000).forEach((ring) => {
    const points = list(ring, 4, 100000);
    points.forEach((point) => {
      const p = list(point, 2, 2);
      check(
        typeof p[0] === 'number' &&
          Number.isFinite(p[0]) &&
          Math.abs(p[0]) <= 180,
      );
      check(
        typeof p[1] === 'number' &&
          Number.isFinite(p[1]) &&
          Math.abs(p[1]) <= 90,
      );
    });
    check(JSON.stringify(points[0]) === JSON.stringify(points.at(-1)));
  });
  const actor = exact(row.actor, ['usuario_id', 'fuente_autoridad']);
  check(
    id(actor.usuario_id) === actorId &&
      ['GLOBAL', 'CONTEXTUAL'].includes(actor.fuente_autoridad as string),
  );
  check(['DISPONIBLE', 'SIN_STOCK'].includes(row.disponibilidad as string));
  const speciesIds = new Set<string>();
  list(row.especies, 1, 100).forEach((value) => {
    const entry = exact(value, [
      'planta_id',
      'nombre',
      'porcentaje_objetivo',
      'cantidad_objetivo',
      'saldo_elegible',
    ]);
    const plant = id(entry.planta_id);
    check(!speciesIds.has(plant));
    speciesIds.add(plant);
    text(entry.nombre);
    integer(entry.cantidad_objetivo);
    integer(entry.saldo_elegible);
    check(
      typeof entry.porcentaje_objetivo === 'number' &&
        Number.isFinite(entry.porcentaje_objetivo) &&
        entry.porcentaje_objetivo >= 0 &&
        entry.porcentaje_objetivo <= 100,
    );
  });
  const rules = exact(row.reglas, [
    'hoy_operativo',
    'fecha_minima_ventana',
    'fecha_maxima',
    'zona_horaria',
    'ventana_retroactiva_dias',
    'fotos_min',
    'fotos_max',
    'exterior_permitido',
  ]);
  ['hoy_operativo', 'fecha_minima_ventana', 'fecha_maxima'].forEach((key) =>
    fechaExacta(rules[key]),
  );
  check(
    rules.zona_horaria === 'America/La_Paz' &&
      rules.ventana_retroactiva_dias === 10 &&
      rules.fotos_min === 1 &&
      rules.fotos_max === 10 &&
      rules.exterior_permitido === true,
  );
  return row;
}
export function detallePropio(
  value: unknown,
  actorId: string,
  registroId: string,
) {
  const row = exact(value, [
    'registro_plantacion_id',
    'codigo_trazabilidad',
    'subcampania_id',
    'fecha_plantacion',
    'revision_registro',
    'relaciones',
    'cantidad_total_plantada',
    'especies',
    'latitud',
    'longitud',
    'gps_dentro_poligono',
    'participantes',
    'evidencia_ids',
    'observaciones_autor',
  ]);
  check(id(row.registro_plantacion_id) === registroId);
  id(row.subcampania_id);
  text(row.codigo_trazabilidad);
  fechaExacta(row.fecha_plantacion);
  revision(row.revision_registro);
  integer(row.cantidad_total_plantada, 1);
  const relations = list(row.relaciones, 1, 2);
  check(
    relations.every((r) => ['AUTOR', 'PARTICIPANTE'].includes(r as string)) &&
      new Set(relations).size === relations.length,
  );
  const speciesIds = new Set<string>();
  let total = 0;
  list(row.especies, 1, 100).forEach((value) => {
    const species = exact(value, ['planta_id', 'cantidad']);
    const plant = id(species.planta_id);
    check(!speciesIds.has(plant));
    speciesIds.add(plant);
    integer(species.cantidad, 1);
    total += species.cantidad as number;
  });
  check(total === row.cantidad_total_plantada);
  coordenada(row.latitud, 90, 'latitud');
  coordenada(row.longitud, 180, 'longitud');
  check(typeof row.gps_dentro_poligono === 'boolean');
  const people = list(row.participantes, 1, 101).map((value) => {
    const person = exact(value, [
      'usuario_id',
      'nombre_snapshot',
      'afiliacion_snapshot',
      'afiliacion_estado',
      'afiliacion_tipo',
      'organizacion_id_snapshot',
      'es_responsable',
    ]);
    id(person.usuario_id);
    text(person.nombre_snapshot, true);
    text(person.afiliacion_snapshot, true);
    check(typeof person.es_responsable === 'boolean');
    if (person.afiliacion_estado === 'DECLARADA') {
      check(
        typeof person.afiliacion_snapshot === 'string' &&
          person.afiliacion_snapshot.trim(),
      );
      check(
        ['ORGANIZACION_REGISTRADA', 'OTRA'].includes(
          person.afiliacion_tipo as string,
        ),
      );
      if (person.afiliacion_tipo === 'ORGANIZACION_REGISTRADA')
        id(person.organizacion_id_snapshot);
      else check(person.organizacion_id_snapshot === null);
    } else
      check(
        ['NO_DECLARADA', 'HISTORICA_NO_DISPONIBLE'].includes(
          person.afiliacion_estado as string,
        ) &&
          person.afiliacion_snapshot === null &&
          person.afiliacion_tipo === null &&
          person.organizacion_id_snapshot === null,
      );
    return person;
  });
  check(
    new Set(people.map((p) => p.usuario_id)).size === people.length &&
      people.filter((p) => p.es_responsable).length === 1,
  );
  check(people.some((p) => p.usuario_id === actorId));
  check(
    relations.includes('AUTOR') ===
      people.some((p) => p.usuario_id === actorId && p.es_responsable),
  );
  const images = list(row.evidencia_ids, 0, 10).map((value) => id(value));
  check(new Set(images).size === images.length);
  text(row.observaciones_autor, true);
  if (!relations.includes('AUTOR')) check(row.observaciones_autor === null);
  return row;
}
