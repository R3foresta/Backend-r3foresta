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
import { RegistrarAdaptabilidadDto } from '../api/dto/registrar-adaptabilidad.dto';
import { SubetapaAdaptabilidad } from '../domain/enums/subetapa-adaptabilidad.enum';
import { ViveroAuthService } from './vivero-auth.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';

type RpcAdaptabilidadResult = {
  evento_adaptabilidad_id: number;
  lote_vivero_id: number;
  codigo_trazabilidad: string;
  subetapa_destino: SubetapaAdaptabilidad;
  saldo_vivo_actual: number;
  evidencia_ids_vinculadas: number[];
};

type EventoAdaptabilidadRow = {
  id: number;
  tipo_evento: string;
  fecha_evento: string;
  cantidad_afectada: number | null;
  unidad_medida_evento: string | null;
  subetapa_destino: SubetapaAdaptabilidad | null;
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
export class ViveroAdaptabilidadService {
  private readonly logger = new Logger(ViveroAdaptabilidadService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly evidenciasService: ViveroEvidenciasService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST :id/adaptabilidad/evidencias-pendientes
  // Sube fotos al storage antes de confirmar la adaptabilidad (paso opcional).
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
        'Error al verificar lote para evidencias de adaptabilidad:',
        loteError,
      );
      throw new InternalServerErrorException('Error al verificar el lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    if (lote.estado_lote !== 'ACTIVO') {
      throw new BadRequestException(
        `El lote ${loteId} esta en estado ${lote.estado_lote}. No se pueden subir evidencias para adaptabilidad.`,
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
          'No se pudo actualizar codigo_trazabilidad en evidencias pendientes de adaptabilidad:',
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
  // POST :id/adaptabilidad
  // Llama la RPC fn_vivero_registrar_adaptabilidad en una sola transaccion.
  // La evidencia es opcional: se puede enviar evidencia_ids vacio o nulo.
  // ---------------------------------------------------------------------------
  async registrar(
    loteId: number,
    dto: RegistrarAdaptabilidadDto,
    authId: string,
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .rpc('fn_vivero_registrar_adaptabilidad', {
        p_lote_id: loteId,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: usuario.id,
        p_subetapa_destino: dto.subetapa_destino,
        p_observaciones: dto.observaciones ?? null,
        p_evidencia_ids: dto.evidencia_ids ?? null,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar adaptabilidad:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar la adaptabilidad.',
      );
    }

    const row = data as RpcAdaptabilidadResult;

    return {
      success: true,
      message: `ADAPTABILIDAD registrada. Subetapa actualizada a ${row.subetapa_destino}.`,
      data: {
        evento_adaptabilidad_id: Number(row.evento_adaptabilidad_id),
        lote_vivero_id: Number(row.lote_vivero_id),
        codigo_trazabilidad: row.codigo_trazabilidad,
        subetapa_destino: row.subetapa_destino,
        saldo_vivo_actual: Number(row.saldo_vivo_actual),
        evidencia_ids_vinculadas: (row.evidencia_ids_vinculadas ?? []).map(
          Number,
        ),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET :id/adaptabilidad
  // Devuelve todos los eventos ADAPTABILIDAD del lote con sus evidencias.
  // ---------------------------------------------------------------------------
  async obtenerAdaptabilidades(loteId: number) {
    const supabase = this.supabaseService.getClient();

    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, saldo_vivo_actual, subetapa_actual')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error(
        'Error al obtener lote para adaptabilidades:',
        loteError,
      );
      throw new InternalServerErrorException('Error al obtener datos del lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const { data: eventos, error: eventosError } = await supabase
      .from('evento_lote_vivero')
      .select(
        'id, tipo_evento, fecha_evento, cantidad_afectada, unidad_medida_evento, subetapa_destino, saldo_vivo_antes, saldo_vivo_despues, observaciones, responsable_id, created_at',
      )
      .eq('lote_id', loteId)
      .eq('tipo_evento', 'ADAPTABILIDAD')
      .order('created_at', { ascending: false });

    if (eventosError) {
      this.logger.error(
        'Error al obtener eventos ADAPTABILIDAD:',
        eventosError,
      );
      throw new InternalServerErrorException(
        'Error al obtener los eventos de adaptabilidad',
      );
    }

    const eventosList = (eventos ?? []) as EventoAdaptabilidadRow[];

    const adaptabilidadesConEvidencias = await Promise.all(
      eventosList.map(async (evento) => {
        const eventoId = Number(evento.id);
        const evidencias = await this.obtenerEvidenciasDelEvento(
          supabase,
          eventoId,
        );

        return {
          id: eventoId,
          fecha_evento: evento.fecha_evento,
          subetapa_destino: evento.subetapa_destino,
          cantidad_afectada:
            evento.cantidad_afectada !== null
              ? Number(evento.cantidad_afectada)
              : null,
          unidad_medida_evento: evento.unidad_medida_evento ?? null,
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
        subetapa_actual: lote.subetapa_actual ?? null,
        total_adaptabilidades: adaptabilidadesConEvidencias.length,
        adaptabilidades: adaptabilidadesConEvidencias,
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
        'Error al obtener evidencias del evento ADAPTABILIDAD:',
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
