import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export const BUCKET_ORGANIZACIONES = 'organizaciones';
const EXTENSIONES_VALIDAS = ['png', 'jpg', 'jpeg', 'webp'];

@Injectable()
export class OrganizacionesLogoService {
  private readonly logger = new Logger(OrganizacionesLogoService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async subir(orgId: number, file: Express.Multer.File): Promise<string> {
    const extension = this.resolveExtension(file);
    const supabase = this.supabaseService.getClient();
    const filePath = `org-${orgId}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_ORGANIZACIONES)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      this.logger.error('Error al subir logo a Storage', uploadError);
      throw new InternalServerErrorException(
        'Error al subir logo de la organizacion al storage',
      );
    }

    const { data } = supabase.storage
      .from(BUCKET_ORGANIZACIONES)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async eliminarPorUrl(logoUrl: string | null | undefined): Promise<void> {
    if (!logoUrl) return;
    const path = this.extraerPath(logoUrl);
    if (!path) {
      this.logger.warn(
        `logo_url no apunta al bucket ${BUCKET_ORGANIZACIONES}; no se borra del Storage: ${logoUrl}`,
      );
      return;
    }

    const supabase = this.supabaseService.getClient();
    const { error } = await supabase.storage
      .from(BUCKET_ORGANIZACIONES)
      .remove([path]);

    if (error) {
      this.logger.warn(
        `No se pudo eliminar logo "${path}" del bucket: ${error.message}`,
      );
    }
  }

  extraerPath(logoUrl: string): string | null {
    const marker = `/object/public/${BUCKET_ORGANIZACIONES}/`;
    const idx = logoUrl.indexOf(marker);
    if (idx === -1) return null;
    const rest = logoUrl.slice(idx + marker.length);
    const q = rest.indexOf('?');
    return q === -1 ? rest : rest.slice(0, q);
  }

  private resolveExtension(file: Express.Multer.File): string {
    const mimePart = (file.mimetype || '').split('/')[1]?.toLowerCase();
    if (mimePart && EXTENSIONES_VALIDAS.includes(mimePart)) return mimePart;

    const nameParts = (file.originalname || '').split('.');
    const fromName = nameParts.length > 1 ? nameParts.pop()?.toLowerCase() : '';
    if (fromName && EXTENSIONES_VALIDAS.includes(fromName)) return fromName;

    throw new BadRequestException(
      `Extension de logo no soportada. Permitidas: ${EXTENSIONES_VALIDAS.join(', ')}`,
    );
  }
}
