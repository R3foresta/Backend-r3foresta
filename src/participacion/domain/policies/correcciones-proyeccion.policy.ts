import { id, revision } from '../../dto/comandos.dto';
import { check, exact, instant } from './registro-proyeccion.policy';

function nullableText(value: unknown): asserts value is string | null {
  check(value === null || typeof value === 'string');
}

export function correctionContext(value: unknown, registro: string) {
  const row = exact(value, [
    'registro_plantacion_id',
    'subcampania_id',
    'campania_id',
    'estado_subcampania',
    'es_reposicion',
    'estado_logico',
    'revision_registro',
    'revision_grupo',
    'original',
    'efectivo',
    'observaciones_visibles',
    'capacidades',
  ]);
  check(id(row.registro_plantacion_id) === registro);
  id(row.subcampania_id);
  id(row.campania_id);
  check(
    [
      'BORRADOR',
      'ACTIVA',
      'COMPLETADA',
      'FINALIZADA_PARCIAL',
      'PAUSADA',
      'CANCELADA',
    ].includes(row.estado_subcampania as string),
  );
  check(typeof row.es_reposicion === 'boolean');
  check(row.estado_logico === 'VIGENTE' || row.estado_logico === 'REVERTIDO');
  revision(row.revision_registro);
  revision(row.revision_grupo);
  const original = exact(row.original, ['observaciones', 'participantes']);
  const efectivo = exact(row.efectivo, ['observaciones', 'participantes']);
  nullableText(original.observaciones);
  nullableText(efectivo.observaciones);
  check(typeof row.observaciones_visibles === 'boolean');
  const originalPeople = correctionParticipants(original.participantes);
  const effectivePeople = correctionParticipants(efectivo.participantes);
  check(originalPeople[0].usuario_id === effectivePeople[0].usuario_id);
  const capabilities = exact(row.capacidades, [
    'corregir_observaciones',
    'corregir_participantes',
  ]);
  check(typeof capabilities.corregir_observaciones === 'boolean');
  check(typeof capabilities.corregir_participantes === 'boolean');
  if (!row.observaciones_visibles)
    check(
      original.observaciones === null &&
        efectivo.observaciones === null &&
        !capabilities.corregir_observaciones,
    );
  if (capabilities.corregir_observaciones)
    check(
      row.observaciones_visibles &&
        row.estado_subcampania === 'ACTIVA' &&
        row.estado_logico === 'VIGENTE',
    );
  if (capabilities.corregir_participantes)
    check(
      row.estado_subcampania === 'ACTIVA' && row.estado_logico === 'VIGENTE',
    );
  return row;
}

export function correctionHistory(value: unknown) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  const caso = (value as Record<string, unknown>).caso;
  check(caso === 'OBSERVACIONES' || caso === 'PARTICIPANTES');
  const row = exact(value, [
    'correccion_id',
    'caso',
    'actor',
    'fecha',
    'revision_anterior',
    'revision_nueva',
    'revision_grupo_anterior',
    'revision_grupo_nueva',
    'motivo',
    ...(caso === 'OBSERVACIONES' ? ['observaciones_visibles'] : []),
    'antes',
    'despues',
    'efectos_consumo',
  ]);
  id(row.correccion_id);
  const actor = exact(row.actor, ['usuario_id', 'nombre_snapshot']);
  id(actor.usuario_id);
  nullableText(actor.nombre_snapshot);
  instant(row.fecha);
  revision(row.revision_anterior);
  revision(row.revision_nueva);
  revision(row.revision_grupo_anterior);
  revision(row.revision_grupo_nueva);
  check(
    BigInt(row.revision_nueva as string) ===
      BigInt(row.revision_anterior as string) + 1n,
  );
  check(row.revision_grupo_anterior === row.revision_grupo_nueva);
  if (caso === 'PARTICIPANTES' || row.observaciones_visibles)
    check(
      typeof row.motivo === 'string' &&
        [...row.motivo].length >= 3 &&
        [...row.motivo].length <= 1000,
    );
  if (caso === 'OBSERVACIONES') {
    check(typeof row.observaciones_visibles === 'boolean');
    const before = exact(row.antes, ['observaciones']);
    const after = exact(row.despues, ['observaciones']);
    nullableText(before.observaciones);
    nullableText(after.observaciones);
    if (!row.observaciones_visibles)
      check(
        row.motivo === null &&
          before.observaciones === null &&
          after.observaciones === null,
      );
  } else {
    const before = exact(row.antes, ['participantes']);
    const after = exact(row.despues, ['participantes']);
    const beforePeople = correctionParticipants(before.participantes);
    const afterPeople = correctionParticipants(after.participantes);
    check(beforePeople[0].usuario_id === afterPeople[0].usuario_id);
  }
  check(Array.isArray(row.efectos_consumo) && row.efectos_consumo.length === 0);
  return row;
}

