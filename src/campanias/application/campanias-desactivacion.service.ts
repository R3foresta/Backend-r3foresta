import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { DesactivarCampaniaDto } from '../api/dto/desactivar-campania.dto';
import { CampaniasAuthService } from './campanias-auth.service';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type SubcampaniaPreviewRow = {
  id: number | string;
  estado: string;
  total_plantado_inicial: number | string | null;
};

type AsignacionPreviewRow = {
  id: number | string;
  saldo_asignado_disponible: number | string | null;
};

export type BloqueoDesactivacionCampania = {
  subcampania_id: number;
  estado: string;
  total_plantado_inicial: number;
  codigo: 'SUBCAMPANIA_CON_PLANTACIONES' | 'ESTADO_NO_ELEGIBLE';
  mensaje: string;
};

@Injectable()
export class CampaniasDesactivacionService {
  private readonly logger = new Logger(CampaniasDesactivacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: CampaniasAuthService,
  ) {}

  async preview(id: number, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);

    const supabase = this.supabaseService.getClient();
    const campaniaResult = (await supabase
      .from('campania')
      .select('id')
      .eq('id', id)
      .is('deleted_at', null)
      .single()) as unknown as SupabaseResult<{ id: number | string }>;

    if (campaniaResult.error || !campaniaResult.data) {
      throw new NotFoundException(
        `Campaña con id ${id} no encontrada o ya desactivada`,
      );
    }

    const subcampaniasResult = (await supabase
      .from('subcampania')
      .select('id, estado, total_plantado_inicial')
      .eq('campania_id', id)
      .is('deleted_at', null)
      .order('id', {
        ascending: true,
      })) as unknown as SupabaseResult<SubcampaniaPreviewRow[]>;

    if (subcampaniasResult.error) {
      this.logger.error(
        'Error al previsualizar subcampanias de campania:',
        subcampaniasResult.error,
      );
      throw new BadRequestException(
        subcampaniasResult.error.message ??
          'No se pudo previsualizar la desactivación.',
      );
    }

    const subcampanias = subcampaniasResult.data ?? [];
    const bloqueos = subcampanias.flatMap((subcampania) =>
      this.obtenerBloqueos(subcampania),
    );
    const cancelables = subcampanias.filter(
      (subcampania) =>
        ['BORRADOR', 'ACTIVA'].includes(subcampania.estado) &&
        Number(subcampania.total_plantado_inicial ?? 0) === 0,
    );

    const asignaciones = await this.obtenerAsignacionesConSaldo(
      cancelables.map((subcampania) => Number(subcampania.id)),
    );

