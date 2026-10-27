import {
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { VerifiedActor } from '../../auth/verified-actor.guard';
import {
  MAX_FOTO_BYTES,
  ParticipacionImagenService,
} from '../../participacion/cargas/participacion-imagen.service';
import { SupabaseService } from '../../supabase/supabase.service';

type Material = { bucket: string; ruta: string; legada: boolean };

@Injectable()
export class ImpactoImagenPropiaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly imagenes: ParticipacionImagenService,
  ) {}

  private async material(
    actor: VerifiedActor,
    registroId: string,
    evidenciaId: string,
  ): Promise<Material> {
    const response: unknown = await this.supabase
      .getAdminClient()
      .rpc('pa_foto_propia_leer', {
        p_actor_id: actor.usuario_id,
        p_auth_id: actor.auth_id,
        p_registro_id: registroId,
        p_evidencia_id: evidenciaId,
      });
    if (!response || typeof response !== 'object' || Array.isArray(response))
      throw new ServiceUnavailableException(
        'Imagen no disponible temporalmente.',
      );
    const result = response as Record<string, unknown>;
    const data = result.data;
    const failure = result.error;
    if (failure) {
      const code =
        failure && typeof failure === 'object' && 'code' in failure
          ? failure.code
          : null;
      if (code === 'PT404')
        throw new NotFoundException('Imagen no encontrada.');
      if (code === 'PT401' || code === 'PT403')
        throw new HttpException(
          'La sesión no está disponible.',
          Number(code.slice(2)),
        );
      throw new ServiceUnavailableException(
        'Imagen no disponible temporalmente.',
      );
    }
    const value: unknown = data;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('data' in value) ||
      !value.data ||
      typeof value.data !== 'object' ||
      Array.isArray(value.data)
    )
      throw new ServiceUnavailableException(
        'Imagen no disponible temporalmente.',
      );
    const item = value.data as Record<string, unknown>;
    const { bucket, ruta, legada } = item;
    if (
      typeof ruta !== 'string' ||
      !ruta ||
      ruta.startsWith('/') ||
      ruta.includes('..') ||
      !(
        (legada === true && bucket === 'recoleccion_fotos') ||
        (legada === false &&
          bucket === 'participacion_evidencias' &&
          ruta.endsWith('/derivada.jpg'))
      )
    )
      throw new ServiceUnavailableException(
        'Imagen no disponible temporalmente.',
      );
    return { bucket: bucket as string, ruta, legada };
  }

  /** Autoriza por registro en cada lectura y justo antes de descargar Storage. */
  async imagen(
    actor: VerifiedActor,
    registroId: string,
    evidenciaId: string,
  ): Promise<Buffer> {
    const selected = await this.material(actor, registroId, evidenciaId);
    const descargar = async () => {
      const current = await this.material(actor, registroId, evidenciaId);
      if (
        current.bucket !== selected.bucket ||
        current.ruta !== selected.ruta ||
        current.legada !== selected.legada
      )
        throw new NotFoundException('Imagen no encontrada.');
      const { data: blob, error } = await this.supabase
        .getAdminClient()
        .storage.from(current.bucket)
        .download(current.ruta);
      if (error || !blob || blob.size === 0 || blob.size > MAX_FOTO_BYTES)
        throw new ServiceUnavailableException(
          'Imagen no disponible temporalmente.',
        );
      return Buffer.from(await blob.arrayBuffer());
    };
    if (selected.legada) return this.imagenes.prepararPublica(descargar);
    return descargar();
  }
}
