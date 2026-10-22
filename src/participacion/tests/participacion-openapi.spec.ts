import { ImpactImagenController } from '../../impact/impact-imagen.controller';
import { ImpactService } from '../../impact/impact.service';
import {
  ImpactoConsultaController,
  MisRegistrosController,
} from '../../impact/impact-consulta.controller';
import { ImpactoConsultaService } from '../../impact/application/impacto-consulta.service';
import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { SupabaseService } from '../../supabase/supabase.service';
import { VerifiedActorGuard } from '../../auth/verified-actor.guard';
import { configureGlobalRoutes } from '../../app.routes';
import { ParticipacionComandosController } from '../participacion-comandos.controller';
import { ParticipacionComandosService } from '../participacion-comandos.service';
import { ParticipacionLecturasController } from '../participacion-lecturas.controller';
import { ParticipacionLecturasService } from '../participacion-lecturas.service';
import { participacionOpenApi } from '../participacion-openapi.generated';
import { ParticipacionRegistroController } from '../participacion-registro.controller';
import { ParticipacionRegistroService } from '../application/participacion-registro.service';
import { ParticipacionCorreccionesController } from '../participacion-correcciones.controller';
import { ParticipacionCorreccionesService } from '../application/participacion-correcciones.service';
import {
  ParticipacionCargasController,
  ParticipacionFotosPublicasController,
} from '../cargas/participacion-cargas.controller';
import { ParticipacionCargasService } from '../cargas/participacion-cargas.service';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validarImpacto } from '../../impact/domain/policies/impacto-proyeccion.policy';

