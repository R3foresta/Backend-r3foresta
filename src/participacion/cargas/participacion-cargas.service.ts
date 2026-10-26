import {
  HttpException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  validateRpcReply,
  validateStableError,
  type RpcReply,
} from '../comando-recibo';
import {
  ParticipacionImagenService,
  hashBytes,
} from './participacion-imagen.service';

type Work = {
  bucket: string;
  ruta_original: string;
  ruta_derivada: string;
  lease_token: string;
  generacion: number;
  hash_derivada: string;
  nueva: boolean;
};
type Carga = {
  carga_id: string;
  estado: string;
  evidencia_id: string | null;
  creado_en: string;
  expira_en: string | null;
};
const states = [
  'RESERVADA',
  'DISPONIBLE',
  'VINCULADA',
  'DESCARTE_PENDIENTE',
  'DESCARTADA',
];
const instant = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[1-9][0-9]*$/.test(value) &&
  value.length <= 19 &&
  BigInt(value) <= 9223372036854775807n;
const sameKeys = (value: unknown, keys: string[]) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === keys.sort().join(',');
function carga(value: unknown): Carga {
  const row = value as Carga;
  if (
    !row ||
    Object.keys(row).sort().join(',') !==
      'carga_id,creado_en,estado,evidencia_id,expira_en' ||
    typeof row.carga_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      row.carga_id,
    ) ||
    !states.includes(row.estado) ||
    !instant(row.creado_en) ||
    (row.evidencia_id !== null && !validId(row.evidencia_id)) ||
    (['DISPONIBLE', 'VINCULADA'].includes(row.estado) &&
      row.evidencia_id === null) ||
    (row.estado === 'VINCULADA' && row.expira_en !== null) ||
    (row.expira_en !== null && !instant(row.expira_en))
  )
    throw new Error('respuesta');
  return {
    carga_id: row.carga_id,
    estado: row.estado,
    evidencia_id: row.evidencia_id,
    creado_en: row.creado_en,
    expira_en: row.expira_en,
  };
}

