import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
import { RegistrarDespachoDto } from '../api/dto/registrar-despacho.dto';
import { DestinoTipoVivero } from '../domain/enums/destino-tipo-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { ViveroAuthService } from './vivero-auth.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';
import { ViveroSaldosService } from './vivero-saldos.service';

type RpcDespachoResult = {
  evento_despacho_id: number;
  lote_vivero_id: number;
  codigo_trazabilidad: string;
  cantidad_despachada: number;
  destino_tipo: DestinoTipoVivero;
  destino_referencia: string;
  comunidad_destino_id: number | null;
  saldo_vivo_antes: number;
  saldo_vivo_despues: number;
  evidencia_ids_vinculadas: number[];
  lote_finalizado: boolean;
  motivo_cierre: MotivoCierreLote | null;
};

type EventoDespachoRow = {
  id: number;
  tipo_evento: string;
  fecha_evento: string;
  cantidad_afectada: number;
  destino_tipo: string | null;
  destino_referencia: string | null;
  comunidad_destino_id: number | null;
  origen_despacho: string | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
  observaciones: string | null;
  responsable_id: number;
  created_at: string;
};

type EvidenciaPendienteRow = {
  id: number;
  entidad_id: number;
  ruta_archivo: string;
  mime_type: string;
};

type EvidenciaRow = {
  id: number;
  ruta_archivo: string;
  mime_type: string;
  tipo_archivo: string;
  es_principal: boolean;
  orden: number;
};

@Injectable()
export class ViveroDespachoService {
  private readonly logger = new Logger(ViveroDespachoService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly evidenciasService: ViveroEvidenciasService,
    private readonly saldosService: ViveroSaldosService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST :id/despacho/evidencias-pendientes
  // Sube fotos al storage antes de confirmar el despacho.
  // ---------------------------------------------------------------------------
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
        'Error al verificar lote para evidencias de despacho:',
        loteError,
      );
      throw new InternalServerErrorException('Error al verificar el lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    if (lote.estado_lote !== 'ACTIVO') {
      throw new BadRequestException(
        `El lote ${loteId} esta en estado ${lote.estado_lote}. No se pueden subir evidencias para despacho.`,
      );
    }

    const resultado = await this.evidenciasService.crearPendienteParaEvento(
      dto,
      authId,
      files,
    );

    const evidenciaIds: number[] = resultado.evidencia_ids;

