import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { ParticipacionComandosController } from '../../src/participacion/participacion-comandos.controller';
import { ParticipacionComandosService } from '../../src/participacion/participacion-comandos.service';
import { ParticipacionLecturasController } from '../../src/participacion/participacion-lecturas.controller';
import { ParticipacionLecturasService } from '../../src/participacion/participacion-lecturas.service';
import { configureGlobalRoutes } from '../../src/app.routes';

// Solo el harness aislado suministra este socket. No carga .env ni destino remoto.
const run = promisify(execFile);
const literal = (value: unknown): string =>
  value === null
    ? 'NULL'
    : Array.isArray(value) &&
        value.every(
          (entry) => typeof entry === 'string' && /^[1-9][0-9]*$/.test(entry),
        )
      ? 'ARRAY[' + value.join(',') + ']::bigint[]'
      : "'" +
        (typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)
        ).replace(/'/g, "''") +
        "'";
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('PG')),
);
async function sql(statement: string): Promise<string> {
  if (
    !process.env.PA_C_DB_SOCKET?.startsWith('/private/tmp/') &&
    !process.env.PA_C_DB_SOCKET?.startsWith('/tmp/')
  )
    throw new Error('Se requiere clúster sintético del harness.');
  const result = await run(
    process.env.PA_C_DB_PSQL ?? 'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      process.env.PA_C_DB_SOCKET,
      '-p',
      process.env.PA_C_DB_PORT!,
      '-U',
      'postgres',
      '-d',
      process.env.PA_C_DB_NAME!,
      '-c',
      statement,
    ],
    { env },
  );
  return result.stdout.trim();
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
};
async function rpc(name: string, args: Record<string, unknown>) {
  try {
    const keys = signatures[name] ?? Object.keys(args);
    if (
      !/^pa_[a-z_]+$/.test(name) ||
      keys.some((key) => !/^p_[a-z_]+$/.test(key))
    )
      throw new Error('RPC no permitida.');
    const statement =
      'SELECT public.' +
      name +
      '(' +
      keys.map((key) => key + ' => ' + literal(args[key])).join(',') +
      ')';
    const output = await sql(
      'SET ROLE service_role; SELECT public.pa_http_fixture_transport(' +
        literal(statement) +
        ');',
    );
    return JSON.parse(output) as {
      data: unknown;
      error: { code: string; details: string } | null;
    };
  } catch {
    return { data: null, error: { code: 'RPC_FAILED' } };
  }
}

