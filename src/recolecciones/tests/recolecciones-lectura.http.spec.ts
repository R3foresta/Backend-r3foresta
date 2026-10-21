import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureGlobalRoutes } from '../../app.routes';
import { InternalActorGuard } from '../../auth/internal-actor.guard';
import { EvidenceFileService } from '../../common/files/evidence-file.service';
import { UbicacionesReadService } from '../../common/ubicaciones/ubicaciones-read.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { RecoleccionesController } from '../api/recolecciones.controller';
import { RecoleccionFormDataParser } from '../api/parsers/recoleccion-formdata.parser';
import { RecoleccionAuthService } from '../application/recoleccion-auth.service';
import { RecoleccionConsultasService } from '../application/recoleccion-consultas.service';
import { RecoleccionCreationService } from '../application/recoleccion-creation.service';
import { RecoleccionDesechoService } from '../application/recoleccion-desecho.service';
import { RecoleccionDraftService } from '../application/recoleccion-draft.service';
import { RecoleccionElegibilidadService } from '../application/recoleccion-elegibilidad.service';
import { RecoleccionEvidenciasService } from '../application/recoleccion-evidencias.service';
import { RecoleccionUbicacionService } from '../application/recoleccion-ubicacion.service';
import { RecoleccionValidacionService } from '../application/recoleccion-validacion.service';
import { RecoleccionesService } from '../application/recolecciones.service';

function queryResult(data: unknown, error: unknown = null, count = 1) {
  const result = { data, error, count };
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
    maybeSingle: jest.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
}

// HTTP, guards y servicios de lectura reales; Supabase sustituido, sin .env.
describe('GET recolecciones con evidencias privadas', () => {
  let app: INestApplication<Server>;
  const secret = 'recolecciones-lectura-fixture';
  const jwt = new JwtService({ secret, signOptions: { expiresIn: 60 } });
  const recolecciones = queryResult([
    {
      id: 99,
      usuario_id: 7,
      estado_registro: 'BORRADOR',
      tipo_material: 'SEMILLA',
      unidad_canonica: 'G',
      saldo_actual: 100,
    },
  ]);
  const evidencias = queryResult([
    {
      id: 501,
      entidad_id: 99,
      bucket: 'recoleccion_fotos',
      ruta_archivo: 'fixture.jpg',
      es_principal: true,
      orden: 0,
    },
  ]);
  const adminFrom = jest.fn((table: string) => {
    if (table === 'usuario')
      return queryResult({ id: 7, nombre: 'Fixture', rol: 'ADMIN' });
    if (table === 'recoleccion') return recolecciones;
    if (table === 'evidencias_trazabilidad') return evidencias;
    throw new Error(`Tabla privada inesperada: ${table}`);
  });
  const publicFrom = jest.fn((table: string) => {
    if (table === 'tipos_entidad_evidencia')
      return queryResult({ id: 42, activo: true });
    return queryResult(null, {
      code: '42501',
      message: `permission denied for table ${table}`,
    });
  });
  const rpc = jest.fn((_name: string, params: { p_auth_id: string }) => ({
    data: { usuario_id: '7', rol: params.p_auth_id, activo: true },
    error: null,
  }));
  const storage = {
    from: jest.fn(() => ({
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://storage.example/${path}` },
      }),
    })),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret })],
      controllers: [RecoleccionesController],
      providers: [
        InternalActorGuard,
        RecoleccionesService,
        RecoleccionConsultasService,
        RecoleccionAuthService,
        RecoleccionEvidenciasService,
        RecoleccionUbicacionService,
        RecoleccionElegibilidadService,
        EvidenceFileService,
        { provide: ConfigService, useValue: { get: () => secret } },
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: () => ({ from: adminFrom, rpc, storage }),
            getClient: () => ({ from: publicFrom, storage }),
          },
        },
        {
          provide: UbicacionesReadService,
          useValue: { getUbicacionesByIds: async () => new Map() },
        },
        ...[
          RecoleccionCreationService,
          RecoleccionDraftService,
          RecoleccionDesechoService,
          RecoleccionValidacionService,
          RecoleccionFormDataParser,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => app?.close());
  beforeEach(() => jest.clearAllMocks());

  it('lista las recolecciones propias y sus fotos aun con SELECT público denegado', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/recolecciones?page=1&limit=30')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'ADMIN' })}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: [
        {
          id: 99,
          fotos: [{ id: 501, url: 'https://storage.example/fixture.jpg' }],
        },
      ],
      pagination: { page: 1, limit: 30, total: 1 },
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(recolecciones.eq).toHaveBeenCalledWith('usuario_id', 7);
    expect(recolecciones.range).toHaveBeenCalledWith(0, 29);
    expect(adminFrom).toHaveBeenCalledWith('evidencias_trazabilidad');
    expect(publicFrom).not.toHaveBeenCalledWith('evidencias_trazabilidad');
    expect(evidencias.eq).toHaveBeenCalledWith('tipo_entidad_id', 42);
    expect(evidencias.in).toHaveBeenCalledWith('entidad_id', [99]);
    expect(evidencias.is).toHaveBeenCalledWith('eliminado_en', null);
  });

  it('devuelve 401 al abrir la URL sin Bearer aunque se envíe x-auth-id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/recolecciones?page=1&limit=30')
      .set('x-auth-id', 'ADMIN')
      .expect(401);

    expect(response.body.message).toBe(
      'Se requiere Authorization: Bearer <token>.',
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(adminFrom).not.toHaveBeenCalled();
  });

  it('conserva el rechazo de un rol ajeno a la audiencia interna', async () => {
    await request(app.getHttpServer())
      .get('/api/recolecciones?page=1&limit=30')
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'VOLUNTARIO' })}`)
      .set('x-user-role', 'ADMIN')
      .expect(403);

    expect(adminFrom).not.toHaveBeenCalled();
  });
});