export function observationsHistory(value: unknown) {
  const row = correctionHistory(value);
  check(row.caso === 'OBSERVACIONES');
  return row;
}

export function correctionParticipant(value: unknown) {
  const row = exact(value, [
    'usuario_id',
    'nombre_snapshot',
    'afiliacion_snapshot',
    'afiliacion_estado',
    'afiliacion_tipo',
    'organizacion_id_snapshot',
    'es_responsable',
    'procedencia',
    'capturado_en',
    'nombre_capturado_correccion',
  ]);
  id(row.usuario_id);
  nullableText(row.nombre_snapshot);
  nullableText(row.afiliacion_snapshot);
  nullableText(row.nombre_capturado_correccion);
  check(typeof row.es_responsable === 'boolean');
  check(
    ['ORIGINAL', 'ALTA_CORRECCION', 'RESTAURACION'].includes(
      row.procedencia as string,
    ),
  );
  if (row.afiliacion_estado === 'DECLARADA') {
    check(
      typeof row.afiliacion_snapshot === 'string' &&
        row.afiliacion_snapshot.trim().length > 0,
    );
    check(
      row.afiliacion_tipo === 'ORGANIZACION_REGISTRADA' ||
        row.afiliacion_tipo === 'OTRA',
    );
    if (row.afiliacion_tipo === 'ORGANIZACION_REGISTRADA')
      id(row.organizacion_id_snapshot);
    else check(row.organizacion_id_snapshot === null);
  } else {
    check(
      ['NO_DECLARADA', 'HISTORICA_NO_DISPONIBLE'].includes(
        row.afiliacion_estado as string,
      ),
    );
    check(
      row.afiliacion_snapshot === null &&
        row.afiliacion_tipo === null &&
        row.organizacion_id_snapshot === null,
    );
  }
  if (row.capturado_en !== null) {
    instant(row.capturado_en);
    check(
      row.procedencia !== 'ORIGINAL' &&
        !row.es_responsable &&
        row.nombre_snapshot === null &&
        row.afiliacion_estado === 'HISTORICA_NO_DISPONIBLE',
    );
  } else {
    check(
      row.nombre_capturado_correccion === null &&
        row.procedencia !== 'ALTA_CORRECCION',
    );
  }
  if (row.es_responsable) check(row.procedencia === 'ORIGINAL');
  return row;
}

export function correctionParticipants(value: unknown) {
  check(Array.isArray(value) && value.length >= 1 && value.length <= 101);
  const rows = value.map(correctionParticipant);
  check(
    rows[0].es_responsable && rows.slice(1).every((row) => !row.es_responsable),
  );
  check(new Set(rows.map((row) => row.usuario_id)).size === rows.length);
  let previous = 0n;
  rows.slice(1).forEach((row) => {
    const current = BigInt(row.usuario_id as string);
    check(current > previous);
    previous = current;
  });
  return rows;
}

function species(value: unknown, minimum: number) {
  check(Array.isArray(value) && value.length >= 1 && value.length <= 100);
  let previous = 0n;
  let total = 0;
  const ids = value.map((entry) => {
    const row = exact(entry, ['planta_id', 'cantidad']);
    const current = BigInt(id(row.planta_id));
    check(current > previous);
    previous = current;
    check(
      Number.isInteger(row.cantidad) &&
        (row.cantidad as number) >= minimum &&
        (row.cantidad as number) <= 2147483647,
    );
    total += row.cantidad as number;
    return row.planta_id as string;
  });
  check(total <= 2147483647);
  return { ids, total };
}

