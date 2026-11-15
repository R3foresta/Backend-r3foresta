import { ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import { ViveroAuthService } from '../application/vivero-auth.service';
import { ViveroEvidenciasService } from '../application/vivero-evidencias.service';
import { ViveroTimelineService } from '../application/vivero-timeline.service';
import { TipoEventoVivero as E } from '../domain/enums/tipo-evento-vivero.enum';

function query(data: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest
      .fn()
      .mockResolvedValue({
        data: Array.isArray(data) ? (data[0] ?? null) : data,
        error: null,
      }),
    then: (resolve: any, reject: any) =>
      Promise.resolve({
        data,
        error: null,
        count: Array.isArray(data) ? data.length : data ? 1 : 0,
      }).then(resolve, reject),
  };
}
const foto = {
  mimetype: 'image/jpeg',
  originalname: 'conteo.jpg',
  buffer: Buffer.from('foto'),
};
const solicitud = 'E8ACD7B9-111B-41C3-AB71-A5AB31F00B07';
const ev = {
  id: '9007199254740995',
  bucket: 'vivero_incorporaciones',
  ruta_archivo: 'vivero/incorporaciones/77/conteo.jpg',
};

describe('Fotos T5 privadas y conservación ante incertidumbre', () => {
  let service: ViveroEvidenciasService;
  let rpc: jest.Mock;
  let upload: jest.Mock;
  let remove: jest.Mock;
  let getBucket: jest.Mock;
  let getPublicUrl: jest.Mock;
  let createSignedUrl: jest.Mock;
  let getUserByAuthId: jest.Mock;
  let assertVivero: jest.Mock;
  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue({ data: [ev.id], error: null });
    upload = jest.fn().mockResolvedValue({
      data: { id: '9e98ae22-ed37-4d47-a355-9157a73dcf87' },
      error: null,
    });
    remove = jest.fn().mockResolvedValue({ error: null });
    getPublicUrl = jest.fn();
    createSignedUrl = jest.fn().mockResolvedValue({
      data: { signedUrl: 'https://storage.invalid/signed' },
      error: null,
    });
    getBucket = jest.fn().mockResolvedValue({
      data: { id: 'vivero_incorporaciones', public: false },
      error: null,
    });
    const supabase = {
      getAdminClient: () => ({
        rpc,
        from: (tabla: string) =>
          query(
            tabla === 'tipos_entidad_evidencia'
              ? { id: 9, activo: true }
              : [ev],
          ),
        storage: {
          getBucket,
          from: () => ({ upload, remove, getPublicUrl, createSignedUrl }),
        },
      }),
    } as unknown as SupabaseService;
    getUserByAuthId = jest.fn().mockResolvedValue({ id: '77', rol: 'ADMIN' });
    assertVivero = jest.fn();
    const auth = {
      getUserByAuthId,
      assertVivero,
    } as unknown as ViveroAuthService;
    service = new ViveroEvidenciasService(
      supabase,
      auth,
      new EvidenceFileService(),
    );
  });
  const cargar = (s: ViveroEvidenciasService) =>
    s.crearPendienteParaEvento({ vivero_id: '2' }, 'jwt-auth', [foto], {
      eventoTipo: E.INCORPORACION,
      solicitudId: solicitud,
    });

  it('canonicaliza UUID, conserva BIGINT y firma la foto sin URL pública', async () => {
    const result = await cargar(service);
    expect(upload.mock.calls[0][0]).toContain(
      `/77/${solicitud.toLowerCase()}/`,
    );
    expect(rpc).toHaveBeenCalledWith(
      'm2_incorporacion_evidencias_preparar',
      expect.objectContaining({
        p_solicitud_id: solicitud.toLowerCase(),
        p_vivero_id: '2',
      }),
    );
    expect(result.evidencia_ids).toEqual([ev.id]);
    expect(result.data[0]).toMatchObject({
      signed_url: 'https://storage.invalid/signed',
      url_expira_en_segundos: 300,
    });
    expect(result.data[0]).not.toHaveProperty('public_url');
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
  it.each(['GENERAL', 'VALIDADOR', 'VOLUNTARIO'])(
    'rechaza %s antes de Storage aun con acceso M2',
    async (rol) => {
      getUserByAuthId.mockResolvedValue({ id: '77', rol });
      await expect(cargar(service)).rejects.toThrow(ForbiddenException);
      expect(assertVivero).not.toHaveBeenCalled();
      expect(getBucket).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );
  it('rechaza cuenta inactiva antes de Storage', async () => {
    getUserByAuthId.mockRejectedValue(
      new ForbiddenException('CUENTA_INACTIVA'),
    );
    await expect(cargar(service)).rejects.toThrow(ForbiddenException);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('falla antes de subir si el bucket se volvió público', async () => {
    getBucket.mockResolvedValue({
      data: { id: 'vivero_incorporaciones', public: true },
      error: null,
    });
    await expect(cargar(service)).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });
  it('no elimina objetos si se pierde la respuesta SQL', async () => {
    rpc.mockRejectedValue(new Error('respuesta perdida después del commit'));
    await expect(cargar(service)).rejects.toMatchObject({ status: 503 });
    expect(remove).not.toHaveBeenCalled();
  });
  it('limpia solamente la carga propia ante un rechazo SQL concluyente', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(cargar(service)).rejects.toThrow(ForbiddenException);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0]).toEqual([upload.mock.calls[0][0]]);
  });
  it('permite recuperar fotos pendientes propias con autoridad vigente', async () => {
    rpc.mockResolvedValue({ data: [ev], error: null });
    expect(
      (await service.recuperarPendientesIncorporacion('77', '2', solicitud))
        .evidencia_ids,
    ).toEqual([ev.id]);
    expect(rpc).toHaveBeenCalledWith('m2_incorporacion_evidencias_leer', {
      p_actor_id: '77',
      p_vivero_id: '2',
      p_solicitud_id: solicitud,
    });
  });
});

