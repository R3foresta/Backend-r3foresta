import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RegistrarDesechoDto } from '../api/dto/registrar-desecho.dto';
import { RecoleccionAuthService } from './recoleccion-auth.service';

type RpcDesechoResult = {
  recoleccion_movimiento_id: number;
  recoleccion_id: number;
  cantidad_desechada: number;
  unidad_medida: string;
  saldo_antes: number;
  saldo_despues: number;
  estado_operativo: string;
};

@Injectable()
export class RecoleccionDesechoService {
  private readonly logger = new Logger(RecoleccionDesechoService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
  ) {}

  async registrar(
    recoleccionId: number,
    dto: RegistrarDesechoDto,
    authId: string,
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    const supabase = this.supabaseService.getClient();

    const { data: recoleccion, error: recoleccionError } = await supabase
      .from('recoleccion')
      .select('id, usuario_id')
      .eq('id', recoleccionId)
      .maybeSingle();

    if (recoleccionError) {
      this.logger.error(
        'Error al verificar propietario de recoleccion para descarte:',
        recoleccionError,
      );
      throw new InternalServerErrorException(
        'No se pudo verificar la recoleccion.',
      );
    }

    if (!recoleccion) {
      throw new NotFoundException(
        `Recoleccion con id ${recoleccionId} no encontrada`,
      );
    }

    const esAdmin = String(usuario.rol ?? '').toUpperCase() === 'ADMIN';
    if (!esAdmin && Number(recoleccion.usuario_id) !== Number(usuario.id)) {
      throw new ForbiddenException(
        'Solo el creador de la recoleccion o un ADMIN pueden registrar descartes.',
      );
    }

    const { data, error } = await supabase
      .rpc('fn_recoleccion_registrar_desecho', {
        p_recoleccion_id: recoleccionId,
        p_cantidad_desechada: dto.cantidad,
        p_usuario_id: usuario.id,
      })
      .single();

    if (error) {
      this.logger.error('Error al registrar descarte de recoleccion:', error);
      throw new BadRequestException(
        error.message || 'No se pudo registrar el descarte.',
      );
    }

    const row = data as RpcDesechoResult;
    const saldoDespues = Number(row.saldo_despues);

    return {
      success: true,
      data: {
        message:
          saldoDespues === 0
            ? 'Descarte registrado correctamente. La recoleccion quedo cerrada.'
            : 'Descarte registrado correctamente.',
        recoleccion_movimiento_id: Number(row.recoleccion_movimiento_id),
        recoleccion_id: Number(row.recoleccion_id),
        cantidad_desechada: Number(row.cantidad_desechada),
        unidad_medida: row.unidad_medida,
        saldo_antes: Number(row.saldo_antes),
        saldo_despues: saldoDespues,
        estado_operativo: row.estado_operativo,
      },
    };
  }
}
