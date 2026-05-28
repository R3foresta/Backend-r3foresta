import {
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
import { ViveroSaldosService } from './vivero-saldos.service';

@Injectable()
export class ViveroAsignacionesService {
  private readonly logger = new Logger(ViveroAsignacionesService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: ViveroAuthService,
    private readonly saldosService: ViveroSaldosService,
  ) {}

  async crearAsignacion(loteId: number, dto: CrearAsignacionDto, authId: string) {
    const supabase = this.supabaseService.getClient();

    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertCanWrite(usuario.rol);

    // Verificar que el lote existe y está activo
    const { data: lote, error: loteError } = await supabase
      .from('lote_vivero')
      .select('id, estado')
      .eq('id', loteId)
      .maybeSingle();

    if (loteError) {
      this.logger.error('Error al leer lote_vivero:', loteError);
      throw new InternalServerErrorException('Error al verificar el lote');
    }
    if (!lote) {
      throw new NotFoundException(`Lote de vivero ${loteId} no encontrado`);
    }
    if (lote.estado !== 'ACTIVO') {
      throw new UnprocessableEntityException(
        `Solo se puede asignar desde un lote ACTIVO (estado actual: ${lote.estado})`,
      );
    }

    // Verificar que la subcampaña existe y no está eliminada
    const { data: subcampania, error: subError } = await supabase
      .from('subcampania')
      .select('id, nombre, estado')
      .eq('id', dto.subcampania_id)
      .is('deleted_at', null)
      .maybeSingle();

    if (subError) {
      this.logger.error('Error al leer subcampania:', subError);
      throw new InternalServerErrorException('Error al verificar la subcampaña');
    }
    if (!subcampania) {
      throw new NotFoundException(`Subcampaña ${dto.subcampania_id} no encontrada`);
    }
    const estadosQueAceptanAsignacion = ['BORRADOR', 'ACTIVA'];
    if (!estadosQueAceptanAsignacion.includes(subcampania.estado as string)) {
      throw new UnprocessableEntityException(
        `No se puede asignar a una subcampaña en estado ${subcampania.estado}. Solo se admite en BORRADOR o ACTIVA.`,
      );
    }

    // Validar saldo disponible
    const saldoDisponible = await this.saldosService.leerSaldoDisponible(loteId);
    this.saldosService.assertCantidadNoExcedeSaldo(
      dto.cantidad_asignada,
      saldoDisponible,
      loteId,
    );

    const proposito = dto.proposito ?? PropositoAsignacion.PLANTACION_INICIAL;

    const { data: asignacion, error: insertError } = await supabase
      .from('asignacion_vivero_subcampania')
      .insert({
        lote_vivero_id: loteId,
        subcampania_id: dto.subcampania_id,
        cantidad_asignada: dto.cantidad_asignada,
        proposito,
        usuario_asignacion_id: usuario.id,
      })
      .select()
      .single();

    if (insertError) {
      this.logger.error('Error al crear asignacion:', insertError);
      throw new InternalServerErrorException('Error al crear la asignación');
    }

    return {
      success: true,
      data: {
        ...asignacion,
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
        'id, subcampania_id, proposito, estado, cantidad_asignada, cantidad_consumida, cantidad_devuelta, cantidad_mermada, saldo_asignado_disponible, usuario_asignacion_id, fecha_asignacion, updated_at',
      )
      .eq('lote_vivero_id', loteId)
      .eq('estado', 'ACTIVA')
      .order('fecha_asignacion', { ascending: true });

    if (error) {
      this.logger.error('Error al listar asignaciones:', error);
      throw new InternalServerErrorException('Error al listar asignaciones');
    }

    const asignaciones = data ?? [];
    const subcampaniaIds = [...new Set(asignaciones.map((a) => a.subcampania_id))];
    const subcampaniaNombres: Record<number, string> = {};

    if (subcampaniaIds.length > 0) {
      const { data: subData } = await supabase
        .from('subcampania')
        .select('id, nombre')
        .in('id', subcampaniaIds);

      for (const sub of (subData ?? []) as { id: number; nombre: string }[]) {
        subcampaniaNombres[sub.id] = sub.nombre;
      }
    }

    return {
      success: true,
      data: asignaciones.map((a) => ({
        ...a,
        subcampania_nombre: subcampaniaNombres[a.subcampania_id] ?? null,
      })),
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

    const { data: asignacion, error: fetchError } = await supabase
      .from('asignacion_vivero_subcampania')
      .select('id, lote_vivero_id, estado, cantidad_asignada, cantidad_consumida')
      .eq('id', asignacionId)
      .maybeSingle();

    if (fetchError) {
      this.logger.error('Error al leer asignacion:', fetchError);
      throw new InternalServerErrorException('Error al verificar la asignación');
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
    const { data: actualizada, error: updateError } = await supabase
      .from('asignacion_vivero_subcampania')
      .update({ cantidad_devuelta: asignacion.cantidad_asignada })
      .eq('id', asignacionId)
      .select()
      .single();

    if (updateError) {
      this.logger.error('Error al cancelar asignacion:', updateError);
      throw new InternalServerErrorException('Error al cancelar la asignación');
    }

    return { success: true, data: actualizada };
  }
}
