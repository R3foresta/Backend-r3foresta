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
import { DevolverAsignacionDto } from '../api/dto/devolver-asignacion.dto';
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

type LoteAsignacionRow = {
  id: number;
  estado_lote: string;
};

type SubcampaniaAsignacionRow = {
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

  /**
   * Asignacion FISICA de stock a una subcampania (RF-VIV-11).
   * La RPC descuenta LOTE_VIVERO.saldo_vivo_actual, crea el evento M2
   * DESPACHO/ASIGNACION_SUBCAMPANIA con evidencia obligatoria y registra
   * ASIGNACION_VIVERO en la linea de tiempo de M3 — todo en una transaccion.
   */
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

    const lote = loteData as LoteAsignacionRow | null;
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

    const subcampania = subcampaniaData as SubcampaniaAsignacionRow | null;
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

    // RN-VIV-11 / RF-PLA-04: nunca aceptar BORRADOR ni CANCELADA.
    // PLANTACION_INICIAL requiere ACTIVA. REPOSICION admite ACTIVA/COMPLETADA/FINALIZADA_PARCIAL.
    if (
      subcampania.estado === 'BORRADOR' ||
      subcampania.estado === 'CANCELADA'
    ) {
      throw new ConflictException(
        `No se asignan lotes a una subcampaña en estado ${subcampania.estado}. Activar primero (BORRADOR) o crear una nueva (CANCELADA).`,
      );
    }
    if (
      dto.proposito === PropositoAsignacion.PLANTACION_INICIAL &&
      subcampania.estado !== 'ACTIVA'
    ) {
      throw new UnprocessableEntityException(
        `PLANTACION_INICIAL solo se admite con la subcampaña en ACTIVA (estado actual: ${subcampania.estado}).`,
      );
    }
    if (
      dto.proposito === PropositoAsignacion.REPOSICION &&
      !['ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL'].includes(
        subcampania.estado,
      )
    ) {
      throw new UnprocessableEntityException(
        `REPOSICION solo se admite con la subcampaña en ACTIVA, COMPLETADA o FINALIZADA_PARCIAL (estado actual: ${subcampania.estado}).`,
      );
    }

    const rpcResult = (await supabase.rpc(
      'fn_vivero_asignar_stock_subcampania',
      {
        p_lote_vivero_id: loteId,
        p_subcampania_id: dto.subcampania_id,
        p_cantidad_asignada: dto.cantidad_asignada,
        p_proposito: dto.proposito,
        p_usuario_asignacion_id: usuario.id,
        p_fecha_asignacion: dto.fecha_asignacion,
        p_evidencia_ids: dto.evidencia_ids,
        p_observaciones: dto.observaciones ?? null,
      },
    )) as unknown as SupabaseResult<
      Record<string, unknown> | Record<string, unknown>[]
    >;
    const rpcError = rpcResult.error;

    if (rpcError) {
      this.logger.error('Error al asignar stock a subcampania:', rpcError);
      if (this.esErrorNoEncontradoRpc(rpcError)) {
        throw new NotFoundException(rpcError.message);
      }
      if (this.esErrorDeValidacionRpc(rpcError)) {
        throw new UnprocessableEntityException(rpcError.message);
      }
      if (this.esErrorPorRpcAusente(rpcError)) {
        throw new InternalServerErrorException(
          'La migración de asignación física (fn_vivero_asignar_stock_subcampania) no está aplicada.',
        );
      }
      throw new BadRequestException(
        rpcError.message || 'Error al crear la asignación física',
      );
    }

    const row = this.normalizarRpcRow(rpcResult.data);

    return {
      success: true,
      data: {
        asignacion_id: Number(row.asignacion_id),
        evento_lote_vivero_id: Number(row.evento_lote_vivero_id),
        evento_plantacion_id: Number(row.evento_plantacion_id),
        lote_vivero_id: Number(row.lote_vivero_id),
        codigo_trazabilidad_lote: (row.codigo_trazabilidad_lote ?? null) as
          | string
          | null,
        subcampania_id: Number(row.subcampania_id),
        subcampania_nombre: subcampania.nombre,
        campania_id:
          row.campania_id !== null && row.campania_id !== undefined
            ? Number(row.campania_id)
            : null,
        proposito: row.proposito as string,
        estado: (row.estado_asignacion ?? 'ACTIVA') as string,
        cantidad_asignada: Number(row.cantidad_asignada),
        saldo_vivo_antes: Number(row.saldo_vivo_antes),
        saldo_vivo_despues: Number(row.saldo_vivo_despues),
        evidencia_ids_vinculadas: (
          (row.evidencia_ids_vinculadas ?? []) as number[]
        ).map(Number),
        lote_finalizado: Boolean(row.lote_finalizado),
        motivo_cierre: (row.motivo_cierre ?? null) as string | null,
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

  /**
   * Devolucion FISICA (parcial o total) de una asignacion al vivero (RF-VIV-12).
   * La RPC aumenta cantidad_devuelta y LOTE_VIVERO.saldo_vivo_actual, registra
   * DEVOLUCION_PLANTACION (M2) y DEVOLUCION_A_VIVERO (M3), y reabre el lote si
   * estaba FINALIZADO — todo en una transaccion. Sin evidencia en MVP.
   */
  async devolverAsignacion(
    loteId: number,
    asignacionId: number,
    dto: DevolverAsignacionDto,
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
    if (asignacion.estado === 'DEVUELTA') {
      throw new ConflictException(
        'La asignación ya está DEVUELTA y no admite más devoluciones',
      );
    }

    const rpcResult = (await supabase.rpc('fn_m3_devolver_asignacion_vivero', {
      p_asignacion_id: asignacionId,
      p_cantidad_devuelta: dto.cantidad_devuelta,
      p_motivo_devolucion: dto.motivo_devolucion,
      p_usuario_devolucion_id: usuario.id,
      p_fecha_devolucion: dto.fecha_devolucion,
      p_observaciones: dto.observaciones ?? null,
    })) as unknown as SupabaseResult<
      Record<string, unknown> | Record<string, unknown>[]
    >;

    if (rpcResult.error) {
      const rpcError = rpcResult.error;
      this.logger.error('Error al devolver asignacion:', rpcError);
      if (this.esErrorNoEncontradoRpc(rpcError)) {
        throw new NotFoundException(rpcError.message);
      }
      if (
        rpcError.message?.includes('ya esta DEVUELTA') === true ||
        rpcError.message?.includes('excede el saldo asignado') === true
      ) {
        throw new ConflictException(rpcError.message);
      }
      if (this.esErrorDeValidacionRpc(rpcError)) {
        throw new UnprocessableEntityException(rpcError.message);
      }
      if (
        rpcError.code === 'PGRST202' ||
        rpcError.code === '42883' ||
        rpcError.message?.includes('fn_m3_devolver_asignacion_vivero') === true
      ) {
        throw new InternalServerErrorException(
          'La migración de devolución física (fn_m3_devolver_asignacion_vivero) no está aplicada.',
        );
      }
      throw new BadRequestException(
        rpcError.message || 'Error al registrar la devolución física',
      );
    }

    const row = this.normalizarRpcRow(rpcResult.data);

    return {
      success: true,
      data: {
        asignacion_id: Number(row.asignacion_id),
        estado: (row.estado_asignacion ?? null) as string | null,
        cantidad_devuelta: Number(row.cantidad_devuelta_delta),
        cantidad_devuelta_total: Number(row.cantidad_devuelta_total),
        saldo_asignado_disponible: Number(row.saldo_asignado_disponible),
        lote_vivero_id: Number(row.lote_vivero_id),
        saldo_vivo_antes: Number(row.saldo_vivo_antes),
        saldo_vivo_despues: Number(row.saldo_vivo_despues),
        lote_reabierto: Boolean(row.lote_reabierto),
        evento_lote_vivero_id: Number(row.evento_lote_vivero_id),
        evento_plantacion_id: Number(row.evento_plantacion_id),
      },
    };
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
      error.message?.includes('No se puede asignar') === true ||
      error.message?.includes('excede el saldo') === true ||
      error.message?.includes('requiere al menos una evidencia') === true ||
      error.message?.includes('Solo ADMIN') === true ||
      error.message?.includes('EMBOLSADO') === true
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
      error.message?.includes('fn_vivero_asignar_stock_subcampania') === true
    );
  }

  private unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }
}