    if (evidenciaIds.length > 0) {
      const { error: updateError } = await supabase
        .from('evidencias_trazabilidad')
        .update({ codigo_trazabilidad: lote.codigo_trazabilidad })
        .in('id', evidenciaIds);

      if (updateError) {
        this.logger.warn(
          'No se pudo actualizar codigo_trazabilidad en evidencias pendientes de despacho:',
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

  // ---------------------------------------------------------------------------
  // POST :id/despacho
  // Llama la RPC fn_vivero_registrar_despacho en una sola transaccion.
  // La RPC ya rechaza destino_tipo = 'PLANTACION_CAMPANIA'; aca lo bloqueamos
  // tambien a nivel API por defensa en profundidad (y porque el enum publico
  // DestinoTipoVivero no lo expone, asi que la validacion del DTO lo deberia
  // haber filtrado antes de llegar aca).
  // ---------------------------------------------------------------------------
  async registrar(loteId: number, dto: RegistrarDespachoDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    if ((dto.destino_tipo as string) === 'PLANTACION_CAMPANIA') {
      throw new BadRequestException(
        'destino_tipo PLANTACION_CAMPANIA esta reservado para despachos automaticos generados desde Modulo 3.',
      );
    }

    // Valida contra saldo_vivo_disponible_asignacion (saldo_vivo_actual menos reservas
    // activas de subcampanas). Un DESPACHO MANUAL no puede tocar stock reservado.
    const saldoDisponible =
      await this.saldosService.leerSaldoDisponible(loteId);
    this.saldosService.assertCantidadNoExcedeSaldo(
      dto.cantidad_afectada,
      saldoDisponible,
      loteId,
    );

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .rpc('fn_vivero_registrar_despacho', {
        p_lote_id: loteId,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: usuario.id,
        p_cantidad_despachada: dto.cantidad_afectada,
        p_destino_tipo: dto.destino_tipo,
        p_destino_referencia: dto.destino_referencia,
        p_comunidad_destino_id: dto.comunidad_destino_id ?? null,
        p_observaciones: dto.observaciones ?? null,
        p_evidencia_ids: dto.evidencia_ids,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar despacho:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar el despacho.',
      );
    }

    const row = data as RpcDespachoResult;

    const message = row.lote_finalizado
      ? 'Despacho registrado correctamente. El lote ha sido cerrado automaticamente por saldo en 0.'
      : 'Despacho registrado correctamente.';

    return {
      success: true,
      data: {
        message,
        evento_despacho_id: Number(row.evento_despacho_id),
        lote_vivero_id: Number(row.lote_vivero_id),
        codigo_trazabilidad: row.codigo_trazabilidad,
        cantidad_despachada: Number(row.cantidad_despachada),
        destino_tipo: row.destino_tipo,
        destino_referencia: row.destino_referencia,
        comunidad_destino_id:
          row.comunidad_destino_id !== null
            ? Number(row.comunidad_destino_id)
            : null,
        saldo_vivo_antes: Number(row.saldo_vivo_antes),
        saldo_vivo_despues: Number(row.saldo_vivo_despues),
        evidencia_ids_vinculadas: (row.evidencia_ids_vinculadas ?? []).map(
          Number,
        ),
        lote_finalizado: row.lote_finalizado,
        motivo_cierre: row.motivo_cierre ?? null,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET :id/despacho
  // Devuelve todos los eventos DESPACHO del lote con sus evidencias.
  // ---------------------------------------------------------------------------
  async obtenerDespachos(loteId: number) {
    const supabase = this.supabaseService.getClient();

    const { data: loteData, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, saldo_vivo_actual, estado_lote, motivo_cierre')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al obtener lote para despachos:', loteError);
      throw new InternalServerErrorException('Error al obtener datos del lote');
    }

    if (!loteData) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const lote = loteData as {
      id: number;
      saldo_vivo_actual: number | null;
      estado_lote: string;
      motivo_cierre: MotivoCierreLote | null;
    };

    const { data: eventos, error: eventosError } = await supabase
      .from('evento_lote_vivero')
      .select(
        'id, tipo_evento, fecha_evento, cantidad_afectada, destino_tipo, destino_referencia, comunidad_destino_id, origen_despacho, saldo_vivo_antes, saldo_vivo_despues, observaciones, responsable_id, created_at',
      )
      .eq('lote_id', loteId)
      .eq('tipo_evento', 'DESPACHO')
      .order('created_at', { ascending: true });

    if (eventosError) {
      this.logger.error('Error al obtener eventos DESPACHO:', eventosError);
      throw new InternalServerErrorException(
        'Error al obtener los eventos de despacho',
      );
    }

    const eventosList = (eventos ?? []) as EventoDespachoRow[];

    const despachosConEvidencias = await Promise.all(
      eventosList.map(async (evento) => {
        const eventoId = Number(evento.id);
        const evidencias = await this.obtenerEvidenciasDelEvento(
          supabase,
          eventoId,
        );

        return {
          id: eventoId,
          fecha_evento: evento.fecha_evento,
          cantidad_afectada: Number(evento.cantidad_afectada),
          destino_tipo: evento.destino_tipo,
          destino_referencia: evento.destino_referencia,
          comunidad_destino_id:
            evento.comunidad_destino_id !== null
              ? Number(evento.comunidad_destino_id)
              : null,
          origen_despacho: evento.origen_despacho,
          saldo_vivo_antes:
            evento.saldo_vivo_antes !== null
              ? Number(evento.saldo_vivo_antes)
              : null,
          saldo_vivo_despues:
            evento.saldo_vivo_despues !== null
              ? Number(evento.saldo_vivo_despues)
              : null,
          observaciones: evento.observaciones ?? null,
          responsable_id: Number(evento.responsable_id),
          created_at: evento.created_at,
          evidencias,
        };
      }),
    );

    return {
      success: true,
      data: {
        lote_id: loteId,
        estado_lote: lote.estado_lote,
        motivo_cierre: lote.motivo_cierre ?? null,
        saldo_vivo_actual:
          lote.saldo_vivo_actual !== null
            ? Number(lote.saldo_vivo_actual)
            : null,
        total_despachos: despachosConEvidencias.length,
        despachos: despachosConEvidencias,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Privado: obtiene evidencias vinculadas a un evento de vivero
  // ---------------------------------------------------------------------------
  private async obtenerEvidenciasDelEvento(
    supabase: SupabaseClient,
    eventoId: number,
  ): Promise<(EvidenciaRow & { public_url: string })[]> {
    const { data: tipoEntidadData } = await supabase
      .from('tipos_entidad_evidencia')
      .select('id')
      .ilike('codigo', 'EVENTO_LOTE_VIVERO')
      .eq('activo', true)
      .maybeSingle();

    const tipoEntidad = tipoEntidadData as { id: number } | null;

    if (!tipoEntidad) {
      return [];
    }

    const { data: evidenciasData, error: evError } = await supabase
      .from('evidencias_trazabilidad')
      .select('id, ruta_archivo, mime_type, tipo_archivo, es_principal, orden')
      .eq('tipo_entidad_id', Number(tipoEntidad.id))
      .eq('entidad_id', eventoId)
      .is('eliminado_en', null);

    if (evError) {
      this.logger.warn(
        'Error al obtener evidencias del evento DESPACHO:',
        evError,
      );
      return [];
    }

    return ((evidenciasData ?? []) as EvidenciaRow[]).map((ev) => {
      const { data: publicUrlData } = supabase.storage
        .from('recoleccion_fotos')
        .getPublicUrl(ev.ruta_archivo);

      return {
        id: Number(ev.id),
        ruta_archivo: ev.ruta_archivo,
        mime_type: ev.mime_type,
        tipo_archivo: ev.tipo_archivo,
        es_principal: ev.es_principal,
        orden: ev.orden,
        public_url: publicUrlData.publicUrl,
      };
    });
  }
}
