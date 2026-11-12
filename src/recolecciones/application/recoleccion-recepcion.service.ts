import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import type { EvidenceFileInput } from '../../common/files/evidence-file.policy';
import { SupabaseService } from '../../supabase/supabase.service';
import { id, revision } from '../../participacion/dto/comandos.dto';
import type { RecepcionIntencion } from '../api/dto/recepcion-semillas.dto';
import { RecoleccionBlockchainService } from './recoleccion-blockchain.service';
import { validarReciboRecepcion } from '../domain/policies/recepcion-semillas.policy';

type DbReply = { data: unknown; error: { code?: string } | null };

@Injectable()
export class RecoleccionRecepcionService {
  private readonly logger = new Logger(RecoleccionRecepcionService.name);
  constructor(
    private readonly supabase: SupabaseService,
    private readonly files: EvidenceFileService,
    private readonly blockchain: RecoleccionBlockchainService,
  ) {}

  async leer(
    actor: VerifiedActor,
    origen: string | null,
    antes: string | null,
    limite: number,
  ) {
    const data = await this.rpc('m1_recepcion_leer', {
      p_actor_id: actor.usuario_id,
      p_recoleccion_id: origen,
      p_antes_de_id: antes,
      p_limite: limite,
    });
    if (origen && data && typeof data === 'object' && 'evidencias' in data) {
      const row = data as { evidencias: Record<string, unknown>[] };
      row.evidencias = row.evidencias.map((e) => ({
        ...e,
        public_url: this.supabase
          .getAdminClient()
          .storage.from(String(e.bucket))
          .getPublicUrl(String(e.ruta_archivo)).data.publicUrl,
      }));
    }
    return data;
  }
  async ejecutar(
    actor: VerifiedActor,
    comando: string,
    payload: RecepcionIntencion,
  ) {
    const reply = await this.comando('m1_recepcion_ejecutar', actor, comando, {
      p_payload: payload,
    });
    if (
      reply.ejecucion_nueva &&
      reply.body.estado === 'CONFIRMADO' &&
      payload.accion === 'RECIBIR'
    ) {
      // El flag se confirma con el comando en SQL y no aparece en replay/recovery.
      // El efecto externo queda fuera del recibo: un fallo no revierte la recepción.
      try {
        await this.blockchain.executeBlockchainFlow(payload.recoleccion_id);
      } catch {
        this.logger.error(
          'No se completó el anclaje externo posterior a la recepción.',
        );
      }
    }
    return reply;
  }
  recuperar(actor: VerifiedActor, comando: string) {
    return this.comando('m1_recepcion_recuperar', actor, comando, {}, true);
  }

  async evidencias(
    actor: VerifiedActor,
    origen: string,
    files: EvidenceFileInput[],
  ) {
    const detalle = (await this.leer(actor, origen, null, 20)) as {
      puede_recibir_validar: boolean;
      revision: string;
    };
    if (!detalle.puede_recibir_validar)
      throw new ForbiddenException(
        'El origen no permite recepción por esta cuenta.',
      );
    if (!files.length || files.length > 5)
      throw new BadRequestException('Se requieren de 1 a 5 fotos.');
    const revisionCarga = revision(detalle.revision);
    const prepared = this.files.prepareOriginalEvidenceFiles(files);
    const client = this.supabase.getAdminClient();
    const uploaded: Record<string, unknown>[] = [];
    let incierto = false;
    try {
      for (const f of prepared) {
        const ruta = `recepcion/pendientes/${actor.usuario_id}/${origen}/${randomUUID()}.${f.storageExtension.toLowerCase()}`;
        const { data, error } = await client.storage
          .from('recoleccion_fotos')
          .upload(ruta, f.originalBuffer, {
            contentType: f.storageContentType,
            upsert: false,
          });
        if (error)
          throw new HttpException('No se pudo cargar la evidencia.', 503);
        uploaded.push({
          ruta_archivo: ruta,
          storage_object_id: data?.id ?? null,
          mime_type: f.storageContentType,
          tamano_bytes: f.tamanoBytes,
          hash_sha256: f.hashSha256,
        });
      }
      // Una respuesta perdida no autoriza borrar archivos que podrían estar vinculados.
      incierto = true;
      const { data, error } = (await client.rpc(
        'm1_recepcion_evidencias_preparar',
        {
          p_actor_id: actor.usuario_id,
          p_recoleccion_id: origen,
          p_revision_esperada: revisionCarga,
          p_fotos: uploaded,
        },
      )) as DbReply;
      if (error) {
        if (['42501', 'P0001', 'P0002', '22023'].includes(String(error.code))) {
          incierto = false;
          this.fallo(error.code);
        }
        throw new HttpException(
          'Resultado de carga no determinado. Conserva la pantalla y consulta el origen.',
          503,
        );
      }
      if (!Array.isArray(data) || data.length !== uploaded.length)
        throw new HttpException(
          'Resultado de carga no determinado. Conserva la pantalla y consulta el origen.',
          503,
        );
      let evidencia_ids: string[];
      try {
        evidencia_ids = data.map((v) => id(v));
        if (new Set(evidencia_ids).size !== evidencia_ids.length)
          throw new Error('IDs de carga repetidos');
      } catch {
        throw new HttpException(
          'Resultado de carga no determinado. Conserva la pantalla y consulta el origen.',
          503,
        );
      }
      return { evidencia_ids, audiencia: 'BUCKET_LEGADO_PUBLICO' };
    } catch (error) {
      if (!incierto && uploaded.length)
        await client.storage
          .from('recoleccion_fotos')
          .remove(uploaded.map((f) => String(f.ruta_archivo)));
      throw error;
    }
  }
  private async comando(
    name: string,
    actor: VerifiedActor,
    comando: string,
    args: Record<string, unknown>,
    recuperar = false,
  ) {
    try {
      const { data, error } = (await this.supabase.getAdminClient().rpc(name, {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_comando_id: comando,
        ...args,
      })) as DbReply;
      if (error) throw new Error('RPC inconclusa');
      const p = args.p_payload as RecepcionIntencion | undefined;
      return validarReciboRecepcion(data, comando, recuperar, {
        actor: actor.usuario_id,
        origen: p?.recoleccion_id,
        revision: p?.revision_esperada,
        accion: p?.accion,
      });
    } catch {
      throw new HttpException(
        {
          comando_id: comando,
          resultado_concluyente: false,
          error: {
            codigo: 'RESULTADO_NO_DETERMINADO',
            mensaje:
              'Conserva la intención y recupera el mismo comando. No crees otra operación.',
            campos: [],
            ambitos: [],
            reintento: 'MISMA_CLAVE',
          },
        },
        503,
      );
    }
  }
  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = (await this.supabase
      .getAdminClient()
      .rpc(name, args)) as DbReply;
    if (error) this.fallo(error.code);
    return data;
  }
  private fallo(code?: string): never {
    if (code === '42501')
      throw new ForbiddenException('CAPACIDAD_INSUFICIENTE');
    if (code === 'P0002') throw new NotFoundException('ORIGEN_NO_DISPONIBLE');
    if (code === '22023') throw new BadRequestException('ENTRADA_INVALIDA');
    if (code === 'P0001')
      throw new HttpException('ESTADO_NO_RECEPCIONABLE', 409);
    throw new HttpException('No se pudo consultar recepción.', 503);
  }
}
