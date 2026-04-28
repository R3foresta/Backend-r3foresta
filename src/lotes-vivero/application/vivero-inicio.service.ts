import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearLoteViveroDto } from '../api/dto/crear-lote-vivero.dto';
import { ViveroAuthService } from './vivero-auth.service';

export type CrearLoteViveroResult = {
  lote_vivero_id: number;
  evento_inicio_id: number;
  recoleccion_movimiento_id: number;
  codigo_trazabilidad: string;
  saldo_recoleccion_antes: number;
  saldo_recoleccion_despues: number;
  evidencia_inicio_ids: number[];
};

@Injectable()
export class ViveroInicioService {
  private readonly logger = new Logger(ViveroInicioService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
  ) {}

  async crearDesdeRecoleccion(dto: CrearLoteViveroDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const supabase = this.supabaseService.getClient();
    let lastError: any = null;

    for (let intento = 1; intento <= 5; intento++) {
      const { data, error } = await supabase.rpc(
        'fn_vivero_crear_lote_desde_recoleccion',
        {
          p_recoleccion_id: dto.recoleccion_id,
          p_vivero_id: dto.vivero_id,
          p_responsable_id: usuario.id,
          p_fecha_inicio: dto.fecha_inicio,
          p_fecha_evento: dto.fecha_evento,
          p_cantidad_inicial_en_proceso: dto.cantidad_inicial_en_proceso,
          p_unidad_medida_inicial: dto.unidad_medida_inicial,
          p_observaciones: dto.observaciones ?? null,
          p_evidencia_ids: dto.evidencia_ids,
        },
      );

      if (!error) {
        return {
          success: true,
          data: this.normalizeRpcResult(data),
        };
      }

      lastError = error;
      if (this.isCodigoTrazabilidadDuplicateError(error)) {
        this.logger.warn(
          `Colision de codigo de lote vivero, reintentando (${intento}/5).`,
        );
        continue;
      }

      this.logger.error('Error al crear lote de vivero desde recoleccion:', error);
      throw new BadRequestException(
        error.message || 'No se pudo crear el lote de vivero.',
      );
    }

    this.logger.error(
      'Error al crear lote de vivero: agotados los reintentos de codigo.',
      lastError,
    );
    throw new InternalServerErrorException(
      'No se pudo generar un codigo unico para el lote de vivero.',
    );
  }

  private normalizeRpcResult(data: unknown): CrearLoteViveroResult {
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') {
      throw new InternalServerErrorException(
        'La RPC de inicio de vivero no devolvio datos.',
      );
    }

    const result = row as Record<string, unknown>;

    return {
      lote_vivero_id: Number(result.lote_vivero_id),
      evento_inicio_id: Number(result.evento_inicio_id),
      recoleccion_movimiento_id: Number(result.recoleccion_movimiento_id),
      codigo_trazabilidad: String(result.codigo_trazabilidad),
      saldo_recoleccion_antes: Number(result.saldo_recoleccion_antes),
      saldo_recoleccion_despues: Number(result.saldo_recoleccion_despues),
      evidencia_inicio_ids: Array.isArray(result.evidencia_inicio_ids)
        ? result.evidencia_inicio_ids.map((id) => Number(id))
        : [],
    };
  }

  private isCodigoTrazabilidadDuplicateError(error: any): boolean {
    const code = String(error?.code ?? '');
    const message = String(error?.message ?? '').toLowerCase();
    const details = String(error?.details ?? '').toLowerCase();

    return (
      code === '23505' &&
      (message.includes('codigo_trazabilidad') ||
        details.includes('codigo_trazabilidad'))
    );
  }
}
