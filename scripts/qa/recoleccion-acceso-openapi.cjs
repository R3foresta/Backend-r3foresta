#!/usr/bin/env node
// Proyección del Swagger real T1: no abre sockets, lee .env ni inicia módulos externos.
require('ts-node').register({ transpileOnly: true });
const fs = require('node:fs');
const path = require('node:path');
const { Test } = require('@nestjs/testing');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { VerifiedActorGuard } = require('../../src/auth/verified-actor.guard');
const {
  RecoleccionAccesosController,
} = require('../../src/recolecciones/api/recoleccion-accesos.controller');
const {
  RecoleccionAccesosService,
} = require('../../src/recolecciones/application/recoleccion-accesos.service');
const { configureGlobalRoutes } = require('../../src/app.routes');
(async () => {
  const module = await Test.createTestingModule({
    controllers: [RecoleccionAccesosController],
    providers: [{ provide: RecoleccionAccesosService, useValue: {} }],
  })
    .overrideGuard(VerifiedActorGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = module.createNestApplication();
  try {
    configureGlobalRoutes(app);
    await app.init();
    const config = new DocumentBuilder()
      .setTitle('R3Foresta · Acceso explícito de Recolección T1')
      .setVersion('1.0.0')
      .setDescription(
        'Contrato local 092/093. M1 independiente del rol y de Plantación; T2–T5 y despliegue pendientes. Recuperación propia con la misma clave.',
      )
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    const encoded = JSON.stringify(doc, null, 2) + '\n';
    const target = path.resolve(
      __dirname,
      '../../docs/recoleccion-acceso-openapi.json',
    );
    if (process.argv.includes('--check')) {
      if (fs.readFileSync(target, 'utf8') !== encoded)
        throw new Error('OpenAPI T1 no coincide con DTO/Swagger');
      console.log(
        'OpenAPI T1 reproducible: ' + Object.keys(doc.paths).length + ' rutas.',
      );
    } else {
      fs.writeFileSync(target, encoded);
      console.log('OpenAPI T1 generado.');
    }
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
