import { createHash } from 'crypto';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';

function createQueryBuilder(result: {
  data: any;
  error: any;
  count?: number | null;
}) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

describe('RecoleccionEvidenciasService', () => {
  let upload: jest.Mock;
  let from: jest.Mock;
  let service: RecoleccionEvidenciasService;

  beforeEach(() => {
    upload = jest.fn().mockResolvedValue({
      data: { id: 'storage-object-1' },
      error: null,
    });
    from = jest.fn();

    const supabaseService = {
      getClient: jest.fn().mockReturnValue({
        from,
        storage: {
          from: jest.fn().mockReturnValue({ upload }),
        },
      }),
    } as unknown as SupabaseService;

    service = new RecoleccionEvidenciasService(
      supabaseService,
      new EvidenceFileService(),
    );
  });

  it('sube fotos de creacion preservando original, hash y metadata comun', async () => {
    const buffer = Buffer.from([0, 1, 2, 3, 255]);

    const [foto] = await service.uploadFotosCreacion([
      {
        mimetype: 'image/jpg',
        originalname: 'camara.jpg',
        size: 999,
        buffer,
      },
    ]);

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/camara\.jpg$/),
      buffer,
      {
        contentType: 'image/jpeg',
        upsert: false,
      },
    );
    expect(foto).toMatchObject({
      storage_object_id: 'storage-object-1',
      mime_type: 'image/jpeg',
      tamano_bytes: buffer.length,
      hash_sha256: createHash('sha256').update(buffer).digest('hex'),
      metadata: {
        nombre_original: 'camara.jpg',
        mime_type_recibido: 'image/jpg',
        mime_type_resuelto: 'image/jpeg',
        formato_original: 'JPG',
        hash_algoritmo: 'sha256',
        archivo_original_preservado: true,
      },
    });
  });

  it('agrega fotos de draft con columnas y metadata derivadas del archivo preparado', async () => {
    const tipoEntidadQuery = createQueryBuilder({
      data: { id: 42, activo: true },
      error: null,
    });
    const countQuery = createQueryBuilder({
      data: null,
      error: null,
      count: 1,
    });
    const insertQuery = createQueryBuilder({
      data: [{ id: 501 }],
      error: null,
    });
    let evidenciasCalls = 0;
    from.mockImplementation((table: string) => {
      if (table === 'tipos_entidad_evidencia') return tipoEntidadQuery;
      if (table === 'evidencias_trazabilidad') {
        evidenciasCalls += 1;
        return evidenciasCalls === 1 ? countQuery : insertQuery;
      }
      throw new Error(`Tabla no mockeada: ${table}`);
    });

    const buffer = Buffer.from('heic original');

    const result = await service.appendDraftFotosAsEvidencias(
      99,
      'REC-2026-00099',
      7,
      [
        {
          mimetype: 'application/octet-stream',
          originalname: 'IMG 001.HEIC',
          size: 999,
          buffer,
        },
      ],
    );

    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^draft_99_\d+_0_IMG_001\.HEIC$/),
      buffer,
      {
        contentType: 'image/heic',
        upsert: false,
      },
    );

    const payload = insertQuery.insert.mock.calls[0][0][0];
    expect(payload).toMatchObject({
      tipo_entidad_id: 42,
      entidad_id: 99,
      codigo_trazabilidad: 'REC-2026-00099',
      bucket: 'recoleccion_fotos',
      tipo_archivo: 'FOTO',
      mime_type: 'image/heic',
      tamano_bytes: buffer.length,
      hash_sha256: createHash('sha256').update(buffer).digest('hex'),
      titulo: 'Foto 2',
      metadata: {
        origen: 'UPDATE_DRAFT',
        nombre_original: 'IMG 001.HEIC',
        mime_type_recibido: 'application/octet-stream',
        mime_type_resuelto: 'image/heic',
        formato_original: 'HEIC',
        hash_algoritmo: 'sha256',
        archivo_original_preservado: true,
      },
      es_principal: false,
      orden: 1,
      creado_por_usuario_id: 7,
    });
    expect(result.insertedEvidenceIds).toEqual([501]);
    expect(result.uploadedPaths).toEqual([payload.ruta_archivo]);
  });
});
