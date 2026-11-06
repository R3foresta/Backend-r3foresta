#!/usr/bin/env node
// Proyección del Swagger real T2: no abre sockets, lee .env ni inicia módulos externos.
require('ts-node').register({ transpileOnly: true });
const fs = require('node:fs');
const path = require('node:path');
const { Test } = require('@nestjs/testing');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { VerifiedActorGuard } = require('../../src/auth/verified-actor.guard');
const {
  ViveroAccesosController,
} = require('../../src/lotes-vivero/api/vivero-accesos.controller');
const {
  ViveroAccesosService,
} = require('../../src/lotes-vivero/application/vivero-accesos.service');
const { InternalActorGuard } = require('../../src/auth/internal-actor.guard');
const {
  LotesViveroController,
} = require('../../src/lotes-vivero/api/lotes-vivero.controller');
const {
  LotesViveroService,
} = require('../../src/lotes-vivero/application/lotes-vivero.service');
const { configureGlobalRoutes } = require('../../src/app.routes');
const {
  RecoleccionesController,
} = require('../../src/recolecciones/api/recolecciones.controller');
const {
  RecoleccionesService,
} = require('../../src/recolecciones/application/recolecciones.service');
const {
  RecoleccionFormDataParser,
} = require('../../src/recolecciones/api/parsers/recoleccion-formdata.parser');
(async () => {
  const module = await Test.createTestingModule({
    controllers: [
      ViveroAccesosController,
      LotesViveroController,
      RecoleccionesController,
    ],
    providers: [
      { provide: ViveroAccesosService, useValue: {} },
      { provide: LotesViveroService, useValue: {} },
      { provide: RecoleccionesService, useValue: {} },
      { provide: RecoleccionFormDataParser, useValue: {} },
    ],
  })
    .overrideGuard(VerifiedActorGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(InternalActorGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = module.createNestApplication();
  try {
    configureGlobalRoutes(app);
    await app.init();
    const config = new DocumentBuilder()
      .setTitle('R3Foresta · Acceso por vivero T2')
      .setVersion('1.0.0')
      .setDescription(
        'Contrato local 094/095. M2 por establecimiento independiente de M1 y Plantación; T3–T5 y despliegue pendientes. Recuperación propia con la misma clave.',
      )
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    const encoded = JSON.stringify(doc, null, 2) + '\n';
    const target = path.resolve(
      __dirname,
      '../../docs/vivero-acceso-openapi.json',
    );
    if (process.argv.includes('--check')) {
      if (fs.readFileSync(target, 'utf8') !== encoded)
        throw new Error('OpenAPI T2 no coincide con DTO/Swagger');
      console.log(
        'OpenAPI T2 reproducible: ' + Object.keys(doc.paths).length + ' rutas.',
      );
    } else {
      fs.writeFileSync(target, encoded);
      console.log('OpenAPI T2 generado.');
    }
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
