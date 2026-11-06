import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccesoRecoleccionPolicy } from '../domain/policies/acceso-recoleccion.policy';
import { SupabaseService } from '../../supabase/supabase.service';
import { guardarRecoleccion } from './recoleccion-rpc';
import { RejectValidationDto } from '../api/dto/reject-validation.dto';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';
import { RecoleccionAuthService } from './recoleccion-auth.service';
import { RecoleccionBlockchainService } from './recoleccion-blockchain.service';
import { RecoleccionCompletitudService } from './recoleccion-completitud.service';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';
import { RecoleccionSnapshotsService } from './recoleccion-snapshots.service';

@Injectable()
export class RecoleccionValidacionService {
  private readonly logger = new Logger(RecoleccionValidacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
    private readonly consultasService: RecoleccionConsultasService,
    private readonly completitudService: RecoleccionCompletitudService,
    private readonly snapshotsService: RecoleccionSnapshotsService,
    private readonly blockchainService: RecoleccionBlockchainService,
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

  async approveValidation(id: number, authId: string, userRole: string) {
    const supabase = this.supabaseService.getAdminClient();
    const usuario = await this.authService.getUserByAuthId(authId);

    this.authService.assertReviewerRole(usuario.rol);

    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    const estadoActual = String(
      recoleccion.estado_registro ?? '',
    ).toUpperCase();

    if (estadoActual !== EstadoRegistro.PENDIENTE_VALIDACION) {
      throw new BadRequestException(
        `Solo se puede aprobar una recolección en PENDIENTE_VALIDACION. Estado actual: ${estadoActual}`,
      );
    }

    if (
      !AccesoRecoleccionPolicy.puedeConfirmar(
        usuario.id,
        recoleccion.usuario_id,
      )
    ) {
      throw new ForbiddenException(
        'El recolector no puede confirmar su propia recolección, tampoco como ADMIN.',
      );
    }

    await this.authService.assertReviewerVivero(usuario, recoleccion.vivero_id);
    await this.completitudService.assertRecoleccionCompletaParaValidacion(
      recoleccion,
    );

    const snapshotPayload = await this.snapshotsService.resolve({
      plantaId: recoleccion.planta_id,
      usuarioId: recoleccion.usuario_id,
      ubicacionId: recoleccion.ubicacion_id,
    });
    await guardarRecoleccion(
      supabase,
      usuario.id,
      'APROBAR',
      id,
      recoleccion.revision_captura,
      snapshotPayload,
    );

    this.logger.log(
      `✅ Recolección ${id}: PENDIENTE_VALIDACION → VALIDADO (por usuario ${usuario.id})`,
    );

    const codigoTrazabilidad = String(recoleccion.codigo_trazabilidad ?? '');
    await this.blockchainService.executeBlockchainFlow(id, codigoTrazabilidad);

    return this.consultasService.findOne(id);
  }

  async rejectValidation(
    id: number,
    authId: string,
    userRole: string,
    dto: RejectValidationDto,
  ) {
    const usuario = await this.authService.getUserByAuthId(authId);
    this.authService.assertReviewerRole(usuario.rol);
    // El rechazo antiguo no puede compensarse volviendo a PENDIENTE: su fecha
    // seguiría fuera de rango. Estado, motivo e historial se confirman juntos.
    const { error } = await this.supabaseService
      .getAdminClient()
      .rpc('fn_recoleccion_rechazar_validacion', {
        p_recoleccion_id: id,
        p_actor_id: usuario.id,
        p_motivo_rechazo: dto.motivo_rechazo,
      });

    if (error) {
      switch (error.code) {
        case 'P0002':
          throw new NotFoundException('Recolección no encontrada.');
        case '42501':
          throw new ForbiddenException(
            'Se requiere cuenta activa VALIDADOR o ADMIN.',
          );
        case 'P0001':
          throw new BadRequestException(
            'Solo se puede rechazar una recolección en PENDIENTE_VALIDACION.',
          );
        case '22023':
          throw new BadRequestException(
            'motivo_rechazo debe tener entre 10 y 500 caracteres.',
          );
        case '40001':
        case '55P03':
        case '57014':
          throw new ConflictException(
            'La recolección está siendo modificada. Vuelve a intentarlo.',
          );
        default:
          throw new InternalServerErrorException(
            'Error al rechazar validación',
          );
      }
    }

    this.logger.log(`✅ Recolección ${id}: PENDIENTE_VALIDACION → RECHAZADO`);
    return this.consultasService.findOne(id);
  }
}
