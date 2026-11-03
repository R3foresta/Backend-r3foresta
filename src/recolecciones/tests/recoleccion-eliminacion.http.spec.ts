import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureGlobalRoutes } from '../../app.routes';
import { InternalActorGuard } from '../../auth/internal-actor.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionesController } from '../api/recolecciones.controller';
import { RecoleccionFormDataParser } from '../api/parsers/recoleccion-formdata.parser';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionCreationService } from '../application/recoleccion-creation.service';
import { RecoleccionDesechoService } from '../application/recoleccion-desecho.service';
import { RecoleccionDraftService } from '../application/recoleccion-draft.service';
import { RecoleccionEliminacionService } from '../application/recoleccion-eliminacion.service';
import { RecoleccionValidacionService } from '../application/recoleccion-validacion.service';
import { RecoleccionesService } from '../application/recolecciones.service';

// Guard JWT, controller, orquestador y caso de uso reales; RPC sustituida.
// Las reglas/transacción/locks SQL se verifican además en el runner aislado 089.
describe('DELETE /api/recolecciones/:id', () => {
  let app: INestApplication<Server>;
  const secret = 'recoleccion-eliminacion-fixture';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });
  const rpc = jest.fn();
  const publicClient = jest.fn(() => {
    throw new Error('Cliente público prohibido');
  });
  const result = {
    recoleccion_id: 292,
    eliminado_en: '2026-11-03',
    eliminado_por_usuario_id: 7,
  };
  let sqlError: { code: string; message: string } | null;
  let active: boolean;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [RecoleccionesController],
      providers: [
        InternalActorGuard,
        RecoleccionesService,
        RecoleccionEliminacionService,
        { provide: ConfigService, useValue: { get: () => secret } },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: () => ({ rpc }),
            getClient: publicClient,
          },
        },
        ...[
          RecoleccionFormDataParser,
          RecoleccionConsultasService,
          RecoleccionCreationService,
          RecoleccionDesechoService,
          RecoleccionDraftService,
          RecoleccionValidacionService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    sqlError = null;
    active = true;
    publicClient.mockClear();
    rpc
      .mockReset()
      .mockImplementation((name: string, params: { p_auth_id?: string }) =>
        Promise.resolve(
          name === 'pa_actor_verificar'
            ? {
                data: {
                  usuario_id: '7',
                  rol: params.p_auth_id,
                  activo: active,
                },
                error: null,
              }
            : { data: sqlError ? null : result, error: sqlError },
        ),
      );
  });
  afterEach(() => expect(publicClient).not.toHaveBeenCalled());
  const remove = (id = '292', role = 'GENERAL') =>
    request(app.getHttpServer())
      .delete(`/api/recolecciones/${id}`)
      .set('Authorization', `Bearer ${jwt.sign({ sub: role })}`);

  it('usa el actor verificado aun si el body/headers declaran otro usuario y rol', async () => {
    const response = await remove()
      .set('x-user-role', 'ADMIN')
      .send({ p_actor_id: 999, usuario_id: 999, eliminado_por_usuario_id: 999 })
      .expect(200);
    expect(response.body).toEqual({ success: true, data: result });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(rpc).toHaveBeenLastCalledWith('fn_recoleccion_eliminar_borrador', {
      p_recoleccion_id: 292,
      p_actor_id: '7',
    });
  });
  it('acepta DELETE sin body', async () => {
    await remove().expect(200);
  });
  it('rechaza headers de identidad sin Bearer', async () => {
    await request(app.getHttpServer())
      .delete('/api/recolecciones/292')
      .set('x-auth-id', 'GENERAL')
      .set('x-user-role', 'ADMIN')
      .expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rechaza un x-auth-id distinto del JWT', async () => {
    await remove().set('x-auth-id', 'ADMIN').expect(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rechaza cuenta inactiva', async () => {
    active = false;
    await remove().expect(403);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('no eleva VOLUNTARIO mediante un header', async () => {
    await remove('292', 'VOLUNTARIO').set('x-user-role', 'ADMIN').expect(403);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(['abc', '0', '-1', '1.5', '9007199254740992'])(
    'rechaza id inválido %s',
    async (id) => {
      await remove(id).expect(400);
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    ['P0002', 404],
    ['42501', 403],
    ['P0001', 409],
    ['40001', 409],
    ['55P03', 409],
    ['57014', 409],
    ['XX000', 500],
  ])('traduce %s a HTTP %s sin exponer detalles SQL', async (code, status) => {
    sqlError = { code: String(code), message: 'detalle SQL privado' };
    const response = await remove().expect(Number(status));
    expect(JSON.stringify(response.body)).not.toContain('detalle SQL privado');
  });
  it('publica en OpenAPI Bearer, respuesta y estados de error sin body obligatorio', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    const operation = doc.paths['/api/recolecciones/{id}'].delete!;
    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(operation.requestBody).toBeUndefined();
    expect(Object.keys(operation.responses)).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '500',
    ]);
  });
});
