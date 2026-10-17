import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupabaseService } from '../../supabase/supabase.service';
import { GuardarPlanDto } from '../api/dto/guardar-plan.dto';
import { SubcampaniasAuthService } from '../application/subcampanias-auth.service';
import { SubcampaniasPlanService } from '../application/subcampanias-plan.service';

const metas = [
  { planta_id: 1, porcentaje_objetivo: 60, cantidad_objetivo: 300 },
  { planta_id: 2, porcentaje_objetivo: 40, cantidad_objetivo: 200 },
];
const revision: GuardarPlanDto = {
  meta_total_arboles: 500,
  revision_esperada: 4,
  metas,
};
const snapshot = {
  subcampania_id: 1,
  estado: 'ACTIVA',
  meta_total_arboles: 500,
  plan_revision: 5,
  metas,
};

function setup(
  error: { code: string; message: string } | null = null,
  rol = 'ADMIN',
) {
  const rpc = jest
    .fn()
    .mockResolvedValue({ data: error ? null : snapshot, error });
  const from = jest.fn();
  const supabase = {
    getAdminClient: jest.fn().mockReturnValue({ rpc }),
    getClient: jest.fn().mockReturnValue({ from }),
  } as unknown as SupabaseService;
  const auth = {
    getAuthenticatedUser: jest
      .fn()
      .mockResolvedValue({ id: 3, nombre: 'Admin', rol }),
    assertAdmin: jest.fn().mockImplementation((r: string) => {
      if (r !== 'ADMIN') throw new ForbiddenException();
    }),
  } as unknown as SubcampaniasAuthService;
  return {
    service: new SubcampaniasPlanService(supabase, auth),
    rpc,
    from,
    auth,
  };
}

