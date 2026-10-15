/** Servidor QA local: nunca importado por AppModule ni por el bootstrap real. */
import 'reflect-metadata';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { promisify } from 'node:util';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { Express, NextFunction, Request, Response } from 'express';
import { configureGlobalRoutes } from '../../src/app.routes';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { canonicalCommand } from '../../src/participacion/comando-canonical';
import { ParticipacionComandosController } from '../../src/participacion/participacion-comandos.controller';
import { ParticipacionComandosService } from '../../src/participacion/participacion-comandos.service';
import { ParticipacionLecturasController } from '../../src/participacion/participacion-lecturas.controller';
import { ParticipacionLecturasService } from '../../src/participacion/participacion-lecturas.service';
import { participacionOpenApi } from '../../src/participacion/participacion-openapi.generated';
import { SupabaseService } from '../../src/supabase/supabase.service';

const run = promisify(execFile);
const runId = process.env.PA_C_PREVIEW_RUN;
const socket = process.env.PA_C_PREVIEW_SOCKET;
const cluster = process.env.PA_C_PREVIEW_CLUSTER;
const psql = process.env.PA_C_PREVIEW_PSQL;
const port = Number(process.env.PA_C_PREVIEW_PORT);
const database = 'pa_int02c_preview';
const jwtSecret = randomBytes(48).toString('base64url');
const tokenTtl = 7200;
const preparedCommand = '11111111-1111-4111-8111-111111111111';
const allowedOrigins = new Set<string>(
  JSON.parse(process.env.PA_C_PREVIEW_ORIGINS ?? '[]') as string[],
);
if (
  !runId ||
  !socket ||
  !cluster ||
  !psql ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !/^pa-int02c-preview-/.test(basename(dirname(socket))) ||
  dirname(socket) !== dirname(cluster) ||
  realpathSync(dirname(socket)) !== dirname(socket) ||
  (statSync(dirname(socket)).mode & 0o077) !== 0 ||
  !allowedOrigins.size ||
  [...allowedOrigins].some(
    (origin) => !/^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(origin),
  )
)
  throw new Error(
    'Iniciar sólo mediante pa-int02c-preview.py en su clúster privado.',
  );
