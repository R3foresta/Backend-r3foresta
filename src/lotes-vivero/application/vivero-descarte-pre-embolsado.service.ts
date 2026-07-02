import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
import { RegistrarDescartePreEmbolsadoDto } from '../api/dto/registrar-descarte-pre-embolsado.dto';
import { CausaDescartePreEmbolsado } from '../domain/enums/causa-descarte-pre-embolsado.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';
import { ViveroAuthService } from './vivero-auth.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';

type RpcDescartePreEmbolsadoResult = {
  evento_descarte_pre_embolsado_id: number;
  evento_cierre_id: number;
  lote_vivero_id: number;
  codigo_trazabilidad: string;
  cantidad_material_afectado: number;
  unidad_medida_evento: UnidadMedidaVivero;
  causa_descarte_pre_embolsado: CausaDescartePreEmbolsado;
  evidencia_ids_vinculadas: number[];
  lote_finalizado: boolean;
  motivo_cierre: MotivoCierreLote;
};

type EvidenciaPendienteRow = {
  id: number;
  entidad_id: number;
  ruta_archivo: string;
  mime_type: string;
};

type EventoHitoRow = {
  tipo_evento: TipoEventoVivero;
};

@Injectable()
export class ViveroDescartePreEmbolsadoService {
  private readonly logger = new Logger(ViveroDescartePreEmbolsadoService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly evidenciasService: ViveroEvidenciasService,
  ) {}

  async crearEvidenciasPendientes(
    loteId: number,
    dto: CrearEvidenciaPendienteViveroDto,
    authId: string,
    files: ViveroEvidenceFileInput[],
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, codigo_trazabilidad, estado_lote')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error(
        'Error al verificar lote para evidencias de descarte pre-embolsado:',
        loteError,
      );
      throw new InternalServerErrorException('Error al verificar el lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    if (lote.estado_lote !== 'ACTIVO') {
      throw new BadRequestException(
        `El lote ${loteId} esta en estado ${lote.estado_lote}. No se pueden subir evidencias para descarte pre-embolsado.`,
      );
    }

    const { data: eventos, error: eventosError } = await supabase
      .from('evento_lote_vivero')
      .select('tipo_evento')
      .eq('lote_id', loteId)
      .in('tipo_evento', [TipoEventoVivero.INICIO, TipoEventoVivero.EMBOLSADO]);

    if (eventosError) {
      this.logger.error(
        'Error al verificar hitos para evidencias de descarte pre-embolsado:',
        eventosError,
      );
      throw new InternalServerErrorException(
        'Error al verificar eventos del lote',
      );
    }

    const hitos = (eventos ?? []) as EventoHitoRow[];
    const tieneInicio = hitos.some(
      (evento) => evento.tipo_evento === TipoEventoVivero.INICIO,
    );
    const tieneEmbolsado = hitos.some(
      (evento) => evento.tipo_evento === TipoEventoVivero.EMBOLSADO,
    );

    if (!tieneInicio) {
      throw new BadRequestException(
        `El lote ${loteId} no tiene INICIO. DESCARTE_PRE_EMBOLSADO requiere INICIO previo.`,
      );
    }

    if (tieneEmbolsado) {
      throw new BadRequestException(
        `El lote ${loteId} ya tiene EMBOLSADO. Use MERMA total sobre saldo_vivo_actual para una perdida total post-embolsado.`,
      );
    }

    const resultado = await this.evidenciasService.crearPendienteParaEvento(
      dto,
      authId,
      files,
      { eventoTipo: TipoEventoVivero.DESCARTE_PRE_EMBOLSADO },
    );

    const evidenciaIds: number[] = resultado.evidencia_ids;

    if (evidenciaIds.length > 0) {
      const { error: updateError } = await supabase
        .from('evidencias_trazabilidad')
        .update({ codigo_trazabilidad: lote.codigo_trazabilidad })
        .in('id', evidenciaIds);

      if (updateError) {
        this.logger.warn(
          'No se pudo actualizar codigo_trazabilidad en evidencias pendientes de descarte pre-embolsado:',
          updateError,
        );
      }
    }

    const evidencias = (resultado.data as EvidenciaPendienteRow[]).map(
      (ev) => ({
        id: Number(ev.id),
        codigo_trazabilidad: lote.codigo_trazabilidad,
        entidad_id: ev.entidad_id ?? 0,
        ruta_archivo: ev.ruta_archivo,
        tipo_archivo: ev.mime_type,
      }),
    );

    return {
      success: true,
      data: {
        evidencia_ids: evidenciaIds,
        evidencias,
      },
    };
  }

  async registrar(
    loteId: number,
    dto: RegistrarDescartePreEmbolsadoDto,
    authId: string,
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .rpc('fn_vivero_registrar_descarte_pre_embolsado', {
        p_lote_id: loteId,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: usuario.id,
        p_cantidad_material_afectado: dto.cantidad_material_afectado,
        p_unidad_medida_evento: dto.unidad_medida_evento,
        p_causa_descarte_pre_embolsado: dto.causa_descarte_pre_embolsado,
        p_observaciones: dto.observaciones ?? null,
        p_evidencia_ids: dto.evidencia_ids,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar descarte pre-embolsado:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar el descarte pre-embolsado.',
      );
    }

    const row = data as RpcDescartePreEmbolsadoResult;

    return {
      success: true,
      data: {
        message:
          'Descarte pre-embolsado registrado correctamente. El lote ha sido cerrado automaticamente.',
        evento_descarte_pre_embolsado_id: Number(
          row.evento_descarte_pre_embolsado_id,
        ),
        evento_cierre_id: Number(row.evento_cierre_id),
        lote_vivero_id: Number(row.lote_vivero_id),
        codigo_trazabilidad: row.codigo_trazabilidad,
        cantidad_material_afectado: Number(row.cantidad_material_afectado),
        unidad_medida_evento: row.unidad_medida_evento,
        causa_descarte_pre_embolsado: row.causa_descarte_pre_embolsado,
        evidencia_ids_vinculadas: (row.evidencia_ids_vinculadas ?? []).map(
          Number,
        ),
        lote_finalizado: row.lote_finalizado,
        motivo_cierre: row.motivo_cierre,
      },
    };
  }
}
