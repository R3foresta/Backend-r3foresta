import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { UbicacionesReadService } from '../../common/ubicaciones/ubicaciones-read.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionDraftService } from '../application/recoleccion-draft.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';
import { RecoleccionSnapshotsService } from '../application/recoleccion-snapshots.service';
import { RecoleccionUbicacionService } from '../application/recoleccion-ubicacion.service';
import { FechaRecoleccionPolicy } from '../domain/policies/fecha-recoleccion.policy';

function query(execute: () => { data: unknown; error: unknown }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => execute()),
    maybeSingle: jest.fn(async () => execute()),
    then: (
      resolve: (value: ReturnType<typeof execute>) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(execute()).then(resolve, reject),
  };
}

// Servicios de edición, autorización y validación de ubicación reales;
// persistencia e integraciones sustituidas, sin .env ni escrituras externas.
describe('ubicación al corregir una recolección', () => {
  const fechaNueva = FechaRecoleccionPolicy.addDaysToIsoDate(
    FechaRecoleccionPolicy.getCurrentBusinessDate(),
    -1,
  );
  const ubicacionInput = {
    pais_id: 1,
    division_id: 2,
    nombre: 'Lugar original',
    referencia: 'Referencia',
    latitud: -16.5,
    longitud: -68.1,
    precision_m: 5,
    fuente: 'GPS_MOVIL' as const,
  };
  let service: RecoleccionDraftService;
  let registro: Record<string, unknown>;
  let ubicaciones: Map<number, Record<string, unknown>>;
  let oldUbicacion: Record<string, unknown>;
  let ubicacionInserts: jest.Mock;
  let ubicacionDeletes: jest.Mock;
  let updates: jest.Mock;
  let publicFrom: jest.Mock;
  let adminFrom: jest.Mock;
  let snapshots: { resolve: jest.Mock };
  let evidencias: {
    validarDraftFotos: jest.Mock;
    appendDraftFotosAsEvidencias: jest.Mock;
    deleteEvidenceIds: jest.Mock;
    removeStoragePaths: jest.Mock;
  };
  let divisionPaisId: number;
  let falloUpdate: 'ninguno' | 'respuesta-perdida';

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    registro = {
      id: 99,
      usuario_id: 7,
      estado_registro: 'RECHAZADO',
      fecha: FechaRecoleccionPolicy.addDaysToIsoDate(fechaNueva, -1),
      ubicacion_id: 8,
      planta_id: 3,
      codigo_trazabilidad: 'REC-SINTETICA',
      nombre_comunidad_snapshot: 'Comunidad original',
    };
    oldUbicacion = {
      ...ubicacionInput,
      id: 8,
      latitud: '-16.5000',
      longitud: '-68.1000',
      precision_m: '5.00',
    };
    ubicaciones = new Map([[8, { ...oldUbicacion }]]);
    divisionPaisId = 1;
    falloUpdate = 'ninguno';
    ubicacionInserts = jest.fn();
    ubicacionDeletes = jest.fn();
    updates = jest.fn();
    snapshots = {
      resolve: jest.fn(async ({ ubicacionId }: { ubicacionId: number }) => ({
        nombre_comunidad_snapshot:
          ubicacionId === 8 ? 'Comunidad original' : 'Comunidad corregida',
      })),
    };
    evidencias = {
      validarDraftFotos: jest.fn(),
      appendDraftFotosAsEvidencias: jest.fn(),
      deleteEvidenceIds: jest.fn(async () => undefined),
      removeStoragePaths: jest.fn(async () => undefined),
    };
    publicFrom = jest.fn((table: string) => {
      if (table === 'pais')
        return query(() => ({ data: { id: 1 }, error: null }));
      if (table === 'division_administrativa')
        return query(() => ({
          data: { id: 2, pais_id: divisionPaisId },
          error: null,
        }));
      if (table !== 'recoleccion') throw new Error('Tabla pública inesperada');
      let payload: Record<string, unknown>;
      return {
        update: (value: Record<string, unknown>) => {
          payload = value;
          updates(value);
          return {
            eq: async () => {
              Object.assign(registro, payload);
              return {
                error:
                  falloUpdate === 'respuesta-perdida'
                    ? {
                        code: '',
                        message: 'Respuesta perdida después del commit',
                      }
                    : null,
              };
            },
          };
        },
      };
    });
    adminFrom = jest.fn((table: string) => {
      if (table === 'usuario')
        return query(() => ({
          data: { id: 7, nombre: 'Fixture', rol: 'GENERAL' },
          error: null,
        }));
      if (table !== 'ubicacion') throw new Error('Tabla privada inesperada');
      let inserted: Record<string, unknown> | undefined;
      let selectedId = 0;
      let deleting = false;
      const builder = query(() => {
        if (inserted) {
          ubicaciones.set(9, { ...inserted, id: 9 });
          return { data: { id: 9 }, error: null };
        }
        if (deleting) {
          ubicaciones.delete(selectedId);
          ubicacionDeletes(selectedId);
          return { data: null, error: null };
        }
        return { data: ubicaciones.get(selectedId) ?? null, error: null };
      });
      builder.eq.mockImplementation((_column: string, value: number) => {
        selectedId = value;
        return builder;
      });
      return Object.assign(builder, {
        insert: (payload: Record<string, unknown>) => {
          ubicacionInserts(payload);
          inserted = payload;
          return builder;
        },
        delete: () => {
          deleting = true;
          return builder;
        },
      });
    });
    const supabase = {
      getClient: () => ({ from: publicFrom }),
      getAdminClient: () => ({ from: adminFrom }),
    } as unknown as SupabaseService;
    service = new RecoleccionDraftService(
      supabase,
      new RecoleccionAuthService(supabase),
      {
        getRawRecoleccion: async () => ({ ...registro }),
        findOne: async () => ({
          ...registro,
          fotos: [{ id: 501 }, { id: 502 }],
        }),
      } as unknown as RecoleccionConsultasService,
      evidencias as unknown as RecoleccionEvidenciasService,
      snapshots as unknown as RecoleccionSnapshotsService,
      new RecoleccionUbicacionService(supabase, {} as UbicacionesReadService),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('cambia solo la fecha del rechazado y conserva ubicación equivalente y fotos', async () => {
    const result = await service.updateDraft(
      99,
      { fecha: fechaNueva, ubicacion: { ...ubicacionInput } },
      'actor-verificado',
      'GENERAL',
    );
    expect(result).toMatchObject({
      fecha: fechaNueva,
      estado_registro: 'BORRADOR',
      ubicacion_id: 8,
      fotos: [{ id: 501 }, { id: 502 }],
    });
    expect(ubicacionInserts).not.toHaveBeenCalled();
    expect(ubicacionDeletes).not.toHaveBeenCalled();
    expect(updates).toHaveBeenCalledWith({
      fecha: fechaNueva,
      estado_registro: 'BORRADOR',
      nombre_comunidad_snapshot: 'Comunidad original',
    });
    expect(evidencias.appendDraftFotosAsEvidencias).not.toHaveBeenCalled();
    expect(ubicaciones.get(8)).toEqual(oldUbicacion);
  });

  it('reemplaza la ubicación del borrador y toma su snapshot sin mutar la anterior', async () => {
    registro.estado_registro = 'BORRADOR';
    const result = await service.updateDraft(
      99,
      {
        ubicacion: {
          ...ubicacionInput,
          latitud: -17,
          nombre: ' Lugar corregido ',
        },
      },
      'actor-verificado',
      'GENERAL',
    );
    expect(result).toMatchObject({
      ubicacion_id: 9,
      nombre_comunidad_snapshot: 'Comunidad corregida',
    });
    expect(ubicacionInserts).toHaveBeenCalledWith({
      ...ubicacionInput,
      latitud: -17,
      nombre: 'Lugar corregido',
    });
    expect(snapshots.resolve).toHaveBeenCalledWith({
      plantaId: 3,
      usuarioId: 7,
      ubicacionId: 9,
    });
    expect(ubicaciones.get(8)).toEqual(oldUbicacion);
    expect(ubicacionDeletes).not.toHaveBeenCalled();
    expect(publicFrom).not.toHaveBeenCalledWith('ubicacion');
  });

  it('conserva el vínculo y evita lecturas de ubicación si se omite el campo', async () => {
    await service.updateDraft(
      99,
      { fecha: fechaNueva },
      'actor-verificado',
      'GENERAL',
    );
    expect(registro.ubicacion_id).toBe(8);
    expect(adminFrom).not.toHaveBeenCalledWith('ubicacion');
    expect(ubicacionInserts).not.toHaveBeenCalled();
  });

  it('rechaza división de otro país antes de escribir', async () => {
    divisionPaisId = 2;
    await expect(
      service.updateDraft(
        99,
        { ubicacion: ubicacionInput },
        'actor-verificado',
        'GENERAL',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(ubicacionInserts).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
    expect(adminFrom).not.toHaveBeenCalledWith('ubicacion');
  });

  it.each(['PENDIENTE_VALIDACION', 'VALIDADO'])(
    'no consulta ni escribe ubicación en estado %s',
    async (estado) => {
      registro.estado_registro = estado;
      await expect(
        service.updateDraft(
          99,
          { ubicacion: ubicacionInput },
          'actor-verificado',
          'GENERAL',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adminFrom).not.toHaveBeenCalledWith('ubicacion');
      expect(ubicacionInserts).not.toHaveBeenCalled();
      expect(updates).not.toHaveBeenCalled();
    },
  );

  it('autoriza el objeto antes de consultar ubicación aunque se declare ADMIN en el argumento', async () => {
    registro.usuario_id = 8;
    await expect(
      service.updateDraft(
        99,
        { ubicacion: ubicacionInput },
        'actor-verificado',
        'ADMIN',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adminFrom).not.toHaveBeenCalledWith('ubicacion');
    expect(ubicacionInserts).not.toHaveBeenCalled();
    expect(updates).not.toHaveBeenCalled();
  });

  it('conserva la nueva ubicación si se pierde la respuesta tras confirmar el vínculo', async () => {
    falloUpdate = 'respuesta-perdida';
    await expect(
      service.updateDraft(
        99,
        { ubicacion: { ...ubicacionInput, latitud: -17 } },
        'actor-verificado',
        'GENERAL',
      ),
    ).rejects.toThrow('Error al actualizar borrador');
    expect(registro.ubicacion_id).toBe(9);
    expect(ubicaciones.has(9)).toBe(true);
    expect(ubicacionDeletes).not.toHaveBeenCalled();
    expect(ubicaciones.get(8)).toEqual(oldUbicacion);
  });

  it('limpia la candidata si falla el snapshot antes de intentar vincularla', async () => {
    snapshots.resolve.mockRejectedValueOnce(
      new Error('Snapshot no disponible'),
    );
    await expect(
      service.updateDraft(
        99,
        { ubicacion: { ...ubicacionInput, latitud: -17 } },
        'actor-verificado',
        'GENERAL',
      ),
    ).rejects.toThrow('Snapshot no disponible');
    expect(updates).not.toHaveBeenCalled();
    expect(ubicaciones.has(9)).toBe(false);
    expect(ubicacionDeletes).toHaveBeenCalledWith(9);
    expect(ubicaciones.get(8)).toEqual(oldUbicacion);
  });
});
