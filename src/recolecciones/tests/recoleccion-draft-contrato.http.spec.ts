import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureGlobalRoutes } from '../../app.routes';
import { InternalActorGuard } from '../../auth/internal-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateUbicacionDto } from '../api/dto/create-ubicacion.dto';
import { UpdateDraftDto } from '../api/dto/update-draft.dto';
import { RecoleccionesController } from '../api/recolecciones.controller';
import { RecoleccionFormDataParser } from '../api/parsers/recoleccion-formdata.parser';
import { RecoleccionesService } from '../application/recolecciones.service';

// Contrato HTTP, multipart, parser y guards reales. La aplicación y la consulta
// del actor están sustituidas; no carga .env ni escribe en servicios externos.
describe('PATCH draft de Recolección: contrato de ubicación y actor', () => {
  let app: INestApplication<Server>;
  const secret = 'recoleccion-draft-contrato-fixture';
  const authId = 'actor-recoleccion-fixture';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });
  const route = '/api/recolecciones/292/draft';
  const fecha = '2026-11-02';
  const ubicacion = { latitud: -16.5, longitud: -68.1 };
  const updateDraft = jest.fn();
  const rpc = jest.fn();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [RecoleccionesController],
      providers: [
        InternalActorGuard,
        RecoleccionFormDataParser,
        { provide: RecoleccionesService, useValue: { updateDraft } },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: () => ({ rpc }),
            getClient: () => {
              throw new Error('El guard no debe usar el cliente público');
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => app?.close());

  beforeEach(() => {
    updateDraft
      .mockReset()
      .mockResolvedValue({ id: 292, estado_registro: 'BORRADOR' });
    rpc.mockReset().mockResolvedValue({
      data: { usuario_id: '7', rol: 'GENERAL', activo: true },
      error: null,
    });
  });

  function patch() {
    return request(app.getHttpServer())
      .patch(route)
      .set('Authorization', `Bearer ${jwt.sign({ sub: authId })}`);
  }

  it('acepta el multipart de la PWA al corregir fecha, sin fotos nuevas, y deriva el actor del JWT', async () => {
    await patch()
      .set('x-user-role', 'ADMIN')
      .field('fecha', fecha)
      .field('cantidad_inicial_canonica', '100')
      .field('unidad_canonica', 'G')
      .field('tipo_material', 'SEMILLA')
      .field('planta_id', '2')
      .field('metodo_id', '1')
      .field('vivero_id', '3')
      .field('ubicacion[latitud]', '-16.5')
      .field('ubicacion[longitud]', '-68.1')
      .field('ubicacion[pais_id]', '1')
      .field('ubicacion[division_id]', '2')
      .field('ubicacion[precision_m]', '8.5')
      .field('ubicacion[fuente]', 'GPS_MOVIL')
      .expect(200);

    expect(rpc).toHaveBeenCalledWith('pa_actor_verificar', {
      p_auth_id: authId,
    });
    expect(updateDraft).toHaveBeenCalledTimes(1);
    const [id, dto, actor, role, fotos] = updateDraft.mock.calls[0];
    expect(id).toBe(292);
    expect(actor).toBe(authId);
    expect(role).toBe('GENERAL');
    expect(fotos ?? []).toEqual([]);
    expect(dto).toBeInstanceOf(UpdateDraftDto);
    expect(dto).toMatchObject({
      fecha,
      cantidad_inicial_canonica: 100,
      planta_id: 2,
      metodo_id: 1,
      vivero_id: 3,
      ubicacion: {
        ...ubicacion,
        pais_id: 1,
        division_id: 2,
        precision_m: 8.5,
        fuente: 'GPS_MOVIL',
      },
    });
    expect(dto.ubicacion).toBeInstanceOf(CreateUbicacionDto);
  });

  it('acepta ubicación anidada en JSON', async () => {
    await patch().send({ fecha, ubicacion }).expect(200);

    const dto = updateDraft.mock.calls[0][1];
    expect(dto.ubicacion).toBeInstanceOf(CreateUbicacionDto);
    expect(dto.ubicacion).toMatchObject(ubicacion);
  });

  it('acepta ubicación serializada como JSON en un campo multipart y normaliza números', async () => {
    await patch()
      .field('fecha', fecha)
      .field(
        'ubicacion',
        JSON.stringify({
          latitud: '-16.5',
          longitud: '-68.1',
          precision_m: '4',
        }),
      )
      .expect(200);

    expect(updateDraft.mock.calls[0][1].ubicacion).toMatchObject({
      ...ubicacion,
      precision_m: 4,
    });
  });

  it('admite una corrección JSON de fecha sin enviar ubicación', async () => {
    await patch().send({ fecha }).expect(200);

    expect(updateDraft.mock.calls[0][1]).toMatchObject({ fecha });
    expect(updateDraft.mock.calls[0][1].ubicacion).toBeUndefined();
  });

  it('admite multipart de fecha sin ubicación ni archivos', async () => {
    await patch().field('fecha', fecha).expect(200);

    const [, dto, , , fotos] = updateDraft.mock.calls[0];
    expect(dto.ubicacion).toBeUndefined();
    expect(fotos ?? []).toEqual([]);
  });

  it.each([
    ['latitud fuera de rango', { latitud: 91, longitud: -68.1 }],
    ['longitud fuera de rango', { latitud: -16.5, longitud: -181 }],
    ['campo anidado desconocido', { ...ubicacion, permiso: 'ADMIN' }],
    ['campo legacy', { ...ubicacion, pais: 'BOLIVIA' }],
    ['sin latitud', { longitud: -68.1 }],
    ['sin longitud', { latitud: -16.5 }],
    ['latitud vacía', { latitud: '', longitud: -68.1 }],
    ['longitud vacía', { latitud: -16.5, longitud: '' }],
    ['latitud con espacios', { latitud: '   ', longitud: -68.1 }],
    ['longitud con espacios', { latitud: -16.5, longitud: '   ' }],
    ['latitud null', { latitud: null, longitud: -68.1 }],
    ['longitud null', { latitud: -16.5, longitud: null }],
    ['latitud booleana', { latitud: true, longitud: -68.1 }],
    ['longitud booleana', { latitud: -16.5, longitud: false }],
    ['null', null],
    ['texto', 'ubicación inválida'],
    ['número', 42],
    ['arreglo', [ubicacion]],
    ['precisión negativa', { ...ubicacion, precision_m: -1 }],
    ['fuente inválida', { ...ubicacion, fuente: 'DESCONOCIDA' }],
  ])('rechaza ubicación inválida: %s', async (_caso, valor) => {
    const response = await patch()
      .send({ fecha, ubicacion: valor })
      .expect(400);

    expect(response.body.message).toEqual(expect.any(String));
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('rechaza campos anidados extra también en multipart con corchetes', async () => {
    await patch()
      .field('fecha', fecha)
      .field('ubicacion[latitud]', '-16.5')
      .field('ubicacion[longitud]', '-68.1')
      .field('ubicacion[permiso]', 'ADMIN')
      .expect(400);

    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('conserva el rechazo de propiedades desconocidas en la raíz', async () => {
    await patch().send({ fecha, usuario_id: 999 }).expect(400);

    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('rechaza la petición sin Bearer aunque incluya x-auth-id', async () => {
    await request(app.getHttpServer())
      .patch(route)
      .set('x-auth-id', authId)
      .send({ fecha, ubicacion })
      .expect(401);

    expect(rpc).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('rechaza un x-auth-id que no coincida con el JWT', async () => {
    await patch()
      .set('x-auth-id', 'otro-actor')
      .send({ fecha, ubicacion })
      .expect(401);

    expect(rpc).not.toHaveBeenCalled();
    expect(updateDraft).not.toHaveBeenCalled();
  });

  it('conserva el gate interno aunque el cliente declare ADMIN', async () => {
    rpc.mockResolvedValueOnce({
      data: { usuario_id: '7', rol: 'VOLUNTARIO', activo: true },
      error: null,
    });
    await patch()
      .set('x-user-role', 'ADMIN')
      .send({ fecha, ubicacion })
      .expect(403);

    expect(updateDraft).not.toHaveBeenCalled();
  });
});
