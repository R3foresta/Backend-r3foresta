import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { VerifiedActor } from '../auth/verified-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import {
  parseFiltrosMermas,
  parseFiltrosPlantaciones,
  parseFiltrosVivero,
} from './reportes.dto';

type LecturaReporte =
  | 'reportes_plantaciones_leer'
  | 'reportes_vivero_leer'
  | 'reportes_mermas_leer'
  | 'reportes_mermas_leer_corte';

@Injectable()
export class ReportesService {
  constructor(private readonly supabase: SupabaseService) {}

  permisoExportacion(actor: VerifiedActor): void {
    this.exigirAdmin(actor);
  }

  async plantaciones(actor: VerifiedActor, query: unknown) {
    this.exigirAdmin(actor);
    const filtros = parseFiltrosPlantaciones(query);
    return this.leer(actor, 'reportes_plantaciones_leer', 'plantaciones', {
      p_desde: filtros.desde,
      p_hasta: filtros.hasta,
      p_organizacion_id: filtros.organizacion_id,
      p_campania_id: filtros.campania_id,
      p_planta_id: filtros.planta_id,
    });
  }

  vivero(actor: VerifiedActor, query: unknown) {
    this.exigirAdmin(actor);
    const filtros = parseFiltrosVivero(query);
    return this.leer(actor, 'reportes_vivero_leer', 'vivero', {
      p_planta_id: filtros.planta_id,
      p_vivero_id: filtros.vivero_id,
    });
  }

  mermas(actor: VerifiedActor, query: unknown) {
    this.exigirAdmin(actor);
    const filtros = parseFiltrosMermas(query);
    return this.leer(
      actor,
      filtros.exportar ? 'reportes_mermas_leer_corte' : 'reportes_mermas_leer',
      'mermas',
      {
        p_desde: filtros.desde,
        p_hasta: filtros.hasta,
        p_planta_id: filtros.planta_id,
        p_vivero_id: filtros.vivero_id,
        p_pagina: filtros.pagina,
        ...(filtros.exportar ? { p_exportar: true } : {}),
      },
    );
  }

  private exigirAdmin(actor: VerifiedActor): void {
    if (actor.rol !== 'ADMIN') {
      throw new ForbiddenException('Se requiere una cuenta administradora.');
    }
  }

  private async leer(
    actor: VerifiedActor,
    rpc: LecturaReporte,
    reporte: 'plantaciones' | 'vivero' | 'mermas',
    params: Record<string, string | number | boolean | null>,
  ) {
    const mensaje = `No se pudo consultar el reporte de ${reporte}.`;
    let response: { data: unknown; error: { code?: string } | null };
    try {
      response = await this.supabase.getAdminClient().rpc(rpc, {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        ...params,
      });
    } catch {
      throw new ServiceUnavailableException(mensaje);
    }

    if (response.error?.code === 'PT401')
      throw new UnauthorizedException('La sesión no es válida.');
    if (response.error?.code === 'PT403')
      throw new ForbiddenException(
        'El acceso al reporte ya no está disponible.',
      );
    if (response.error || !response.data)
      throw new ServiceUnavailableException(mensaje);

    return { success: true, data: response.data };
  }
}
