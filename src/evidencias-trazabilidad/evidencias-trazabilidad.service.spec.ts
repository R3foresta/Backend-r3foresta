import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { SupabaseService } from '../supabase/supabase.service';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';

function createQueryBuilder(
  resultOrFactory:
    | { data: any; error: any; count?: number | null }
    | ((builder: any) => { data: any; error: any; count?: number | null }),
) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    single: jest
      .fn()
      .mockImplementation(() => Promise.resolve(resolveResult())),
    maybeSingle: jest
      .fn()
      .mockImplementation(() => Promise.resolve(resolveResult())),
    then: (resolve: any, reject: any) =>
      Promise.resolve(resolveResult()).then(resolve, reject),
  };

  function resolveResult() {
    return typeof resultOrFactory === 'function'
      ? resultOrFactory(builder)
      : resultOrFactory;
  }

  return builder;
}

describe('EvidenciasTrazabilidadService', () => {
  let upload: jest.Mock;
  let remove: jest.Mock;
  let from: jest.Mock;
  let service: EvidenciasTrazabilidadService;

  beforeEach(() => {
    upload = jest.fn().mockResolvedValue({
      data: { id: 'storage-object-heic' },
      error: null,
    });
    remove = jest.fn().mockResolvedValue({ data: [], error: null });
    from = jest.fn();

    const storageBucket = {
      upload,
      remove,
      getPublicUrl: jest.fn().mockReturnValue({
        data: { publicUrl: 'https://storage.local/evidencia.heic' },
      }),
    };

    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from,
        storage: {
          from: jest.fn().mockReturnValue(storageBucket),
        },
      }),
    } as unknown as SupabaseService;

    service = new EvidenciasTrazabilidadService(
      supabaseService,
      new EvidenceFileService(),
    );
  });

  it('sube HEIC octet-stream preservando original y persiste metadata auditable comun', async () => {
    const originalBuffer = Buffer.from('heic original bytes');
    const hashSha256 = createHash('sha256')
      .update(originalBuffer)
      .digest('hex');

    const usuarioQuery = createQueryBuilder({
      data: { id: 7 },
      error: null,
    });
    const recoleccionQuery = createQueryBuilder({
      data: { id: 33, codigo_trazabilidad: 'REC-2026-00033' },
      error: null,
    });
    const tipoEntidadQuery = createQueryBuilder({
      data: { id: 42, activo: true },
      error: null,
    });
    const existentesQuery = createQueryBuilder({
      data: [{ id: 1, orden: 1, es_principal: false }],
      error: null,
    });
    const insertQuery = createQueryBuilder((builder: any) => ({
      data: builder.insert.mock.calls[0][0].map(
        (payload: Record<string, unknown>, index: number) => ({
          id: 900 + index,
          creado_en: '2026-06-17T12:00:00.000Z',
          actualizado_en: '2026-06-17T12:00:00.000Z',
          eliminado_en: null,
          actualizado_por_usuario_id: null,
          eliminado_por_usuario_id: null,
          tipo_entidad: { id: 42, codigo: 'RECOLECCION', descripcion: null },
          creado_por: { id: 7, nombre: 'Usuario' },
          actualizado_por: null,
          eliminado_por: null,
          ...payload,
        }),
      ),
      error: null,
    }));

    let evidenciasCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'usuario') return usuarioQuery;
      if (table === 'recoleccion') return recoleccionQuery;
      if (table === 'tipos_entidad_evidencia') return tipoEntidadQuery;
      if (table === 'evidencias_trazabilidad') {
        evidenciasCalls += 1;
        return evidenciasCalls === 1 ? existentesQuery : insertQuery;
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    });

    const result = await service.createForRecoleccion(
      33,
      {
        titulo: 'Seguimiento',
        descripcion: 'Foto posterior',
        metadata:
          '{"fuente":"app-mobile","origen":"OTRO","hash_algoritmo":"md5","archivo_original_preservado":false}',
        tomado_en: '2026-06-17T08:00:00-04:00',
      },
      'auth-123',
      [
        {
          mimetype: 'application/octet-stream',
          originalname: 'IMG 001.heic',
          size: 999,
          buffer: originalBuffer,
        },
      ],
    );

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/IMG_001\.heic$/),
      originalBuffer,
      {
        contentType: 'image/heic',
        upsert: false,
      },
    );

    const payload = insertQuery.insert.mock.calls[0][0][0];
    expect(payload).toMatchObject({
      tipo_entidad_id: 42,
      entidad_id: 33,
      codigo_trazabilidad: 'REC-2026-00033',
      bucket: 'recoleccion_fotos',
      storage_object_id: 'storage-object-heic',
      tipo_archivo: 'FOTO',
      mime_type: 'image/heic',
      tamano_bytes: originalBuffer.length,
      hash_sha256: hashSha256,
      titulo: 'Seguimiento',
      descripcion: 'Foto posterior',
      metadata: {
        origen: 'POST_EVIDENCIAS_RECOLECCION',
        fuente: 'app-mobile',
        nombre_original: 'IMG 001.heic',
        mime_type_recibido: 'application/octet-stream',
        mime_type_resuelto: 'image/heic',
        formato_original: 'HEIC',
        hash_algoritmo: 'sha256',
        archivo_original_preservado: true,
      },
      es_principal: true,
      orden: 2,
      tomado_en: '2026-06-17T08:00:00-04:00',
      creado_por_usuario_id: 7,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(payload.metadata).not.toMatchObject({
      origen: 'OTRO',
      hash_algoritmo: 'md5',
      archivo_original_preservado: false,
    });
  });

  it('mantiene el maximo actual de 5 fotos por solicitud', async () => {
    await expect(
      service.createForRecoleccion(33, {}, 'auth-123', [
        {
          mimetype: 'image/png',
          originalname: '1.png',
          buffer: Buffer.from('1'),
        },
        {
          mimetype: 'image/png',
          originalname: '2.png',
          buffer: Buffer.from('2'),
        },
        {
          mimetype: 'image/png',
          originalname: '3.png',
          buffer: Buffer.from('3'),
        },
        {
          mimetype: 'image/png',
          originalname: '4.png',
          buffer: Buffer.from('4'),
        },
        {
          mimetype: 'image/png',
          originalname: '5.png',
          buffer: Buffer.from('5'),
        },
        {
          mimetype: 'image/png',
          originalname: '6.png',
          buffer: Buffer.from('6'),
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
