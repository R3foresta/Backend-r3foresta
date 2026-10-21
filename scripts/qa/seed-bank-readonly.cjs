#!/usr/bin/env node
// API local de lectura contra el Supabase configurado. No importa Auth, Pinata,
// Blockchain, comandos, workers de limpieza ni carga fixtures o migraciones.
const { Module } = require('@nestjs/common');
const { ConfigModule } = require('@nestjs/config');
const { NestFactory } = require('@nestjs/core');
const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
const { SeedBankModule } = require('../../dist/impact/seed-bank/seed-bank.module');
const { configureGlobalRoutes } = require('../../dist/app.routes');

async function main() {
  const port = Number(process.env.SEED_BANK_PREVIEW_PORT || 3306);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Puerto inválido.');
  class ReadOnlyModule {}
  Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), SeedBankModule] })(ReadOnlyModule);
  const app = await NestFactory.create(ReadOnlyModule, { logger: ['error', 'warn'] });
  configureGlobalRoutes(app);
  app.enableCors({ origin: true, credentials: false });
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Banco de semillas — lectura local').setVersion('1.0').build());
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(port, '127.0.0.1');
  console.log(`Banco de semillas de solo lectura: http://127.0.0.1:${port}/api/v1/impact/seed-bank`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
main().catch(() => { console.error('No se pudo iniciar la API local de lectura. Revisa build y configuración privada.'); process.exitCode = 1; });
