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
const { EvidenciasTrazabilidadController } = require('../../src/evidencias-trazabilidad/evidencias-trazabilidad.controller');
const { EvidenciasTrazabilidadService } = require('../../src/evidencias-trazabilidad/evidencias-trazabilidad.service');
const { PlantacionesController } = require('../../src/plantaciones/api/plantaciones.controller');
const { PlantacionesService } = require('../../src/plantaciones/application/plantaciones.service');
const { ViveroIncorporacionController } = require('../../src/lotes-vivero/api/vivero-incorporacion.controller');
const { ViveroIncorporacionService } = require('../../src/lotes-vivero/application/vivero-incorporacion.service');
const { ViveroEvidenciasService } = require('../../src/lotes-vivero/application/vivero-evidencias.service');
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
      ViveroIncorporacionController,
      LotesViveroController,
      RecoleccionesController,
      EvidenciasTrazabilidadController,
      PlantacionesController,
    ],
    providers: [
      { provide: ViveroAccesosService, useValue: {} },
      { provide: ViveroIncorporacionService, useValue: {} },
      { provide: ViveroEvidenciasService, useValue: {} },
      { provide: LotesViveroService, useValue: {} },
      { provide: RecoleccionesService, useValue: {} },
      { provide: RecoleccionFormDataParser, useValue: {} },
      { provide: EvidenciasTrazabilidadService, useValue: {} },
      { provide: PlantacionesService, useValue: {} },
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
      .setTitle('R3Foresta · Acceso y material por vivero')
      .setVersion('3.2.0')
      .setDescription(
        'Contrato local de recepción única, material por vivero y continuidad de reposición interna con IDs exactos. Nuevas incorporaciones T5 y fotos pendientes requieren ADMIN global actual; resultado y replay propios confirmados siguen disponibles para la cuenta activa tras perder el rol. No persiste preparación ni rechazo durable. Timeline por lote paginado con vínculos reales, fuentes de responsable y estado explícito de fotos. Los buckets privados vivero_evidencias y vivero_incorporaciones usan firma TTL300 para el historial autorizado.',
      )
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);
    if (
      Object.keys(doc.paths).some((route) =>
        /\/conciliaciones(?:\/|$)|\/(approve|reject)$/.test(route),
      )
    )
      throw new Error('El contrato M2 conserva rutas retiradas');
    const contract = JSON.stringify(doc);
    if (
      /"(puede_consultar_conciliacion|revisar_documental|revisar_documental_cualquier_vivero)"/.test(
        contract,
      ) ||
      /"(?:CONCILIACION_CONFORME|PENDIENTE_CONCILIACION|INCIDENCIA_CONCILIACION)"/.test(
        contract,
      )
    )
      throw new Error(
        'El contrato M2 conserva capacidades o estados retirados',
      );
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
