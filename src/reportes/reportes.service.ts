import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { VerifiedActor } from '../auth/verified-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { parseFiltrosPlantaciones } from './reportes.dto';

@Injectable()
export class ReportesService {
  constructor(private readonly supabase: SupabaseService) {}

  permisoExportacion(actor: VerifiedActor): void {
    if (actor.rol !== 'ADMIN') {
      throw new ForbiddenException('Se requiere una cuenta administradora.');
    }
  }

  async plantaciones(actor: VerifiedActor, query: unknown) {
    this.permisoExportacion(actor);
    const filtros = parseFiltrosPlantaciones(query);

    let response: { data: unknown; error: { code?: string } | null };
    try {
      response = await this.supabase
        .getAdminClient()
        .rpc('reportes_plantaciones_leer', {
          p_actor_id: actor.usuario_id,
          p_auth_id: actor.auth_id,
          p_desde: filtros.desde,
          p_hasta: filtros.hasta,
          p_organizacion_id: filtros.organizacion_id,
          p_campania_id: filtros.campania_id,
          p_planta_id: filtros.planta_id,
        });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo consultar el reporte de plantaciones.',
      );
    }

    if (response.error?.code === 'PT401')
      throw new UnauthorizedException('La sesión no es válida.');
    if (response.error?.code === 'PT403')
      throw new ForbiddenException(
        'El acceso al reporte ya no está disponible.',
      );
    if (response.error || !response.data) {
      throw new ServiceUnavailableException(
        'No se pudo consultar el reporte de plantaciones.',
      );
    }

    return { success: true, data: response.data };
  }
}
