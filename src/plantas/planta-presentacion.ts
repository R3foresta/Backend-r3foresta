import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export type PresentacionPlanta = {
  nombre: string;
  especie: string | null;
  nombre_comun_principal: string | null;
  nombre_cientifico: string | null;
  imagen_url: string | null;
};

function texto(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

/** Metadatos vivos de presentación, sólo para IDs del ámbito ya autorizado.
 * Nunca usar para reemplazar snapshots históricos ni decidir saldos/permisos. */
export async function leerPresentacionPlantas(
  supabase: SupabaseService,
  plantaIds: (string | number)[],
): Promise<Map<string, PresentacionPlanta>> {
  const ids = [...new Set(plantaIds.map(String))];
  const result = new Map<string, PresentacionPlanta>();
  if (!ids.length) return result;
  const fail = (): never => {
    throw new ServiceUnavailableException(
      'No se pudieron consultar los nombres de las plantas.',
    );
  };
  const { data, error } = await supabase
    .getAdminClient()
    .from('planta')
    .select(
      'id, especie, nombre_comun_principal, nombre_cientifico, imagen_url',
    )
    .in('id', ids);
  if (error || !Array.isArray(data)) return fail();
  for (const value of data as unknown[]) {
    if (!value || typeof value !== 'object') return fail();
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== 'string' &&
      !(typeof row.id === 'number' && Number.isSafeInteger(row.id))
    )
      return fail();
    const id = String(row.id);
    if (!ids.includes(id) || result.has(id)) return fail();
    const nombre_comun_principal = texto(row.nombre_comun_principal);
    const nombre_cientifico = texto(row.nombre_cientifico);
    result.set(id, {
      nombre: nombre_comun_principal ?? nombre_cientifico ?? `Especie #${id}`,
      especie: texto(row.especie),
      nombre_comun_principal,
      nombre_cientifico,
      imagen_url: texto(row.imagen_url),
    });
  }
  if (result.size !== ids.length) return fail();
  return result;
}
