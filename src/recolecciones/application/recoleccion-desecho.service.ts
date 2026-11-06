import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
    const supabase = this.supabaseService.getAdminClient();

    const { data, error } = await supabase
      .rpc('fn_recoleccion_registrar_desecho', {
        p_recoleccion_id: recoleccionId,
        p_cantidad_desechada: dto.cantidad,
        p_usuario_id: usuario.id,
      })
      .single();

    if (error) {
      if (error.code === '42501')
        throw new ForbiddenException(
          'DESECHO requiere ADMIN u operario activo del vivero de almacenamiento.',
        );
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
