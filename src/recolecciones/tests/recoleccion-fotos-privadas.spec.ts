import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionBlockchainService } from '../application/recoleccion-blockchain.service';
import { RecoleccionCodigosService } from '../application/recoleccion-codigos.service';
import { RecoleccionCompletitudService } from '../application/recoleccion-completitud.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionCreationService } from '../application/recoleccion-creation.service';
import { RecoleccionDraftService } from '../application/recoleccion-draft.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';
import { RecoleccionHistorialService } from '../application/recoleccion-historial.service';
import { RecoleccionSnapshotsService } from '../application/recoleccion-snapshots.service';
import { RecoleccionUbicacionService } from '../application/recoleccion-ubicacion.service';
import { RecoleccionValidacionService } from '../application/recoleccion-validacion.service';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';

function query(data: unknown, count = 2) {
  const result = { data, count, error: null as unknown, status: 200 };
  return {
    result,
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    single: jest.fn(async () => result),
    maybeSingle: jest.fn(async () => result),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
}

// Flujos reales de aplicación; DB, Storage e integraciones sustituidos, sin .env.
describe('Recolección con fotos y superficie privada 080/083', () => {
  const fotos = ['lugar.jpg', 'total.jpg'].map((originalname) => ({
    originalname,
    mimetype: 'image/jpeg',
    buffer: Buffer.from('foto sintética'),
  }));
  let creation: RecoleccionCreationService;
  let draft: RecoleccionDraftService;
  let validacion: RecoleccionValidacionService;
  let recoleccion: ReturnType<typeof query>;
  let ubicacion: ReturnType<typeof query>;
  let evidencias: ReturnType<typeof query>;
  let usuario: { id: number; rol: string; activo: boolean };
  let registro: Record<string, unknown>;
  let publicFrom: jest.Mock;
  let upload: jest.Mock;
  let remove: jest.Mock;
  let findOne: jest.Mock;
  let historial: jest.Mock;
  let rpc: jest.Mock;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    usuario = { id: 7, rol: 'GENERAL', activo: true };
    registro = {
      id: 99,
      usuario_id: 7,
      ubicacion_id: 8,
      codigo_trazabilidad: 'REC-2026-00099',
      estado_registro: 'BORRADOR',
      fecha: FechaRecoleccionPolicy.getCurrentBusinessDate(),
      planta_id: 1,
      metodo_id: 2,
      vivero_id: 3,
      tipo_material: 'SEMILLA',
      cantidad_inicial_canonica: 100,
      unidad_canonica: 'G',
      observaciones: 'Original',
    };
    recoleccion = query({ id: 99 });
    ubicacion = query({ id: 8, latitud: -17, longitud: -66 });
    evidencias = query([{ id: 501 }, { id: 502 }]);
    publicFrom = jest.fn((table: string) => {
      if (table === 'recoleccion') return recoleccion;
      if (table === 'ubicacion') return ubicacion;
      if (table === 'tipos_entidad_evidencia')
        return query({ id: 42, activo: true });
      if (['planta', 'metodo_recoleccion', 'vivero'].includes(table))
        return query({ id: 1 });
      const denied = query(null);
      denied.result.error = {
        code: '42501',
        message: `permission denied for table ${table}`,
      };
      return denied;
    });
    upload = jest.fn(async () => ({
      data: { id: 'storage-fixture' },
      error: null,
    }));
    remove = jest.fn(async () => ({ data: [], error: null }));
    findOne = jest.fn(async () => ({
      ...registro,
      fotos: [{ id: 501 }, { id: 502 }],
    }));
    historial = jest.fn(async () => undefined);
    rpc = jest.fn(async (name: string) => ({
      data:
        name === 'm2_ambitos'
          ? { global: false, viveros: ['1', '2', '3'] }
          : name === 'm1_acceso_efectivo'
            ? true
            : name === 'fn_recoleccion_compensar_creacion'
              ? { compensado: false }
              : { id: 99, evidencia_ids: [501, 502], revision_captura: '1' },
      error: null,
    }));
    const module = await Test.createTestingModule({
      providers: [
        RecoleccionCreationService,
        RecoleccionDraftService,
        RecoleccionValidacionService,
        RecoleccionEvidenciasService,
        RecoleccionCompletitudService,
        RecoleccionAuthService,
        EvidenceFileService,
        {
          provide: SupabaseService,
          useValue: {
            getClient: () => ({
              from: publicFrom,
              storage: {
                from: () => {
                  throw new Error('Storage público denegado');
                },
              },
            }),
            getAdminClient: () => ({
              from: (table: string) => {
                if (table === 'usuario') return query(usuario);
                if (table === 'tipos_entidad_evidencia')
                  return query({ id: 42, activo: true });
                if (table === 'evidencias_trazabilidad') return evidencias;
                if (table === 'ubicacion') return ubicacion;
                if (table === 'recoleccion') return recoleccion;
                if (['planta', 'metodo_recoleccion', 'vivero'].includes(table))
                  return query({ id: 1 });
                throw new Error(`Tabla privada inesperada: ${table}`);
              },
              rpc,
              storage: { from: () => ({ upload, remove }) },
            }),
          },
        },
        {
          provide: RecoleccionConsultasService,
          useValue: { getRawRecoleccion: async () => registro, findOne },
        },
        {
          provide: RecoleccionCodigosService,
          useValue: {
            generateCodigoTrazabilidad: async () => 'REC-2026-00099',
            isCodigoTrazabilidadDuplicateError: () => false,
          },
        },
        {
          provide: RecoleccionHistorialService,
          useValue: { registrarEvento: historial },
        },
        {
          provide: RecoleccionSnapshotsService,
          useValue: { resolve: async () => ({}) },
        },
        {
          provide: RecoleccionUbicacionService,
          useValue: {
            validateAndNormalizeUbicacionPayload: async (value: unknown) =>
              value,
          },
        },
        {
          provide: RecoleccionBlockchainService,
          useValue: { anchorValidatedRecoleccion: jest.fn() },
        },
      ],
    }).compile();
    creation = module.get(RecoleccionCreationService);
    draft = module.get(RecoleccionDraftService);
    validacion = module.get(RecoleccionValidacionService);
  });

  afterEach(() => {
    expect(publicFrom).not.toHaveBeenCalledWith('evidencias_trazabilidad');
    jest.restoreAllMocks();
  });

  function crear() {
    return creation.create(
      {
        fecha: String(registro.fecha),
        cantidad_inicial_canonica: 100,
        unidad_canonica: 'G',
        tipo_material: 'SEMILLA',
        planta_id: 1,
        metodo_id: 2,
        vivero_id: 3,
        ubicacion: { latitud: -17, longitud: -66 },
      },
      'actor-verificado',
      undefined,
      fotos,
    );
  }

  it('crea ficha, fotos e historial por una sola RPC privada', async () => {
    await expect(crear()).resolves.toMatchObject({
      id: 99,
      fotos: [{ id: 501 }, { id: 502 }],
    });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith(
      'm1_recoleccion_guardar',
      expect.objectContaining({
        p_actor_id: 7,
        p_accion: 'CREAR',
        p_fotos: expect.arrayContaining([
          expect.objectContaining({ mime_type: 'image/jpeg' }),
        ]),
      }),
    );
    expect(evidencias.insert).not.toHaveBeenCalled();
    expect(recoleccion.insert).not.toHaveBeenCalled();
    expect(historial).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('conserva los recursos confirmados si falla la lectura posterior', async () => {
    findOne.mockRejectedValueOnce(new Error('Lectura fallida'));
    await expect(crear()).rejects.toThrow('Lectura fallida');
    expect(rpc).toHaveBeenCalledWith('fn_recoleccion_compensar_creacion', {
      p_recoleccion_id: 99,
      p_actor_id: 7,
    });
    expect(remove).not.toHaveBeenCalled();
    expect(ubicacion.delete).not.toHaveBeenCalled();
  });
  it('edita campos y fotos juntos en la RPC, sin compensar cambios ya confirmados', async () => {
    await draft.updateDraft(
      99,
      { observaciones: 'Nueva' },
      'actor-verificado',
      'GENERAL',
      fotos,
    );
    expect(rpc).toHaveBeenCalledWith(
      'm1_recoleccion_guardar',
      expect.objectContaining({
        p_accion: 'EDITAR',
        p_payload: { observaciones: 'Nueva' },
        p_fotos: expect.any(Array),
      }),
    );
    expect(recoleccion.update).not.toHaveBeenCalled();
    expect(evidencias.insert).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it('limpia subidas cuando la RPC rechaza por retiro de acceso durante upload', async () => {
    rpc.mockImplementation(async (name: string) =>
      name === 'm2_ambitos'
        ? { global: false, viveros: ['1', '2', '3'] }
        : name === 'm1_acceso_efectivo'
          ? { data: true, error: null }
          : { data: null, error: { code: '42501' } },
    );
    await expect(
      draft.updateDraft(
        99,
        { observaciones: 'Nueva' },
        'actor-verificado',
        'GENERAL',
        fotos,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recoleccion.update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(
      upload.mock.calls.map(([path]) => path),
    );
  });
  it('envía a validación contando únicamente evidencias activas de la entidad', async () => {
    await validacion.submitForValidation(99, 'actor-verificado', 'GENERAL');
    expect(evidencias.select).toHaveBeenCalledWith('id', {
      count: 'exact',
      head: true,
    });
    expect(evidencias.eq.mock.calls).toEqual([
      ['tipo_entidad_id', 42],
      ['entidad_id', 99],
    ]);
    expect(evidencias.is).toHaveBeenCalledWith('eliminado_en', null);
    expect(rpc).toHaveBeenCalledWith(
      'm1_recoleccion_guardar',
      expect.objectContaining({ p_accion: 'ENVIAR' }),
    );
    expect(recoleccion.update).not.toHaveBeenCalled();
  });

  it.each([1, 0])(
    'mantiene el mínimo de fotos para submit con conteo privado %s',
    async (count) => {
      evidencias.result.count = count;
      await expect(
        validacion.submitForValidation(99, 'actor-verificado', 'GENERAL'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(recoleccion.update).not.toHaveBeenCalled();
    },
  );

  it('no envía a validación si falla el conteo privado', async () => {
    evidencias.result.error = { code: '42501' };
    await expect(
      validacion.submitForValidation(99, 'actor-verificado', 'GENERAL'),
    ).rejects.toThrow('Error al validar evidencias');
    expect(recoleccion.update).not.toHaveBeenCalled();
  });

  it('approve también comprueba el mínimo de fotos mediante completitud privada', async () => {
    usuario.rol = 'VALIDADOR';
    usuario.id = 8;
    registro.estado_registro = 'PENDIENTE_VALIDACION';
    evidencias.result.count = 1;
    await expect(
      validacion.approveValidation(99, 'actor-verificado', 'VALIDADOR'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(evidencias.select).toHaveBeenCalled();
    expect(recoleccion.update).not.toHaveBeenCalled();
  });

  it('conserva la autorización por objeto aunque se declare ADMIN en el argumento legado', async () => {
    registro.usuario_id = 8;
    await expect(
      draft.updateDraft(99, {}, 'actor-verificado', 'ADMIN', fotos),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      validacion.submitForValidation(99, 'actor-verificado', 'ADMIN'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upload).not.toHaveBeenCalled();
    expect(evidencias.select).not.toHaveBeenCalled();
    expect(recoleccion.update).not.toHaveBeenCalled();
  });
});
