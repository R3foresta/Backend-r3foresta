import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';

@Injectable()
export class RecoleccionCodigosService {
  private readonly logger = new Logger(RecoleccionCodigosService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async generateCodigoTrazabilidad(fechaISO: string): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const fechaNormalizada = FechaRecoleccionPolicy.normalizeIsoDateString(
      fechaISO,
      'fecha',
    );
    const año = Number(fechaNormalizada.slice(0, 4));
    const prefijo = `REC-${año}-`;
    const { data, error } = await supabase
      .from('recoleccion')
      .select('codigo_trazabilidad')
      .ilike('codigo_trazabilidad', `${prefijo}%`);

    if (error) {
      this.logger.error(
        '❌ Error al consultar códigos de trazabilidad para generar correlativo:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al generar código de trazabilidad',
      );
    }

    let maxSecuencial = 0;
    for (const row of data ?? []) {
      const codigo = String(
        (row as { codigo_trazabilidad?: string }).codigo_trazabilidad ?? '',
      );
      const secuencial = this.extractSecuencialFromCodigo(codigo, año);
      if (secuencial > maxSecuencial) {
        maxSecuencial = secuencial;
      }
    }

    let siguiente = maxSecuencial + 1;
    while (true) {
      const codigo = `${prefijo}${siguiente.toString().padStart(3, '0')}`;
      const existe = await this.codigoTrazabilidadExists(codigo);
      if (!existe) {
        return codigo;
      }
      siguiente += 1;
    }
  }

  isCodigoTrazabilidadDuplicateError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: string; message?: string };
    return (
      candidate.code === '23505' &&
      String(candidate.message ?? '').includes(
        'recoleccion_codigo_trazabilidad_key',
      )
    );
  }

  private extractSecuencialFromCodigo(codigo: string, año: number): number {
    const prefijo = `REC-${año}-`;
    if (!codigo.startsWith(prefijo)) {
      return 0;
    }

    const parteSecuencial = codigo.slice(prefijo.length);
    const numero = Number.parseInt(parteSecuencial, 10);
    return Number.isFinite(numero) ? numero : 0;
  }

  private async codigoTrazabilidadExists(codigo: string): Promise<boolean> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('recoleccion')
      .select('id')
      .eq('codigo_trazabilidad', codigo)
      .maybeSingle();

    if (error) {
      this.logger.error(
        '❌ Error al verificar existencia de codigo_trazabilidad:',
        error,
      );
      throw new InternalServerErrorException(
        'Error al validar código de trazabilidad',
      );
    }

    return Boolean(data);
  }
}
