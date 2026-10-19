import { HttpException, Injectable } from '@nestjs/common';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import type { ImpactoQuery } from '../impacto-consulta.dto';
import { validarImpacto } from '../domain/policies/impacto-proyeccion.policy';

@Injectable()
export class ImpactoConsultaService {
  constructor(private readonly supabase: SupabaseService) {}

  private fallo(status = 503): never {
    throw new HttpException(
      {
        error: {
          codigo:
            status === 404
              ? 'RECURSO_NO_VISIBLE'
              : status === 401
                ? 'SESION_INVALIDA'
                : status === 403
                  ? 'CUENTA_INACTIVA'
                  : 'RESULTADO_NO_DETERMINADO',
          mensaje:
            status === 404
              ? 'El recurso no está disponible.'
              : 'No se pudo consultar. Reintente la lectura.',
          campos: [],
          ambitos: [],
          reintento:
            status === 401 || status === 403 ? 'RECUPERAR_SESION' : 'NO_APLICA',
        },
        comando_id: null,
        resultado_concluyente: false,
      },
      status,
    );
  }

  private async leer(
    name: string,
    args: Record<string, unknown>,
    schema: string,
  ) {
    let data: unknown;
    try {
      const response = await this.supabase.getAdminClient().rpc(name, args);
      if (response.error) {
        if (/^PT(401|403|404)$/.test(response.error.code ?? ''))
          this.fallo(Number(response.error.code.slice(2)));
        this.fallo();
      }
      data = response.data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.fallo();
    }
    try {
      validarImpacto(data, schema);
      return data;
    } catch {
      return this.fallo();
    }
  }

  publico(query: ImpactoQuery, registro?: string) {
    return this.leer(
      'pa_impacto_leer',
      {
        p_campania_id: query.campania_id ?? null,
        p_subcampania_id: query.subcampania_id ?? null,
        p_registro_id: registro ?? null,
        p_organizacion_id: query.organizacion_id ?? null,
        p_planta_id: query.planta_id ?? null,
        p_desde: query.desde ?? null,
        p_hasta: query.hasta ?? null,
        p_cursor: query.cursor ?? null,
        p_limite: query.limite,
      },
      registro ? 'ImpactoRegistroRespuesta' : 'ImpactoConsultaRespuesta',
    );
  }

  propios(actor: VerifiedActor, query: ImpactoQuery) {
    return this.leer(
      'pa_mis_registros_leer',
      {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_cursor: query.cursor ?? null,
        p_limite: query.limite,
      },
      'MisRegistrosRespuesta',
    );
  }
}