describe('SubcampaniasPlanService', () => {
  it('guarda meta, especies, actor y versión con una sola RPC para ACTIVA', async () => {
    const { service, rpc, from } = setup();
    const result = await service.guardar(1, revision, 'auth-1');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_subcampania_revisar_plan', {
      p_subcampania_id: 1,
      p_meta_total_arboles: 500,
      p_revision_esperada: 4,
      p_metas: metas,
      p_actor_user_id: 3,
    });
    expect(from).not.toHaveBeenCalled();
    expect(result.data).toMatchObject(snapshot);
  });

  it('preserva payload de BORRADOR {metas} vinculándolo a la versión al inicio de la petición', async () => {
    const { service, rpc } = setup();
    await service.guardar(1, { metas }, 'auth-1');
    expect(rpc).toHaveBeenCalledWith(
      'fn_subcampania_revisar_plan',
      expect.objectContaining({
        p_meta_total_arboles: null,
        p_revision_esperada: snapshot.plan_revision,
        p_metas: metas,
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(1, 'fn_subcampania_obtener_plan', {
      p_subcampania_id: 1,
    });
  });

  it('lee meta, versión y especies mediante un único snapshot', async () => {
    const { service, rpc, from } = setup();
    await expect(service.obtener(1, 'auth-1')).resolves.toEqual({
      success: true,
      data: snapshot,
    });
    expect(rpc).toHaveBeenCalledWith('fn_subcampania_obtener_plan', {
      p_subcampania_id: 1,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('devuelve 404 si el snapshot no encuentra la subcampaña', async () => {
    const { service, rpc } = setup();
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(service.obtener(99, 'auth-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it.each(['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO', 'COORDINADOR'])(
    'permite leer el plan a un usuario existente con rol %s',
    async (rol) => {
      const { service, auth } = setup(null, rol);
      await expect(service.obtener(1, 'auth-1')).resolves.toHaveProperty(
        'data',
        snapshot,
      );
      expect(auth.getAuthenticatedUser).toHaveBeenCalledWith('auth-1');
      expect(auth.assertAdmin).not.toHaveBeenCalled();
    },
  );

  it.each(['lectura', 'escritura'])(
    'no accede al plan si la sesión tiene un usuario inexistente en %s',
    async (operacion) => {
      const { service, rpc, auth } = setup();
      jest
        .mocked(auth.getAuthenticatedUser)
        .mockRejectedValue(new UnauthorizedException());
      await expect(
        operacion === 'lectura'
          ? service.obtener(1, 'ghost')
          : service.guardar(1, revision, 'ghost'),
      ).rejects.toThrow(UnauthorizedException);
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each(['GENERAL', 'VALIDADOR', 'VOLUNTARIO', 'COORDINADOR'])(
    'rechaza rol %s antes de acceder a la RPC',
    async (rol) => {
      const { service, rpc } = setup(null, rol);
      await expect(service.guardar(1, revision, 'auth-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['plan vacío', { ...revision, metas: [] }],
    ['especies repetidas', { ...revision, metas: [metas[0], metas[0]] }],
    [
      'suma porcentajes',
      {
        ...revision,
        metas: [{ ...metas[0], porcentaje_objetivo: 59 }, metas[1]],
      },
    ],
    ['suma cantidades', { ...revision, meta_total_arboles: 501 }],
    [
      'objetivo cero',
      { ...revision, metas: [{ ...metas[0], cantidad_objetivo: 0 }, metas[1]] },
    ],
    [
      'objetivo fraccionario',
      {
        ...revision,
        metas: [{ ...metas[0], cantidad_objetivo: 300.5 }, metas[1]],
      },
    ],
    [
      'especie inválida',
      { ...revision, metas: [{ ...metas[0], planta_id: -1 }, metas[1]] },
    ],
    [
      'porcentaje cero',
      {
        ...revision,
        metas: [{ ...metas[0], porcentaje_objetivo: 0 }, metas[1]],
      },
    ],
    [
      'porcentaje precisión',
      {
        ...revision,
        metas: [{ ...metas[0], porcentaje_objetivo: 60.001 }, metas[1]],
      },
    ],
    ['meta negativa', { ...revision, meta_total_arboles: -1 }],
    ['meta fuera de rango', { ...revision, meta_total_arboles: 2147483648 }],
    ['versión negativa', { ...revision, revision_esperada: -1 }],
    ['versión fraccionaria', { ...revision, revision_esperada: 0.5 }],
  ])('rechaza %s sin escrituras', async (_label, dto) => {
    const { service, rpc } = setup();
    await expect(
      service.guardar(1, dto as GuardarPlanDto, 'auth-1'),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('acepta porcentajes de dos decimales cuya suma es exactamente 100', async () => {
    const { service } = setup();
    await expect(
      service.guardar(
        1,
        {
          meta_total_arboles: 3,
          revision_esperada: 0,
          metas: [33.33, 33.33, 33.34].map((porcentaje_objetivo, index) => ({
            planta_id: index + 1,
            cantidad_objetivo: 1,
            porcentaje_objetivo,
          })),
        },
        'auth-1',
      ),
    ).resolves.toHaveProperty('success', true);
  });

  it.each([
    ['PT404', NotFoundException, 'Subcampaña no encontrada'],
    ['PT403', ForbiddenException, 'Solo ADMIN'],
    ['PT409', ConflictException, 'Revisión obsoleta'],
    [
      'PT422',
      UnprocessableEntityException,
      'Especie con stock inicial disponible',
    ],
    [
      'PT422',
      UnprocessableEntityException,
      'Especie con plantación inicial registrada',
    ],
    ['PT422', UnprocessableEntityException, 'Estado COMPLETADA no editable'],
    ['PT422', UnprocessableEntityException, 'Estado CANCELADA no editable'],
    ['23503', BadRequestException, 'Especie no existe'],
    ['PGRST202', InternalServerErrorException, 'RPC ausente'],
    ['P0001', InternalServerErrorException, 'Fallo al insertar auditoría'],
  ])(
    'propaga %s (%s) sin escrituras alternativas',
    async (code, exception, message) => {
      const { service, rpc, from } = setup({ code, message });
      await expect(service.guardar(1, revision, 'auth-1')).rejects.toThrow(
        exception,
      );
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(from).not.toHaveBeenCalled();
    },
  );
});

describe('GuardarPlanDto', () => {
  it('acepta la revisión completa y el contrato BORRADOR histórico', async () => {
    expect(await validate(plainToInstance(GuardarPlanDto, revision))).toEqual(
      [],
    );
    expect(await validate(plainToInstance(GuardarPlanDto, { metas }))).toEqual(
      [],
    );
  });

  it.each([
    { ...revision, meta_total_arboles: null },
    { ...revision, revision_esperada: null },
    { ...revision, revision_esperada: -1 },
    { ...revision, metas: [{ ...metas[0], porcentaje_objetivo: 60.001 }] },
  ])(
    'rechaza tipos o valores inválidos en el contrato HTTP',
    async (payload) => {
      expect(
        (await validate(plainToInstance(GuardarPlanDto, payload))).length,
      ).toBeGreaterThan(0);
    },
  );
});

// Un aborto técnico no es un rechazo de negocio ni autoriza repetir a ciegas.
it.each(['55P03', '57014', '40P01', '40001'])(
  'INT02-D: %s devuelve 503 inconcluso',
  async (code) => {
    const { service } = setup({ code, message: 'abort concurrente' });
    const action = service.guardar(1, revision, 'auth-1');
    await expect(action).rejects.toMatchObject({
      response: {
        error: {
          codigo: 'RESULTADO_NO_DETERMINADO',
          resultado_concluyente: false,
        },
      },
      status: 503,
    });
  },
);
