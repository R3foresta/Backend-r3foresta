import { SupabaseService } from '../supabase/supabase.service';
import { leerPresentacionPlantas } from './planta-presentacion';

describe('Nombres operativos de plantas', () => {
  const query = jest.fn();
  const from = jest.fn(() => ({ select: () => ({ in: query }) }));
  const supabase = {
    getAdminClient: () => ({ from }),
  } as unknown as SupabaseService;
  beforeEach(() => {
    query.mockReset();
    from.mockClear();
  });
  it.each([null, '', '   '])(
    'usa científico si común es %p, nunca familia/especie',
    async (common) => {
      query.mockResolvedValue({
        data: [
          {
            id: 50,
            especie: 'Araceae',
            nombre_comun_principal: common,
            nombre_cientifico: ' Pistia stratiotes ',
            imagen_url: null,
          },
        ],
        error: null,
      });
      expect(
        (await leerPresentacionPlantas(supabase, ['50'])).get('50')?.nombre,
      ).toBe('Pistia stratiotes');
    },
  );
  it('prioriza común, conserva foto y consulta sólo IDs pedidos sin filtrar plantas inactivas', async () => {
    query.mockResolvedValue({
      data: [
        {
          id: '9007199254740993',
          especie: 'Araceae',
          nombre_comun_principal: ' Lechuga de agua ',
          nombre_cientifico: 'Pistia stratiotes',
          imagen_url: 'https://example.com/planta.jpg',
        },
      ],
      error: null,
    });
    const result = await leerPresentacionPlantas(supabase, [
      '9007199254740993',
      '9007199254740993',
    ]);
    expect(query).toHaveBeenCalledWith('id', ['9007199254740993']);
    expect(result.get('9007199254740993')).toMatchObject({
      nombre: 'Lechuga de agua',
      imagen_url: 'https://example.com/planta.jpg',
    });
  });
  it.each([
    { data: null, error: { message: 'private' } },
    { data: [], error: null },
  ])('no oculta errores o metadatos incompletos', async (response) => {
    query.mockResolvedValue(response);
    await expect(leerPresentacionPlantas(supabase, [50])).rejects.toMatchObject(
      { status: 503 },
    );
  });
  it('no consulta un catálogo completo para un plan vacío', async () => {
    expect((await leerPresentacionPlantas(supabase, [])).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});
