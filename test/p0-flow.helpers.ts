import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';
import { SupabaseService } from '../src/supabase/supabase.service';

config({ path: resolve(__dirname, '../.env') });

export type P0UserRef = {
  id: number;
  authId: string;
  nombre: string;
  rol: string;
};

export type P0Refs = {
  admin: P0UserRef;
  nonAdmin: P0UserRef;
  operario: P0UserRef;
  zona: {
    id: number;
    nombre: string;
  };
};

export type P0CreatedIds = {
  campaniaIds: number[];
  subcampaniaIds: number[];
  organizacionIds: number[];
};

type QueryResult<T> = {
  data: T | null;
  error: {
    message?: string;
    details?: string | null;
    hint?: string | null;
    code?: string | null;
  } | null;
};

export function newP0CreatedIds(): P0CreatedIds {
  return {
    campaniaIds: [],
    subcampaniaIds: [],
    organizacionIds: [],
  };
}

export async function createP0App(): Promise<INestApplication> {
  ensureSupabaseEnv();

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');

  await app.init();
  return app;
}

export function createP0SupabaseClient(): SupabaseClient {
  ensureSupabaseEnv();

  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY!,
  );
}

export async function closeP0Resources(
  app?: INestApplication,
  client?: SupabaseClient,
): Promise<void> {
  await closeSupabaseClient(client);

  if (!app) {
    return;
  }

  try {
    const supabaseService = app.get(SupabaseService, { strict: false });
    await closeSupabaseClient(supabaseService.getClient());
    await closeSupabaseClient(supabaseService.getAdminClient());
  } catch {
    // La app pudo fallar durante bootstrap; en ese caso no hay cliente que cerrar.
  }

  await app.close();
}

export async function loadP0References(
  client: SupabaseClient,
): Promise<P0Refs> {
  const admin = unwrap(
    await client
      .from('usuario')
      .select('id, auth_id, nombre, rol')
      .eq('rol', 'ADMIN')
      .not('auth_id', 'is', null)
      .neq('auth_id', '')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar usuario ADMIN con auth_id',
  );

  const nonAdmin = unwrap(
    await client
      .from('usuario')
      .select('id, auth_id, nombre, rol')
      .in('rol', ['GENERAL', 'VALIDADOR', 'VOLUNTARIO'])
      .not('auth_id', 'is', null)
      .neq('auth_id', '')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar usuario no ADMIN con auth_id',
  );

  const operario = unwrap(
    await client
      .from('usuario')
      .select('id, auth_id, nombre, rol')
      .neq('id', admin.id)
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar usuario alterno para equipo de subcampania',
  );

  const zona = unwrap(
    await client
      .from('division_administrativa')
      .select('id, nombre')
      .order('id', { ascending: true })
      .limit(1)
      .single(),
    'cargar zona/division administrativa',
  );

  return {
    admin: mapUser(admin),
    nonAdmin: mapUser(nonAdmin),
    operario: mapUser(operario),
    zona: {
      id: Number(zona.id),
      nombre: String(zona.nombre),
    },
  };
}

export async function createP0Organizacion(
  client: SupabaseClient,
  created: P0CreatedIds,
  tag: string,
  suffix: string,
) {
  const organizacion = unwrap(
    await client
      .from('organizacion')
      .insert({
        nombre: `[${tag}] ${suffix}`,
        tipo: 'ONG',
        activo: true,
      })
      .select('id, nombre, tipo, activo, logo_url')
      .single(),
    `crear organizacion ${suffix}`,
  );

  created.organizacionIds.push(Number(organizacion.id));
  return {
    ...organizacion,
    id: Number(organizacion.id),
  };
}

export async function cleanupP0Data(
  client: SupabaseClient,
  created: P0CreatedIds,
): Promise<void> {
  if (created.subcampaniaIds.length > 0) {
    await client
      .from('subcampania_equipo')
      .delete()
      .in('subcampania_id', created.subcampaniaIds);
  }

  if (created.campaniaIds.length > 0) {
    await client
      .from('campania_organizacion')
      .delete()
      .in('campania_id', created.campaniaIds);
  }

  if (created.organizacionIds.length > 0) {
    await client
      .from('campania_organizacion')
      .delete()
      .in('organizacion_id', created.organizacionIds);
  }

  if (created.subcampaniaIds.length > 0) {
    await client.from('subcampania').delete().in('id', created.subcampaniaIds);
  }

  if (created.campaniaIds.length > 0) {
    await client.from('campania').delete().in('id', created.campaniaIds);
  }

  if (created.organizacionIds.length > 0) {
    await client
      .from('organizacion')
      .delete()
      .in('id', created.organizacionIds);
  }
}

export function uniqueP0Tag(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function unwrap<T>(result: QueryResult<T>, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${formatError(result.error)}`);
  }

  if (result.data === null) {
    throw new Error(`${context}: la base no devolvio datos.`);
  }

  return result.data;
}

function ensureSupabaseEnv(): void {
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL es obligatoria para los tests P0.');
  }

  if (!process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_KEY o SUPABASE_SERVICE_ROLE_KEY es obligatoria para los tests P0.',
    );
  }

  if (!process.env.SUPABASE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

function mapUser(row: any): P0UserRef {
  return {
    id: Number(row.id),
    authId: String(row.auth_id),
    nombre: String(row.nombre),
    rol: String(row.rol),
  };
}

async function closeSupabaseClient(client?: SupabaseClient): Promise<void> {
  if (!client) {
    return;
  }

  await client.removeAllChannels();
  client.realtime.disconnect();
  (client.auth as any).stopAutoRefresh?.();
}

function formatError(
  error: NonNullable<QueryResult<unknown>['error']>,
): string {
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(' | ');
}
