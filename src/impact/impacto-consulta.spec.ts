import { HttpException } from '@nestjs/common';
import { ImpactoConsultaService } from './application/impacto-consulta.service';
import { parseImpactoQuery } from './impacto-consulta.dto';
import { validarImpacto } from './domain/policies/impacto-proyeccion.policy';

const vacio = () => ({
  data: {
    indicadores: {
      plantacion_inicial: 0,
      reposiciones: 0,
      bajas_reportadas: 0,
      registros: 0,
    },
    campanias: [],
    subcampanias: [],
    mapa: [],
    registros: [],
    siguiente_cursor: null,
  },
});

describe('Consulta INT05: entradas y frontera de proyección', () => {
  it('conserva BIGINT como cadena y valida fechas y límite', () => {
    expect(
      parseImpactoQuery(
        {
          campania_id: '9223372036854775807',
          desde: '2026-10-01',
          hasta: '2026-10-17',
          limite: '100',
        },
        'global',
      ),
    ).toEqual({
      campania_id: '9223372036854775807',
      desde: '2026-10-01',
      hasta: '2026-10-17',
      limite: 100,
    });
    expect(parseImpactoQuery({}, 'propio')).toEqual({ limite: 20 });
  });
  it.each([
    [{ actor_id: '800' }, 'propio'],
    [{ usuario_id: '800' }, 'global'],
    [{ campania_id: '1' }, 'campania'],
    [{ subcampania_id: '1' }, 'subcampania'],
    [{ limite: '1' }, 'registro'],
    [{ desde: '2026-02-30' }, 'global'],
    [{ desde: '2026-10-17', hasta: '2026-10-01' }, 'global'],
    [{ cursor: '9223372036854775808' }, 'global'],
    [{ cursor: ['1', '2'] }, 'global'],
    [{ limite: '101' }, 'global'],
    [{ limite: 20 }, 'global'],
    [{ campania_id: '01' }, 'global'],
  ] as const)('rechaza query fuera del contrato %j en %s', (query, nivel) => {
    expect(() => parseImpactoQuery(query, nivel)).toThrow(HttpException);
  });
  it('falla cerrada ante campos privados incluso claves heredadas de Object', () => {
    for (const key of ['stock', 'observaciones', 'constructor', '__proto__']) {
      const body = vacio();
      Object.defineProperty(body.data, key, {
        value: { secreto: 'privado' },
        enumerable: true,
      });
      expect(() => validarImpacto(body, 'ImpactoConsultaRespuesta')).toThrow();
    }
    expect(() =>
      validarImpacto(vacio(), 'ImpactoConsultaRespuesta'),
    ).not.toThrow();
  });
  it('rechaza indicadores no finitos o cantidades ambiguas', () => {
    for (const value of [
      NaN,
      Infinity,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      '50',
    ]) {
      const body = vacio();
      body.data.indicadores.plantacion_inicial = value as number;
      expect(() => validarImpacto(body, 'ImpactoConsultaRespuesta')).toThrow();
    }
  });
  it('rechaza fechas normalizadas y relaciones duplicadas de SQL', () => {
    const body = {
      data: {
        registros: [
          {
            id: '1',
            subcampania_id: '2',
            fecha_plantacion: '2026-02-30',
            codigo_trazabilidad: 'PLT-1',
            cantidad_total_plantada: 30,
            es_reposicion: false,
            relaciones: ['AUTOR'],
            url_publica: '/api/v1/impact/registros/1',
            url_detalle_propio: '/api/v1/plantaciones/1/detalle-propio',
          },
        ],
        siguiente_cursor: null,
      },
    };
    expect(() => validarImpacto(body, 'MisRegistrosRespuesta')).toThrow();
    body.data.registros[0].fecha_plantacion = '2026-10-17';
    body.data.registros[0].relaciones = ['AUTOR', 'AUTOR'];
    expect(() => validarImpacto(body, 'MisRegistrosRespuesta')).toThrow();
    body.data.registros[0].relaciones = ['AUTOR', 'PARTICIPANTE'];
    expect(() => validarImpacto(body, 'MisRegistrosRespuesta')).not.toThrow();
  });
});

describe('ImpactoConsultaService', () => {
  const actor = {
    usuario_id: '801',
    auth_id: 'sesion-verificada',
    rol: 'VOLUNTARIO',
  };
  let rpc: jest.Mock;
  let service: ImpactoConsultaService;
  beforeEach(() => {
    rpc = jest.fn().mockResolvedValue({ data: vacio(), error: null });
    service = new ImpactoConsultaService({
      getAdminClient: () => ({ rpc }),
      getClient: () => {
        throw new Error('público');
      },
    } as any);
  });
  it('consulta pública no transmite actor ni JWT', async () => {
    await expect(service.publico({ limite: 20 })).resolves.toEqual(vacio());
    expect(rpc.mock.calls[0][0]).toBe('pa_impacto_leer');
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_actor_id');
  });
  it('lista propia obtiene identidad solo del actor verificado', async () => {
    rpc.mockResolvedValue({
      data: { data: { registros: [], siguiente_cursor: null } },
      error: null,
    });
    await service.propios(actor, { limite: 1, cursor: '50' });
    expect(rpc).toHaveBeenCalledWith('pa_mis_registros_leer', {
      p_actor_id: '801',
      p_auth_id: 'sesion-verificada',
      p_limite: 1,
      p_cursor: '50',
    });
  });
  it.each([
    { data: null, error: { message: 'SQL SECRETO' } },
    { data: { ...vacio(), bucket: 'privado' }, error: null },
    { data: { data: { stock: 999 } }, error: null },
  ])('no publica fallos ni campos imprevistos', async (response) => {
    rpc.mockResolvedValue(response);
    try {
      await service.publico({ limite: 20 });
      throw new Error('Debe fallar');
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(503);
      expect(
        JSON.stringify((error as HttpException).getResponse()),
      ).not.toMatch(/SECRETO|bucket|stock/);
    }
  });
  it('mantiene404 uniforme sin publicar detalle SQL', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'PT404', details: 'secreto' },
    });
    await expect(service.publico({ limite: 20 }, '999')).rejects.toMatchObject({
      status: 404,
    });
  });
});