if (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error('El preview no admite configuración de Supabase.');

const profiles = [
  ['admin', '600', 'Administradora global activa'],
  ['admin2', '601', 'Segundo administrador global activo'],
  ['gestora', '602', 'Administradora contextual de Norte y ámbitos de prueba'],
  ['plantador', '603', 'Plantador de Norte'],
  ['voluntario', '604', 'Voluntario sin acceso contextual'],
  ['inactivo', '605', 'Cuenta inactiva: sus peticiones privadas deben fallar'],
  ['gestor-ajeno', '606', 'Administrador contextual de Sur'],
  ['logistica', '607', 'Coordinador logístico sin permiso contextual'],
] as const;
const scopes = [
  ['600', 'Norte propia', 'ACTIVA'],
  ['601', 'Sur ajena', 'ACTIVA'],
  ['602', 'Cerrada con administrador', 'COMPLETADA'],
  ['603', 'Borrador', 'BORRADOR'],
  ['604', 'Cancelada con administrador', 'CANCELADA'],
  ['605', 'Pausada reservada', 'PAUSADA'],
] as const;
const sqlEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('PG')),
);
// Opciones fijadas antes de la llamada, sin heredar destino/servicio libpq.
sqlEnv.PGOPTIONS = '-c statement_timeout=30000 -c lock_timeout=5000';
async function sql(statement: string): Promise<string> {
  const result = await run(
    psql!,
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket!,
      '-p',
      '55435',
      '-U',
      'postgres',
      '-d',
      database,
      '-c',
      statement,
    ],
    { env: sqlEnv, timeout: 35000, maxBuffer: 4 * 1024 * 1024 },
  );
  return result.stdout.trim();
}
function literal(value: unknown): string {
  if (value === null) return 'NULL';
  if (Array.isArray(value)) {
    if (
      !value.length ||
      value.some(
        (entry) => typeof entry !== 'string' || !/^[1-9][0-9]*$/.test(entry),
      )
    )
      throw new Error('Selección RPC de fixture inválida.');
    return 'ARRAY[' + value.join(',') + ']::bigint[]';
  }
  if (value === undefined) throw new Error('Argumento RPC ausente.');
  let serialized: string;
  if (typeof value === 'object') serialized = JSON.stringify(value);
  else if (typeof value === 'string') serialized = value;
  else if (
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    serialized = String(value);
  else throw new Error('Tipo RPC inválido.');
  return "'" + serialized.replace(/'/g, "''") + "'";
}
const signatures: Record<string, string[]> = {
  pa_actor_verificar: ['p_auth_id'],
  pa_acceso_ejecutar: [
    'p_actor_id',
    'p_auth_id',
    'p_operacion',
    'p_comando_id',
    'p_payload',
    'p_contenido_canonico',
  ],
  pa_autoridad_ejecutar: [
    'p_actor_id',
    'p_auth_id',
    'p_operacion',
    'p_comando_id',
    'p_payload',
    'p_contenido_canonico',
  ],
  pa_comando_recuperar: [
    'p_actor_id',
    'p_auth_id',
    'p_operacion',
    'p_comando_id',
  ],
  pa_autoridad_leer: ['p_actor_id', 'p_auth_id', 'p_usuario_id'],
  pa_capacidades_leer: [
    'p_actor_id',
    'p_auth_id',
    'p_campania_id',
    'p_despues_id',
    'p_limite',
  ],
  pa_miembros_participacion_leer: [
    'p_actor_id',
    'p_auth_id',
    'p_subcampania_id',
    'p_despues_id',
    'p_limite',
  ],
  pa_personas_buscar: [
    'p_actor_id',
    'p_auth_id',
    'p_modo',
    'p_consulta',
    'p_accion',
    'p_subcampania_ids',
    'p_despues_id',
    'p_limite',
  ],
  pa_accesos_revisar: [
    'p_actor_id',
    'p_auth_id',
    'p_usuario_destino_id',
    'p_subcampania_ids',
  ],
};
async function rpc(name: string, args: Record<string, unknown>) {
  try {
    const keys = signatures[name];
    if (
      !keys ||
      Object.keys(args).length !== keys.length ||
      keys.some((key) => !(key in args))
    )
      throw new Error('RPC fuera de la superficie INT02C.');
    const statement =
      'SELECT public.' +
      name +
      '(' +
      keys.map((key) => key + ' => ' + literal(args[key])).join(',') +
      ')';
    return JSON.parse(
      await sql(
        'SET ROLE service_role; SELECT public.pa_preview_fixture_transport(' +
          literal(statement) +
          ');',
      ),
    ) as {
      data: unknown;
      error: { code: string; details?: string } | null;
    };
  } catch {
    return { data: null, error: { code: 'RPC_FAILED' } };
  }
}

@Module({
  imports: [JwtModule.register({ secret: jwtSecret })],
  controllers: [
    ParticipacionComandosController,
    ParticipacionLecturasController,
  ],
  providers: [
    VerifiedActorGuard,
    ParticipacionComandosService,
    ParticipacionLecturasService,
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => (key === 'JWT_SECRET' ? jwtSecret : undefined),
      },
    },
    { provide: SupabaseService, useValue: { getAdminClient: () => ({ rpc }) } },
  ],
})
class PreviewModule {}

