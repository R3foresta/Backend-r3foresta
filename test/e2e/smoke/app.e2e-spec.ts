import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import { configureGlobalRoutes } from '../../../src/app.routes';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureGlobalRoutes(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) es público y no usa el prefijo /api', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect('Cache-Control', 'no-store')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      service: 'r3foresta-backend',
      timestamp: expect.any(String),
      uptimeSeconds: expect.any(Number),
    });
  });

  it('/api/health (GET) no duplica la ruta global', () => {
    return request(app.getHttpServer()).get('/api/health').expect(404);
  });
});
