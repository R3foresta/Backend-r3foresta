import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ForbiddenException,
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
    rpc = jest.fn(async (name: string) => {
      if (name === 'm1_recoleccion_guardar') {
        const result = await insertParent();
        evidenceExists = true;
        return result;
      }

      if (deleted || evidenceExists)
        return { data: { compensado: false }, error: null };
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

  it('conserva ficha, historia y fotos si falla la proyección posterior al commit', async () => {
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(rowExists).toBe(true);
    expect(evidenceExists).toBe(true);
    expect(locationExists).toBe(true);
    expect(filesExist).toBe(true);
    expect(removeStorage).not.toHaveBeenCalled();
    expect(deleteLocation).not.toHaveBeenCalled();
    expect(insertEvidence).not.toHaveBeenCalled();
    expect(createHistory).not.toHaveBeenCalled();
  });
  it.each(['error SQL', 'respuesta perdida'])(
    'conserva recursos si falla la compensación: %s',
    async (kind) => {
      const original = rpc.getMockImplementation()!;
      rpc.mockImplementation((name: string) =>
        name === 'm1_recoleccion_guardar'
          ? original(name)
          : kind === 'error SQL'
            ? Promise.resolve({ data: null, error: { code: '42501' } })
            : Promise.reject(new Error('Transporte perdido')),
      );
      await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
      expect(rowExists && evidenceExists && locationExists && filesExist).toBe(
        true,
      );
      expect(removeStorage).not.toHaveBeenCalled();
    },
  );
  it('conserva recursos si la respuesta de creación se pierde después del commit', async () => {
    insertParent.mockImplementation(async () => {
      rowExists = true;
      throw failure;
    });
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(rowExists && locationExists && filesExist).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(removeStorage).not.toHaveBeenCalled();
  });
  it('conserva recursos cuando la RPC retorna un resultado incierto sin id', async () => {
    insertParent.mockResolvedValue({ data: null, error: { code: '' } });
    await expect(service.create(dto(), 'fixture')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(locationExists && filesExist).toBe(true);
    expect(removeStorage).not.toHaveBeenCalled();
  });
  it('limpia subidas cuando el retiro gana antes de la creación RPC', async () => {
    insertParent.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(service.create(dto(), 'fixture')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(rowExists).toBe(false);
    expect(locationExists).toBe(false);
    expect(filesExist).toBe(false);
  });
  it('limpia una ubicación sin vínculo cuando falla antes de enviar el INSERT padre', async () => {
    snapshotResolve.mockRejectedValue(failure);
    await expect(service.create(dto(), 'fixture')).rejects.toBe(failure);
    expect(insertParent).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(locationExists).toBe(false);
    expect(deleteLocation).toHaveBeenCalledWith('id', 8);
  });

  it('historial y evidencias no se escriben en llamadas posteriores a la RPC', async () => {
    findOne.mockResolvedValue({ success: true, data: { id: 292 } });
    await service.create(dto(), 'fixture');
    expect(createHistory).not.toHaveBeenCalled();
    expect(insertEvidence).not.toHaveBeenCalled();
  });
});