describe('PA INT02-C HTTP → guard → servicio → PostgreSQL aislado', () => {
  let app: INestApplication;
  const examples: Record<string, { http: number; body: unknown }> = {};
  const capture = (
    name: string,
    response: { status: number; body: unknown },
  ) => {
    examples[name] = { http: response.status, body: response.body };
  };
  const jwt = new JwtService({
    secret: 'pa-c-http-fixture',
    signOptions: { expiresIn: 600 },
  });
  const token = (actor: string) =>
    'Bearer ' + jwt.sign({ sub: 'http-' + actor });
  const path = '/api/v1/participacion';
  beforeAll(async () => {
    await sql(`
      INSERT INTO public.campania(id,nombre) VALUES(600,'Campaña HTTP');
      INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo,correo) VALUES
        (600,'http-admin','ADMIN HTTP','admin','ADMIN',true,'admin-http@example.test'),
        (601,'http-admin2','ADMIN HTTP 2','admin2','ADMIN',true,NULL),
        (602,'http-contextual','Gestora HTTP','gestora','VOLUNTARIO',true,NULL),
        (603,'http-plantador','Plántador HTTP','plantador','VOLUNTARIO',true,' Persona.HTTP@example.test '),
        (604,'http-voluntario','Voluntario HTTP','voluntario','VOLUNTARIO',true,NULL),
        (605,'http-inactivo','Inactivo HTTP','inactivo','ADMIN',false,NULL);
      INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by) VALUES
        (600,600,'Propia HTTP','ACTIVA','HTTP600',600,600),
        (601,600,'Ajena HTTP','ACTIVA','HTTP601',600,600),
        (602,600,'Cerrada HTTP','COMPLETADA','HTTP602',600,600);
      CREATE OR REPLACE FUNCTION public.pa_actor_verificar(p_auth_id TEXT) RETURNS JSONB LANGUAGE SQL SECURITY INVOKER
        AS $$ SELECT jsonb_build_object('usuario_id',id::text,'rol',rol::text,'activo',activo) FROM public.usuario WHERE auth_id=p_auth_id $$;
      REVOKE ALL ON FUNCTION public.pa_actor_verificar(TEXT) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.pa_actor_verificar(TEXT) TO service_role;
      CREATE FUNCTION public.pa_http_fixture_transport(p_sql TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER AS $$
      DECLARE v_result JSONB; v_code TEXT; v_details TEXT;
      BEGIN
        EXECUTE p_sql INTO v_result;
        RETURN jsonb_build_object('data',v_result,'error',NULL);
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_code=RETURNED_SQLSTATE,v_details=PG_EXCEPTION_DETAIL;
        RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',v_code,'details',v_details));
      END $$;
      REVOKE ALL ON FUNCTION public.pa_http_fixture_transport(TEXT) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.pa_http_fixture_transport(TEXT) TO service_role;
    `);
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({})],
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
          useValue: { get: () => 'pa-c-http-fixture' },
        },
        {
          provide: SupabaseService,
          useValue: { getAdminClient: () => ({ rpc }) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureGlobalRoutes(app);
    await app.listen(0, '127.0.0.1');
    const designate = await request(app.getHttpServer())
      .post(path + '/accesos/designar-administrador')
      .set('Authorization', token('admin'))
      .send({
        comando_id: randomUUID(),
        usuario_destino_id: '602',
        ambitos: [{ subcampania_id: '600', revision_esperada: '0' }],
      });
    expect(designate.status).toBe(200);
    capture('designacion_confirmada', designate);
    const grant = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('contextual'))
      .send({
        comando_id: randomUUID(),
        usuario_destino_id: '603',
        ambitos: [{ subcampania_id: '600', revision_esperada: '0' }],
      });
    expect(grant.status).toBe(200);
    capture('plantador_confirmado', grant);
  });
  afterAll(async () => {
    await app?.close();
    writeFileSync(
      resolve('docs/pa-int02c-ejemplos.json'),
      JSON.stringify(
        {
          origen:
            'HTTP directo contra PostgreSQL sintético aislado; sólo identidades de fixture.',
          ejemplos: examples,
        },
        null,
        2,
      ) + '\n',
    );
  });

  it.each([
    'capacidades',
    'comandos/' + randomUUID() + '?operacion=OTORGAR_PLANTADOR',
  ])('visitante no abre %s', async (endpoint) => {
    const response = await request(app.getHttpServer())
      .get(path + '/' + endpoint)
      .set('x-user-role', 'ADMIN');
    expect(response.status).toBe(401);
    expect(response.body.error.codigo).toBe('SESION_INVALIDA');
    expect(response.body.resultado_concluyente).toBe(false);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });
  it('cuenta inactiva y header discordante usan envelope seguro', async () => {
    const inactive = await request(app.getHttpServer())
      .get(path + '/capacidades')
      .set('Authorization', token('inactivo'));
    expect(inactive.status).toBe(403);
    expect(inactive.body.error.codigo).toBe('CUENTA_INACTIVA');
    const mismatch = await request(app.getHttpServer())
      .get(path + '/capacidades')
      .set('Authorization', token('plantador'))
      .set('x-auth-id', 'http-admin');
    expect(mismatch.status).toBe(401);
    expect(mismatch.body.error.codigo).toBe('IDENTIDAD_DISCORDANTE');
  });
  it.each(['voluntario', 'plantador', 'contextual', 'admin'])(
    'capacidades de %s por JWT/BD, sin filtrar por stock',
    async (actor) => {
      const response = await request(app.getHttpServer())
        .get(path + '/capacidades')
        .set('Authorization', token(actor));
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('observado_en');
      expect(response.body).toHaveProperty('siguiente_cursor');
      if (actor === 'voluntario')
        expect(response.body.data.subcampanias).toEqual([]);
      else {
        const own = response.body.data.subcampanias.find(
          (s: { subcampania_id: string }) => s.subcampania_id === '600',
        );
        expect(own.acciones.registrar_inicial).toBe(true);
      }
      capture('capacidades_' + actor, response);
    },
  );
  it('miembros requieren gestor propio y no exponen contactos, ADMIN global deduplicado', async () => {
    for (const actor of ['voluntario', 'plantador'])
      expect(
        (
          await request(app.getHttpServer())
            .get('/api/v1/subcampanias/600/miembros-participacion')
            .set('Authorization', token(actor))
        ).status,
      ).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/subcampanias/601/miembros-participacion')
          .set('Authorization', token('contextual'))
      ).status,
    ).toBe(403);
    const response = await request(app.getHttpServer())
      .get('/api/v1/subcampanias/600/miembros-participacion')
      .set('Authorization', token('contextual'));
    expect(response.status).toBe(200);
    capture('miembros', response);
    const rows = response.body.data;
    expect(
      rows.filter((u: { usuario_id: string }) => u.usuario_id === '600'),
    ).toHaveLength(1);
    for (const member of rows) {
      expect(member).not.toHaveProperty('correo');
      expect(member).not.toHaveProperty('auth_id');
    }
  });
  it('busca correo exacto normalizado sin retornarlo; revisión selección completa', async () => {
    const response = await request(app.getHttpServer())
      .post(path + '/personas/buscar')
      .set('Authorization', token('contextual'))
      .send({
        modo: 'CORREO_EXACTO',
        consulta: 'persona.http@EXAMPLE.test',
        accion: 'OTORGAR_PLANTADOR',
        subcampania_ids: ['600'],
      });
    expect(response.status).toBe(200);
    capture('busqueda_correo_exacto', response);
    expect(response.body.data).toEqual([
      { usuario_id: '603', nombre: 'Plántador HTTP', organizacion: null },
    ]);
    const review = await request(app.getHttpServer())
      .post(path + '/accesos/revisar')
      .set('Authorization', token('contextual'))
      .send({ usuario_destino_id: '603', subcampania_ids: ['600'] });
    expect(review.status).toBe(200);
    capture('revision_accesos', review);
    expect(review.body.data.ambitos[0].revision_permiso).toBe('1');
    const foreign = await request(app.getHttpServer())
      .post(path + '/accesos/revisar')
      .set('Authorization', token('contextual'))
      .send({ usuario_destino_id: '603', subcampania_ids: ['600', '601'] });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.ambitos).toEqual([]);
  });
  it('SIN_CAMBIOS valida revisión; retiro conserva recibo propio tras perder autoridad', async () => {
    const command = randomUUID();
    const body = {
      comando_id: command,
      usuario_destino_id: '603',
      ambitos: [{ subcampania_id: '600', revision_esperada: '1' }],
    };
    const same = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('contextual'))
      .send(body);
    expect(same.status).toBe(200);
    capture('sin_cambios', same);
    expect(same.body.resultado.cambios[0].usuarios[0].cambio).toBe(
      'SIN_CAMBIOS',
    );
    const stale = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('contextual'))
      .send({
        ...body,
        comando_id: randomUUID(),
        ambitos: [{ subcampania_id: '600', revision_esperada: '0' }],
      });
    expect(stale.status).toBe(409);
    expect(stale.body.estado).toBe('RECHAZADO');
    expect(stale.body.error.codigo).toBe('REVISION_OBSOLETA');
    capture('revision_obsoleta_rechazado', stale);
    const replace = await request(app.getHttpServer())
      .post(path + '/accesos/reemplazar-administrador')
      .set('Authorization', token('admin'))
      .send({
        comando_id: randomUUID(),
        usuario_saliente_id: '602',
        usuario_reemplazo_id: '604',
        tratamiento_saliente: 'SIN_ACCESO',
        ambitos: [
          {
            subcampania_id: '600',
            revision_saliente_esperada: '1',
            revision_reemplazo_esperada: '0',
          },
        ],
      });
    expect(replace.status).toBe(200);
    capture('reemplazo_confirmado', replace);
    const replay = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('contextual'))
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(same.body);
    const recovered = await request(app.getHttpServer())
      .get(path + '/comandos/' + command + '?operacion=OTORGAR_PLANTADOR')
      .set('Authorization', token('contextual'));
    expect(recovered.status).toBe(200);
    expect(recovered.body).toEqual(same.body);
    capture('recuperacion_propia', recovered);
    const reused = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('contextual'))
      .send({ ...body, usuario_destino_id: '604' });
    expect(reused.status).toBe(409);
    expect(reused.body.error.codigo).toBe('COMANDO_REUTILIZADO');
    capture('clave_reutilizada_inconcluso', reused);
    const foreignReceipt = await request(app.getHttpServer())
      .get(path + '/comandos/' + command + '?operacion=OTORGAR_PLANTADOR')
      .set('Authorization', token('admin'));
    expect(foreignReceipt.status).toBe(404);
    expect(foreignReceipt.body.error.codigo).toBe('COMANDO_NO_CONFIRMADO');
    capture('comando_no_confirmado_inconcluso', foreignReceipt);
  });
  it('DTO rechaza campos desconocidos y números, sin recibo durable', async () => {
    const command = randomUUID();
    const response = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('admin'))
      .send({
        comando_id: command,
        usuario_destino_id: '603',
        actor_id: '600',
        ambitos: [{ subcampania_id: '600', revision_esperada: '1' }],
      });
    expect(response.status).toBe(422);
    expect(response.body.error.codigo).toBe('CAMPO_NO_PERMITIDO');
    expect(response.body.comando_id).toBe(command);
    const bad = await request(app.getHttpServer())
      .post(path + '/accesos/otorgar-plantador')
      .set('Authorization', token('admin'))
      .send({
        comando_id: randomUUID(),
        usuario_destino_id: 603,
        ambitos: [{ subcampania_id: '600', revision_esperada: '1' }],
      });
    expect(bad.status).toBe(422);
  });
  it('autoridad administrativa separada, motivo/revisión/recuperación', async () => {
    const read = await request(app.getHttpServer())
      .get('/api/v1/usuarios/603/autoridad')
      .set('Authorization', token('admin'));
    expect(read.status).toBe(200);
    expect(read.body.data.revision_autoridad).toBe('0');
    capture('autoridad', read);
    const command = randomUUID();
    const role = await request(app.getHttpServer())
      .post('/api/v1/usuarios/603/roles')
      .set('Authorization', token('admin'))
      .send({
        comando_id: command,
        rol_global: 'GENERAL',
        revision_esperada: '0',
        motivo: 'Cambio sintético HTTP',
      });
    expect(role.status).toBe(200);
    expect(role.body.resultado.tipo).toBe('ROL_GLOBAL');
    capture('rol_confirmado', role);
    const low = await request(app.getHttpServer())
      .post('/api/v1/usuarios/603/roles')
      .set('Authorization', token('plantador'))
      .send({
        comando_id: randomUUID(),
        rol_global: 'ADMIN',
        revision_esperada: '1',
        motivo: 'Cambio no autorizado',
      });
    expect(low.status).toBe(403);
    expect(low.body.estado).toBe('RECHAZADO');
    capture('capacidad_rechazado', low);
    const deactivate = await request(app.getHttpServer())
      .post('/api/v1/usuarios/603/inactivaciones')
      .set('Authorization', token('admin'))
      .send({
        comando_id: randomUUID(),
        revision_esperada: '1',
        motivo: 'Baja sintética HTTP',
      });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.resultado.activo).toBe(false);
    capture('inactivacion_confirmada', deactivate);
  });
  it('PREPARADO recupera 202 sin resultado y Retry-After, sin prometer ejecución', async () => {
    const command = randomUUID();
    await sql(
      `INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,estado,subcampania_preparacion_id) VALUES(600,'REGISTRAR_PLANTACION_INICIAL',${literal(command)},'PREPARADO',600);`,
    );
    const response = await request(app.getHttpServer())
      .get(
        path +
          '/comandos/' +
          command +
          '?operacion=REGISTRAR_PLANTACION_INICIAL',
      )
      .set('Authorization', token('admin'));
    expect(response.status).toBe(202);
    expect(response.headers['retry-after']).toBe('2');
    expect(response.body.estado).toBe('SIN_RESULTADO');
    capture('preparado_sin_resultado', response);
  });
});
