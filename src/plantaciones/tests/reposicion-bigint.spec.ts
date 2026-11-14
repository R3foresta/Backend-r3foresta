import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { ParticipacionImagenService } from '../../participacion/cargas/participacion-imagen.service';
import { CrearEvidenciaPendientePlantacionDto } from '../api/dto/crear-evidencia-pendiente-plantacion.dto';
import { DescartarEvidenciasPendientesPlantacionDto } from '../api/dto/descartar-evidencias-pendientes-plantacion.dto';
import { RegistrarPlantacionDto } from '../api/dto/registrar-plantacion.dto';
import { PlantacionAuthService } from '../application/plantacion-auth.service';
import { PlantacionCreationService } from '../application/plantacion-creation.service';
import { PlantacionEvidenciasService } from '../application/plantacion-evidencias.service';
import { CoresponsablesPolicy } from '../domain/policies/coresponsables.policy';
import { DetallesPlantacionPolicy } from '../domain/policies/detalles.policy';
import { ReposicionPolicy } from '../domain/policies/reposicion.policy';

const compra = '9007199255741000';
const donacion = '9007199255741001';
const vecinoFoto = '9007199255741003';
const actorId = '9007199255741005';
const request = () => ({
  subcampania_id: '9007199255741007',
  es_reposicion: true,
  registro_plantacion_origen_id: '9007199255741009',
  fecha_plantacion: '2026-11-14',
  latitud: -16.5,
  longitud: -68.1,
  coresponsable_ids: [actorId, compra, donacion],
  detalles: [
    {
      asignacion_id: donacion,
      lote_vivero_id: donacion,
      planta_id: '9223372036854775807',
      cantidad: 1,
    },
  ],
  evidencia_ids: [donacion, vecinoFoto],
});
const validar = (input: unknown) => {
  const dto = plainToInstance(RegistrarPlantacionDto, input);
  return {
    dto,
    errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
  };
};

