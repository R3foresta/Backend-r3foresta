import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { RejectValidationDto } from '../api/dto/reject-validation.dto';
import { EstadoRegistro } from '../domain/enums/estado-registro.enum';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';
import { RecoleccionAuthService } from './recoleccion-auth.service';
import { RecoleccionBlockchainService } from './recoleccion-blockchain.service';
import { RecoleccionCompletitudService } from './recoleccion-completitud.service';
import { RecoleccionConsultasService } from './recoleccion-consultas.service';
import {
  RecoleccionHistorialService,
  TipoHistorialRecoleccion,
} from './recoleccion-historial.service';
import { RecoleccionSnapshotsService } from './recoleccion-snapshots.service';

@Injectable()
export class RecoleccionValidacionService {
  private readonly logger = new Logger(RecoleccionValidacionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly authService: RecoleccionAuthService,
    private readonly consultasService: RecoleccionConsultasService,
    private readonly completitudService: RecoleccionCompletitudService,
    private readonly historialService: RecoleccionHistorialService,
    private readonly snapshotsService: RecoleccionSnapshotsService,
    private readonly blockchainService: RecoleccionBlockchainService,
  ) {}

  async submitForValidation(id: number, authId: string, userRole: string) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.authService.getUserByAuthId(authId);
    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (estadoActual !== EstadoRegistro.BORRADOR) {
      throw new BadRequestException(
        `Solo se puede enviar a validación una recolección en BORRADOR. Estado actual: ${estadoActual}`,
      );
    }

    this.authService.assertOwnerOrAdmin(
      { usuario_id: recoleccion.usuario_id as number },
      usuario.id,
      usuario.rol,
    );
    await this.completitudService.assertRecoleccionCompletaParaValidacion(
      recoleccion,
    );

    const { error: updateError } = await supabase
      .from('recoleccion')
      .update({ estado_registro: EstadoRegistro.PENDIENTE_VALIDACION })
      .eq('id', id);

    if (updateError) {
      this.logger.error('❌ Error al enviar a validación:', updateError);
      throw new InternalServerErrorException('Error al enviar a validación');
    }

    try {
      await this.historialService.registrarEvento({
        recoleccionId: id,
        tipoHistorial: TipoHistorialRecoleccion.SOLICITUD_VALIDACION,
        estadoOrigen: EstadoRegistro.BORRADOR,
        estadoDestino: EstadoRegistro.PENDIENTE_VALIDACION,
        actorUserId: usuario.id,
        metadata: {
          codigo_trazabilidad: recoleccion.codigo_trazabilidad ?? null,
        },
      });
    } catch (error) {
      await this.rollbackRecoleccionUpdate(
        id,
        { estado_registro: EstadoRegistro.BORRADOR },
        'historial de solicitud de validación',
      );
      throw error;
    }

