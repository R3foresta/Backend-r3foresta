import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateRecoleccionDto } from '../api/dto/create-recoleccion.dto';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionCodigosService } from '../application/recoleccion-codigos.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionCreationService } from '../application/recoleccion-creation.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';
import { RecoleccionHistorialService } from '../application/recoleccion-historial.service';
import { RecoleccionSnapshotsService } from '../application/recoleccion-snapshots.service';
import { RecoleccionUbicacionService } from '../application/recoleccion-ubicacion.service';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';

// Caso de uso real con persistencia sustituida. La atomicidad de la RPC de
// compensación y sus carreras se comprueban además en PostgreSQL aislado 089.
describe('Creación de Recolección: compensación segura ante soft delete', () => {
  let deleted: boolean;
  let rowExists: boolean;
  let evidenceExists: boolean;
  let locationExists: boolean;
  let filesExist: boolean;
  let service: RecoleccionCreationService;
  let insertParent: jest.Mock;
  let rpc: jest.Mock;
  let getClient: jest.Mock;
  let deleteLocation: jest.Mock;
  let insertEvidence: jest.Mock;
  let removeStorage: jest.Mock;
  let findOne: jest.Mock;
  let createHistory: jest.Mock;
  let snapshotResolve: jest.Mock;
  const failure = new InternalServerErrorException(
    'Fallo sintético posterior al INSERT',
  );
  const dto = (): CreateRecoleccionDto => ({
    fecha: FechaRecoleccionPolicy.getCurrentBusinessDate(),
    tipo_material: 'SEMILLA',
    unidad_canonica: 'G',
    cantidad_inicial_canonica: 100,
    planta_id: 1,
    metodo_id: 1,
    ubicacion: { latitud: -16.5, longitud: -68.1 },
  });

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    deleted = false;
    rowExists = false;
    evidenceExists = false;
    locationExists = false;
    filesExist = false;
    insertParent = jest.fn(async () => {
      rowExists = true;
      return { data: { id: 292 }, error: null };
    });
    deleteLocation = jest.fn(async () => {
      locationExists = false;
      return { error: null };
    });
    rpc = jest.fn(async () => {
      if (deleted) return { data: { compensado: false }, error: null };
      rowExists = false;
      evidenceExists = false;
      return { data: { compensado: true }, error: null };
    });
    const client = {
      rpc,
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          insert: () => query,
          single: async () => {
            if (table === 'recoleccion') return insertParent();
            if (table === 'ubicacion') locationExists = true;
            return { data: { id: table === 'ubicacion' ? 8 : 1 }, error: null };
          },
          delete: () => ({ eq: deleteLocation }),
        };
        return query;
      },
    };
    getClient = jest.fn(() => {
      throw new Error('Cliente público prohibido');
    });
    const supabase = { getAdminClient: () => client, getClient };
    insertEvidence = jest.fn(async () => {
      evidenceExists = true;
    });
    removeStorage = jest.fn(async () => {
      filesExist = false;
    });
    findOne = jest.fn(async () => {
      throw failure;
    });
    createHistory = jest.fn(async () => undefined);
    snapshotResolve = jest.fn(async () => ({}));
    service = new RecoleccionCreationService(
      supabase as unknown as SupabaseService,
      {
        getUserByAuthId: async () => ({ id: 7, rol: 'GENERAL' }),
        assertCanCreate() {},
      } as unknown as RecoleccionAuthService,
      {
        generateCodigoTrazabilidad: async () => 'REC-SINTETICA-292',
        isCodigoTrazabilidadDuplicateError: () => false,
      } as unknown as RecoleccionCodigosService,
      { findOne } as unknown as RecoleccionConsultasService,
      {
        validarFotosCreacion() {},
        assertTipoEntidadActiva: async () => undefined,
        uploadFotosCreacion: async () => {
          filesExist = true;
          return [{ ruta_archivo: 'original.jpg' }];
        },
        insertEvidenciasCreacion: insertEvidence,
        removeStoragePaths: removeStorage,
      } as unknown as RecoleccionEvidenciasService,
      {
        registrarEvento: createHistory,
      } as unknown as RecoleccionHistorialService,
      { resolve: snapshotResolve } as unknown as RecoleccionSnapshotsService,
      {
        validateAndNormalizeUbicacionPayload: async () => dto().ubicacion,
      } as unknown as RecoleccionUbicacionService,
    );
  });
  afterEach(() => {
    expect(getClient).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('compensa en RPC y solo después limpia ubicación y Storage si no existe historia', async () => {
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(rpc).toHaveBeenCalledWith('fn_recoleccion_compensar_creacion', {
      p_recoleccion_id: 292,
      p_actor_id: 7,
    });
    expect(rowExists).toBe(false);
    expect(evidenceExists).toBe(false);
    expect(locationExists).toBe(false);
    expect(filesExist).toBe(false);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      deleteLocation.mock.invocationCallOrder[0],
    );
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      removeStorage.mock.invocationCallOrder[0],
    );
  });

  it('conserva ficha, evidencia, ubicación y fotos si DELETE confirmó antes del findOne final', async () => {
    const notFound = new NotFoundException('Recolección eliminada');
    insertEvidence.mockImplementation(async () => {
      evidenceExists = true;
      deleted = true;
    });
    findOne.mockRejectedValue(notFound);
    await expect(service.create(dto(), 'fixture')).rejects.toBe(notFound);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rowExists).toBe(true);
    expect(evidenceExists).toBe(true);
    expect(locationExists).toBe(true);
    expect(filesExist).toBe(true);
    expect(deleteLocation).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(createHistory).not.toHaveBeenCalled();
  });

  it.each(['error SQL', 'respuesta perdida'])(
    'conserva recursos si la RPC de compensación falla: %s',
    async (kind) => {
      if (kind === 'error SQL')
        rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
      else rpc.mockRejectedValue(new Error('Transporte perdido'));
      await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
      expect(rowExists).toBe(true);
      expect(evidenceExists).toBe(true);
      expect(locationExists).toBe(true);
      expect(filesExist).toBe(true);
      expect(deleteLocation).not.toHaveBeenCalled();
      expect(removeStorage).not.toHaveBeenCalled();
    },
  );

  it('conserva ubicación y fotos si el INSERT padre confirmó pero su respuesta se perdió antes de conocer el id', async () => {
    insertParent.mockImplementation(async () => {
      rowExists = true;
      throw failure;
    });
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(rowExists).toBe(true);
    expect(locationExists).toBe(true);
    expect(filesExist).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(deleteLocation).not.toHaveBeenCalled();
  });

  it('conserva recursos cuando el INSERT padre retorna error sin un id confirmado', async () => {
    insertParent.mockResolvedValue({
      data: null,
      error: { code: '', message: 'Respuesta incierta' },
    });
    await expect(service.create(dto(), 'fixture')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(locationExists).toBe(true);
    expect(filesExist).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(deleteLocation).not.toHaveBeenCalled();
  });

  it('limpia una ubicación sin vínculo cuando falla antes de enviar el INSERT padre', async () => {
    snapshotResolve.mockRejectedValue(failure);
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(insertParent).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(locationExists).toBe(false);
    expect(deleteLocation).toHaveBeenCalledWith('id', 8);
  });

  it('conserva todos los recursos si hay historia y el historial de creación falla', async () => {
    findOne.mockResolvedValue({ success: true, data: { id: 292 } });
    createHistory.mockRejectedValue(failure);
    rpc.mockResolvedValue({ data: { compensado: false }, error: null });
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(rowExists).toBe(true);
    expect(evidenceExists).toBe(true);
    expect(locationExists).toBe(true);
    expect(filesExist).toBe(true);
    expect(removeStorage).not.toHaveBeenCalled();
  });
});