@Injectable()
export class ParticipacionCargasService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private limpiando = false;
  constructor(
    private readonly supabase: SupabaseService,
    private readonly imagenes: ParticipacionImagenService,
  ) {}

  onModuleInit() {
    // Opt-in del operador: no conectar ni limpiar servicios reales al importar el módulo.
    if (
      process.env.NODE_ENV !== 'test' &&
      process.env.PARTICIPACION_CARGAS_CLEANUP_ENABLED === 'true'
    ) {
      this.timer = setInterval(() => {
        void this.limpiar().catch(() => undefined);
      }, 60_000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async preparar(
    actor: VerifiedActor,
    command: string,
    scope: string,
  ): Promise<RpcReply> {
    const reply = await this.operar(actor, 'PREPARAR', command, {
      subcampania_id: scope,
    });
    if ('estado' in reply.body)
      return validateRpcReply(
        reply,
        command,
        'REGISTRAR_PLANTACION_INICIAL',
        true,
      );
    const data = this.data(reply) as Record<string, unknown>;
    if (
      !sameKeys(data, [
        'comando_id',
        'estado',
        'operacion',
        'subcampania_id',
      ]) ||
      data.comando_id !== command ||
      data.subcampania_id !== scope ||
      data.operacion !== 'REGISTRAR_PLANTACION_INICIAL' ||
      data.estado !== 'PREPARADO'
    )
      this.inconcluso(command);
    return reply;
  }
  async listar(actor: VerifiedActor, command: string): Promise<RpcReply> {
    const reply = await this.operar(actor, 'LISTAR', command);
    const rows = this.data(reply);
    if (!Array.isArray(rows) || rows.length > 10) this.inconcluso(command);
    try {
      return this.envelope(reply, rows.map(carga));
    } catch {
      return this.inconcluso(command);
    }
  }
  async descartar(actor: VerifiedActor, command: string): Promise<RpcReply> {
    const reply = await this.operar(actor, 'DESCARTAR', command);
    const validated = validateRpcReply(
      reply,
      command,
      'REGISTRAR_PLANTACION_INICIAL',
      true,
    );
    // DB ya clausuró la preparación; IO se puede reintentar sin revertir su terminal.
    if (process.env.NODE_ENV !== 'test')
      void this.limpiar().catch(() => undefined);
    return validated;
  }
  async subir(
    actor: VerifiedActor,
    command: string,
    cargaId: string,
    bytes: Buffer,
  ): Promise<RpcReply> {
    const prepared = await this.imagenes.preparar(bytes);
    const payload = {
      carga_id: cargaId,
      hash_original: prepared.hashOriginal,
      hash_derivada: prepared.hashDerivada,
      tamano_original: bytes.length,
      tamano_derivada: prepared.derivada.length,
      mime_original: prepared.mimeOriginal,
      lease_token: randomUUID(),
    };
    const reserved = await this.operar(actor, 'RESERVAR', command, payload);
    const value = this.data(reserved) as { carga?: unknown; trabajo?: Work };
    if (!value || typeof value !== 'object' || Array.isArray(value))
      this.inconcluso(command);
    if (!value.trabajo) {
      try {
        return this.envelope(reserved, carga(value));
      } catch {
        return this.inconcluso(command);
      }
    }
    const work = value.trabajo;
    if (
      !sameKeys(value, ['carga', 'trabajo']) ||
      !sameKeys(work, [
        'bucket',
        'ruta_original',
        'ruta_derivada',
        'lease_token',
        'generacion',
        'hash_derivada',
        'nueva',
      ]) ||
      work.bucket !== 'participacion_evidencias' ||
      typeof work.ruta_original !== 'string' ||
      typeof work.ruta_derivada !== 'string' ||
      !work.ruta_original.endsWith('/original') ||
      !work.ruta_derivada.endsWith('/derivada.jpg') ||
      typeof work.lease_token !== 'string' ||
      typeof work.nueva !== 'boolean' ||
      !Number.isInteger(work.generacion) ||
      work.generacion < 1 ||
      work.hash_derivada !== prepared.hashDerivada
    )
      this.inconcluso(command);
    try {
      carga(value.carga);
    } catch {
      this.inconcluso(command);
    }
    try {
      const bucket = this.supabase.getAdminClient().storage.from(work.bucket);
      // Ante respuesta perdida, descargar y verificar antes de volver a subir.
      await this.asegurarObjeto(
        bucket,
        work.ruta_original,
        prepared.original,
        prepared.mimeOriginal,
        prepared.hashOriginal,
      );
      await this.asegurarObjeto(
        bucket,
        work.ruta_derivada,
        prepared.derivada,
        'image/jpeg',
        prepared.hashDerivada,
      );
    } catch {
      // RESERVADA permite recuperar/reconciliar con la misma identidad. No fabricar rechazo.
      return this.envelope(reserved, carga(value.carga));
    }
    const finalized = await this.operar(actor, 'FINALIZAR', command, {
      ...payload,
      lease_token: work.lease_token,
      generacion: work.generacion,
      objetos_verificados: true,
    });
    if (!work.nueva && finalized.http_status === 201)
      finalized.http_status = 200;
    try {
      return this.envelope(finalized, carga(this.data(finalized)));
    } catch {
      return this.inconcluso(command);
    }
  }
  async preview(actor: VerifiedActor, cargaId: string): Promise<RpcReply> {
    const reply = await this.operar(actor, 'PREVIEW', null, {
      carga_id: cargaId,
    });
    const value = this.data(reply) as { bucket: string; ruta_derivada: string };
    this.validarDerivada(value);
    return this.envelope(
      reply,
      await this.firmar(value.bucket, value.ruta_derivada),
    );
  }
  async fotoPublica(evidencia: string): Promise<RpcReply> {
    // La RPC aplica la elegibilidad pública del hecho y devuelve exclusivamente
    // el path de un derivado vinculado. No existe acceso por actor/rol a originales.
    const result = await this.rpc('pa_foto_publica', {
      p_evidencia_id: evidencia,
    });
    const reply = this.reply(result, null);
    const value = this.data(reply) as { bucket: string; ruta_derivada: string };
    this.validarDerivada(value);
    return this.envelope(
      reply,
      await this.firmar(value.bucket, value.ruta_derivada),
    );
  }
  async limpiar(): Promise<void> {
    if (this.limpiando) return;
    this.limpiando = true;
    try {
      // Cada expiración tiene su propia transacción y vuelve a comenzar por
      // cuentas → ámbito; no retener locks de un comando al comenzar otro.
      for (let n = 0; n < 100; n++) {
        if (
          (await this.rpc('pa_cargas_mantenimiento', {
            p_accion: 'EXPIRAR',
            p_payload: {},
          })) !== true
        )
          break;
      }
      const rows = (await this.rpc('pa_cargas_mantenimiento', {
        p_accion: 'LISTAR',
        p_payload: {},
      })) as Array<Work & { carga_interna_id: string }>;
      if (!Array.isArray(rows)) throw new Error('limpieza');
      for (const row of rows) {
        let borrado = false;
        try {
          if (row.bucket !== 'participacion_evidencias')
            throw new Error('bucket');
          const bucket = this.supabase
            .getAdminClient()
            .storage.from(row.bucket);
          const paths = [row.ruta_original, row.ruta_derivada];
          const { error } = await bucket.remove(paths);
          if (error) throw new Error('remove');
          borrado = (
            await Promise.all(
              paths.map(async (path) => {
                const result = await bucket.download(path);
                return !result.data && (await this.ausente(result.error));
              }),
            )
          ).every(Boolean);
        } catch {
          /* ledger mantiene la obligación; nunca borrar fila ni vinculadas */
        }
        await this.rpc('pa_cargas_mantenimiento', {
          p_accion: 'RESULTADO',
          p_payload: {
            carga_interna_id: row.carga_interna_id,
            generacion: row.generacion,
            borrado,
          },
        });
      }
    } finally {
      this.limpiando = false;
    }
  }
  private async asegurarObjeto(
    bucket: ReturnType<
      ReturnType<SupabaseService['getAdminClient']>['storage']['from']
    >,
    path: string,
    bytes: Buffer,
    mime: string,
    hash: string,
  ) {
    const existing = await bucket.download(path);
    if (existing.data) {
      if (hashBytes(new Uint8Array(await existing.data.arrayBuffer())) !== hash)
        throw new Error('hash');
      return;
    }
    if (!(await this.ausente(existing.error))) throw new Error('storage');
    await bucket.upload(path, bytes, {
      upsert: false,
      contentType: mime,
      cacheControl: '0',
    });
    // Incluso error/timeout de upload puede significar que el objeto existe.
    const verified = await bucket.download(path);
    if (
      !verified.data ||
      hashBytes(new Uint8Array(await verified.data.arrayBuffer())) !== hash
    )
      throw new Error('storage');
  }
  private async ausente(error: unknown): Promise<boolean> {
    if (!error || typeof error !== 'object') return false;
    const e = error as {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      name?: unknown;
      originalError?: unknown;
    };
    // download usa noResolveJson: el SDK conserva el Response sin leerlo.
    // Clonar evita consumir el cuerpo que podría necesitar otro diagnóstico.
    if (e.name === 'StorageUnknownError' && e.originalError instanceof Response) {
      const response = e.originalError;
      if (![400, 404].includes(response.status)) return false;
      try {
        return await this.ausente(await response.clone().json());
      } catch {
        return false;
      }
    }
    // Los errores de autorización/servicio prevalecen sobre señales contradictorias.
    const statuses = [e.status, e.statusCode].filter((v) => v !== undefined);
    if (statuses.some((v) => ![400, 404].includes(Number(v)))) return false;
    if (e.code !== undefined && e.code !== 'NoSuchKey') return false;
    return (
      Number(e.status) === 404 ||
      Number(e.statusCode) === 404 ||
      e.code === 'NoSuchKey'
    );
  }
  private async firmar(bucket: string, path: string) {
    const store = this.supabase.getAdminClient().storage.from(bucket);
    const exists = await store.download(path);
    if (!exists.data) this.noDisponible();
    const signed = await store.createSignedUrl(path, 300);
    if (signed.error || !signed.data?.signedUrl) this.noDisponible();
    return {
      url: signed.data.signedUrl,
      expira_en: new Date(Date.now() + 300_000).toISOString(),
    };
  }
  private operar(
    actor: VerifiedActor,
    action: string,
    command: string | null,
    payload: unknown = {},
  ): Promise<RpcReply> {
    return this.rpc('pa_cargas_operar', {
      p_actor_id: actor.usuario_id,
      p_auth_id: actor.auth_id,
      p_accion: action,
      p_comando_id: command,
      p_payload: payload,
    }).then((data) => this.reply(data, command));
  }
  private async rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      const { data, error } = await this.supabase
        .getAdminClient()
        .rpc(name, args);
      if (error || data === null)
        return this.inconcluso(
          typeof args.p_comando_id === 'string' ? args.p_comando_id : null,
        );
      return data;
    } catch {
      return this.inconcluso(
        typeof args.p_comando_id === 'string' ? args.p_comando_id : null,
      );
    }
  }
  private reply(data: unknown, command: string | null): RpcReply {
    const value = data as RpcReply;
    if (
      !sameKeys(value, ['http_status', 'body']) ||
      ![200, 201, 202, 401, 403, 404, 409, 422, 503].includes(
        value.http_status,
      ) ||
      !value.body ||
      typeof value.body !== 'object'
    )
      this.inconcluso(command);
    if (value.http_status >= 400) {
      try {
        if (
          !sameKeys(value.body, [
            'error',
            'comando_id',
            'resultado_concluyente',
          ]) ||
          value.body.comando_id !== command ||
          value.body.resultado_concluyente !== false
        )
          throw new Error('respuesta');
        validateStableError(value.body.error);
      } catch {
        return this.inconcluso(command);
      }
      throw new HttpException(value.body, value.http_status);
    }
    return value;
  }
  private data(reply: RpcReply): unknown {
    if (
      !sameKeys(reply.body, ['data', 'observado_en']) ||
      !instant(reply.body.observado_en)
    )
      this.inconcluso(null);
    return (reply.body as Record<string, unknown>).data;
  }
  private envelope(reply: RpcReply, data: unknown): RpcReply {
    return {
      http_status: reply.http_status,
      body: {
        data,
        observado_en: (reply.body as Record<string, unknown>).observado_en,
      },
    } as RpcReply;
  }
  private validarDerivada(value: {
    bucket: string;
    ruta_derivada: string;
  }): void {
    if (
      !sameKeys(value, ['bucket', 'ruta_derivada']) ||
      value.bucket !== 'participacion_evidencias' ||
      typeof value.ruta_derivada !== 'string' ||
      !value.ruta_derivada.endsWith('/derivada.jpg')
    )
      this.inconcluso(null);
  }
  private noDisponible(): never {
    throw new HttpException(
      {
        error: {
          codigo: 'IMAGEN_NO_DISPONIBLE',
          mensaje: 'La imagen no está disponible temporalmente.',
          campos: [],
          ambitos: [],
          reintento: 'MISMA_CLAVE',
        },
        comando_id: null,
        resultado_concluyente: false,
      },
      503,
    );
  }
  private inconcluso(command: string | null): never {
    throw new HttpException(
      {
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          mensaje: 'Recupere la misma preparación y carga.',
          campos: [],
          ambitos: [],
          reintento: 'MISMA_CLAVE',
        },
        comando_id: command,
        resultado_concluyente: false,
      },
      503,
    );
  }
}
