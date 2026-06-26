import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CrearAsignacionDto } from '../api/dto/crear-asignacion.dto';
import { PropositoAsignacion } from '../domain/enums/proposito-asignacion.enum';
import { SupabaseService } from '../../supabase/supabase.service';
import { ViveroAuthService } from './vivero-auth.service';

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike | null;
};

type LoteReservaRow = {
  id: number;
  estado_lote: string;
};

type SubcampaniaReservaRow = {
  id: number;
  nombre: string;
  estado: string;
};

type UsuarioNombreRow = {
  nombre: string | null;
  apellido?: string | null;
};

type CampaniaNombreRow = {
  nombre: string | null;
};

type SubcampaniaNombreRow = {
  id: number;
  nombre: string;
  campania: CampaniaNombreRow | CampaniaNombreRow[] | null;
};

type CoordinadorAsignacionRow = {
  subcampania_id: number;
  usuario: UsuarioNombreRow | UsuarioNombreRow[] | null;
};

type AsignacionListaRow = Record<string, unknown> & {
  subcampania_id: number;
  creator: UsuarioNombreRow | UsuarioNombreRow[] | null;
};

type AsignacionCancelacionRow = {
  id: number;
  lote_vivero_id: number;
  estado: string;
  cantidad_asignada: number;
  cantidad_consumida: number;
};

@Injectable()
export class ViveroAsignacionesService {
  private readonly logger = new Logger(ViveroAsignacionesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
  ) {}

  async crearAsignacion(
    loteId: number,
    dto: CrearAsignacionDto,
    authId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const { data: loteData, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, estado_lote')
      .eq('id', loteId)
      .maybeSingle();

    const lote = loteData as LoteReservaRow | null;
    if (loteError) {
      this.logger.error('Error al leer lote_vivero:', loteError);
      throw new InternalServerErrorException('Error al verificar el lote');
    }
    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }
    if (lote.estado_lote !== 'ACTIVO') {
      throw new UnprocessableEntityException(
        `Solo se puede asignar desde un lote ACTIVO (estado actual: ${lote.estado_lote})`,
      );
    }

    // Verificar que la subcampaña existe y no está eliminada
    const { data: subcampaniaData, error: subError } = await supabase
      .from('subcampania')
      .select('id, nombre, estado')
      .eq('id', dto.subcampania_id)
      .is('deleted_at', null)
      .maybeSingle();

    const subcampania = subcampaniaData as SubcampaniaReservaRow | null;
    if (subError) {
      this.logger.error('Error al leer subcampania:', subError);
      throw new InternalServerErrorException(
        'Error al verificar la subcampaña',
      );
    }
    if (!subcampania) {
      throw new NotFoundException(
        `Subcampaña ${dto.subcampania_id} no encontrada`,
      );
    }
    const estadosQueAceptanAsignacion = ['BORRADOR', 'ACTIVA'];
    if (!estadosQueAceptanAsignacion.includes(subcampania.estado)) {
      throw new UnprocessableEntityException(
        `No se puede asignar a una subcampaña en estado ${subcampania.estado}. Solo se admite en BORRADOR o ACTIVA.`,
      );
    }

    const proposito = dto.proposito ?? PropositoAsignacion.PLANTACION_INICIAL;

    const rpcResult = (await supabase.rpc('fn_vivero_reservar_stock_lote', {
      p_lote_vivero_id: loteId,
      p_subcampania_id: dto.subcampania_id,
      p_cantidad_asignada: dto.cantidad_asignada,
      p_proposito: proposito,
      p_usuario_asignacion_id: usuario.id,
    })) as unknown as SupabaseResult<
      Record<string, unknown> | Record<string, unknown>[]
    >;
    const asignacion = rpcResult.data;
    const rpcError = rpcResult.error;

    if (rpcError) {
      this.logger.error('Error al reservar stock por lote:', rpcError);
      if (this.esErrorNoEncontradoRpc(rpcError)) {
        throw new NotFoundException(rpcError.message);
      }
      if (this.esErrorDeValidacionRpc(rpcError)) {
        throw new UnprocessableEntityException(rpcError.message);
      }
      if (this.esErrorPorRpcAusente(rpcError)) {
        throw new InternalServerErrorException(
          'La migración de reserva transaccional no está aplicada.',
        );
      }
      throw new BadRequestException(
        rpcError.message || 'Error al crear la reserva de stock',
      );
    }

    return {
      success: true,
      data: {
        ...this.normalizarRpcRow(asignacion),
        subcampania_nombre: subcampania.nombre,
      },
    };
  }

