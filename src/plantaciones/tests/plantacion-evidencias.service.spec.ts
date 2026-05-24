import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { PlantacionAuthService } from '../application/plantacion-auth.service';
import { PlantacionEvidenciasService } from '../application/plantacion-evidencias.service';

function createQueryBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    insert: jest.fn().mockReturnThis(),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe('PlantacionEvidenciasService', () => {
  let service: PlantacionEvidenciasService;
  let authService: jest.Mocked<
    Pick<PlantacionAuthService, 'getUserByAuthId' | 'assertCanWrite'>
  >;
  let from: jest.Mock;
  let upload: jest.Mock;
  let remove: jest.Mock;

  const foto = {
    mimetype: 'image/jpeg',
    size: 12,
    originalname: 'plantacion.jpg',
    buffer: Buffer.from('foto'),
  };

  beforeEach(() => {
    upload = jest.fn().mockResolvedValue({
      data: { id: 'storage-obj-1' },
      error: null,
    });
    remove = jest.fn().mockResolvedValue({ data: [], error: null });

    const storageBucket = {
      upload,
      remove,
      getPublicUrl: jest.fn().mockReturnValue({
        data: {
          publicUrl:
            'https://storage.example/recoleccion_fotos/plantaciones/registros/pendientes/77/1_plantacion.jpg',
        },
      }),
    };

    from = jest.fn((table: string) => {
      if (table === 'tipos_entidad_evidencia') {
        return createQueryBuilder({
          data: { id: 17, activo: true },
          error: null,
        });
      }

      if (table === 'evidencias_trazabilidad') {
        return createQueryBuilder({
          data: [
            {
              id: 801,
              tipo_entidad_id: 17,
              entidad_id: 0,
              codigo_trazabilidad: null,
              bucket: 'recoleccion_fotos',
              ruta_archivo:
                'plantaciones/registros/pendientes/77/1_plantacion.jpg',
              storage_object_id: 'storage-obj-1',
              tipo_archivo: 'FOTO',
              mime_type: 'image/jpeg',
              tamano_bytes: 12,
              hash_sha256: 'abc',
              titulo: 'Plantacion 1',
              descripcion: null,
              metadata: {},
              es_principal: false,
              orden: 0,
              tomado_en: null,
              creado_en: '2026-05-24',
              creado_por_usuario_id: 77,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Tabla no mockeada: ${table}`);
    });

    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from,
        storage: {
          from: jest.fn().mockReturnValue(storageBucket),
        },
      }),
    } as unknown as SupabaseService;

    authService = {
      getUserByAuthId: jest.fn().mockResolvedValue({
        id: 77,
        nombre: 'Responsable Plantacion',
        rol: 'GENERAL',
      }),
      assertCanWrite: jest.fn(),
    };

    service = new PlantacionEvidenciasService(
      supabaseService,
      authService as unknown as PlantacionAuthService,
    );
  });

  it('crea evidencia pendiente con entidad_id 0 y namespace plantaciones/', async () => {
    const result = await service.crearPendienteParaRegistro(
      { titulo: 'Plantacion sector A', descripcion: undefined },
      'auth-1',
      [foto],
    );

    expect(authService.getUserByAuthId).toHaveBeenCalledWith('auth-1');
    expect(authService.assertCanWrite).toHaveBeenCalledWith('GENERAL');
    expect(upload).toHaveBeenCalledTimes(1);
    const uploadPath = upload.mock.calls[0][0] as string;
    expect(uploadPath.startsWith('plantaciones/registros/pendientes/77/')).toBe(
      true,
    );

    const evidenciasQuery = from.mock.results.find(
      (resultItem: any) =>
        resultItem.type === 'return' &&
        resultItem.value.insert?.mock?.calls.length > 0,
    )?.value;
    const payload = evidenciasQuery.insert.mock.calls[0][0][0];

    expect(payload).toMatchObject({
      tipo_entidad_id: 17,
      entidad_id: 0,
      codigo_trazabilidad: null,
      bucket: 'recoleccion_fotos',
      tipo_archivo: 'FOTO',
      creado_por_usuario_id: 77,
    });
    expect(payload.metadata).toMatchObject({
      origen: 'PLANTACION_REGISTRO_PENDIENTE',
      estado: 'PENDIENTE_VINCULACION',
      formato: 'JPEG',
    });
    expect(result.success).toBe(true);
    expect(result.evidencia_ids).toEqual([801]);
  });

  it('rechaza la solicitud sin fotos', async () => {
    await expect(
      service.crearPendienteParaRegistro({}, 'auth-1', []),
    ).rejects.toThrow(BadRequestException);
  });

  it('falla si no existe tipo_entidad REGISTRO_PLANTACION activo', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'tipos_entidad_evidencia') {
        return createQueryBuilder({ data: null, error: null });
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    });

    await expect(
      service.crearPendienteParaRegistro({}, 'auth-1', [foto]),
    ).rejects.toThrow(NotFoundException);
  });
});
