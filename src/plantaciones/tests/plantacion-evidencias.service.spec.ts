import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionImagenService } from '../../participacion/cargas/participacion-imagen.service';
import { PlantacionAuthService } from '../application/plantacion-auth.service';
import { PlantacionEvidenciasService } from '../application/plantacion-evidencias.service';

function harness() {
  const upload = jest.fn(async () => ({ error: null }));
  const remove = jest.fn(async () => ({ error: null }));
  const rpc = jest.fn(
    async (_name: string, args: any): Promise<any> => ({
      data: {
        http_status: args.p_accion === 'CREAR' ? 201 : 200,
        body: { data: args.p_accion === 'CREAR' ? [{ id: '801' }] : [] },
      },
      error: null,
    }),
  );
  const bucket = jest.fn(() => ({ upload, remove }));
  const admin = jest.fn(() => ({ rpc, storage: { from: bucket } }));
  const auth = {
    getUserByAuthId: jest.fn(async () => ({ id: 77, rol: 'ADMIN' })),
    assertCanWrite: jest.fn(),
  };
  const imagen = {
    preparar: jest.fn(async (bytes: Buffer) => ({
      original: bytes,
      derivada: Buffer.from('jpeg sin EXIF'),
      mimeOriginal: 'image/heic',
      hashOriginal: 'a'.repeat(64),
      hashDerivada: 'b'.repeat(64),
    })),
  };
  const service = new PlantacionEvidenciasService(
    { getAdminClient: admin } as unknown as SupabaseService,
    auth as unknown as PlantacionAuthService,
    imagen as unknown as ParticipacionImagenService,
  );
  return { service, upload, remove, rpc, bucket, admin, auth, imagen };
}
const dto = { subcampania_id: 10, es_reposicion: true };
const files = [{ buffer: Buffer.from('original con metadata') }];

describe('PlantacionEvidenciasService privado INT02-D', () => {
  it('contrato viejo/inicial falla409 antes de identidad, DB, decoder y Storage', async () => {
    const h = harness();
    await expect(
      h.service.crearPendienteParaRegistro({}, 'jwt', files),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.auth.getUserByAuthId).not.toHaveBeenCalled();
    expect(h.admin).not.toHaveBeenCalled();
    expect(h.imagen.preparar).not.toHaveBeenCalled();
  });
  it('autoriza ámbito antes de decoder y guarda original/derivada en privado sin metadata del cliente', async () => {
    const h = harness();
    const result = await h.service.crearPendienteParaRegistro(
      dto,
      'jwt',
      files,
    );
    expect(h.rpc.mock.calls.map((call) => call[1].p_accion)).toEqual([
      'AUTORIZAR',
      'CREAR',
    ]);
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      h.imagen.preparar.mock.invocationCallOrder[0],
    );
    expect(h.bucket).toHaveBeenCalledWith('participacion_evidencias');
    expect(h.upload).toHaveBeenCalledTimes(2);
    const foto = h.rpc.mock.calls[1][1].p_payload.fotos[0];
    expect(foto.ruta_original).toMatch(
      /^reposiciones\/77\/10\/[a-f0-9-]{36}\/original$/,
    );
    expect(foto.ruta_derivada).toBe(
      foto.ruta_original.replace('/original', '/derivada.jpg'),
    );
    expect(result).toEqual({
      success: true,
      data: [{ id: '801' }],
      evidencia_ids: [801],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /original|bucket|metadata|public_url/,
    );
  });
  it('rechazo de autoridad no sube archivos y ADMIN no evita la RPC', async () => {
    const h = harness();
    h.rpc.mockResolvedValueOnce({
      data: {
        http_status: 403,
        body: { error: { codigo: 'AUTORIDAD_INSUFICIENTE' } },
      },
      error: null,
    });
    await expect(
      h.service.crearPendienteParaRegistro(dto, 'jwt', files),
    ).rejects.toBeInstanceOf(HttpException);
    expect(h.upload).not.toHaveBeenCalled();
  });
  it('rechaza metadata libre para impedir ámbito/propiedad/derivado elegidos por cliente', async () => {
    const h = harness();
    await expect(
      h.service.crearPendienteParaRegistro(
        { ...dto, metadata: '{"subcampania_id":999}' },
        'jwt',
        files,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.admin).not.toHaveBeenCalled();
  });
  it('respuesta CREAR perdida conserva objetos porque el COMMIT es incierto', async () => {
    const h = harness();
    h.rpc
      .mockResolvedValueOnce({
        data: { http_status: 200, body: { data: {} } },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } });
    await expect(
      h.service.crearPendienteParaRegistro(dto, 'jwt', files),
    ).rejects.toThrow();
    expect(h.remove).not.toHaveBeenCalled();
  });
  it('descarte usa propietario/ámbito DB inclusive ADMIN y solo elimina paths retornados', async () => {
    const h = harness();
    h.rpc.mockResolvedValueOnce({
      data: {
        http_status: 200,
        body: {
          data: [
            {
              id: '801',
              ruta_original: 'reposiciones/77/10/u/original',
              ruta_derivada: 'reposiciones/77/10/u/derivada.jpg',
            },
          ],
        },
      },
      error: null,
    });
    const result = await h.service.descartarPendientesParaRegistro(
      { ...dto, evidencia_ids: [801, 802] },
      'jwt',
    );
    expect(h.rpc).toHaveBeenCalledWith(
      'pa_d_evidencias_reposicion',
      expect.objectContaining({
        p_actor_id: 77,
        p_subcampania_id: 10,
        p_accion: 'DESCARTAR',
      }),
    );
    expect(h.remove).toHaveBeenCalledWith([
      'reposiciones/77/10/u/original',
      'reposiciones/77/10/u/derivada.jpg',
    ]);
    expect(result.data.evidencia_ids_ignoradas).toEqual([802]);
  });
});