describe('Contrato OpenAPI de participación v1', () => {
  it('documenta las 33 rutas registradas por Nest y resuelve todos sus schemas', async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        ParticipacionComandosController,
        ParticipacionLecturasController,
        ParticipacionRegistroController,
        ParticipacionCorreccionesController,
        ParticipacionCargasController,
        ParticipacionFotosPublicasController,
        ImpactImagenController,
        ImpactoConsultaController,
        MisRegistrosController,
      ],
      providers: [
        VerifiedActorGuard,
        { provide: ImpactService, useValue: {} },
        { provide: ImpactoConsultaService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => 'synthetic' } },
        { provide: SupabaseService, useValue: {} },
        { provide: ParticipacionComandosService, useValue: {} },
        { provide: ParticipacionLecturasService, useValue: {} },
        { provide: ParticipacionRegistroService, useValue: {} },
        { provide: ParticipacionCorreccionesService, useValue: {} },
        { provide: ParticipacionCargasService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    configureGlobalRoutes(app);
    await app.init();
    try {
      const actual = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('test').setVersion('1').build(),
      );
      expect(Object.keys(actual.paths).sort()).toEqual(
        Object.keys(participacionOpenApi.paths).sort(),
      );
      expect(Object.keys(actual.paths)).toHaveLength(33);
      for (const route of Object.keys(actual.paths))
        expect(Object.keys(actual.paths[route]).sort()).toEqual(
          Object.keys(participacionOpenApi.paths[route]).sort(),
        );
      const schemas = participacionOpenApi.components!.schemas!;
      const visit = (value: unknown) => {
        if (value && typeof value === 'object') {
          for (const [key, item] of Object.entries(value)) {
            if (key === '$ref') {
              expect(typeof item).toBe('string');
              expect(schemas).toHaveProperty(
                String(item).replace('#/components/schemas/', ''),
              );
            } else visit(item);
          }
        }
      };
      visit(participacionOpenApi);
    } finally {
      await app.close();
    }
  });

  it('publica observaciones y recuperación sin abrir las correcciones todavía pendientes', () => {
    const paths = participacionOpenApi.paths;
    const post =
      paths['/api/v1/plantaciones/{id}/correcciones/observaciones'].post!;
    expect(post.security).toEqual([{ bearerAuth: [] }]);
    expect(post.requestBody).toHaveProperty(
      'content.application/json.schema.$ref',
      '#/components/schemas/CorreccionObservacionesEntrada',
    );
    expect(post.responses!['422']).toHaveProperty(
      'content.application/json.schema.$ref',
      '#/components/schemas/ReciboOError',
    );
    const recovery = paths['/api/v1/participacion/comandos/{comando_id}'].get!;
    const operation = recovery.parameters!.find(
      (value) => 'name' in value && value.name === 'operacion',
    );
    expect(operation).toHaveProperty(
      'schema.enum',
      expect.arrayContaining(['CORREGIR_OBSERVACIONES_PLANTACION']),
    );
    expect(paths).not.toHaveProperty(
      '/api/v1/plantaciones/{id}/correcciones/cantidad',
    );
    const schema =
      participacionOpenApi.components!.schemas!.CorreccionPlantacionResultado;
    expect(schema).not.toHaveProperty('properties.motivo');
    expect(schema).not.toHaveProperty('properties.observaciones');
    expect(schema).toHaveProperty('additionalProperties', false);
    expect(schema).toHaveProperty('properties.caso.enum', ['OBSERVACIONES']);
  });

  it('mantiene audiencias, caché y filtros por nivel de INT05', () => {
    const cases = [
      [
        '/api/v1/impact/global',
        [
          'campania_id',
          'subcampania_id',
          'organizacion_id',
          'planta_id',
          'desde',
          'hasta',
          'cursor',
          'limite',
        ],
      ],
      [
        '/api/v1/impact/campanias/{id}',
        [
          'subcampania_id',
          'organizacion_id',
          'planta_id',
          'desde',
          'hasta',
          'cursor',
          'limite',
        ],
      ],
      [
        '/api/v1/impact/subcampanias/{id}',
        ['organizacion_id', 'planta_id', 'desde', 'hasta', 'cursor', 'limite'],
      ],
      ['/api/v1/impact/registros/{id}', []],
    ] as const;
    for (const [route, filters] of cases) {
      const operation = participacionOpenApi.paths[route].get!;
      expect(operation.security).toEqual([]);
      const params = operation.parameters as Array<{
        name: string;
        in: string;
        schema: object;
      }>;
      expect(params.filter((p) => p.in === 'query').map((p) => p.name)).toEqual(
        filters,
      );
      for (const [status, response] of Object.entries(operation.responses!)) {
        expect(response).toHaveProperty(
          'headers.Cache-Control.description',
          status === '200' ? 'no-store' : 'private, no-store',
        );
        if (status === '200')
          expect(response).not.toHaveProperty('headers.Vary');
        else
          expect(response).toHaveProperty(
            'headers.Vary.description',
            'Authorization',
          );
      }
      const cursor = params.find((p) => p.name === 'cursor');
      if (cursor)
        expect(cursor.schema).toEqual({ $ref: '#/components/schemas/Id' });
    }
    const own =
      participacionOpenApi.paths['/api/v1/plantaciones/mis-registros'].get!;
    expect(own.security).toEqual([{ bearerAuth: [] }]);
    expect(own.responses).toHaveProperty('401');
    expect(own.responses).toHaveProperty('403');
    expect(own.responses!['200']).toHaveProperty(
      'headers.Cache-Control.description',
      'private, no-store',
    );
    expect(own.responses!['200']).toHaveProperty(
      'headers.Vary.description',
      'Authorization',
    );
    const schemas = participacionOpenApi.components!.schemas!;
    expect(schemas.ImpactoRegistro).toHaveProperty(
      'additionalProperties',
      false,
    );
    expect(schemas.ImpactoConsulta).toHaveProperty(
      'additionalProperties',
      false,
    );
    expect(schemas.MisRegistros).toHaveProperty('additionalProperties', false);
    expect(schemas.ImpactoRegistro).not.toHaveProperty(
      'properties.observaciones_autor',
    );
    expect(schemas.ImpactoPersona).not.toHaveProperty('properties.usuario_id');
    expect(schemas.ImpactoSubcampania).toHaveProperty(
      'properties.estado.enum',
      ['ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL'],
    );
    expect(schemas.ImpactoSubcampania).not.toHaveProperty(
      'properties.avance_porcentaje.maximum',
    );
  });

  it('valida ejemplos HTTP/SQL capturados con 50 iniciales y relaciones históricas', () => {
    const examples = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../docs/pa-int05-ejemplos.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    for (const [name, schema] of [
      ['global', 'ImpactoConsultaRespuesta'],
      ['campania', 'ImpactoConsultaRespuesta'],
      ['subcampania', 'ImpactoConsultaRespuesta'],
      ['registro', 'ImpactoRegistroRespuesta'],
      ['mis_registros', 'MisRegistrosRespuesta'],
    ])
      expect(() => validarImpacto(examples[name], schema)).not.toThrow();
    expect(examples.global).toHaveProperty(
      'data.indicadores.plantacion_inicial',
      50,
    );
    expect(examples.global).toHaveProperty('data.indicadores.reposiciones', 4);
    expect(examples.global).toHaveProperty(
      'data.indicadores.bajas_reportadas',
      11,
    );
    expect(examples.campania).toHaveProperty(
      'data.indicadores.plantacion_inicial',
      30,
    );
    expect(examples.subcampania).toHaveProperty(
      'data.subcampanias.0.avance_porcentaje',
      125,
    );
    expect(examples.subcampania).toHaveProperty(
      'data.subcampanias.0.faltantes',
      0,
    );
    expect(examples.registro).toHaveProperty(
      'data.seguimiento.bajas.0.cantidad',
      6,
    );
    expect(examples.registro).toHaveProperty(
      'data.seguimiento.reposiciones.0.cantidad',
      4,
    );
    const own = examples.mis_registros as {
      data: { registros: Array<{ id: string; relaciones: string[] }> };
    };
    expect(new Set(own.data.registros.map((row) => row.id)).size).toBe(
      own.data.registros.length,
    );
    expect(
      own.data.registros.find((row) => row.id === '826000')?.relaciones,
    ).toEqual(['AUTOR', 'PARTICIPANTE']);
    expect(JSON.stringify(examples.registro)).not.toContain(
      'OBSERVACION_PRIVADA',
    );
    expect(JSON.stringify(examples.registro)).not.toContain(
      'Perfil actual cambiado',
    );
  });
});