    this.logger.log(`✅ Recolección ${id}: BORRADOR → PENDIENTE_VALIDACION`);
    return this.consultasService.findOne(id);
  }

  async approveValidation(id: number, authId: string, userRole: string) {
    const supabase = this.supabaseService.getClient();
    const usuario = await this.authService.getUserByAuthId(authId);

    this.authService.assertReviewerRole(usuario.rol);

    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (estadoActual !== EstadoRegistro.PENDIENTE_VALIDACION) {
      throw new BadRequestException(
        `Solo se puede aprobar una recolección en PENDIENTE_VALIDACION. Estado actual: ${estadoActual}`,
      );
    }

    await this.completitudService.assertRecoleccionCompletaParaValidacion(
      recoleccion,
    );

    const snapshotPayload = await this.snapshotsService.resolve({
      plantaId: recoleccion.planta_id,
      usuarioId: recoleccion.usuario_id,
      ubicacionId: recoleccion.ubicacion_id,
    });
    const fechaValidacion = FechaRecoleccionPolicy.getCurrentBusinessDate();

    const { error: updateError } = await supabase
      .from('recoleccion')
      .update({
        estado_registro: EstadoRegistro.VALIDADO,
        usuario_validacion_id: usuario.id,
        fecha_validacion: fechaValidacion,
        ...snapshotPayload,
      })
      .eq('id', id);

    if (updateError) {
      this.logger.error('❌ Error al aprobar validación:', updateError);
      throw new InternalServerErrorException('Error al aprobar validación');
    }

    try {
      await this.historialService.registrarEvento({
        recoleccionId: id,
        tipoHistorial: TipoHistorialRecoleccion.VALIDACION_APROBADA,
        estadoOrigen: EstadoRegistro.PENDIENTE_VALIDACION,
        estadoDestino: EstadoRegistro.VALIDADO,
        actorUserId: usuario.id,
        metadata: {
          codigo_trazabilidad: recoleccion.codigo_trazabilidad ?? null,
          fecha_validacion: fechaValidacion,
        },
      });
    } catch (error) {
      await this.rollbackRecoleccionUpdate(
        id,
        {
          estado_registro: recoleccion.estado_registro ?? null,
          usuario_validacion_id: recoleccion.usuario_validacion_id ?? null,
          fecha_validacion: recoleccion.fecha_validacion ?? null,
        },
        'historial de validación aprobada',
      );
      throw error;
    }

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
    const supabase = this.supabaseService.getClient();
    const usuario = await this.authService.getUserByAuthId(authId);

    this.authService.assertReviewerRole(usuario.rol);

    const recoleccion = await this.consultasService.getRawRecoleccion(id);
    const estadoActual = String(recoleccion.estado_registro ?? '').toUpperCase();

    if (estadoActual !== EstadoRegistro.PENDIENTE_VALIDACION) {
      throw new BadRequestException(
        `Solo se puede rechazar una recolección en PENDIENTE_VALIDACION. Estado actual: ${estadoActual}`,
      );
    }

    const { error: updateError } = await supabase
      .from('recoleccion')
      .update({
        estado_registro: EstadoRegistro.RECHAZADO,
        usuario_validacion_id: null,
        fecha_validacion: null,
        motivo_rechazo: dto.motivo_rechazo,
      })
      .eq('id', id);

    if (updateError) {
      this.logger.error('❌ Error al rechazar validación:', updateError);
      throw new InternalServerErrorException('Error al rechazar validación');
    }

    try {
      await this.historialService.registrarEvento({
        recoleccionId: id,
        tipoHistorial: TipoHistorialRecoleccion.VALIDACION_RECHAZADA,
        estadoOrigen: EstadoRegistro.PENDIENTE_VALIDACION,
        estadoDestino: EstadoRegistro.RECHAZADO,
        observaciones: dto.motivo_rechazo,
        actorUserId: usuario.id,
        metadata: {
          codigo_trazabilidad: recoleccion.codigo_trazabilidad ?? null,
          motivo_rechazo: dto.motivo_rechazo,
        },
      });
    } catch (error) {
      await this.rollbackRecoleccionUpdate(
        id,
        {
          estado_registro: recoleccion.estado_registro ?? null,
          usuario_validacion_id: recoleccion.usuario_validacion_id ?? null,
          fecha_validacion: recoleccion.fecha_validacion ?? null,
          motivo_rechazo: recoleccion.motivo_rechazo ?? null,
        },
        'historial de validación rechazada',
      );
      throw error;
    }

    this.logger.log(
      `✅ Recolección ${id}: PENDIENTE_VALIDACION → RECHAZADO. Motivo: ${dto.motivo_rechazo}`,
    );
    return this.consultasService.findOne(id);
  }

  private async rollbackRecoleccionUpdate(
    id: number,
    rollbackPayload: Record<string, unknown>,
    context: string,
  ): Promise<void> {
    if (Object.keys(rollbackPayload).length === 0) {
      return;
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('recoleccion')
      .update(rollbackPayload)
      .eq('id', id);

    if (error) {
      this.logger.error(
        `⚠️ No se pudo revertir recolección ${id} después de error en ${context}:`,
        error,
      );
    }
  }
}
