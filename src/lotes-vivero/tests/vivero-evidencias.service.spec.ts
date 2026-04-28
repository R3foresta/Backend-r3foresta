import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroEvidenciasService } from '../application/vivero-evidencias.service';

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

describe('ViveroEvidenciasService', () => {
  let service: ViveroEvidenciasService;
  let authService: jest.Mocked<Pick<ViveroAuthService, 'getUserByAuthId' | 'assertCanWrite'>>;
  let from: jest.Mock;
  let upload: jest.Mock;
  let remove: jest.Mock;

  const foto = {
    mimetype: 'image/jpeg',
    size: 12,
    originalname: 'inicio.jpg',
    buffer: Buffer.from('foto'),
  };

  beforeEach(() => {
    upload = jest.fn().mockResolvedValue({
      data: { id: 'storage-object-1' },
      error: null,
    });
    remove = jest.fn().mockResolvedValue({ data: [], error: null });

    const storageBucket = {
      upload,
      remove,
      getPublicUrl: jest.fn().mockReturnValue({
        data: {
          publicUrl:
            'https://storage.example/recoleccion_fotos/vivero/eventos/pendientes/77/1_inicio.jpg',
        },
      }),
    };

    from = jest.fn((table: string) => {
      if (table === 'tipos_entidad_evidencia') {
        return createQueryBuilder({
          data: { id: 9, activo: true },
          error: null,
        });
      }

      if (table === 'evidencias_trazabilidad') {
        return createQueryBuilder({
          data: [
            {
              id: 501,
              tipo_entidad_id: 9,
              entidad_id: 0,
              codigo_trazabilidad: null,
              bucket: 'recoleccion_fotos',
              ruta_archivo: 'vivero/eventos/pendientes/77/1_inicio.jpg',
              storage_object_id: 'storage-object-1',
              tipo_archivo: 'FOTO',
              mime_type: 'image/jpeg',
              tamano_bytes: 12,
              hash_sha256: 'abc',
              titulo: 'Inicio 1',
              descripcion: 'Foto inicio',
              metadata: {},
              es_principal: true,
              orden: 0,
              tomado_en: null,
              creado_en: '2026-04-27',
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
        nombre: 'Responsable Vivero',
        rol: 'GENERAL',
      }),
      assertCanWrite: jest.fn(),
    };

    service = new ViveroEvidenciasService(
      supabaseService,
      authService as unknown as ViveroAuthService,
    );
  });

  it('crea evidencia pendiente de evento vivero con entidad_id 0', async () => {
    const result = await service.crearPendienteParaEvento(
      {
        titulo: 'Inicio',
        descripcion: 'Foto inicio',
        metadata: '{"fuente":"app"}',
      },
      'auth-1',
      [foto],
    );

    expect(authService.getUserByAuthId).toHaveBeenCalledWith('auth-1');
    expect(authService.assertCanWrite).toHaveBeenCalledWith('GENERAL');
    expect(upload).toHaveBeenCalledTimes(1);

    const evidenciasQuery = from.mock.results.find(
      (resultItem) =>
        resultItem.type === 'return' &&
        resultItem.value.insert?.mock?.calls.length > 0,
    )?.value;
    const payload = evidenciasQuery.insert.mock.calls[0][0][0];

    expect(payload).toMatchObject({
      tipo_entidad_id: 9,
      entidad_id: 0,
      codigo_trazabilidad: null,
      bucket: 'recoleccion_fotos',
      tipo_archivo: 'FOTO',
      mime_type: 'image/jpeg',
      titulo: 'Inicio',
      descripcion: 'Foto inicio',
      es_principal: true,
      orden: 0,
      creado_por_usuario_id: 77,
    });
    expect(payload.metadata).toMatchObject({
      fuente: 'app',
      origen: 'VIVERO_EVENTO_PENDIENTE',
      estado: 'PENDIENTE_VINCULACION',
      formato: 'JPEG',
    });
    expect(result.success).toBe(true);
    expect(result.evidencia_ids).toEqual([501]);
    expect(result.data[0].id).toBe(501);
    expect(result.data[0].public_url).toContain('https://storage.example/');
  });

  it('rechaza la solicitud sin fotos', async () => {
    await expect(
      service.crearPendienteParaEvento({}, 'auth-1', []),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza metadata invalida', async () => {
    await expect(
      service.crearPendienteParaEvento(
        {
          metadata: '{no-json}',
        },
        'auth-1',
        [foto],
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('falla si no existe tipo_entidad_evidencia EVENTO_LOTE_VIVERO activo', async () => {
    from.mockImplementation((table: string) => {
      if (table === 'tipos_entidad_evidencia') {
        return createQueryBuilder({
          data: null,
          error: null,
        });
      }

      throw new Error(`Tabla no mockeada: ${table}`);
    });

    await expect(
      service.crearPendienteParaEvento({}, 'auth-1', [foto]),
    ).rejects.toThrow(NotFoundException);
  });
});
