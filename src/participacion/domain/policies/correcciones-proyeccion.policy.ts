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
  const original = exact(row.original, ['observaciones']);
  const efectivo = exact(row.efectivo, ['observaciones']);
  nullableText(original.observaciones);
  nullableText(efectivo.observaciones);
  check(typeof row.observaciones_visibles === 'boolean');
  const capabilities = exact(row.capacidades, ['corregir_observaciones']);
  check(typeof capabilities.corregir_observaciones === 'boolean');
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
  return row;
}

export function observationsHistory(value: unknown) {
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
    'observaciones_visibles',
    'antes',
    'despues',
    'efectos_consumo',
  ]);
  id(row.correccion_id);
  check(row.caso === 'OBSERVACIONES');
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
  nullableText(row.motivo);
  check(typeof row.observaciones_visibles === 'boolean');
  const before = exact(row.antes, ['observaciones']);
  const after = exact(row.despues, ['observaciones']);
  nullableText(before.observaciones);
  nullableText(after.observaciones);
  if (row.observaciones_visibles)
    check(
      typeof row.motivo === 'string' &&
        [...row.motivo].length >= 3 &&
        [...row.motivo].length <= 1000,
    );
  else
    check(
      row.motivo === null &&
        before.observaciones === null &&
        after.observaciones === null,
    );
  check(Array.isArray(row.efectos_consumo) && row.efectos_consumo.length === 0);
  return row;
}
