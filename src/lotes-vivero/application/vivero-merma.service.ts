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
import { RegistrarMermaDto } from '../api/dto/registrar-merma.dto';
import { CausaMermaVivero } from '../domain/enums/causa-merma-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { ViveroAuthService } from './vivero-auth.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';

type RpcMermaResult = {
  evento_merma_id: number;
  lote_vivero_id: number;
  codigo_trazabilidad: string;
  cantidad_perdida: number;
  causa_merma: CausaMermaVivero;
  saldo_vivo_antes: number;
  saldo_vivo_despues: number;
  evidencia_ids_vinculadas: number[];
  lote_finalizado: boolean;
  motivo_cierre: MotivoCierreLote | null;
};

type EventoMermaRow = {
  id: number;
  tipo_evento: string;
  fecha_evento: string;
  cantidad_afectada: number;
  causa_merma: string;
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
export class ViveroMermaService {
  private readonly logger = new Logger(ViveroMermaService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly evidenciasService: ViveroEvidenciasService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST :id/merma/evidencias-pendientes
  // Sube fotos al storage antes de confirmar la merma.
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
        'Error al verificar lote para evidencias de merma:',
        loteError,
      );
      throw new InternalServerErrorException('Error al verificar el lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    if (lote.estado_lote !== 'ACTIVO') {
      throw new BadRequestException(
        `El lote ${loteId} esta en estado ${lote.estado_lote}. No se pueden subir evidencias para merma.`,
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
          'No se pudo actualizar codigo_trazabilidad en evidencias pendientes de merma:',
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
  // POST :id/merma
  // Llama la RPC fn_vivero_registrar_merma en una sola transaccion.
  // ---------------------------------------------------------------------------
  async registrar(loteId: number, dto: RegistrarMermaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .rpc('fn_vivero_registrar_merma', {
        p_lote_id: loteId,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: usuario.id,
        p_cantidad_perdida: dto.cantidad_afectada,
        p_causa_merma: dto.causa_merma,
        p_observaciones: dto.observaciones ?? null,
        p_evidencia_ids: dto.evidencia_ids,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar merma:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar la merma.',
      );
    }

    const row = data as RpcMermaResult;

    const message = row.lote_finalizado
      ? 'Merma registrada correctamente. El lote ha sido cerrado automaticamente por saldo en 0.'
      : 'Merma registrada correctamente.';

    return {
      success: true,
      data: {
        message,
        evento_merma_id: Number(row.evento_merma_id),
        lote_vivero_id: Number(row.lote_vivero_id),
        codigo_trazabilidad: row.codigo_trazabilidad,
        cantidad_perdida: Number(row.cantidad_perdida),
        causa_merma: row.causa_merma,
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
  // GET :id/merma
  // Devuelve todos los eventos MERMA del lote con sus evidencias.
  // ---------------------------------------------------------------------------
  async obtenerMermas(loteId: number) {
    const supabase = this.supabaseService.getClient();

    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, saldo_vivo_actual')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al obtener lote para mermas:', loteError);
      throw new InternalServerErrorException('Error al obtener datos del lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const { data: eventos, error: eventosError } = await supabase
      .from('evento_lote_vivero')
      .select(
        'id, tipo_evento, fecha_evento, cantidad_afectada, causa_merma, saldo_vivo_antes, saldo_vivo_despues, observaciones, responsable_id, created_at',
      )
      .eq('lote_id', loteId)
      .eq('tipo_evento', 'MERMA')
      .order('created_at', { ascending: true });

    if (eventosError) {
      this.logger.error('Error al obtener eventos MERMA:', eventosError);
      throw new InternalServerErrorException(
        'Error al obtener los eventos de merma',
      );
    }

    const eventosList = (eventos ?? []) as EventoMermaRow[];

    const mermasConEvidencias = await Promise.all(
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
          causa_merma: evento.causa_merma,
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
        saldo_vivo_actual:
          lote.saldo_vivo_actual !== null
            ? Number(lote.saldo_vivo_actual)
            : null,
        total_mermas: mermasConEvidencias.length,
        mermas: mermasConEvidencias,
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
      this.logger.warn('Error al obtener evidencias del evento MERMA:', evError);
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
