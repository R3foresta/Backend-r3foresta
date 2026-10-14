import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { InternalActorGuard } from './internal-actor.guard';
import { SupabaseService } from '../supabase/supabase.service';
import { OrganizacionesController } from '../organizaciones/organizaciones.controller';
import { OrganizacionesService } from '../organizaciones/organizaciones.service';
import { CampaniasController } from '../campanias/api/campanias.controller';
import { CampaniasService } from '../campanias/application/campanias.service';
import { SubcampaniasController } from '../subcampanias/api/subcampanias.controller';
import { SubcampaniasService } from '../subcampanias/application/subcampanias.service';
import { LotesViveroController } from '../lotes-vivero/api/lotes-vivero.controller';
import { LotesViveroService } from '../lotes-vivero/application/lotes-vivero.service';
import { RecoleccionesController } from '../recolecciones/api/recolecciones.controller';
import { RecoleccionesService } from '../recolecciones/application/recolecciones.service';
import { PlantacionesController } from '../plantaciones/api/plantaciones.controller';
import { PlantacionesService } from '../plantaciones/application/plantaciones.service';
import { EvidenciasTrazabilidadController } from '../evidencias-trazabilidad/evidencias-trazabilidad.controller';
import { EvidenciasTrazabilidadService } from '../evidencias-trazabilidad/evidencias-trazabilidad.service';
import { RecoleccionFormDataParser } from '../recolecciones/api/parsers/recoleccion-formdata.parser';
import { SubcampaniaPlanAuthGuard } from '../subcampanias/api/guards/subcampania-plan-auth.guard';
import { configureGlobalRoutes } from '../app.routes';

// Controllers/guards reales. DB y servicios de dominio simulados: no prueba SQL remoto.
describe('Audiencias privadas tras cerrar SELECT de usuario', () => {
  let app: INestApplication<Server>;
  const secret = 'isolated-internal-actor';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });
  const rpc = jest.fn((name: string, params: { p_auth_id: string }) => {
    expect(name).toBe('pa_actor_verificar');
    const role = params.p_auth_id;
    return {
      data:
        role === 'missing'
          ? null
          : {
              usuario_id: '20',
              rol: role === 'inactive' ? 'ADMIN' : role,
              activo: role !== 'inactive',
            },
      error: null,
    };
  });
  const crear = jest.fn((_dto: unknown, authId: string) => ({ authId }));
  const methods = { listar: () => [], findAll: () => [], crear };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [
        OrganizacionesController,
        CampaniasController,
        SubcampaniasController,
        LotesViveroController,
        RecoleccionesController,
        PlantacionesController,
        EvidenciasTrazabilidadController,
      ],
      providers: [
        InternalActorGuard,
        SubcampaniaPlanAuthGuard,
        { provide: ConfigService, useValue: { get: () => secret } },
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => ({ rpc }) },
        },
        ...[
          OrganizacionesService,
          CampaniasService,
          SubcampaniasService,
          LotesViveroService,
          RecoleccionesService,
          PlantacionesService,
          EvidenciasTrazabilidadService,
          RecoleccionFormDataParser,
        ].map((provide) => ({ provide, useValue: methods })),
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    rpc.mockClear();
    crear.mockClear();
  });
  const routes = [
    'organizaciones',
    'campanias',
    'subcampanias',
    'lotes-vivero',
    'recolecciones',
    'registros-plantacion',
    'evidencias-trazabilidad',
  ];
  it.each(routes)(
    '%s rechaza consulta sin Bearer aunque lleve headers elevados',
    async (route) => {
      await (
        route === 'registros-plantacion'
          ? request(app.getHttpServer()).post(`/api/${route}`)
          : request(app.getHttpServer()).get(`/api/${route}`)
      )
        .set('x-auth-id', 'ADMIN')
        .set('x-user-role', 'ADMIN')
        .expect(401);
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it.each(routes)(
    '%s rechaza VOLUNTARIO y no lo eleva con x-user-role',
    async (route) => {
      await (
        route === 'registros-plantacion'
          ? request(app.getHttpServer()).post(`/api/${route}`)
          : request(app.getHttpServer()).get(`/api/${route}`)
      )
        .set('Authorization', `Bearer ${jwt.sign({ sub: 'VOLUNTARIO' })}`)
        .set('x-user-role', 'ADMIN')
        .expect(403);
    },
  );
  it.each(['ADMIN', 'GENERAL', 'VALIDADOR'])(
    'conserva lectura interna de organizaciones para %s',
    async (role) => {
      await request(app.getHttpServer())
        .get('/api/organizaciones')
        .set('Authorization', `Bearer ${jwt.sign({ sub: role })}`)
        .expect(200);
    },
  );
  it.each(['POST', 'PATCH', 'DELETE'])(
    'organizaciones %s rechaza identidad ajena antes del servicio',
    async (method) => {
      const path =
        method === 'POST' ? '/api/organizaciones' : '/api/organizaciones/1';
      const call =
        method === 'POST'
          ? request(app.getHttpServer()).post(path)
          : method === 'PATCH'
            ? request(app.getHttpServer()).patch(path)
            : request(app.getHttpServer()).delete(path);
      await call
        .set('Authorization', `Bearer ${jwt.sign({ sub: 'GENERAL' })}`)
        .set('x-auth-id', 'ADMIN')
        .expect(401);
      expect(crear).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it('deriva identidad desde JWT aun sin header legado', async () => {
    await request(app.getHttpServer())
      .post('/api/organizaciones')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'ADMIN' })}`)
      .send({ nombre: 'Entidad' })
      .expect(201);
    expect(crear).toHaveBeenCalledWith(
      { nombre: 'Entidad' },
      'ADMIN',
      undefined,
    );
  });
  it.each([
    ['inactive', 403],
    ['missing', 401],
  ] as const)('rechaza actor %s', async (actor, status) => {
    await request(app.getHttpServer())
      .get('/api/organizaciones')
      .set('Authorization', `Bearer ${jwt.sign({ sub: actor })}`)
      .expect(status);
  });
});
