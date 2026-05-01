import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CrearEvidenciaPendienteViveroDto } from '../api/dto/crear-evidencia-pendiente-vivero.dto';
import { RegistrarEmbolsadoDto } from '../api/dto/registrar-embolsado.dto';
import { ViveroAuthService } from './vivero-auth.service';
import {
  ViveroEvidenceFileInput,
  ViveroEvidenciasService,
} from './vivero-evidencias.service';
import { SupabaseClient } from '@supabase/supabase-js';

type EventoLoteRow = {
  id: number;
  tipo_evento: string;
  fecha_evento: string;
  cantidad_afectada: number | null;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number | null;
  created_at: string;
};

type EventoEmbolsadoRow = EventoLoteRow & {
  unidad_medida_evento: string | null;
  observaciones: string | null;
  responsable_id: number;
};

type RpcEmbolsadoResult = {
  evento_embolsado_id: number;
  lote_vivero_id: number;
  codigo_trazabilidad: string;
  plantas_vivas_iniciales: number;
  saldo_vivo_antes: number | null;
  saldo_vivo_despues: number;
  evidencia_ids_vinculadas: number[];
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
export class ViveroEmbolsadoService {
  private readonly logger = new Logger(ViveroEmbolsadoService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly evidenciasService: ViveroEvidenciasService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET :id/embolsado/context
  // Carga los datos del lote para la pantalla de embolsado. Solo lectura.
  // ---------------------------------------------------------------------------
  async obtenerContexto(loteId: number) {
    const supabase = this.supabaseService.getClient();

    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select(
        `
        id,
        codigo_trazabilidad,
        estado_lote,
        nombre_cientifico_snapshot,
        nombre_comercial_snapshot,
        tipo_material_snapshot,
        cantidad_inicial_en_proceso,
        unidad_medida_inicial,
        fecha_inicio,
        plantas_vivas_iniciales,
        saldo_vivo_actual
      `,
      )
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al obtener contexto de embolsado:', loteError);
      throw new InternalServerErrorException('Error al obtener datos del lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const { data: eventos, error: eventosError } = await supabase
      .from('evento_lote_vivero')
      .select(
        'id, tipo_evento, fecha_evento, cantidad_afectada, saldo_vivo_antes, saldo_vivo_despues, created_at',
      )
      .eq('lote_id', loteId)
      .in('tipo_evento', ['INICIO', 'EMBOLSADO'])
      .order('created_at', { ascending: true });

    if (eventosError) {
      this.logger.error('Error al obtener eventos del lote:', eventosError);
      throw new InternalServerErrorException(
        'Error al verificar eventos del lote',
      );
    }

    const eventosList = (eventos || []) as EventoLoteRow[];
    const tieneInicio = eventosList.some((e) => e.tipo_evento === 'INICIO');
    const eventoEmbolsado =
      eventosList.find((e) => e.tipo_evento === 'EMBOLSADO') ?? null;
    const tieneEmbolsado = !!eventoEmbolsado;

    let puedeRegistrarEmbolsado = true;
    let motivoBloqueo: string | null = null;

    if (lote.estado_lote !== 'ACTIVO') {
      puedeRegistrarEmbolsado = false;
      motivoBloqueo = `El lote esta en estado ${lote.estado_lote}. Solo lotes ACTIVOS permiten registrar EMBOLSADO.`;
    } else if (!tieneInicio) {
      puedeRegistrarEmbolsado = false;
      motivoBloqueo =
        'El lote no tiene un evento INICIO registrado. EMBOLSADO requiere INICIO previo (RN-VIV-10).';
    } else if (tieneEmbolsado) {
      puedeRegistrarEmbolsado = false;
      motivoBloqueo =
        'El lote ya tiene EMBOLSADO registrado. Solo se permite una vez por lote (RN-VIV-11).';
    }

    return {
      success: true,
      data: {
        lote_id: Number(lote.id),
        codigo_trazabilidad: lote.codigo_trazabilidad,
        nombre_cientifico_snapshot: lote.nombre_cientifico_snapshot,
        nombre_comercial_snapshot: lote.nombre_comercial_snapshot,
        tipo_material_snapshot: lote.tipo_material_snapshot,
        cantidad_inicial_en_proceso: Number(lote.cantidad_inicial_en_proceso),
        unidad_medida_inicial: lote.unidad_medida_inicial,
        fecha_inicio: lote.fecha_inicio,
        estado_lote: lote.estado_lote,
        plantas_vivas_iniciales:
          lote.plantas_vivas_iniciales !== null &&
          lote.plantas_vivas_iniciales !== undefined
            ? Number(lote.plantas_vivas_iniciales)
            : null,
        saldo_vivo_actual:
          lote.saldo_vivo_actual !== null &&
          lote.saldo_vivo_actual !== undefined
            ? Number(lote.saldo_vivo_actual)
            : null,
        puede_registrar_embolsado: puedeRegistrarEmbolsado,
        motivo_bloqueo: motivoBloqueo,
        ...(tieneEmbolsado && { evento_embolsado_existente: eventoEmbolsado }),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // POST :id/embolsado/evidencias-pendientes
  // Sube fotos al storage antes de confirmar el embolsado.
  // Reutiliza ViveroEvidenciasService y asocia el codigo_trazabilidad del lote.
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
        'Error al verificar lote para evidencias de embolsado:',
        loteError,
      );
      throw new InternalServerErrorException('Error al verificar el lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    if (lote.estado_lote !== 'ACTIVO') {
      throw new BadRequestException(
        `El lote ${loteId} esta en estado ${lote.estado_lote}. No se pueden subir evidencias para embolsado.`,
      );
    }

    // Delegar subida y creacion al servicio de evidencias existente
    const resultado = await this.evidenciasService.crearPendienteParaEvento(
      dto,
      authId,
      files,
    );

    const evidenciaIds: number[] = resultado.evidencia_ids;

    // Vincular visualmente el codigo_trazabilidad del lote a las evidencias pendientes.
    // La vinculacion definitiva (entidad_id, tipo_entidad_id) ocurre en la RPC de embolsado.
    if (evidenciaIds.length > 0) {
      const { error: updateError } = await supabase
        .from('evidencias_trazabilidad')
        .update({ codigo_trazabilidad: lote.codigo_trazabilidad })
        .in('id', evidenciaIds);

      if (updateError) {
        this.logger.warn(
          'No se pudo actualizar codigo_trazabilidad en evidencias pendientes de embolsado:',
          updateError,
        );
        // No bloqueamos: la RPC hace la vinculacion definitiva
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
  // POST :id/embolsado
  // Registra el embolsado llamando la RPC fn_vivero_registrar_embolsado.
  // El responsable_id sale del usuario autenticado, nunca del body.
  // ---------------------------------------------------------------------------
  async registrar(loteId: number, dto: RegistrarEmbolsadoDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .rpc('fn_vivero_registrar_embolsado', {
        p_lote_id: loteId,
        p_fecha_evento: dto.fecha_evento,
        p_responsable_id: usuario.id,
        p_plantas_vivas_iniciales: dto.plantas_vivas_iniciales,
        p_observaciones: dto.observaciones ?? null,
        p_evidencia_ids: dto.evidencia_ids,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar embolsado:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar el embolsado.',
      );
    }

    const row = data as RpcEmbolsadoResult;

    return {
      success: true,
      data: {
        message: 'Embolsado registrado correctamente.',
        evento_embolsado_id: Number(row.evento_embolsado_id),
        lote_vivero_id: Number(row.lote_vivero_id),
        codigo_trazabilidad: row.codigo_trazabilidad,
        plantas_vivas_iniciales: Number(row.plantas_vivas_iniciales),
        saldo_vivo_antes:
          row.saldo_vivo_antes !== null ? Number(row.saldo_vivo_antes) : null,
        saldo_vivo_despues: Number(row.saldo_vivo_despues),
        evidencia_ids_vinculadas: (row.evidencia_ids_vinculadas ?? []).map(
          Number,
        ),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // GET :id/embolsado
  // Consulta el resultado del embolsado ya registrado.
  // ---------------------------------------------------------------------------
  async obtenerResultado(loteId: number) {
    const supabase = this.supabaseService.getClient();

    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select(
        'id, codigo_trazabilidad, plantas_vivas_iniciales, saldo_vivo_actual',
      )
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al obtener resultado de embolsado:', loteError);
      throw new InternalServerErrorException('Error al obtener datos del lote');
    }

    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const { data: evento, error: eventoError } = await supabase
      .from('evento_lote_vivero')
      .select(
        `
        id,
        tipo_evento,
        fecha_evento,
        cantidad_afectada,
        unidad_medida_evento,
        saldo_vivo_antes,
        saldo_vivo_despues,
        observaciones,
        responsable_id,
        created_at
      `,
      )
      .eq('lote_id', loteId)
      .eq('tipo_evento', 'EMBOLSADO')
      .maybeSingle();

    if (eventoError) {
      this.logger.error('Error al obtener evento EMBOLSADO:', eventoError);
      throw new InternalServerErrorException(
        'Error al obtener el evento de embolsado',
      );
    }

    if (!evento) {
      return {
        success: true,
        data: { registrado: false, evento: null },
      };
    }

    const eventoTyped = evento as EventoEmbolsadoRow;
    const eventoId = Number(eventoTyped.id);
    const evidencias = await this.obtenerEvidenciasDelEvento(
      supabase,
      eventoId,
    );

    return {
      success: true,
      data: {
        registrado: true,
        evento: {
          id: eventoId,
          tipo_evento: eventoTyped.tipo_evento,
          fecha_evento: eventoTyped.fecha_evento,
          cantidad_afectada: Number(eventoTyped.cantidad_afectada),
          unidad_medida_evento: eventoTyped.unidad_medida_evento,
          saldo_vivo_antes:
            eventoTyped.saldo_vivo_antes !== null
              ? Number(eventoTyped.saldo_vivo_antes)
              : null,
          saldo_vivo_despues: Number(eventoTyped.saldo_vivo_despues),
          observaciones: eventoTyped.observaciones ?? null,
          responsable_id: Number(eventoTyped.responsable_id),
          created_at: eventoTyped.created_at,
        },
        lote: {
          id: Number(lote.id),
          codigo_trazabilidad: lote.codigo_trazabilidad,
          plantas_vivas_iniciales:
            lote.plantas_vivas_iniciales !== null
              ? Number(lote.plantas_vivas_iniciales)
              : null,
          saldo_vivo_actual:
            lote.saldo_vivo_actual !== null
              ? Number(lote.saldo_vivo_actual)
              : null,
        },
        evidencias,
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
        'Error al obtener evidencias del evento EMBOLSADO:',
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