export function ownCorrectionState(
  value: unknown,
  actor: string,
  registro?: string,
) {
  const row = exact(value, [
    'registro_plantacion_id',
    'codigo_trazabilidad',
    'subcampania_id',
    'es_reposicion',
    'registro_plantacion_origen_id',
    'estado_logico',
    'tiene_correcciones',
    'revision_registro',
    'revision_grupo',
    'relaciones',
    'cantidad_original',
    'cantidad_efectiva',
    'especies_originales',
    'especies_efectivas',
    'participantes',
    'registro_vigente_id',
    'url_detalle_efectivo',
  ]);
  const record = id(row.registro_plantacion_id);
  if (registro !== undefined) check(record === registro);
  id(row.subcampania_id);
  check(
    typeof row.codigo_trazabilidad === 'string' &&
      row.codigo_trazabilidad.length > 0,
  );
  check(typeof row.es_reposicion === 'boolean');
  if (row.es_reposicion)
    check(id(row.registro_plantacion_origen_id) !== record);
  else check(row.registro_plantacion_origen_id === null);
  check(row.estado_logico === 'VIGENTE' || row.estado_logico === 'REVERTIDO');
  check(typeof row.tiene_correcciones === 'boolean');
  revision(row.revision_registro);
  revision(row.revision_grupo);
  const original = species(row.especies_originales, 1);
  const effective = species(
    row.especies_efectivas,
    row.estado_logico === 'VIGENTE' ? 1 : 0,
  );
  check(
    original.total === row.cantidad_original &&
      effective.total === row.cantidad_efectiva &&
      original.ids.join(',') === effective.ids.join(','),
  );
  check(
    row.estado_logico === 'VIGENTE'
      ? effective.total > 0
      : effective.total === 0 && row.tiene_correcciones,
  );
  const people = correctionParticipants(row.participantes);
  check(
    Array.isArray(row.relaciones) &&
      row.relaciones.length >= 1 &&
      row.relaciones.length <= 2,
  );
  check(
    JSON.stringify(row.relaciones) ===
      JSON.stringify(
        ['AUTOR', 'PARTICIPANTE'].filter((relation) =>
          (row.relaciones as unknown[]).includes(relation),
        ),
      ),
  );
  const person = people.find((entry) => entry.usuario_id === actor);
  check(person !== undefined);
  check(row.relaciones.includes('AUTOR') === person.es_responsable);
  if (!person.es_responsable) check(row.relaciones.includes('PARTICIPANTE'));
  if (row.estado_logico === 'VIGENTE') {
    check(
      row.registro_vigente_id === null &&
        row.url_detalle_efectivo ===
          `/api/v1/plantaciones/${record}/detalle-propio`,
    );
  } else {
    check(row.url_detalle_efectivo === null);
    if (row.registro_vigente_id !== null)
      check(id(row.registro_vigente_id) !== record);
  }
  return row;
}

export function ownCorrectionHistory(value: unknown) {
  const row = exact(value, [
    'correccion_id',
    'caso',
    'actor',
    'fecha',
    'revision_anterior',
    'revision_nueva',
  ]);
  id(row.correccion_id);
  check(row.caso === 'OBSERVACIONES' || row.caso === 'PARTICIPANTES');
  const actor = exact(row.actor, ['usuario_id', 'nombre_snapshot']);
  id(actor.usuario_id);
  nullableText(actor.nombre_snapshot);
  instant(row.fecha);
  revision(row.revision_anterior);
  revision(row.revision_nueva);
  check(
    BigInt(row.revision_nueva as string) ===
      BigInt(row.revision_anterior as string) + 1n,
  );
  return row;
}

export function historicalParticipant(value: unknown) {
  const row = exact(value, [
    'usuario_id',
    'nombre_actual',
    'activo',
    'relacion_historica',
  ]);
  id(row.usuario_id);
  nullableText(row.nombre_actual);
  check(typeof row.activo === 'boolean');
  check(
    ['PRESENTE', 'RETIRADO', 'SIN_RELACION'].includes(
      row.relacion_historica as string,
    ),
  );
  return row;
}

export function publicCorrectionState(value: unknown, registro: string) {
  const row = exact(value, [
    'registro_plantacion_id',
    'estado_logico',
    'tiene_correcciones',
    'url_detalle_efectivo',
    'registro_vigente',
  ]);
  check(id(row.registro_plantacion_id) === registro);
  check(row.estado_logico === 'VIGENTE' || row.estado_logico === 'REVERTIDO');
  check(typeof row.tiene_correcciones === 'boolean');
  if (row.estado_logico === 'VIGENTE') {
    check(
      row.url_detalle_efectivo === `/api/v1/impact/registros/${registro}` &&
        row.registro_vigente === null,
    );
  } else {
    check(row.url_detalle_efectivo === null && row.tiene_correcciones);
    if (row.registro_vigente !== null) {
      const reference = exact(row.registro_vigente, [
        'registro_plantacion_id',
        'url_publica',
      ]);
      const referenceId = id(reference.registro_plantacion_id);
      check(
        referenceId !== registro &&
          reference.url_publica === `/api/v1/impact/registros/${referenceId}`,
      );
    }
  }
  return row;
}
