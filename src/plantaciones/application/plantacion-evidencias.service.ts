import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ParticipacionImagenService } from '../../participacion/cargas/participacion-imagen.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearEvidenciaPendientePlantacionDto } from '../api/dto/crear-evidencia-pendiente-plantacion.dto';
import { DescartarEvidenciasPendientesPlantacionDto } from '../api/dto/descartar-evidencias-pendientes-plantacion.dto';
import { PlantacionAuthService } from './plantacion-auth.service';

export type PlantacionEvidenceFileInput = {
  mimetype?: string;
  size?: number;
  originalname?: string;
  buffer?: Buffer;
};
type RpcReply = { http_status: number; body: { data?: any; error?: unknown } };

@Injectable()
export class PlantacionEvidenciasService {
  private readonly logger = new Logger(PlantacionEvidenciasService.name);
  private readonly bucketEvidencias = 'participacion_evidencias';

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: PlantacionAuthService,
    private readonly imagenService: ParticipacionImagenService,
  ) {}

  async crearPendienteParaRegistro(
    dto: CrearEvidenciaPendientePlantacionDto,
    authId: string,
    files: PlantacionEvidenceFileInput[] = [],
  ) {
    this.exigirContrato(dto);
    if (
      !files.length ||
      files.length > 10 ||
      files.some((file) => !file.buffer)
    )
      throw new BadRequestException('Se requieren entre 1 y 10 fotos.');
    // Metadata libre nunca puede declarar propietario/ámbito/tipo/derivado.
    if (dto.metadata !== undefined)
      throw new BadRequestException(
        'metadata no se admite en cargas de reposición.',
      );
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);
    await this.operar(usuario.id, dto.subcampania_id!, 'AUTORIZAR');
    const storage = this.supabaseService
      .getAdminClient()
      .storage.from(this.bucketEvidencias);
    const uploaded: string[] = [];
    const fotos: Record<string, unknown>[] = [];
    let confirmacionIncierta = false;
    try {
      for (const file of files) {
        const prepared = await this.imagenService.preparar(file.buffer!);
        const ruta = `reposiciones/${usuario.id}/${dto.subcampania_id}/${randomUUID()}`;
        for (const [path, bytes, mime] of [
          [`${ruta}/original`, prepared.original, prepared.mimeOriginal],
          [`${ruta}/derivada.jpg`, prepared.derivada, 'image/jpeg'],
        ] as const) {
          const { error } = await storage.upload(path, bytes, {
            contentType: mime,
            upsert: false,
          });
          if (error)
            throw new InternalServerErrorException(
              'No se pudo subir la evidencia.',
            );
          uploaded.push(path);
        }
        fotos.push({
          ruta_original: `${ruta}/original`,
          ruta_derivada: `${ruta}/derivada.jpg`,
          mime_original: prepared.mimeOriginal,
          tamano_original: prepared.original.length,
          hash_original: prepared.hashOriginal,
          hash_derivada: prepared.hashDerivada,
          titulo: dto.titulo?.trim() || null,
          descripcion: dto.descripcion?.trim() || null,
          tomado_en: dto.tomado_en ?? null,
        });
      }
      // Un error de transporte después de CREAR no autoriza a borrar objetos:
      // el COMMIT puede haberse confirmado aunque se pierda su respuesta.
      confirmacionIncierta = true;
      const reply = await this.operar(
        usuario.id,
        dto.subcampania_id!,
        'CREAR',
        { fotos },
        true,
      );
      if (reply.http_status >= 400) {
        confirmacionIncierta = false;
        this.exigirExito(reply);
      }
      // Una respuesta inesperada tampoco demuestra que no hubo COMMIT.
      if (reply.http_status !== 201 || !Array.isArray(reply.body.data))
        throw new InternalServerErrorException(
          'No se pudo confirmar la evidencia creada.',
        );
      const evidencias = reply.body.data as Array<{ id: string }>;
      return {
        success: true,
        data: evidencias,
        evidencia_ids: evidencias.map((row) => Number(row.id)),
      };
    } catch (error) {
      if (!confirmacionIncierta && uploaded.length) {
        const { error: cleanupError } = await storage.remove(uploaded);
        if (cleanupError)
          this.logger.warn('Limpieza compensatoria interna pendiente.');
      }
      throw error;
    }
  }

  async descartarPendientesParaRegistro(
    dto: DescartarEvidenciasPendientesPlantacionDto,
    authId: string,
  ) {
    this.exigirContrato(dto);
    if (
      !Array.isArray(dto.evidencia_ids) ||
      !dto.evidencia_ids.length ||
      dto.evidencia_ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    )
      throw new BadRequestException(
        'evidencia_ids debe contener enteros positivos.',
      );
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);
    const ids = [...new Set(dto.evidencia_ids)].sort((a, b) => a - b);
    const reply = await this.operar(
      usuario.id,
      dto.subcampania_id!,
      'DESCARTAR',
      { evidencia_ids: ids },
    );
    const descartadas = reply.body.data as Array<{
      id: string;
      ruta_original: string;
      ruta_derivada: string;
    }>;
    if (descartadas.length) {
      const paths = descartadas.flatMap((row) => [
        row.ruta_original,
        row.ruta_derivada,
      ]);
      // Tombstone primero; repetir descarte permite reintentar la limpieza.
      const { error } = await this.supabaseService
        .getAdminClient()
        .storage.from(this.bucketEvidencias)
        .remove(paths);
      if (error)
        throw new InternalServerErrorException(
          'Descarte registrado; la limpieza debe reintentarse.',
        );
    }
    const descartadasIds = descartadas.map((row) => Number(row.id));
    return {
      success: true,
      data: {
        evidencia_ids_descartadas: descartadasIds,
        evidencia_ids_ignoradas: ids.filter(
          (id) => !descartadasIds.includes(id),
        ),
      },
    };
  }

  private exigirContrato(dto: {
    subcampania_id?: number;
    es_reposicion?: boolean;
  }): void {
    if (
      dto.es_reposicion !== true ||
      !Number.isSafeInteger(dto.subcampania_id) ||
      dto.subcampania_id! <= 0
    )
      throw new ConflictException({
        error: {
          codigo: 'CLIENTE_INCOMPATIBLE',
          mensaje:
            'La carga interna requiere subcampania_id y es_reposicion:true. Use cargas v1 para inicial.',
        },
      });
  }
  private async operar(
    actorId: number,
    scope: number,
    accion: string,
    payload = {},
    permitirRechazo = false,
  ): Promise<RpcReply> {
    const { data, error } = await this.supabaseService
      .getAdminClient()
      .rpc('pa_d_evidencias_reposicion', {
        p_actor_id: actorId,
        p_subcampania_id: scope,
        p_accion: accion,
        p_payload: payload,
      });
    if (error?.code === 'PT403')
      throw new HttpException(
        {
          error: {
            codigo: 'CUENTA_NO_DISPONIBLE',
            mensaje: 'La cuenta no está activa.',
          },
        },
        403,
      );
    if (error || !data || !Number.isInteger(data.http_status) || !data.body)
      throw new InternalServerErrorException(
        'No se pudo confirmar la operación de evidencia.',
      );
    if (!permitirRechazo) this.exigirExito(data as RpcReply);
    return data as RpcReply;
  }
  private exigirExito(reply: RpcReply) {
    if (reply.http_status >= 400)
      throw new HttpException(reply.body, reply.http_status);
  }
}