async function initializeFixture() {
  const verified = JSON.parse(
    await sql(`SELECT jsonb_build_object(
    'cluster',current_setting('data_directory'),'tcp',current_setting('listen_addresses'),
    'address',inet_server_addr(),'fixture',(SELECT fixture FROM public.pa_int02c_preview_marker))`),
  ) as Record<string, unknown>;
  if (
    verified.cluster !== cluster ||
    verified.tcp !== '' ||
    verified.address !== null ||
    verified.fixture !== 'SINTETICO_LOCAL_INT02C'
  )
    throw new Error('El transporte no apunta al clúster sintético esperado.');
  for (const [operation, payload] of [
    [
      'DESIGNAR_ADMINISTRADOR',
      {
        usuario_destino_id: '602',
        ambitos: ['600', '602', '603', '604', '605'].map((subcampania_id) => ({
          subcampania_id,
          revision_esperada: '0',
        })),
      },
    ],
    [
      'DESIGNAR_ADMINISTRADOR',
      {
        usuario_destino_id: '606',
        ambitos: [{ subcampania_id: '601', revision_esperada: '0' }],
      },
    ],
    [
      'OTORGAR_PLANTADOR',
      {
        usuario_destino_id: '603',
        ambitos: [{ subcampania_id: '600', revision_esperada: '0' }],
      },
    ],
  ] as const) {
    const result = await rpc('pa_acceso_ejecutar', {
      p_actor_id: '600',
      p_auth_id: 'preview-admin',
      p_operacion: operation,
      p_comando_id: randomUUID(),
      p_payload: payload,
      p_contenido_canonico: canonicalCommand(operation, payload).contenido,
    });
    const data = result.data as { http_status?: number } | null;
    if (result.error || data?.http_status !== 200)
      throw new Error(
        'No se pudo inicializar permiso sintético mediante RPC real.',
      );
  }
  await sql(`UPDATE public.subcampania SET estado='COMPLETADA' WHERE id=602;
    UPDATE public.subcampania SET estado='CANCELADA' WHERE id=604;
    UPDATE public.subcampania SET estado='PAUSADA' WHERE id=605;
    SET ROLE service_role;
    INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,estado,subcampania_preparacion_id)
      VALUES(600,'REGISTRAR_PLANTACION_INICIAL','${preparedCommand}','PREPARADO',600)`);
}

async function main() {
  await initializeFixture();
  const app = await NestFactory.create(PreviewModule, {
    logger: ['error', 'warn'],
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'private, no-store');
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    if (
      !hosts.includes(req.headers.host ?? '') ||
      (req.headers.origin && !allowedOrigins.has(req.headers.origin))
    ) {
      res.status(403).json({ error: 'PREVIEW_SOLO_LOCAL' });
      return;
    }
    next();
  });
  app.enableCors({
    origin: [...allowedOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-auth-id',
      'x-user-role',
    ],
    exposedHeaders: ['Content-Type', 'Authorization', 'Retry-After'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  configureGlobalRoutes(app);
  const server = app.getHttpAdapter().getInstance() as Express;
  const jwt = app.get(JwtService);
  server.get('/__fixture/health', (_req: Request, res: Response) =>
    res.json({ entorno: 'SINTETICO_LOCAL_INT02C', run_id: runId }),
  );
  server.get('/__fixture', (_req: Request, res: Response) =>
    res.json({
      entorno: 'SINTETICO_LOCAL_INT02C',
      base_url: `http://127.0.0.1:${port}`,
      api_base: '/api/v1',
      pwa_variable: { VITE_API_URL: `http://127.0.0.1:${port}` },
      revision_backend: process.env.PA_C_PREVIEW_REVISION ?? null,
      cambios_de_trabajo: process.env.PA_C_PREVIEW_DIRTY === 'true',
      migraciones_sha256: JSON.parse(
        process.env.PA_C_PREVIEW_MIGRACIONES ?? '{}',
      ) as Record<string, string>,
      aviso:
        'Sólo datos ficticios. Reiniciar borra cambios y renueva secretos. No incluye login WebAuthn, registro, fotos, stock ni Impacto.',
      token_ttl_segundos: tokenTtl,
      origenes_permitidos: [...allowedOrigins],
      openapi: '/__fixture/openapi.json',
      perfiles: profiles.map(([perfil, usuario_id, descripcion_inicial]) => ({
        perfil,
        usuario_id,
        descripcion_inicial,
        token: jwt.sign(
          { sub: `preview-${perfil}` },
          { expiresIn: tokenTtl, algorithm: 'HS256' },
        ),
      })),
      ambitos: scopes.map(([subcampania_id, nombre, estado_inicial]) => ({
        subcampania_id,
        nombre,
        estado_inicial,
      })),
      preparacion_sintetica: {
        actor: 'admin',
        comando_id: preparedCommand,
        operacion: 'REGISTRAR_PLANTACION_INICIAL',
      },
    }),
  );
  server.get('/__fixture/openapi.json', (_req: Request, res: Response) =>
    res.json({
      openapi: '3.0.0',
      info: { title: 'INT02C — entorno sintético local', version: '1' },
      ...participacionOpenApi,
    }),
  );
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      void app.close().then(() => process.exit(0));
    });
  await app.listen(port, '127.0.0.1');
  console.log(`INT02C sintético listo: http://127.0.0.1:${port}/__fixture`);
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'No se pudo iniciar el preview.',
  );
  process.exitCode = 1;
});