it('historial T5 conserva nombre del responsable inicial, procedencia y URL privada', async () => {
  const sign = jest.fn().mockResolvedValue({
    data: { signedUrl: 'https://storage.invalid/private' },
    error: null,
  });
  const pub = jest.fn();
  const supabase = {
    getAdminClient: () => ({
      from: (tabla: string) =>
        query(
          {
            lote_vivero: {
              id: '9007199254740993',
              nombre_responsable_snapshot: 'Nombre histórico',
              codigo_trazabilidad: 'VIV-INC-ejemplo',
              estado_lote: 'FINALIZADO',
            },
            evento_lote_vivero: [
              {
                id: '9007199254740994',
                lote_id: '9007199254740993',
                tipo_evento: E.INCORPORACION,
                responsable_id: '77',
                fecha_evento: '2026-11-13',
                created_at: '2026-11-13',
                cantidad_afectada: 100,
                usuario: { nombre: 'Nombre cambiado', apellido: null },
                incorporacion: {
                  modalidad: 'RECEPCION',
                  procedencia: 'COMPRA',
                },
              },
            ],
            tipos_entidad_evidencia: { id: 9 },
            evidencias_trazabilidad: [
              { ...ev, entidad_id: '9007199254740994' },
            ],
          }[tabla],
        ),
      storage: { from: () => ({ createSignedUrl: sign, getPublicUrl: pub }) },
    }),
  } as unknown as SupabaseService;
  const result = await new ViveroTimelineService(supabase).obtenerTimeline(
    '9007199254740993',
    {},
  );
  expect(result.data.eventos[0]).toMatchObject({
    id: '9007199254740994',
    responsable_nombre: 'Nombre histórico',
    payload: {
      tipo: E.INCORPORACION,
      cantidad: 100,
      procedencia: { procedencia: 'COMPRA' },
    },
  });
  expect(result.data.eventos[0].evidencias[0]).toMatchObject({
    signed_url: 'https://storage.invalid/private',
  });
  expect(pub).not.toHaveBeenCalled();
});
