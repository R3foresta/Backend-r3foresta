#!/usr/bin/env node
// Proyección del Swagger real T1: no abre sockets, lee .env ni inicia módulos externos.
require('ts-node').register({ transpileOnly: true });
const fs = require('node:fs');
const path = require('node:path');
const { Test } = require('@nestjs/testing');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { VerifiedActorGuard } = require('../../src/auth/verified-actor.guard');
const {
  RecoleccionRecepcionController,
} = require('../../src/recolecciones/api/recoleccion-recepcion.controller');
const {
  RecoleccionRecepcionService,
} = require('../../src/recolecciones/application/recoleccion-recepcion.service');
const { configureGlobalRoutes } = require('../../src/app.routes');
(async () => {
  const module = await Test.createTestingModule({
    controllers: [RecoleccionRecepcionController],
    providers: [{ provide: RecoleccionRecepcionService, useValue: {} }],
  })
    .overrideGuard(VerifiedActorGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const app = module.createNestApplication();
  try {
    configureGlobalRoutes(app);
    await app.init();
    const config = new DocumentBuilder()
      .setTitle('R3Foresta · Recepción de semillas T4')
      .setVersion('2.0.0')
      .setDescription(
        'Contrato local de decisión única. ADMIN o VALIDADOR con asignación vigente al vivero confirma recepción conforme y validación atómicas, sin autorrecepción, o rechaza con motivo. Corrección sobre la misma ficha. Recuperación propia; SQL remoto y despliegue pendientes.',
      )
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    const base = '/api/v1/recepcion-semillas';
    const expected = [
      base,
      `${base}/comandos/{comando_id}`,
      `${base}/{id}`,
      `${base}/{id}/evidencias`,
      `${base}/{id}/recibir-validar`,
      `${base}/{id}/rechazar`,
    ];
    if (
      Object.keys(doc.paths).length !== expected.length ||
      expected.some((route) => !doc.paths[route])
    )
      throw new Error('Recepción única exige las seis rutas acordadas');
    const contract = JSON.stringify(doc);
    if (
      /"(incidencia_id|observacion_id|motivo_resolucion|requiere_conciliacion|puede_consultar_conciliacion)"/.test(
        contract,
      )
    )
      throw new Error('Recepción única conserva campos retirados');
    const encoded = JSON.stringify(doc, null, 2) + '\n';
    const target = path.resolve(
      __dirname,
      '../../docs/recepcion-semillas-openapi.json',
    );
    if (process.argv.includes('--check')) {
      if (fs.readFileSync(target, 'utf8') !== encoded)
        throw new Error('OpenAPI T4 no coincide con DTO/Swagger');
      console.log(
        'OpenAPI T4 reproducible: ' + Object.keys(doc.paths).length + ' rutas.',
      );
    } else {
      fs.writeFileSync(target, encoded);
      console.log('OpenAPI T4 generado.');
    }
  } finally {
    await app.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
