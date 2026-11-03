import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { SupabaseService } from '../../supabase/supabase.service';
import { RejectValidationDto } from '../api/dto/reject-validation.dto';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionValidacionService } from '../application/recoleccion-validacion.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';

describe('Rechazo de validación (RPC privada 090)', () => {
  const motivo = '  Datos de campo inconsistentes  ';
  let rol: string;
  let rpc: jest.Mock;
  let findOne: jest.Mock;
  let getClient: jest.Mock;
  let service: RecoleccionValidacionService;

  beforeEach(() => {
    rol = 'VALIDADOR';
    rpc = jest.fn().mockResolvedValue({ error: null });
    findOne = jest
      .fn()
      .mockResolvedValue({ id: 9, estado_registro: 'RECHAZADO' });
    getClient = jest.fn(() => {
      throw new Error('Cliente público prohibido');
    });
    const admin = {
      rpc,
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(async () => ({ data: { id: 7, rol }, error: null })),
      })),
    };
    const supabase = {
      getAdminClient: () => admin,
      getClient,
    } as unknown as SupabaseService;
    service = new RecoleccionValidacionService(
      supabase,
      new RecoleccionAuthService(supabase),
      { findOne } as unknown as RecoleccionConsultasService,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
    );
  });

  it.each(['VALIDADOR', 'ADMIN'])(
    'usa actor resuelto en DB y conserva motivo exacto (%s)',
    async (role) => {
      rol = role;
      await expect(
        service.rejectValidation(9, 'identidad-verificada', 'GENERAL', {
          motivo_rechazo: motivo,
        }),
      ).resolves.toEqual({ id: 9, estado_registro: 'RECHAZADO' });
      expect(rpc).toHaveBeenCalledWith('fn_recoleccion_rechazar_validacion', {
        p_recoleccion_id: 9,
        p_actor_id: 7,
        p_motivo_rechazo: motivo,
      });
      expect(getClient).not.toHaveBeenCalled();
      expect(findOne).toHaveBeenCalledWith(9);
    },
  );

  it('un rol recibido no convierte a GENERAL en revisor', async () => {
    rol = 'GENERAL';
    await expect(
      service.rejectValidation(9, 'identidad-verificada', 'ADMIN', {
        motivo_rechazo: motivo,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', ForbiddenException],
    ['P0002', NotFoundException],
    ['P0001', BadRequestException],
    ['22023', BadRequestException],
    ['55P03', ConflictException],
    ['57014', ConflictException],
    ['40001', ConflictException],
    ['XX000', InternalServerErrorException],
  ])(
    'propaga fallo %s sin compensación ni lectura de éxito',
    async (code, exception) => {
      rpc.mockResolvedValue({ error: { code } });
      await expect(
        service.rejectValidation(9, 'identidad-verificada', 'VALIDADOR', {
          motivo_rechazo: motivo,
        }),
      ).rejects.toBeInstanceOf(exception);
      expect(findOne).not.toHaveBeenCalled();
      expect(getClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    [9, false],
    [10, true],
    [500, true],
    [501, false],
  ])(
    'mantiene contrato HTTP de motivo con %i caracteres',
    async (length, valid) => {
      const dto = Object.assign(new RejectValidationDto(), {
        motivo_rechazo: 'a'.repeat(length as number),
      });
      expect((await validate(dto)).length === 0).toBe(valid);
    },
  );
});
