import { createHash } from 'crypto';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';

function createQueryBuilder(result: {
  data: any;
  error: any;
  count?: number | null;
  status?: number;
}) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

describe('RecoleccionEvidenciasService', () => {
  let upload: jest.Mock;
  let from: jest.Mock;
  let remove: jest.Mock;
  let publicFrom: jest.Mock;
  let publicStorageFrom: jest.Mock;
  let getAdminClient: jest.Mock;
  let service: RecoleccionEvidenciasService;

  beforeEach(() => {
    upload = jest.fn().mockResolvedValue({
      data: { id: 'storage-object-1' },
      error: null,
    });
    from = jest.fn();
    remove = jest.fn().mockResolvedValue({ data: [], error: null });
    publicFrom = jest.fn((table: string) =>
      createQueryBuilder(
        table === 'tipos_entidad_evidencia'
          ? { data: { id: 42, activo: true }, error: null }
          : {
              data: null,
              error: {
                code: '42501',
                message: `permission denied for table ${table}`,
              },
            },
      ),
    );
    publicStorageFrom = jest.fn(() => ({
      upload: jest.fn().mockResolvedValue({ error: { code: '42501' } }),
      remove: jest.fn().mockResolvedValue({ error: { code: '42501' } }),
    }));
    const publicClient = {
      from: publicFrom,
      storage: { from: publicStorageFrom },
    };
    getAdminClient = jest.fn().mockReturnValue({
      from,
      storage: { from: jest.fn().mockReturnValue({ upload, remove }) },
    });

    const supabaseService = {
      getClient: jest.fn().mockReturnValue(publicClient),
      getAdminClient,
    } as unknown as SupabaseService;

    service = new RecoleccionEvidenciasService(
      supabaseService,
      new EvidenceFileService(),
    );
  });

  afterEach(() => {
    expect(
      publicFrom.mock.calls.every(
        ([table]) => table === 'tipos_entidad_evidencia',
      ),
    ).toBe(true);
    expect(publicStorageFrom).not.toHaveBeenCalled();
    jest.restoreAllMocks();
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
    expect(countQuery.eq).toHaveBeenCalledWith('tipo_entidad_id', 42);
    expect(countQuery.eq).toHaveBeenCalledWith('entidad_id', 99);
    expect(countQuery.is).toHaveBeenCalledWith('eliminado_en', null);
  });

  const fotos = ['lugar.jpg', 'total.jpg'].map((originalname) => ({
    originalname,
    mimetype: 'image/jpeg',
    buffer: Buffer.from('foto sintética'),
  }));

  it('registra las fotos de creación aunque el cliente público deniegue INSERT', async () => {
    const insertQuery = createQueryBuilder({ data: null, error: null });
    from.mockReturnValue(insertQuery);
    const fotosSubidas = await service.uploadFotosCreacion(fotos);
    await service.insertEvidenciasCreacion({
      recoleccionId: 99,
      codigoTrazabilidad: 'REC-2026-00099',
      userId: 7,
      fotosSubidas,
    });

    expect(insertQuery.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        tipo_entidad_id: 42,
        entidad_id: 99,
        ruta_archivo: fotosSubidas[0].ruta_archivo,
        storage_object_id: 'storage-object-1',
        creado_por_usuario_id: 7,
        es_principal: true,
        orden: 0,
      }),
      expect.objectContaining({
        entidad_id: 99,
        es_principal: false,
        orden: 1,
      }),
    ]);
  });

  it('limpia solo los IDs, entidad y rutas indicados mediante el cliente privado', async () => {
    const porIds = createQueryBuilder({ data: null, error: null });
    const porEntidad = createQueryBuilder({ data: null, error: null });
    from.mockReturnValueOnce(porIds).mockReturnValueOnce(porEntidad);

    await service.deleteEvidenceIds([501, 502]);
    await service.deleteByRecoleccionId(99);
    await service.removeStoragePaths(['lugar.jpg', 'total.jpg']);

    expect(porIds.delete).toHaveBeenCalled();
    expect(porIds.in).toHaveBeenCalledWith('id', [501, 502]);
    expect(porEntidad.delete).toHaveBeenCalled();
    expect(porEntidad.eq.mock.calls).toEqual([
      ['tipo_entidad_id', 42],
      ['entidad_id', 99],
    ]);
    expect(remove).toHaveBeenCalledWith(['lugar.jpg', 'total.jpg']);
  });

  it.each(['creación', 'borrador'])(
    'compensa una subida parcial de %s',
    async (flujo) => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      from.mockReturnValue(
        createQueryBuilder({ data: null, error: null, count: 0 }),
      );
      upload
        .mockResolvedValueOnce({ data: { id: 'primera' }, error: null })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'upload fallido' },
        });

      const operacion =
        flujo === 'creación'
          ? service.uploadFotosCreacion(fotos)
          : service.appendDraftFotosAsEvidencias(
              99,
              'REC-2026-00099',
              7,
              fotos,
            );

      await expect(operacion).rejects.toThrow('Error al subir foto');
      expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]]);
    },
  );

  it('compensa todas las subidas si falla el INSERT del borrador y conserva el error original', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    from
      .mockReturnValueOnce(
        createQueryBuilder({ data: null, error: null, count: 0 }),
      )
      .mockReturnValueOnce(
        createQueryBuilder({
          data: null,
          error: { code: '42501' },
          status: 403,
        }),
      );
    remove.mockRejectedValueOnce(new Error('Storage no disponible'));

    await expect(
      service.appendDraftFotosAsEvidencias(99, 'REC-2026-00099', 7, fotos),
    ).rejects.toThrow('Error al guardar fotos del borrador');
    expect(remove).toHaveBeenCalledWith(
      upload.mock.calls.map(([path]) => path),
    );
  });

  it.each(['cuerpo perdido', 'fetch rechazado', 'JSON inválido', 'timeout'])(
    'conserva los archivos referenciados si hay commit seguido de %s (SDK real)',
    async (fallo) => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const objects = new Set<string>();
      const rows: Array<{ ruta_archivo: string }> = [];
      const transport = jest.fn(
        async (_input: unknown, options?: RequestInit) => {
          if (options?.method === 'HEAD') {
            return new Response(null, {
              status: 200,
              headers: { 'content-range': '*/0' },
            });
          }
          if (options?.method !== 'POST') throw new Error('Método inesperado');
          // El servidor confirma el INSERT antes de perderse la respuesta.
          rows.push(...JSON.parse(String(options.body)));
          if (fallo === 'fetch rechazado')
            throw new TypeError('conexión cerrada después del commit');
          if (fallo === 'timeout')
            throw new DOMException(
              'respuesta agotada después del commit',
              'AbortError',
            );
          const response = new Response(
            fallo === 'JSON inválido' ? '{' : '[]',
            { status: 201 },
          );
          if (fallo === 'cuerpo perdido') {
            response.text = async () => {
              throw new TypeError('cuerpo perdido después del commit');
            };
          }
          return response;
        },
      );
      const sdk = createClient('https://fixture.invalid', 'fixture-key', {
        global: { fetch: transport },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      from.mockImplementation((table: string) => sdk.from(table));
      upload.mockImplementation(async (path: string) => {
        objects.add(path);
        return { data: { id: 'fixture' }, error: null };
      });
      remove.mockImplementation(async (paths: string[]) => {
        paths.forEach((path) => objects.delete(path));
        return { data: [], error: null };
      });

      await expect(
        service.appendDraftFotosAsEvidencias(99, 'REC-2026-00099', 7, fotos),
      ).rejects.toThrow('Error al guardar fotos del borrador');

      expect(transport).toHaveBeenCalledTimes(2); // HEAD y POST; sin inferir rollback de un SELECT.
      expect(rows).toHaveLength(2);
      expect(objects.size).toBe(2);
      expect(rows.every((row) => objects.has(row.ruta_archivo))).toBe(true);
      expect(remove).not.toHaveBeenCalled();
      expect(log.mock.calls).toEqual([
        [
          'Resultado incierto del INSERT de evidencias del borrador; se conservan las fotos subidas',
        ],
      ]);
    },
  );

  it('conserva el error lanzado por el transporte sin intentar compensar un INSERT incierto', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const original = new TypeError('respuesta perdida');
    from
      .mockReturnValueOnce(
        createQueryBuilder({ data: null, error: null, count: 0 }),
      )
      .mockReturnValueOnce({
        insert: () => ({ select: () => Promise.reject(original) }),
      });

    await expect(
      service.appendDraftFotosAsEvidencias(99, 'REC-2026-00099', 7, fotos),
    ).rejects.toBe(original);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    { status: 0, code: '42501' },
    { status: 504, code: 'PGRST003' },
    { status: 500, code: '57014' },
  ])(
    'conserva las fotos ante una respuesta incierta $status/$code',
    async ({ status, code }) => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      from
        .mockReturnValueOnce(
          createQueryBuilder({ data: null, error: null, count: 0 }),
        )
        .mockReturnValueOnce(
          createQueryBuilder({ data: null, error: { code }, status }),
        );

      await expect(
        service.appendDraftFotosAsEvidencias(99, 'REC-2026-00099', 7, fotos),
      ).rejects.toThrow('Error al guardar fotos del borrador');
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('no sube fotos si el conteo privado falla', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    from.mockReturnValue(
      createQueryBuilder({ data: null, error: { code: '42501' } }),
    );
    await expect(
      service.appendDraftFotosAsEvidencias(99, 'REC-2026-00099', 7, fotos),
    ).rejects.toThrow('Error al preparar el guardado de fotos del borrador');
    expect(upload).not.toHaveBeenCalled();
  });

  it('falla sin configuración privada, sin intentar Storage público', async () => {
    getAdminClient.mockImplementation(() => {
      throw new InternalServerErrorException('Configuración privada ausente');
    });
    await expect(service.uploadFotosCreacion(fotos)).rejects.toThrow(
      'Configuración privada ausente',
    );
    await expect(service.deleteEvidenceIds([501])).rejects.toThrow(
      'Configuración privada ausente',
    );
    expect(upload).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('registra fallos de compensación devueltos por DB y Storage sin ocultar el fallo de negocio', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    from.mockReturnValue(
      createQueryBuilder({ data: null, error: { code: '42501' } }),
    );
    remove.mockResolvedValue({ data: null, error: { code: '42501' } });

    await service.deleteEvidenceIds([501]);
    await service.deleteByRecoleccionId(99);
    await service.removeStoragePaths(['lugar.jpg']);

    expect(log).toHaveBeenCalledWith(
      'No se pudieron eliminar las evidencias por ID',
    );
    expect(log).toHaveBeenCalledWith(
      'No se pudieron eliminar las evidencias de la recolección',
    );
    expect(log).toHaveBeenCalledWith(
      'No se pudieron eliminar las fotos de Storage',
    );
  });
});
