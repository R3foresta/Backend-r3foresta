import { NotFoundException } from '@nestjs/common';
import type { ParticipacionImagenService } from '../../participacion/cargas/participacion-imagen.service';
import type { SupabaseService } from '../../supabase/supabase.service';
import { ImpactoImagenPropiaService } from './impacto-imagen-propia.service';

const actor = {
  usuario_id: '42',
  auth_id: 'actor-verificado',
  rol: 'VOLUNTARIO',
} as const;
const ruta = '42/comando/carga/1/derivada.jpg';
const material = (legada = false) => ({
  data: {
    data: {
      bucket: legada ? 'recoleccion_fotos' : 'participacion_evidencias',
      ruta: legada ? 'historicas/1/foto.jpg' : ruta,
      legada,
    },
  },
  error: null,
});

describe('ImpactoImagenPropiaService', () => {
  let rpc: jest.Mock;
  let download: jest.Mock;
  let prepararPublica: jest.Mock;
  let service: ImpactoImagenPropiaService;
  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue(material());
    download = jest.fn().mockResolvedValue({
      data: new Blob([Buffer.from('JPEG')], { type: 'image/jpeg' }),
      error: null,
    });
    prepararPublica = jest.fn(async (load: () => Promise<Buffer>) => {
      await load();
      return Buffer.from('JPEG limpio');
    });
    service = new ImpactoImagenPropiaService(
      {
        getAdminClient: () => ({
          rpc,
          storage: { from: () => ({ download }) },
        }),
      } as unknown as SupabaseService,
      { prepararPublica } as unknown as ParticipacionImagenService,
    );
  });

  it('revalida actor y evidencia antes de descargar una derivada privada', async () => {
    await expect(service.imagen(actor, '100', '900')).resolves.toEqual(
      Buffer.from('JPEG'),
    );
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('pa_foto_propia_leer', {
      p_actor_id: '42',
      p_auth_id: 'actor-verificado',
      p_registro_id: '100',
      p_evidencia_id: '900',
    });
    expect(download).toHaveBeenCalledWith(ruta);
    expect(prepararPublica).not.toHaveBeenCalled();
  });

  it('no descarga Storage ante registro ajeno o evidencia ajena', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PT404' } });
    await expect(service.imagen(actor, '100', '901')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('revalida antes de Storage cuando la relación desaparece', async () => {
    rpc.mockResolvedValueOnce(material()).mockResolvedValueOnce({
      data: null,
      error: { code: 'PT404' },
    });
    await expect(service.imagen(actor, '100', '900')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('sanitiza foto histórica después de revalidar y descargar', async () => {
    rpc.mockResolvedValue(material(true));
    await expect(service.imagen(actor, '100', '900')).resolves.toEqual(
      Buffer.from('JPEG limpio'),
    );
    expect(prepararPublica).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith('historicas/1/foto.jpg');
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('rechaza rutas inesperadas sin leer Storage ni revelar ruta', async () => {
    rpc.mockResolvedValue({
      data: {
        bucket: 'participacion_evidencias',
        ruta: '../original',
        legada: false,
      },
      error: null,
    });
    await expect(service.imagen(actor, '100', '900')).rejects.toMatchObject({
      status: 503,
    });
    expect(download).not.toHaveBeenCalled();
  });

  it.each(['PT401', 'PT403'])(
    'conserva sesión no disponible para %s',
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(service.imagen(actor, '100', '900')).rejects.toMatchObject({
        status: Number(code.slice(2)),
      });
      expect(download).not.toHaveBeenCalled();
    },
  );
});
