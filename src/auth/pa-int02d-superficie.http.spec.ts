import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ActorModule } from './actor.module';
import { SupabaseService } from '../supabase/supabase.service';
import { configureGlobalRoutes } from '../app.routes';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { PinataController } from '../pinata/pinata.controller';
import { PinataService } from '../pinata/pinata.service';
import { BlockchainController } from '../blockchain/blockchain.controller';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PlantasController } from '../plantas/plantas.controller';
import { PlantasService } from '../plantas/plantas.service';
import { ComunidadesController } from '../comunidades/comunidades.controller';
import { ComunidadesService } from '../comunidades/comunidades.service';
import { UbicacionesController } from '../ubicaciones/ubicaciones.controller';
import { UbicacionesService } from '../ubicaciones/ubicaciones.service';

// Controllers, guards y JWT reales. Solo dominios externos y DB se sustituyen;
// ningún mint/upload/credencial ni servicio real se invoca desde esta suite.
describe('PA-T-INT02-D superficie HTTP autorizada', () => {
  let app: INestApplication;
  const secret = 'pa-int02d-superficie-sintetica';
  const jwt = new JwtService({ secret });
  const successful = () => jest.fn(async () => ({ success: true }));
  const pinata = { uploadJson: successful() };
  const chain = {
    mintNFT: successful(),
    getWalletBalance: successful(),
    getContractInfo: successful(),
    getTokenURI: successful(),
    getTokenOwner: successful(),
    getBalanceOf: successful(),
  };
  const plants = {
    crear: successful(),
    crearTipoPlanta: successful(),
    actualizar: successful(),
    desactivar: successful(),
    listar: successful(),
    listarTiposPlanta: successful(),
    obtenerPorId: successful(),
  };
  const communities = {
    crear: successful(),
    actualizar: successful(),
    desactivar: successful(),
    listar: successful(),
    obtenerPorId: successful(),
  };
  const locations = {
    ensureFlexibleDivision: successful(),
    findPaises: successful(),
    findDivisiones: successful(),
  };
  const limit = jest.fn(async () => ({ data: [], error: null }));
  const diagnosticClient = jest.fn(() => ({
    from: () => ({ select: () => ({ limit }) }),
  }));
  const actorRpc = jest.fn(
    async (name: string, args: { p_auth_id: string }) => ({
      data:
        name === 'pa_actor_verificar'
          ? { usuario_id: '100', activo: true, rol: args.p_auth_id }
          : null,
      error: null,
    }),
  );
  const spies = [
    limit,
    pinata.uploadJson,
    ...Object.values(chain),
    ...Object.values(plants),
    ...Object.values(communities),
    ...Object.values(locations),
  ];
  type Entry = [
    method: 'get' | 'post' | 'patch',
    path: string,
    body: Record<string, unknown>,
    expected: number,
    effect: jest.Mock,
  ];
  const privateEntries: Entry[] = [
    ['get', '/api/test-db', {}, 200, limit],
    [
      'post',
      '/api/pinata/upload-json',
      { data: { prueba: true } },
      201,
      pinata.uploadJson,
    ],
    [
      'post',
      '/api/blockchain/mint',
      {
        to: '0x1111111111111111111111111111111111111111',
        uri: 'ipfs://sintetico',
      },
      201,
      chain.mintNFT,
    ],
    ['get', '/api/blockchain/wallet', {}, 200, chain.getWalletBalance],
    ['get', '/api/blockchain/contract-info', {}, 200, chain.getContractInfo],
    [
      'post',
      '/api/plantas',
      {
        especie: 'Sintética',
        nombre_cientifico: 'Arbor synth',
        variedad: 'QA',
        tipo_planta_id: 1,
      },
      201,
      plants.crear,
    ],
    [
      'post',
      '/api/plantas/tipos-planta',
      { nombre: 'Sintético' },
      201,
      plants.crearTipoPlanta,
    ],
    [
      'patch',
      '/api/plantas/1',
      { especie: 'Sintética' },
      200,
      plants.actualizar,
    ],
    ['patch', '/api/plantas/1/desactivar', {}, 200, plants.desactivar],
    [
      'post',
      '/api/comunidades',
      { pais_id: 1, municipio_id: 2, nombre: 'Sintética' },
      201,
      communities.crear,
    ],
    [
      'patch',
      '/api/comunidades/1',
      { nombre: 'Sintética' },
      200,
      communities.actualizar,
    ],
    ['patch', '/api/comunidades/1/desactivar', {}, 200, communities.desactivar],
    [
      'post',
      '/api/ubicaciones/divisiones/flexible',
      { pais_id: 1, parent_id: 2, nombre: 'Sintética' },
      201,
      locations.ensureFlexibleDivision,
    ],
  ];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ActorModule],
      controllers: [
        AppController,
        PinataController,
        BlockchainController,
        PlantasController,
        ComunidadesController,
        UbicacionesController,
      ],
      providers: [
        { provide: AppService, useValue: { getHello: () => 'Hello World!' } },
        { provide: PinataService, useValue: pinata },
        { provide: BlockchainService, useValue: chain },
        { provide: PlantasService, useValue: plants },
        { provide: ComunidadesService, useValue: communities },
        { provide: UbicacionesService, useValue: locations },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
      })
      .overrideProvider(SupabaseService)
      .useValue({
        getAdminClient: () => ({ rpc: actorRpc }),
        getClient: diagnosticClient,
      })
      .compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    spies.forEach((spy) => spy.mockClear());
    actorRpc.mockClear();
    diagnosticClient.mockClear();
  });
  it.each(privateEntries)(
    '%s %s rechaza ausencia de JWT antes del servicio',
    async (method, path, body) => {
      await request(app.getHttpServer())
        [method](path)
        .set('x-auth-id', 'ADMIN')
        .set('x-user-role', 'ADMIN')
        .send(body)
        .expect(401);
      expect(actorRpc).not.toHaveBeenCalled();
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    },
  );
  it.each(privateEntries)(
    '%s %s no eleva VOLUNTARIO con x-user-role ADMIN',
    async (method, path, body) => {
      await request(app.getHttpServer())
        [method](path)
        .set(
          'Authorization',
          `Bearer ${jwt.sign({ sub: 'VOLUNTARIO' }, { expiresIn: 60 })}`,
        )
        .set('x-user-role', 'ADMIN')
        .send(body)
        .expect(403);
      spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    },
  );
  for (const role of ['ADMIN', 'GENERAL', 'VALIDADOR']) {
    it.each(privateEntries)(
      `%s %s admite ${role} verificado con efecto sustituido`,
      async (method, path, body, status, effect) => {
        await request(app.getHttpServer())
          [method](path)
          .set(
            'Authorization',
            `Bearer ${jwt.sign({ sub: role }, { expiresIn: 60 })}`,
          )
          .send(body)
          .expect(status);
        expect(effect).toHaveBeenCalledTimes(1);
      },
    );
  }
  it.each([
    '/api',
    '/api/blockchain/token/1/uri',
    '/api/blockchain/token/1/owner',
    '/api/blockchain/balance/0x1111111111111111111111111111111111111111',
    '/api/plantas',
    '/api/plantas/tipos-planta',
    '/api/plantas/1',
    '/api/comunidades?pais_id=BO',
    '/api/comunidades/1',
    '/api/ubicaciones/paises',
    '/api/ubicaciones/divisiones?pais_id=1',
  ])('conserva lectura pública %s sin JWT', async (path) => {
    await request(app.getHttpServer()).get(path).expect(200);
    expect(actorRpc).not.toHaveBeenCalled();
  });
});
