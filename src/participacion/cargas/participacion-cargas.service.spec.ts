import type { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionCargasService } from './participacion-cargas.service';
import {
  ParticipacionImagenService,
  hashBytes,
} from './participacion-imagen.service';

describe('ParticipacionCargasService: reconciliación sin locks durante IO', () => {
  const actor = {
    auth_id: 'actor-sintetico',
    usuario_id: '9007199254740993',
    rol: 'ADMIN',
  };
  const command = '10000000-0000-4000-8000-000000000001';
  const fileId = '10000000-0000-4000-8000-000000000002';
  const bytes = Buffer.from('original-sintetico');
  const derivative = Buffer.from('derivada-sintetica');
  const work = {
    bucket: 'participacion_evidencias',
    ruta_original: '1/command/file/1/original',
    ruta_derivada: '1/command/file/1/derivada.jpg',
    generacion: 1,
    lease_token: '10000000-0000-4000-8000-000000000003',
    hash_derivada: hashBytes(derivative),
    nueva: true,
  };
  const load = {
    carga_id: fileId,
    estado: 'RESERVADA',
    evidencia_id: null as string | null,
    creado_en: '2026-10-15T00:00:00.000Z',
    expira_en: '2026-11-14T00:00:00.000Z',
  };
  const envelope = (data: unknown, status = 200) => ({
    http_status: status,
    body: { data, observado_en: '2026-10-15T00:00:00.000Z' },
  });

  function harness(
    options: {
      lostUpload?: boolean;
      failFinalize?: boolean;
      failUpload?: boolean;
    } = {},
  ) {
    const objects = new Map<string, Buffer>();
    let inRpc = false;
    let reservas = 0;
    const bucket = {
      download: jest.fn(async (path: string) => {
        expect(inRpc).toBe(false);
        const stored = objects.get(path);
        return stored
          ? { data: new Blob([new Uint8Array(stored)]), error: null }
          : { data: null, error: { statusCode: '404' } };
      }),
      upload: jest.fn(
        async (path: string, value: Buffer, args: { upsert: boolean }) => {
          expect(inRpc).toBe(false);
          expect(args.upsert).toBe(false);
          if (options.failUpload) return { data: null, error: { status: 503 } };
          objects.set(path, Buffer.from(value));
          return options.lostUpload
            ? { data: null, error: { status: 503 } }
            : { data: { path }, error: null };
        },
      ),
      remove: jest.fn(async (paths: string[]) => {
        paths.forEach((p) => objects.delete(p));
        return { data: [], error: null };
      }),
      createSignedUrl: jest.fn(async () => ({
        data: { signedUrl: 'https://storage.invalid/firmada' },
        error: null,
      })),
    };
    const rpc = jest.fn(
      async (_name: string, args: Record<string, unknown>) => {
        inRpc = true;
        try {
          if (args.p_accion === 'RESERVAR')
            return {
              data: envelope(
                { carga: load, trabajo: { ...work, nueva: reservas++ === 0 } },
                202,
              ),
              error: null,
            };
          if (args.p_accion === 'FINALIZAR') {
            if (options.failFinalize)
              return { data: null, error: { message: 'respuesta perdida' } };
            expect(objects.size).toBe(2);
            return {
              data: envelope(
                {
                  ...load,
                  estado: 'DISPONIBLE',
                  evidencia_id: '9007199254740994',
                },
                201,
              ),
              error: null,
            };
          }
          return { data: null, error: new Error('acción inesperada') };
        } finally {
          inRpc = false;
        }
      },
    );
    const supabase = {
      getAdminClient: jest.fn(() => ({
        rpc,
        storage: { from: jest.fn(() => bucket) },
      })),
      getClient: jest.fn(() => {
        throw new Error('cliente público prohibido');
      }),
    };
    const imagen = {
      preparar: jest.fn(async () => ({
        original: bytes,
        derivada: derivative,
        mimeOriginal: 'image/jpeg',
        hashOriginal: hashBytes(bytes),
        hashDerivada: hashBytes(derivative),
      })),
    };
    const service = new ParticipacionCargasService(
      supabase as unknown as SupabaseService,
      imagen as unknown as ParticipacionImagenService,
    );
    return { service, rpc, bucket, objects, imagen, supabase };
  }

  it('reserva antes de Storage y verifica original+derivada antes de finalizar; no expone trabajo', async () => {
    const h = harness();
    const result = await h.service.subir(actor, command, fileId, bytes);
    expect(result.http_status).toBe(201);
    expect(result.body.data).toMatchObject({
      evidencia_id: '9007199254740994',
      estado: 'DISPONIBLE',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /bucket|ruta_|lease_token|hash_/,
    );
    expect(h.supabase.getClient).not.toHaveBeenCalled();
    expect(h.rpc.mock.calls.map((call) => call[1].p_accion)).toEqual([
      'RESERVAR',
      'FINALIZAR',
    ]);
  });

  it('reconcilia upload confirmado cuya respuesta se perdió', async () => {
    const h = harness({ lostUpload: true });
    const result = await h.service.subir(actor, command, fileId, bytes);
    expect(result.http_status).toBe(201);
    expect(h.objects.size).toBe(2);
  });

  it('tras pérdida de finalización reintenta misma generación verificando objetos, sin repetir upload', async () => {
    const options = { failFinalize: true };
    const h = harness(options);
    await expect(
      h.service.subir(actor, command, fileId, bytes),
    ).rejects.toMatchObject({ status: 503 });
    expect(h.bucket.upload).toHaveBeenCalledTimes(2);
    options.failFinalize = false;
    await expect(
      h.service.subir(actor, command, fileId, bytes),
    ).resolves.toMatchObject({ http_status: 200 });
    expect(h.bucket.upload).toHaveBeenCalledTimes(2);
  });

  it('fallo de Storage queda RESERVADA202 y no ejecuta finalización', async () => {
    const h = harness({ failUpload: true });
    const result = await h.service.subir(actor, command, fileId, bytes);
    expect(result).toMatchObject({
      http_status: 202,
      body: { data: { estado: 'RESERVADA', evidencia_id: null } },
    });
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it('objeto preexistente con hash distinto no se sobrescribe ni se finaliza', async () => {
    const h = harness();
    h.objects.set(work.ruta_original, Buffer.from('otros bytes'));
    const result = await h.service.subir(actor, command, fileId, bytes);
    expect(result.http_status).toBe(202);
    expect(h.bucket.upload).not.toHaveBeenCalled();
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    envelope([{ ...load, evidencia_id: 9007199254740992 }]),
    envelope([{ ...load, carga_id: 'no-uuid' }]),
    envelope([{ ...load, creado_en: '2026-10-15T00:00:00+00:00' }]),
    envelope([{ ...load, bucket: 'privado' }]),
    {
      http_status: 404,
      body: { error: { codigo: 'X', mensaje: 'X', secretos: 'oculto' } },
    },
  ])('falla cerrado ante respuesta RPC fuera de contrato', async (value) => {
    const h = harness();
    h.rpc.mockResolvedValue({ data: value as never, error: null });
    await expect(h.service.listar(actor, command)).rejects.toMatchObject({
      status: 503,
      response: { error: { codigo: 'RESULTADO_NO_DETERMINADO' } },
    });
  });
});