  async listarAsignaciones(loteId: number) {
    const supabase = this.supabaseService.getClient();

    // Verificar que el lote existe
    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al leer lote_vivero:', loteError);
      throw new InternalServerErrorException('Error al verificar el lote');
    }
    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }

    const { data, error } = await supabase
      .from('asignacion_vivero_subcampania')
      .select(
        'id, subcampania_id, proposito, estado, cantidad_asignada, cantidad_consumida, cantidad_devuelta, cantidad_mermada, saldo_asignado_disponible, usuario_asignacion_id, fecha_asignacion, updated_at, creator:usuario_asignacion_id(nombre, apellido)',
      )
      .eq('lote_vivero_id', loteId)
      .eq('estado', 'ACTIVA')
      .order('fecha_asignacion', { ascending: true });

    if (error) {
      this.logger.error('Error al listar asignaciones:', error);
      throw new InternalServerErrorException('Error al listar asignaciones');
    }

    const asignaciones = (data ?? []) as AsignacionListaRow[];
    const subcampaniaIds = [
      ...new Set(asignaciones.map((a) => a.subcampania_id)),
    ];
    const subcampaniaNombres: Record<
      number,
      { nombre: string; campania_nombre: string }
    > = {};

    if (subcampaniaIds.length > 0) {
      const { data: subData } = await supabase
        .from('subcampania')
        .select('id, nombre, campania:campania_id(nombre)')
        .in('id', subcampaniaIds);

      for (const sub of (subData ?? []) as SubcampaniaNombreRow[]) {
        const campania = this.unwrapRelation(sub.campania);
        subcampaniaNombres[sub.id] = {
          nombre: sub.nombre,
          campania_nombre: campania?.nombre || 'Sin campaña',
        };
      }
    }

    const coordinatorNombres: Record<number, string> = {};
    if (subcampaniaIds.length > 0) {
      const { data: coorData } = await supabase
        .from('subcampania_equipo')
        .select('subcampania_id, usuario:usuario_id(nombre, apellido)')
        .in('subcampania_id', subcampaniaIds)
        .eq('rol', 'COORDINADOR');

      for (const c of (coorData ?? []) as CoordinadorAsignacionRow[]) {
        const u = this.unwrapRelation(c.usuario);
        if (u) {
          coordinatorNombres[Number(c.subcampania_id)] =
            `${u.nombre ?? ''} ${u.apellido || ''}`.trim();
        }
      }
    }

    return {
      success: true,
      data: asignaciones.map((a) => {
        const c = this.unwrapRelation(a.creator);
        return {
          ...a,
          subcampania_nombre:
            subcampaniaNombres[a.subcampania_id]?.nombre ?? null,
          campania_nombre:
            subcampaniaNombres[a.subcampania_id]?.campania_nombre ?? null,
          coordinador_nombre: coordinatorNombres[a.subcampania_id] ?? null,
          creador_nombre: c
            ? `${c.nombre ?? ''} ${c.apellido || ''}`.trim()
            : null,
        };
      }),
    };
  }

  async cancelarAsignacion(
    loteId: number,
    asignacionId: number,
    authId: string,
  ) {
    const supabase = this.supabaseService.getClient();

    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    const { data: asignacionData, error: fetchError } = await supabase
      .from('asignacion_vivero_subcampania')
      .select(
        'id, lote_vivero_id, estado, cantidad_asignada, cantidad_consumida',
      )
      .eq('id', asignacionId)
      .maybeSingle();

    const asignacion = asignacionData as AsignacionCancelacionRow | null;
    if (fetchError) {
      this.logger.error('Error al leer asignacion:', fetchError);
      throw new InternalServerErrorException(
        'Error al verificar la asignación',
      );
    }
    if (!asignacion) {
      throw new NotFoundException(`Asignación ${asignacionId} no encontrada`);
    }
    if (asignacion.lote_vivero_id !== loteId) {
      throw new NotFoundException(
        `Asignación ${asignacionId} no pertenece al lote ${loteId}`,
      );
    }
    if (asignacion.estado !== 'ACTIVA') {
      throw new ConflictException(
        `La asignación ya está en estado ${asignacion.estado} y no puede cancelarse`,
      );
    }
    if (asignacion.cantidad_consumida > 0) {
      throw new ConflictException(
        `No se puede cancelar: la asignación ya tiene ${asignacion.cantidad_consumida} unidades consumidas en plantación`,
      );
    }

    // Devolver todo lo asignado → el trigger transiciona a DEVUELTA
    const updateResult = (await supabase
      .from('asignacion_vivero_subcampania')
      .update({ cantidad_devuelta: asignacion.cantidad_asignada })
      .eq('id', asignacionId)
      .select()
      .single()) as unknown as SupabaseResult<Record<string, unknown>>;
    const actualizada = updateResult.data;
    const updateError = updateResult.error;

    if (updateError) {
      this.logger.error('Error al cancelar asignacion:', updateError);
      throw new InternalServerErrorException('Error al cancelar la asignación');
    }

    return { success: true, data: actualizada };
  }

  private normalizarRpcRow(data: unknown): Record<string, unknown> {
    if (Array.isArray(data)) return (data[0] ?? {}) as Record<string, unknown>;
    return (data ?? {}) as Record<string, unknown>;
  }

  private esErrorDeValidacionRpc(error: {
    code?: string;
    message?: string;
  }): boolean {
    return (
      error.code === 'P0001' ||
      error.message?.includes('No se puede reservar') === true ||
      error.message?.includes('excede el saldo') === true
    );
  }

  private esErrorNoEncontradoRpc(error: {
    code?: string;
    message?: string;
  }): boolean {
    return (
      error.message?.includes('no encontrado') === true ||
      error.message?.includes('no encontrada') === true
    );
  }

  private esErrorPorRpcAusente(error: {
    code?: string;
    message?: string;
  }): boolean {
    return (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message?.includes('fn_vivero_reservar_stock_lote') === true
    );
  }

  private unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
}
