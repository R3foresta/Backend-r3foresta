import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import type { EvidenceFileInput } from '../../common/files/evidence-file.policy';
import { id } from '../../participacion/dto/comandos.dto';
import { SupabaseService } from '../../supabase/supabase.service';
import type { ConciliacionIntencion } from '../api/dto/conciliacion-vivero.dto';
import { validarReciboConciliacion } from '../domain/policies/conciliacion-recibo.policy';

type DbReply = { data: unknown; error: { code?: string } | null };
const BUCKET = 'r3foresta-conciliacion';

@Injectable()
export class ViveroConciliacionService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly files: EvidenceFileService,
  ) {}

  leer(
    actor: VerifiedActor,
    origen: string | null,
    antes: string | null,
    limite: number,
    vivero: string | null = null,
  ) {
    return this.consultar('m2_conciliacion_leer', {
      p_actor_id: actor.usuario_id,
      p_recoleccion_id: origen,
      p_antes_de_id: antes,
      p_limite: limite,
      p_vivero_id: vivero,
    });
  }

  async comando(
    actor: VerifiedActor,
    comando: string,
    payload?: ConciliacionIntencion,
  ) {
    try {
      const { data, error } = await this.rpc(
        payload ? 'm2_conciliacion_ejecutar' : 'm2_conciliacion_recuperar',
        {
          p_actor_id: actor.usuario_id,
          p_auth_id: actor.auth_id,
          p_comando_id: comando,
          ...(payload && { p_payload: payload }),
        },
      );
      if (error) throw new Error('RPC inconclusa.');
      return validarReciboConciliacion(
        data,
        comando,
        actor.usuario_id,
        payload,
      );
    } catch {
      throw new HttpException(
        {
          comando_id: comando,
          resultado_concluyente: false,
          error: {
            codigo: 'RESULTADO_NO_DETERMINADO',
            mensaje: 'Conserva la intención y recupera el mismo comando.',
            campos: [],
            ambitos: [],
            reintento: 'MISMA_CLAVE',
          },
        },
        503,
      );
    }
  }

  async evidencias(
    actor: VerifiedActor,
    origen: string,
    files: EvidenceFileInput[],
  ) {
    const ficha = (await this.leer(actor, origen, null, 20)) as {
      puede_conciliar: boolean;
    };
    if (ficha.puede_conciliar !== true)
      throw new ForbiddenException(
        'El origen no permite conciliación por esta cuenta.',
      );
    if (!files.length || files.length > 5)
      throw new BadRequestException('Se requieren de 1 a 5 fotos.');

    const prepared = this.files.prepareOriginalEvidenceFiles(files);
    const storage = this.supabase.getAdminClient().storage.from(BUCKET);
    const uploaded: {
      ruta_archivo: string;
      storage_object_id: string | null;
      mime_type: string;
      tamano_bytes: number;
      hash_sha256: string;
    }[] = [];
    let incierto = false;
    try {
      for (const file of prepared) {
        const ruta = `conciliacion/pendientes/${actor.usuario_id}/${origen}/${randomUUID()}.${file.storageExtension.toLowerCase()}`;
        const { data, error } = await storage.upload(
          ruta,
          file.originalBuffer,
          {
            contentType: file.storageContentType,
            upsert: false,
          },
        );
        if (error)
          throw new HttpException('No se pudo cargar la evidencia.', 503);
        uploaded.push({
          ruta_archivo: ruta,
          storage_object_id: data?.id ?? null,
          mime_type: file.storageContentType,
          tamano_bytes: file.tamanoBytes,
          hash_sha256: file.hashSha256,
        });
      }
      incierto = true;
      const { data, error } = await this.rpc(
        'm2_conciliacion_evidencias_preparar',
        {
          p_actor_id: actor.usuario_id,
          p_recoleccion_id: origen,
          p_fotos: uploaded,
        },
      );
      if (
        error &&
        ['42501', 'P0001', 'P0002', '22023'].includes(String(error.code))
      ) {
        incierto = false;
        this.fallo(error.code);
      }
      if (error || !Array.isArray(data) || data.length !== uploaded.length)
        throw new HttpException(
          'Resultado de carga no determinado. Consulta la ficha.',
          503,
        );
      return { evidencia_ids: data.map((v) => id(v)), audiencia: 'PRIVADA' };
    } catch (error) {
      if (!incierto && uploaded.length)
        await storage
          .remove(uploaded.map((f) => f.ruta_archivo))
          .catch(() => undefined);
      throw error;
    }
  }

  private async consultar(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.rpc(name, args);
    if (error || !data) this.fallo(error?.code);
    return data;
  }

  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<DbReply> {
    return (await this.supabase.getAdminClient().rpc(name, args)) as DbReply;
  }

  private fallo(code?: string): never {
    if (code === '42501')
      throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
    if (code === 'P0002') throw new NotFoundException('ORIGEN_NO_DISPONIBLE');
    if (code === '22023') throw new BadRequestException('ENTRADA_INVALIDA');
    if (code === 'P0001') throw new HttpException('ESTADO_NO_CONCILIABLE', 409);
    throw new HttpException('No se pudo consultar la conciliación.', 503);
  }
}
