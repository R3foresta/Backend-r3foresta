import { ImpactImagenController } from '../../impact/impact-imagen.controller';
import { ImpactService } from '../../impact/impact.service';
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
import {
  ParticipacionCargasController,
  ParticipacionFotosPublicasController,
} from '../cargas/participacion-cargas.controller';
import { ParticipacionCargasService } from '../cargas/participacion-cargas.service';

describe('Contrato OpenAPI de participación v1', () => {
  it('documenta las 25 rutas registradas por Nest y resuelve todos sus schemas', async () => {
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        ParticipacionComandosController,
        ParticipacionLecturasController,
        ParticipacionRegistroController,
        ParticipacionCargasController,
        ParticipacionFotosPublicasController,
        ImpactImagenController,
      ],
      providers: [
        VerifiedActorGuard,
        { provide: ImpactService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => 'synthetic' } },
        { provide: SupabaseService, useValue: {} },
        { provide: ParticipacionComandosService, useValue: {} },
        { provide: ParticipacionLecturasService, useValue: {} },
        { provide: ParticipacionRegistroService, useValue: {} },
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
      expect(Object.keys(actual.paths)).toHaveLength(25);
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
});
