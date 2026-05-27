import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SubcampaniasCodigosService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async generarCodigo(campaniaId: number): Promise<string> {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('fn_generar_codigo_subcampania', { p_campania_id: campaniaId });

    if (error || !data) {
      throw new Error(
        error?.message ?? 'No se pudo generar el codigo de trazabilidad.',
      );
    }

    return data as string;
  }
}
