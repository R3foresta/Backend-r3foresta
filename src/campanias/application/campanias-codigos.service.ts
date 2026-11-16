import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class CampaniasCodigosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async generarCodigo(anio: number): Promise<string> {
    const { data, error } = (await this.supabaseService
      .getAdminClient()
      .rpc('fn_generar_codigo_campania', { p_anio: anio })) as {
      data: unknown;
      error: { message: string } | null;
    };

    if (error || typeof data !== 'string' || !data) {
      throw new Error(
        error?.message ?? 'No se pudo generar el codigo de trazabilidad.',
      );
    }

    return data;
  }
}