describe('Reposición T5: frontera DTO y reglas puras con BIGINT', () => {
  it('conserva el vecino DONACION exacto desde plainToInstance hasta la política real', () => {
    // Estos dos IDs se hacían iguales al convertirlos a Number antes de validar.
    expect(Number(compra)).toBe(Number(donacion));
    const { dto, errors } = validar(request());
    expect(errors).toEqual([]);
    expect(dto.detalles[0]).toMatchObject({
      asignacion_id: donacion,
      lote_vivero_id: donacion,
      planta_id: '9223372036854775807',
    });
    expect(() =>
      DetallesPlantacionPolicy.assertValidos(dto.detalles),
    ).not.toThrow();
    expect(() =>
      ReposicionPolicy.assertCoherencia(
        true,
        dto.registro_plantacion_origen_id,
      ),
    ).not.toThrow();
    expect(
      CoresponsablesPolicy.normalizar(dto.coresponsable_ids, actorId),
    ).toEqual([compra, donacion]);
  });

  it('conserva compatibilidad con números seguros normalizándolos a cadenas exactas', () => {
    const { dto, errors } = validar({
      ...request(),
      subcampania_id: 7,
      registro_plantacion_origen_id: 8,
      coresponsable_ids: [9],
      detalles: [
        { asignacion_id: 10, lote_vivero_id: 11, planta_id: 12, cantidad: 1 },
      ],
      evidencia_ids: [13],
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({
      subcampania_id: '7',
      registro_plantacion_origen_id: '8',
      coresponsable_ids: ['9'],
      detalles: [
        {
          asignacion_id: '10',
          lote_vivero_id: '11',
          planta_id: '12',
          cantidad: 1,
        },
      ],
      evidencia_ids: ['13'],
    });
  });

  it.each(['asignacion_id', 'lote_vivero_id', 'planta_id'] as const)(
    'rechaza un número JSON ya redondeado en %s antes de llegar a SQL',
    (field) => {
      const input = request();
      input.detalles[0][field] = Number(donacion) as any;
      expect(validar(input).errors.length).toBeGreaterThan(0);
      expect(() =>
        DetallesPlantacionPolicy.assertValidos(input.detalles),
      ).toThrow();
    },
  );
  it.each([
    '0',
    '-1',
    '1.0',
    '1e3',
    '001',
    '9223372036854775808',
    true,
    null,
    '',
  ])('rechaza ID no canónico o fuera de BIGINT: %j', (value) => {
    const input = request();
    input.detalles[0].asignacion_id = value as any;
    expect(validar(input).errors.length).toBeGreaterThan(0);
    expect(() =>
      DetallesPlantacionPolicy.assertValidos(input.detalles),
    ).toThrow();
  });
  it.each([
    'subcampania_id',
    'registro_plantacion_origen_id',
    'coresponsable_ids',
    'evidencia_ids',
  ] as const)('rechaza un número inseguro en la frontera %s', (field) => {
    const value = Number(donacion);
    const input = {
      ...request(),
      [field]: field.endsWith('_ids') ? [value] : value,
    };
    expect(validar(input).errors.length).toBeGreaterThan(0);
  });
  it('deduplica números y cadenas seguros sin confundir dos vecinos grandes', () => {
    expect(
      CoresponsablesPolicy.normalizar(
        [1, '1', compra, donacion, actorId],
        actorId,
      ),
    ).toEqual(['1', compra, donacion]);
    expect(() =>
      DetallesPlantacionPolicy.assertValidos([
        { asignacion_id: 1, lote_vivero_id: 2, planta_id: 3, cantidad: 1 },
        {
          asignacion_id: '1',
          lote_vivero_id: '2',
          planta_id: '3',
          cantidad: 1,
        },
      ]),
    ).toThrow();
  });
});

function auth() {
  return {
    getUserByAuthId: jest.fn(async () => ({ id: actorId, rol: 'GENERAL' })),
    assertCanWrite: jest.fn(),
  } as unknown as PlantacionAuthService;
}

describe('Reposición T5: identidad de entrada y salida de la RPC privada106', () => {
  const respuesta = () => ({
    registro_plantacion_id: vecinoFoto,
    codigo_trazabilidad: 'PLT-SINTETICO',
    cantidad_total_plantada: 1,
    gps_dentro_poligono: true,
    gps_distancia_a_poligono_m: null,
    consumos: [
      {
        asignacion_id: donacion,
        lote_vivero_id: donacion,
        cantidad_consumida: 1,
        saldo_asignado_antes: 5,
        saldo_asignado_despues: 4,
        estado_final: 'ACTIVA',
      },
    ],
    coresponsable_ids_vinculados: [compra, donacion],
    evidencia_ids_vinculadas: [donacion, vecinoFoto],
  });
  function crear(row = respuesta()) {
    const single = jest.fn(async () => ({ data: row, error: null }));
    const rpc = jest.fn(() => ({ single }));
    const service = new PlantacionCreationService(
      { getAdminClient: () => ({ rpc }) } as unknown as SupabaseService,
      auth(),
    );
    return { service, rpc };
  }
  it('envía DONACION y devuelve cada ID sin redondear, en una sola RPC', async () => {
    const h = crear();
    const { dto, errors } = validar(request());
    expect(errors).toEqual([]);
    const result = await h.service.registrar(dto, 'auth-verificado');
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc).toHaveBeenCalledWith(
      'fn_m3_registrar_plantacion_exacto',
      expect.objectContaining({
        p_subcampania_id: dto.subcampania_id,
        p_registro_plantacion_origen_id: dto.registro_plantacion_origen_id,
        p_responsable_id: actorId,
        p_coresponsable_ids: [compra, donacion],
        p_detalles: [
          {
            asignacion_id: donacion,
            lote_vivero_id: donacion,
            planta_id: '9223372036854775807',
            cantidad: 1,
          },
        ],
        p_evidencia_ids: [donacion, vecinoFoto],
      }),
    );
    expect(result.data).toMatchObject({
      registro_plantacion_id: vecinoFoto,
      consumos: [
        {
          asignacion_id: donacion,
          lote_vivero_id: donacion,
          cantidad_consumida: 1,
        },
      ],
      coresponsable_ids_vinculados: [compra, donacion],
      evidencia_ids_vinculadas: [donacion, vecinoFoto],
    });
  });
  it('el servicio tampoco acepta un detalle inseguro si se invoca sin DTO HTTP', async () => {
    const h = crear();
    const input = request();
    input.detalles[0].lote_vivero_id = Number(donacion) as any;
    await expect(h.service.registrar(input, 'auth-verificado')).rejects.toThrow(
      BadRequestException,
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('si el transporte ya perdió la precisión de una respuesta confirmada informa503', async () => {
    const row = respuesta();
    row.consumos[0].asignacion_id = Number(donacion) as any;
    const h = crear(row);
    await expect(
      h.service.registrar(request(), 'auth-verificado'),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
});

describe('Reposición T5: fotos y descarte con IDs exactos', () => {
  function harness() {
    const rpc = jest.fn(async (_name: string, args: any) => ({
      data: {
        http_status: args.p_accion === 'CREAR' ? 201 : 200,
        body: {
          data:
            args.p_accion === 'CREAR'
              ? [{ id: vecinoFoto }]
              : args.p_accion === 'DESCARTAR'
                ? [
                    {
                      id: donacion,
                      ruta_original: 'reposiciones/propia/original',
                      ruta_derivada: 'reposiciones/propia/derivada.jpg',
                    },
                  ]
                : {},
        },
      },
      error: null,
    }));
    const upload = jest.fn(async () => ({ error: null }));
    const remove = jest.fn(async () => ({ error: null }));
    const service = new PlantacionEvidenciasService(
      {
        getAdminClient: () => ({
          rpc,
          storage: { from: () => ({ upload, remove }) },
        }),
      } as unknown as SupabaseService,
      auth(),
      {
        preparar: async (original: Buffer) => ({
          original,
          derivada: Buffer.from('jpeg'),
          mimeOriginal: 'image/jpeg',
          hashOriginal: 'a'.repeat(64),
          hashDerivada: 'b'.repeat(64),
        }),
      } as unknown as ParticipacionImagenService,
    );
    return { service, rpc, upload, remove };
  }
  it('el multipart conserva ámbito y resultado grandes sin cambiar identidad', async () => {
    const dto = plainToInstance(CrearEvidenciaPendientePlantacionDto, {
      subcampania_id: donacion,
      es_reposicion: 'true',
    });
    expect(validateSync(dto)).toEqual([]);
    const h = harness();
    const result = await h.service.crearPendienteParaRegistro(
      dto,
      'auth-verificado',
      [{ buffer: Buffer.from('imagen') }],
    );
    expect(result.evidencia_ids).toEqual([vecinoFoto]);
    expect(h.rpc.mock.calls[0]).toEqual([
      'pa_d_evidencias_reposicion_exacto',
      expect.objectContaining({
        p_actor_id: actorId,
        p_subcampania_id: donacion,
        p_accion: 'AUTORIZAR',
      }),
    ]);
    expect(h.upload.mock.calls[0][0]).toContain(`/${actorId}/${donacion}/`);
  });
  it('descarte conserva vecino ignorado y borra sólo los paths autorizados por SQL', async () => {
    const dto = plainToInstance(DescartarEvidenciasPendientesPlantacionDto, {
      subcampania_id: donacion,
      es_reposicion: true,
      evidencia_ids: [compra, donacion],
    });
    expect(validateSync(dto)).toEqual([]);
    const h = harness();
    const result = await h.service.descartarPendientesParaRegistro(
      dto,
      'auth-verificado',
    );
    expect(h.rpc).toHaveBeenCalledWith(
      'pa_d_evidencias_reposicion_exacto',
      expect.objectContaining({
        p_subcampania_id: donacion,
        p_accion: 'DESCARTAR',
        p_payload: { evidencia_ids: [compra, donacion] },
      }),
    );
    expect(result.data).toEqual({
      evidencia_ids_descartadas: [donacion],
      evidencia_ids_ignoradas: [compra],
    });
    expect(h.remove).toHaveBeenCalledWith([
      'reposiciones/propia/original',
      'reposiciones/propia/derivada.jpg',
    ]);
  });
  it('un ID de foto ya redondeado es inválido antes del descarte SQL/Storage', async () => {
    const h = harness();
    await expect(
      h.service.descartarPendientesParaRegistro(
        {
          subcampania_id: donacion,
          es_reposicion: true,
          evidencia_ids: [Number(donacion)],
        },
        'auth-verificado',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });
});