    return {
      success: true,
      data: {
        campania_id: id,
        elegible: bloqueos.length === 0,
        subcampanias_vivas: subcampanias.length,
        subcampanias_a_cancelar: cancelables.length,
        borradores: cancelables.filter(
          (subcampania) => subcampania.estado === 'BORRADOR',
        ).length,
        activas_sin_plantar: cancelables.filter(
          (subcampania) => subcampania.estado === 'ACTIVA',
        ).length,
        ya_canceladas: subcampanias.filter(
          (subcampania) => subcampania.estado === 'CANCELADA',
        ).length,
        asignaciones_con_saldo: asignaciones.length,
        unidades_a_devolver: asignaciones.reduce(
          (total, asignacion) =>
            total + Number(asignacion.saldo_asignado_disponible ?? 0),
          0,
        ),
        bloqueos,
      },
    };
  }

  async desactivar(id: number, dto: DesactivarCampaniaDto, authId: string) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertAdmin(usuario.rol);
    const motivo = this.normalizarMotivo(dto.motivo);

    const rpc = (await this.supabaseService
      .getAdminClient()
      .rpc('fn_campania_desactivar_sin_plantaciones', {
        p_campania_id: id,
        p_actor_user_id: usuario.id,
        p_motivo: motivo,
      })) as unknown as SupabaseResult<
      Record<string, unknown> | Record<string, unknown>[]
    >;

    if (rpc.error) {
      this.mapearErrorRpc(rpc.error);
    }

    const row = this.normalizarRpcRow(rpc.data);

    return {
      success: true,
      data: {
        message: 'Campaña desactivada correctamente.',
        campania_id: Number(row.campania_id ?? id),
        deleted_at: row.deleted_at ?? null,
        subcampanias_canceladas: Number(row.subcampanias_canceladas ?? 0),
        asignaciones_devueltas: Number(row.asignaciones_devueltas ?? 0),
        unidades_devueltas: Number(row.unidades_devueltas ?? 0),
      },
    };
  }

  private async obtenerAsignacionesConSaldo(
    subcampaniaIds: number[],
  ): Promise<AsignacionPreviewRow[]> {
    if (subcampaniaIds.length === 0) return [];

    const result = (await this.supabaseService
      .getClient()
      .from('asignacion_vivero_subcampania')
      .select('id, saldo_asignado_disponible')
      .in('subcampania_id', subcampaniaIds)
      .eq('estado', 'ACTIVA')
      .gt('saldo_asignado_disponible', 0)
      .order('id', {
        ascending: true,
      })) as unknown as SupabaseResult<AsignacionPreviewRow[]>;

    if (result.error) {
      this.logger.error(
        'Error al previsualizar asignaciones de campania:',
        result.error,
      );
      throw new BadRequestException(
        result.error.message ?? 'No se pudo previsualizar las asignaciones.',
      );
    }

    return result.data ?? [];
  }

  private obtenerBloqueos(
    subcampania: SubcampaniaPreviewRow,
  ): BloqueoDesactivacionCampania[] {
    const totalPlantado = Number(subcampania.total_plantado_inicial ?? 0);
    const base = {
      subcampania_id: Number(subcampania.id),
      estado: subcampania.estado,
      total_plantado_inicial: totalPlantado,
    };
    const bloqueos: BloqueoDesactivacionCampania[] = [];

    if (totalPlantado > 0) {
      bloqueos.push({
        ...base,
        codigo: 'SUBCAMPANIA_CON_PLANTACIONES',
        mensaje:
          'La subcampaña tiene plantaciones iniciales y no puede cancelarse.',
      });
    }

    if (!['BORRADOR', 'ACTIVA', 'CANCELADA'].includes(subcampania.estado)) {
      bloqueos.push({
        ...base,
        codigo: 'ESTADO_NO_ELEGIBLE',
        mensaje: `El estado ${subcampania.estado} no permite cancelación masiva.`,
      });
    }

    return bloqueos;
  }

  private normalizarMotivo(motivoRecibido: string): string {
    const motivo = motivoRecibido?.trim();
    if (!motivo || motivo.length < 3 || motivo.length > 1000) {
      throw new BadRequestException(
        'motivo debe tener entre 3 y 1000 caracteres.',
      );
    }
    return motivo;
  }

  private normalizarRpcRow(data: unknown): Record<string, unknown> {
    if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
    return (data ?? {}) as Record<string, unknown>;
  }

  private mapearErrorRpc(error: SupabaseErrorLike): never {
    this.logger.error('Error al desactivar campania masivamente:', error);
    const message =
      error.message ?? 'No se pudo desactivar la campaña de forma atómica.';

    if (this.esRpcAusente(error)) {
      throw new InternalServerErrorException(
        'La migración fn_campania_desactivar_sin_plantaciones no está aplicada.',
      );
    }
    if (error.code === '42501') {
      throw new InternalServerErrorException(
        'La desactivación atómica requiere SUPABASE_SERVICE_ROLE_KEY.',
      );
    }
    if (
      error.code === 'P0002' ||
      message.includes('no encontrada') ||
      message.includes('ya desactivada')
    ) {
      throw new NotFoundException(message);
    }
    if (error.code === 'P0003') {
      throw new UnprocessableEntityException(message);
    }
    if (message.includes('motivo')) {
      throw new BadRequestException(message);
    }
    throw new ConflictException(message);
  }

  private esRpcAusente(error: SupabaseErrorLike): boolean {
    return (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('fn_campania_desactivar_sin_plantaciones') ===
        true
    );
  }
}
