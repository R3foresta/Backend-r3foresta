/** Harness sintético local: guards/services/RPC reales, transporte psql privado,
 * objetos privados de disco y URLs HMAC de cinco minutos verificadas por HTTP.
 * Nunca lee .env ni acepta PostgreSQL/Storage remotos. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { SubcampaniasModule } from '../../src/subcampanias/subcampanias.module';
import { PlantacionesModule } from '../../src/plantaciones/plantaciones.module';
import { ImpactModule } from '../../src/impact/impact.module';
import { EvidenciasTrazabilidadModule } from '../../src/evidencias-trazabilidad/evidencias-trazabilidad.module';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { VerifiedActorGuard } from '../../src/auth/verified-actor.guard';
import { ParticipacionComandosController } from '../../src/participacion/participacion-comandos.controller';
import { ParticipacionComandosService } from '../../src/participacion/participacion-comandos.service';
import { ParticipacionLecturasController } from '../../src/participacion/participacion-lecturas.controller';
import { ParticipacionLecturasService } from '../../src/participacion/participacion-lecturas.service';
import { ParticipacionRegistroController } from '../../src/participacion/participacion-registro.controller';
import { ParticipacionRegistroService } from '../../src/participacion/application/participacion-registro.service';
import {
  ParticipacionCargasController,
  ParticipacionFotosPublicasController,
} from '../../src/participacion/cargas/participacion-cargas.controller';
import { ParticipacionCargasService } from '../../src/participacion/cargas/participacion-cargas.service';
import { ParticipacionImagenService } from '../../src/participacion/cargas/participacion-imagen.service';
import { configureGlobalRoutes } from '../../src/app.routes';

const run = promisify(execFile);
const literal = (value: unknown): string =>
  value === null || value === undefined
    ? 'NULL'
    : "'" +
      (typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
      ).replace(/'/g, "''") +
      "'";
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('PG')),
);
export async function sql(statement: string): Promise<string> {
  const socket = process.env.PA_A_DB_SOCKET;
  if (
    !socket ||
    !/^\/(private\/)?tmp\/pa-int03a-[^/]+\/socket$/.test(socket) ||
    process.env.PA_A_DB_NAME !== 'pa_int03a_ensayo'
  )
    throw new Error(
      'Solo se admite clúster sintético privado del runner INT03-A.',
    );
  const result = await run(
    process.env.PA_A_DB_PSQL ?? 'psql',
    [
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      socket,
      '-p',
      process.env.PA_A_DB_PORT!,
      '-U',
      'postgres',
      '-d',
      process.env.PA_A_DB_NAME,
      '-c',
      statement,
    ],
    { env },
  );
  return result.stdout.trim();
}
export const controls={initialWrites:true};
export const faults = {
  uploadAfterWriteOnce: false,
  uploadBeforeWriteOnce: false,
  removeOnce: false,
  finalizeAfterCommitOnce: false,
  registroAfterCommitOnce: false,
  blockUpload: null as null | { entered: () => void; wait: Promise<void> },
};
export async function rpc(name: string, args: Record<string, unknown>) {
  if (
    !/^(pa_|fn_)[a-z0-9_]+$/.test(name) ||
    Object.keys(args).some((key) => !/^p_[a-z_]+$/.test(key))
  )
    throw new Error('RPC no permitida.');
  const statement =
    (name.startsWith('fn_m3_') || name === 'fn_vivero_asignar_stock_subcampania' ? 'SELECT to_jsonb(t) FROM public.' : 'SELECT public.') +
    name +
    '(' +
    Object.keys(args)
      .map((key) => key + ' => ' + (Array.isArray(args[key]) && key.endsWith('_ids') ? 'ARRAY[' + (args[key] as unknown[]).map(literal).join(',') + ']::bigint[]' : literal(args[key])))
      .join(',') +
    ')' + (name.startsWith('fn_m3_') || name === 'fn_vivero_asignar_stock_subcampania' ? ' t' : '');
  // PostgREST hoista rol/proconfig antes de ejecutar la RPC. El transporte
  // psql reproduce esa frontera, no confunde SET dentro de función con timer.
  const config = JSON.parse(await sql("SELECT coalesce((SELECT to_json(rolconfig) FROM pg_roles WHERE rolname='service_role'),'[]'::json)")) as string[];
  const local = JSON.parse(await sql('SELECT coalesce(to_json(proconfig),'+literal([])+'::json) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='+literal('public')+' AND p.proname='+literal(name)+' LIMIT 1')) as string[];
  const settings = new Map<string,string>();
  for(const item of [...config,...local]) {
    const [key,value]=item.split('=');
    if(key==='lock_timeout'||key==='statement_timeout') {
      if(!/^[0-9]+(ms|s|min)?$/.test(value))throw new Error('timeout fixture');
      settings.set(key,value);
    }
  }
  const before=[...settings].map(([key,value])=>'SET '+key+'='+literal(value)+';').join('');
  const value = JSON.parse(
    await sql(
      before+'SET ROLE service_role; SELECT public.pa_a_http_transport(' +
        literal(statement) +
        ')',
    ),
  );
  if (
    (name === 'pa_cargas_operar' &&
      args.p_accion === 'FINALIZAR' &&
      faults.finalizeAfterCommitOnce) ||
    (name === 'pa_registro_inicial_ejecutar' && faults.registroAfterCommitOnce)
  ) {
    faults.finalizeAfterCommitOnce = false;
    faults.registroAfterCommitOnce = false;
    return { data: null, error: { code: 'PA_FIXTURE_RESPUESTA_PERDIDA' } };
  }
  return value;
}
export const jwt = new JwtService({
  secret: 'pa-a-http-fixture',
  signOptions: { expiresIn: 3600 },
});
export const token = (actor: string | number) =>
  'Bearer ' + jwt.sign({ sub: 'a-http-' + actor });

export async function startHarness(port = 0, sessionEndpoint = false) {
  const storage = resolve(process.env.PA_A_STORAGE_DIR ?? '');
  if (!/^\/(private\/)?tmp\/pa-int03a-[^/]+\/storage$/.test(storage))
    throw new Error('Storage solo en fixture /tmp.');
  const secret = randomBytes(32);
  let origin = '';
  const localPath = (bucket: string, path: string) => {
    if (
      !['participacion_evidencias','recoleccion_fotos'].includes(bucket) ||
      !path ||
      path.includes('..') ||
      path.startsWith('/')
    )
      throw new Error('ruta');
    const target = resolve(storage, bucket, path);
    if (!target.startsWith(storage + sep)) throw new Error('ruta');
    return target;
  };
  const from = (bucket: string) => ({
    download: async (path: string) => {
      try {
        return {
          data: new Blob([
            new Uint8Array(await readFile(localPath(bucket, path))),
          ]),
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: {
            status:
              (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500,
          },
        };
      }
    },
    upload: async (path: string, bytes: Buffer) => {
      if (faults.blockUpload) {
        const block = faults.blockUpload;
        faults.blockUpload = null;
        block.entered();
        await block.wait;
      }
      if (faults.uploadBeforeWriteOnce) {
        faults.uploadBeforeWriteOnce = false;
        return { data: null, error: { status: 503 } };
      }
      const target = localPath(bucket, path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      try {
        await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      if (faults.uploadAfterWriteOnce) {
        faults.uploadAfterWriteOnce = false;
        return { data: null, error: { status: 504 } };
      }
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      if (faults.removeOnce) {
        faults.removeOnce = false;
        return { data: null, error: { status: 503 } };
      }
      for (const path of paths) {
        try {
          await unlink(localPath(bucket, path));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      return { data: [], error: null };
    },
    createSignedUrl: async (path: string, seconds: number) => {
      const exp = Date.now() + seconds * 1000;
      const sig = createHmac('sha256', secret)
        .update(JSON.stringify([bucket, path, exp]))
        .digest('hex');
      return {
        data: {
          signedUrl:
            origin +
            '/_fixture/storage?bucket=' +
            encodeURIComponent(bucket) +
            '&path=' +
            encodeURIComponent(path) +
            '&exp=' +
            exp +
            '&sig=' +
            sig,
        },
        error: null,
      };
    },
  });
  await sql(`CREATE OR REPLACE FUNCTION public.pa_a_http_transport(p_sql TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER AS $$
    DECLARE r JSONB; c TEXT; m TEXT; d TEXT;
    BEGIN EXECUTE p_sql INTO r; RETURN jsonb_build_object('data',r,'error',NULL);
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS c=RETURNED_SQLSTATE,m=MESSAGE_TEXT,d=PG_EXCEPTION_DETAIL;
      RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',c,'message',m,'details',d)); END $$;
    REVOKE ALL ON FUNCTION public.pa_a_http_transport(TEXT) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.pa_a_http_transport(TEXT) TO service_role;`);
  // Transporte de tablas solo del fixture. No reproduce autorización: la hacen
  // controllers/guards/services reales y las RPC PostgreSQL instaladas.
  const table = (name: string): any => {
    if (!/^[a-z_]+$/.test(name)) throw new Error('tabla');
    const where: string[]=[];const order: string[]=[];let size=1000;let offset=0;let single=false;
    const col=(c:string)=>{if(!/^[a-z_]+$/.test(c))throw new Error('columna');return 't.'+c;};
    const q:any={select:()=>q,eq:(c:string,v:unknown)=>{where.push(col(c)+'='+literal(v));return q;},
      neq:(c:string,v:unknown)=>{where.push(col(c)+'<>'+literal(v));return q;},
      is:(c:string,v:unknown)=>{where.push(col(c)+(v===null?' IS NULL':'='+literal(v)));return q;},
      gt:(c:string,v:unknown)=>{where.push(col(c)+'>'+literal(v));return q;},
      ilike:(c:string,v:string)=>{where.push(col(c)+' ILIKE '+literal(v));return q;},
      in:(c:string,v:unknown[])=>{where.push(col(c)+' IN ('+(v.length?v.map(literal).join(','):'NULL')+')');return q;},
      not:(c:string,op:string,v:unknown)=>{if(op==='is'&&v===null)where.push(col(c)+' IS NOT NULL');else if(op==='like')where.push(col(c)+' NOT LIKE '+literal(v));else throw new Error('not');return q;},
      or:(expression:string)=>{if(expression==='entidad_id.is.null,entidad_id.gt.0'){where.push('(t.entidad_id IS NULL OR t.entidad_id>0)');return q;}throw new Error('or:'+expression);},
      order:(c:string,o?:{ascending?:boolean})=>{order.push(col(c)+(o?.ascending===false?' DESC':' ASC'));return q;},
      range:(a:number,b:number)=>{offset=a;size=b-a+1;return q;},limit:(n:number)=>{size=n;return q;},
      single:()=>{single=true;return q;},maybeSingle:()=>{single=true;return q;},
      then:(resolve:any,reject:any)=>sql('SET ROLE service_role; SELECT coalesce(jsonb_agg(x),'+literal([])+'::jsonb) FROM (SELECT t.* FROM public.'+name+' t'+(where.length?' WHERE '+where.join(' AND '):'')+(order.length?' ORDER BY '+order.join(','):'')+' LIMIT '+size+' OFFSET '+offset+')x')
        .then(value=>{const rows=JSON.parse(value);return {data:single?(rows[0]??null):rows,error:null,count:rows.length};}).then(resolve,reject)};
    return q;
  };
  const client={rpc:(name:string,args:Record<string,unknown>)=>{
    const pending:any=rpc(name,args);pending.single=()=>pending;return pending;},from:table,storage:{from}};
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({}),SubcampaniasModule,PlantacionesModule,ImpactModule,EvidenciasTrazabilidadModule],
    controllers: [
      ParticipacionComandosController,
      ParticipacionLecturasController,
      ParticipacionRegistroController,
      ParticipacionCargasController,
      ParticipacionFotosPublicasController,
    ],
    providers: [
      VerifiedActorGuard,
      ParticipacionComandosService,
      ParticipacionLecturasService,
      ParticipacionRegistroService,
      ParticipacionCargasService,
      ParticipacionImagenService,
      { provide: ConfigService, useValue: { get: () => 'pa-a-http-fixture' } },
      {
        provide: SupabaseService,
        useValue: { getAdminClient: () => client, getClient:()=>{throw new Error('Cliente público no permitido en harness D');} },
      },
    ],
  }).overrideProvider(SupabaseService).useValue({getAdminClient:()=>client,getClient:()=>{throw new Error('Cliente público no permitido en harness D');}}).overrideProvider(ConfigService).useValue({get:(key:string)=>key==='PARTICIPACION_INICIAL_ESCRITURA_HABILITADA'?String(controls.initialWrites):'pa-a-http-fixture'}).compile();
  const app = module.createNestApplication();
  configureGlobalRoutes(app);
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
  app.enableCors({
    origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
    credentials: true,
    exposedHeaders: ['Retry-After'],
  });
  const express = app.getHttpAdapter().getInstance();
  express.get('/_fixture/storage', async (req: any, res: any) => {
    try {
      const { bucket, path, exp, sig } = req.query;
      if (
        typeof bucket !== 'string' ||
        typeof path !== 'string' ||
        typeof exp !== 'string' ||
        typeof sig !== 'string'
      )
        throw new Error('firma');
      const expected = createHmac('sha256', secret)
        .update(JSON.stringify([bucket, path, Number(exp)]))
        .digest('hex');
      if (
        sig !== expected ||
        Number(exp) < Date.now() ||
        Number(exp) > Date.now() + 301000
      )
        throw new Error('firma');
      const bytes = await readFile(localPath(bucket, path));
      res
        .set('Cache-Control', 'private, no-store')
        .type('image/jpeg')
        .send(bytes);
    } catch {
      res.status(404).json({ error: 'Objeto privado no visible' });
    }
  });
  if (sessionEndpoint)
    express.get('/_fixture/sesion/:actor', (req: any, res: any) => {
      const allowed = ['800', '801', '802', '803', '804', '805','901'];
      if (!allowed.includes(req.params.actor))
        return res.status(404).json({ error: 'Actor sintético no disponible' });
      res
        .set('Cache-Control', 'private, no-store')
        .json({
          actor_id: req.params.actor,
          authorization: token(req.params.actor),
          sintetico: true,
        });
    });
  await app.listen(port, '127.0.0.1');
  origin = await app.getUrl();
  return {
    app,
    origin,
    storage,
    from,
    cargas: module.get(ParticipacionCargasService),
  };
}
