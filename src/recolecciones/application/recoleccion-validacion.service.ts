import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { guardarRecoleccion } from './recoleccion-rpc';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';
import { RecoleccionAuthService } from './recoleccion-auth.service';
import { RecoleccionCompletitudService } from './recoleccion-completitud.service';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';

@Injectable()
export class RecoleccionValidacionService {
  private readonly logger = new Logger(RecoleccionValidacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
    private readonly consultasService: RecoleccionConsultasService,
    private readonly completitudService: RecoleccionCompletitudService,
  ) {}

  async submitForValidation(id: number, authId: string, userRole: string) {
    const supabase = this.supabaseService.getAdminClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    await this.authService.assertOwnerOrAdmin(
      { usuario_id: recoleccion.usuario_id as number },
      usuario.id,
      usuario.rol,
    );

    const estadoActual = String(
      recoleccion.estado_registro ?? '',
    ).toUpperCase();

    if (estadoActual !== EstadoRegistro.BORRADOR) {
      throw new BadRequestException(
        `Solo se puede enviar a validación una recolección en BORRADOR. Estado actual: ${estadoActual}`,
      );
    }

    await this.completitudService.assertRecoleccionCompletaParaValidacion(
      recoleccion,
    );

    await guardarRecoleccion(
      supabase,
      usuario.id,
      'ENVIAR',
      id,
      recoleccion.revision_captura,
      {},
    );

    this.logger.log(`✅ Recolección ${id}: BORRADOR → PENDIENTE_VALIDACION`);
    return this.consultasService.findOne(id);
  }
}
