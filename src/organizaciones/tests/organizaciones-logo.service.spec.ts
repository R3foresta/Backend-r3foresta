import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  BUCKET_ORGANIZACIONES,
  OrganizacionesLogoService,
} from '../organizaciones-logo.service';

type StorageMock = {
  upload: jest.Mock;
  getPublicUrl: jest.Mock;
  remove: jest.Mock;
};

function createSupabase(storage: StorageMock): SupabaseService {
  return {
    getClient: jest.fn().mockReturnValue({
      storage: {
        from: jest.fn().mockReturnValue(storage),
      },
    }),
  } as unknown as SupabaseService;
}

function fakeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'logo',
    originalname: 'logo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('binary'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
    ...overrides,
  } as Express.Multer.File;
}

describe('OrganizacionesLogoService.subir', () => {
  it('sube el archivo y devuelve la URL publica', async () => {
    const storage: StorageMock = {
      upload: jest
        .fn()
        .mockResolvedValue({ data: { id: 'obj-1' }, error: null }),
      getPublicUrl: jest.fn().mockReturnValue({
        data: {
          publicUrl:
            'https://x.supabase.co/storage/v1/object/public/organizaciones/org-9-123.png',
        },
      }),
      remove: jest.fn(),
    };
    const supabase = createSupabase(storage);
    const service = new OrganizacionesLogoService(supabase);

    const url = await service.subir(9, fakeFile());

    expect(storage.upload).toHaveBeenCalledTimes(1);
    const [filePath, buffer, opts] = storage.upload.mock.calls[0];
    expect(filePath).toMatch(/^org-9-\d+\.png$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(opts).toMatchObject({ contentType: 'image/png', upsert: false });

    expect(storage.getPublicUrl).toHaveBeenCalledWith(filePath);
    expect(url).toBe(
      'https://x.supabase.co/storage/v1/object/public/organizaciones/org-9-123.png',
    );
  });

  it('lanza InternalServerErrorException si falla la subida', async () => {
    const storage: StorageMock = {
      upload: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'storage exploded' },
      }),
      getPublicUrl: jest.fn(),
      remove: jest.fn(),
    };
    const service = new OrganizacionesLogoService(createSupabase(storage));

    await expect(service.subir(1, fakeFile())).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('lanza BadRequestException si la extension no esta permitida', async () => {
    const storage: StorageMock = {
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
      remove: jest.fn(),
    };
    const service = new OrganizacionesLogoService(createSupabase(storage));

    await expect(
      service.subir(
        1,
        fakeFile({ mimetype: 'application/pdf', originalname: 'logo.pdf' }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe('OrganizacionesLogoService.eliminarPorUrl', () => {
  it('no hace nada si la URL es null o vacia', async () => {
    const storage: StorageMock = {
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
      remove: jest.fn(),
    };
    const service = new OrganizacionesLogoService(createSupabase(storage));

    await service.eliminarPorUrl(null);
    await service.eliminarPorUrl(undefined);
    await service.eliminarPorUrl('');

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('no hace nada si la URL no apunta al bucket', async () => {
    const storage: StorageMock = {
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
      remove: jest.fn(),
    };
    const service = new OrganizacionesLogoService(createSupabase(storage));

    await service.eliminarPorUrl('https://otro-host.com/imagen.png');

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('extrae el path y llama storage.remove', async () => {
    const storage: StorageMock = {
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
      remove: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const service = new OrganizacionesLogoService(createSupabase(storage));

    await service.eliminarPorUrl(
      `https://x.supabase.co/storage/v1/object/public/${BUCKET_ORGANIZACIONES}/org-3-999.webp?v=cache`,
    );

    expect(storage.remove).toHaveBeenCalledWith(['org-3-999.webp']);
  });
});

describe('OrganizacionesLogoService.extraerPath', () => {
  const service = new OrganizacionesLogoService({} as any);

  it('devuelve null cuando no contiene el marker del bucket', () => {
    expect(service.extraerPath('https://otro/algo.png')).toBeNull();
  });

  it('extrae el path quitando el query string', () => {
    expect(
      service.extraerPath(
        'https://x.co/storage/v1/object/public/organizaciones/org-1-555.png?v=12',
      ),
    ).toBe('org-1-555.png');
  });
});
