import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { startHarness, sql, token, controls } from '../../scripts/qa/pa-int02d-harness';

const lit = (s: string) => "'" + s.replace(/'/g, "''") + "'";
describe('INT02-D HTTP real → guard/service/RPC/PostGIS/Storage privado', () => {
  let h: Awaited<ReturnType<typeof startHarness>>;
  let photo: Buffer, today: string, originId: number, otherOrigin: number;
  let uploadedId: number;
  const cases: string[]=[];
  const get = (path:string,actor?:number) => {
    const r=request(h.app.getHttpServer()).get('/api'+path);
    return actor===undefined?r:r.set('Authorization',token(actor));
  };
  const post = (path:string,body:unknown,actor=800) => request(h.app.getHttpServer()).post('/api'+path).set('Authorization',token(actor)).send(body);
  const repo = (origin=originId,evid=uploadedId) => ({subcampania_id:980,es_reposicion:true,registro_plantacion_origen_id:origin,
    fecha_plantacion:today,latitud:-16.5,longitud:-68.1,detalles:[{asignacion_id:98001,lote_vivero_id:81,planta_id:8,cantidad:1}],evidencia_ids:[evid],coresponsable_ids:[]});
  const upload = (actor=800,scope='980',contract=true) => {
    let r=request(h.app.getHttpServer()).post('/api/registros-plantacion/evidencias-pendientes').set('Authorization',token(actor));
    if(contract)r=r.field('subcampania_id',scope).field('es_reposicion','true');
    return r.attach('fotos',photo,{filename:'privada.png',contentType:'image/png'});
  };
  beforeAll(async()=>{
    today=await sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date");
    await sql(`INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom,meta_total_arboles)
      SELECT n,800,'HTTP D '||n,'ACTIVA','HTTP-D-'||n,800,800,1,ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),2 FROM generate_series(980,984)n;
      INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) SELECT n,8,100,2 FROM generate_series(980,984)n;
      INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(980,800,'COORDINADOR',800);
      INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
      VALUES(98001,980,81,'REPOSICION',10,800,now()-interval '1 day',CURRENT_DATE-1);`);
    originId=Number(await sql("INSERT INTO public.registro_plantacion(subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,cantidad_muerta_acumulada,codigo_trazabilidad,created_by) VALUES(980,800,CURRENT_DATE,5,5,'HTTP-D-ORIGEN',800) RETURNING id"));
    otherOrigin=Number(await sql("INSERT INTO public.registro_plantacion(subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,cantidad_muerta_acumulada,codigo_trazabilidad,created_by) VALUES(981,800,CURRENT_DATE,5,5,'HTTP-D-AJENO',800) RETURNING id"));
    photo=await sharp({create:{width:5,height:4,channels:3,background:'#228b22'}}).withMetadata({exif:{IFD0:{Artist:'SECRETO_EXIF_D'}}}).png().toBuffer();
    h=await startHarness();
  });
  afterEach(()=>{cases.push(expect.getState().currentTestName??'');controls.initialWrites=true;});
  afterAll(async()=>{
    await h?.app.close();
    const p=resolve('docs/evidencia/pa-int02d-local.json');const e=JSON.parse(readFileSync(p,'utf8'));e.d_http_casos=cases;
    writeFileSync(p,JSON.stringify(e,null,2)+'\n');
  });
  it('JWT/actividad y rol interno se comprueban antes de las rutas equivalentes',async()=>{
    expect((await get('/subcampanias/980/plantacion/context')).status).toBe(401);
    expect((await get('/subcampanias/980/plantacion/context',801)).status).toBe(403);
    expect((await get('/subcampanias/980/plantacion/context',805)).status).toBe(403);
    const spoof=await get('/subcampanias/980/plantacion/context',800).set('x-auth-id','a-http-801');expect(spoof.status).toBe(401);
  });
  it('inicial/contexto/upload antiguos dan409 sin crear evidencias o consumir stock',async()=>{
    const before=await sql('SELECT count(*) FROM public.evidencias_trazabilidad');
    const context=await get('/subcampanias/980/plantacion/context',800);expect(context.status).toBe(409);expect(context.body.error.codigo).toBe('CLIENTE_INCOMPATIBLE');
    const initial=await post('/registros-plantacion',{...repo(originId,1),es_reposicion:false,registro_plantacion_origen_id:undefined});
    expect(initial.status).toBe(409);expect(initial.body.error.codigo).toBe('CLIENTE_INCOMPATIBLE');
    const pending=await upload(800,'980',false);expect(pending.status).toBe(409);expect(pending.body.error.codigo).toBe('CLIENTE_INCOMPATIBLE');
    expect(await sql('SELECT count(*) FROM public.evidencias_trazabilidad')).toBe(before);
    expect(await sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=98001')).toBe('0');
  });
  it('GET plan permanece disponible para toda cuenta activa y escritura exigeADMIN',async()=>{
    expect((await get('/subcampanias/980/plan',801)).status).toBe(200);
    const denied=await request(h.app.getHttpServer()).put('/api/subcampanias/980/plan').set('Authorization',token(801)).send({meta_total_arboles:2,revision_esperada:0,metas:[{planta_id:8,porcentaje_objetivo:100,cantidad_objetivo:2}]});expect(denied.status).toBe(403);
    const closed=await post('/subcampanias/982/cerrar',{estado_final:'COMPLETADA',fecha_cierre_operativo:today+'T00:00:00Z',fecha_fin_mantenimiento:today});expect(closed.status).toBe(201);expect(closed.body.data.estado).toBe('COMPLETADA');
  });
  it('upload interno exige ámbito/equipo y usa original privado+derivado sanitizado',async()=>{
    expect((await upload(801)).status).toBe(403);
    expect((await upload(803)).status).toBe(403);
    const good=await upload();expect(good.status).toBe(201);uploadedId=Number(good.body.evidencia_ids[0]);expect(uploadedId).toBeGreaterThan(0);
    expect(JSON.stringify(good.body)).not.toMatch(/original|ruta_archivo|public_url|metadata/);
    const row=JSON.parse(await sql('SELECT to_jsonb(e) FROM public.evidencias_trazabilidad e WHERE id='+uploadedId));expect(row.bucket).toBe('participacion_evidencias');expect(row.metadata.subcampania_id).toBe('980');
    const bytes=await h.from(row.bucket).download(row.metadata.ruta_derivada);const metadata=await sharp(Buffer.from(await bytes.data!.arrayBuffer())).metadata();expect(metadata.format).toBe('jpeg');expect(metadata.exif).toBeUndefined();
  });
  it('API general/aliases/foto pública no abren una pendiente privada porID',async()=>{
    expect((await get('/evidencias-trazabilidad/'+uploadedId,800)).status).toBe(404);
    const listing=await get('/evidencias-trazabilidad?entidad_id=0',800);expect(listing.status).toBe(200);expect(listing.body.data).toHaveLength(0);
    expect((await get('/v1/impact/imagenes/'+uploadedId)).status).toBe(404);
  });
  it('origen ajeno rechaza HTTP íntegro y origen propio conserva reposición interna',async()=>{
    const before=await sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=98001');
    const denied=await post('/registros-plantacion',repo(otherOrigin));expect(denied.status).toBe(400);expect(await sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=98001')).toBe(before);
    const good=await post('/registros-plantacion',repo());expect(good.status).toBe(201);expect(good.body.data.cantidad_total_plantada).toBe(1);
    expect(await sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=98001')).toBe('1');
    const image=await get('/v1/impact/imagenes/'+uploadedId);expect(image.status).toBe(200);expect(image.headers['content-type']).toContain('image/jpeg');expect((await sharp(image.body).metadata()).exif).toBeUndefined();
  });
  it('ADMIN no descarta ajenas/vinculadas y descarta solo pendientes propias',async()=>{
    const other=await upload();expect(other.status).toBe(201);const id=other.body.evidencia_ids[0];
    const deny=await request(h.app.getHttpServer()).delete('/api/registros-plantacion/evidencias-pendientes').set('Authorization',token(803)).send({subcampania_id:980,es_reposicion:true,evidencia_ids:[id]});expect(deny.status).toBe(403);
    const good=await request(h.app.getHttpServer()).delete('/api/registros-plantacion/evidencias-pendientes').set('Authorization',token(800)).send({subcampania_id:980,es_reposicion:true,evidencia_ids:[id,uploadedId]});expect(good.status).toBe(200);expect(good.body.data.evidencia_ids_descartadas).toEqual([Number(id)]);
  });
  it('pausa de servidor conserva preparación/GET y replay terminal sin nueva escritura',async()=>{
    await sql("INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) VALUES(98300,983,81,'PLANTACION_INICIAL',10,800,now()-interval '1 day',CURRENT_DATE-1)");
    const command=randomUUID(),carga=randomUUID();
    expect((await post('/v1/participacion/comandos/preparaciones',{comando_id:command,operacion:'REGISTRAR_PLANTACION_INICIAL',subcampania_id:'983'})).status).toBe(200);
    const up=await request(h.app.getHttpServer()).put('/api/v1/participacion/comandos/'+command+'/cargas/'+carga+'?operacion=REGISTRAR_PLANTACION_INICIAL').set('Authorization',token(800)).attach('foto',photo,{filename:'foto.png',contentType:'image/png'});expect(up.status).toBe(201);
    const value={comando_id:command,subcampania_id:'983',plan_revision_esperada:'0',fecha_plantacion:today,latitud:-16.5,longitud:-68.1,especies:[{planta_id:'8',cantidad:1}],coresponsable_ids:[],evidencia_ids:[up.body.data.evidencia_id]};
    controls.initialWrites=false;
    const paused=await post('/v1/plantaciones/iniciales',value);expect(paused.status).toBe(503);expect(paused.body.error.codigo).toBe('RESULTADO_NO_DETERMINADO');expect(paused.body.resultado_concluyente).toBe(false);
    expect(await sql('SELECT count(*) FROM public.registro_plantacion WHERE subcampania_id=983')).toBe('0');
    expect((await get('/v1/participacion/comandos/'+command+'?operacion=REGISTRAR_PLANTACION_INICIAL',800)).status).toBe(202);
    controls.initialWrites=true;const saved=await post('/v1/plantaciones/iniciales',value);expect(saved.status).toBe(200);expect(saved.body.estado).toBe('CONFIRMADO');
    controls.initialWrites=false;const replay=await post('/v1/plantaciones/iniciales',value);expect(replay.status).toBe(200);expect(replay.body).toEqual(saved.body);
    const changed=await post('/v1/plantaciones/iniciales',{...value,especies:[{planta_id:'8',cantidad:2}]});expect(changed.status).toBe(409);expect(changed.body.error.codigo).toBe('COMANDO_REUTILIZADO');
    expect(await sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=98300')).toBe('1');
  });
  it('foto histórica elegible se sanitiza sinJWT; pendiente/ajena no accede aStorage',async()=>{
    await h.from('recoleccion_fotos').upload('legado-elegible.png',photo);
    const id=await sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,creado_por_usuario_id) VALUES(1,"+originId+",'recoleccion_fotos','legado-elegible.png','FOTO',800) RETURNING id");
    const got=await get('/v1/impact/imagenes/'+id);expect(got.status).toBe(200);const meta=await sharp(got.body).metadata();expect(meta.format).toBe('jpeg');expect(meta.exif).toBeUndefined();
    const pending=await sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,creado_por_usuario_id) VALUES(1,0,'recoleccion_fotos','legado-elegible.png','FOTO',800) RETURNING id");
    expect((await get('/v1/impact/imagenes/'+pending)).status).toBe(404);
    await sql('UPDATE public.evidencias_trazabilidad SET eliminado_en=now() WHERE id='+id);expect((await get('/v1/impact/imagenes/'+id)).status).toBe(404);
  });
});
