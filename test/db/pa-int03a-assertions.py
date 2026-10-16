"""RPC/locks reales sobre fixture aislado INT03-A. Objetos reales se prueban por HTTP.
Los datos de evidencia de esta capa son metadatos sintéticos explícitos.
"""
import argparse
import copy
import json
import os
from pathlib import Path
import select
import subprocess
import time
import uuid

p = argparse.ArgumentParser()
for key in ('socket','cluster','port','database','psql','evidence'):
    p.add_argument('--'+key, required=True)
a = p.parse_args()
root = Path(__file__).resolve().parents[2]
assert a.database == 'pa_int03a_ensayo'
assert Path(a.socket).resolve().parent == Path(a.cluster).resolve().parent
assert Path(a.cluster).resolve().parent.name.startswith('pa-int03a-')
base = [a.psql,'-X','-qAt','-v','ON_ERROR_STOP=1','-h',a.socket,'-p',a.port,'-U','postgres','-d',a.database]
evidence = json.loads(Path(a.evidence).read_text())
cases, races = evidence['casos'], evidence['carreras']


def lit(value):
    if value is None: return 'NULL'
    if isinstance(value, (dict,list)): value=json.dumps(value,ensure_ascii=False,separators=(',',':'))
    return "'"+str(value).replace("'","''")+"'"


def sql(statement, error=None):
    result = subprocess.run(base, input="SET statement_timeout='25s'; "+statement, text=True,capture_output=True,timeout=30)
    if error:
        assert result.returncode and error in result.stderr, result.stderr
        return result.stderr
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def rpc(name, *params):
    return json.loads(sql('SET ROLE service_role; SELECT public.'+name+'('+','.join(lit(x) for x in params)+');'))


def ok(label, ids):
    cases.append({'caso':label,'trazabilidad':ids,'resultado':'CORRECTO'})
    print('OK: '+label,flush=True)


def auth(actor): return 'a-http-'+str(actor)

def access(operation,user,scope,revision=0):
    value={'usuario_destino_id':str(user),'ambitos':[{'subcampania_id':str(scope),'revision_esperada':str(revision)}]}
    canon=json.dumps(value,sort_keys=True,separators=(',',':'))
    return 'SET ROLE service_role; SELECT public.pa_acceso_ejecutar(800,'+lit(auth(800))+','+lit(operation)+','+lit(str(uuid.uuid4()))+','+lit(value)+'::jsonb,'+lit(canon)+');'


def initial(value,key,actor=801):
    canon=copy.deepcopy(value)
    for field in ('latitud','longitud'): canon[field]=format(canon[field],'.6f')
    return 'SET ROLE service_role; SELECT public.pa_registro_inicial_ejecutar('+str(actor)+','+lit(auth(actor))+','+lit(key)+','+lit(value)+'::jsonb,'+lit(json.dumps(canon,sort_keys=True,ensure_ascii=False,separators=(',',':')))+');'


def prepare(scope=800,actor=801):
    key=str(uuid.uuid4())
    response=rpc('pa_cargas_operar',actor,auth(actor),'PREPARAR',key,{'subcampania_id':str(scope)})
    assert response['http_status']==200,response
    return key


def photo(key,actor=801):
    payload={'carga_id':str(uuid.uuid4()),'hash_original':'12'*32,'hash_derivada':'34'*32,
             'tamano_original':80,'tamano_derivada':70,'mime_original':'image/png','lease_token':str(uuid.uuid4())}
    reserved=rpc('pa_cargas_operar',actor,auth(actor),'RESERVAR',key,payload)
    assert reserved['http_status']==202,reserved
    job=reserved['body']['data']['trabajo']
    payload.update(generacion=job['generacion'],lease_token=job['lease_token'],objetos_verificados=True)
    finished=rpc('pa_cargas_operar',actor,auth(actor),'FINALIZAR',key,payload)
    assert finished['http_status']==201,finished
    return finished['body']['data']['evidencia_id']


def payload(scope=800,key=None,count=1,actor=801,date=None,cores=None):
    key=key or prepare(scope,actor)
    value={'subcampania_id':str(scope),'plan_revision_esperada':'0','fecha_plantacion':date or today,
           'latitud':-16.5,'longitud':-68.1,'especies':[{'planta_id':'8','cantidad':count}],
           'coresponsable_ids':cores or [],'evidencia_ids':[photo(key,actor)],'observaciones':None,'afiliaciones_declaradas':[]}
    return key,value


def execute(value,key,actor=801): return json.loads(sql(initial(value,key,actor)))
def confirmed(response):
    assert response['http_status']==200 and response['body']['estado']=='CONFIRMADO',response
    return response['body']['resultado']
def rejected(response,code):
    assert response['body']['estado']=='RECHAZADO' and response['body']['error']['codigo']==code,response
    return response

def recovery(key,actor=801): return rpc('pa_comando_recuperar',actor,auth(actor),'REGISTRAR_PLANTACION_INICIAL',key)

def state(scope):
    return sql("SELECT jsonb_build_object('registros',(SELECT count(*) FROM public.registro_plantacion WHERE subcampania_id="+str(scope)+"),'consumo',(SELECT coalesce(sum(cantidad_consumida),0) FROM public.asignacion_vivero_subcampania WHERE subcampania_id="+str(scope)+"),'contador',(SELECT total_plantado_inicial FROM public.subcampania WHERE id="+str(scope)+"),'vivero',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l))")


def race(first_sql,second_sql,label):
    env=dict(os.environ,PGAPPNAME='pa_int03a_race_'+uuid.uuid4().hex[:10])
    first=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    second=None
    try:
        first.stdin.write('BEGIN;\n'+first_sql+'\n\\echo READY\n');first.stdin.flush()
        assert select.select([first.stdout],[],[],30)[0],'primera transacción sin respuesta'
        first_response=json.loads(first.stdout.readline()); assert first.stdout.readline().strip()=='READY'
        second=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env)
        second.stdin.write(second_sql);second.stdin.close()
        blocked=False
        for _ in range(70):
            blocked=sql('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='+lit(env['PGAPPNAME'])+" AND wait_event_type='Lock')")=='t'
            if blocked: break
            assert second.poll() is None,'segunda RPC terminó sin espera'
            time.sleep(.03)
        assert blocked,'no se observó espera Lock real'
        first.stdin.write('COMMIT;\n\\quit\n');first.stdin.flush();first.stdin.close();first.wait(timeout=30)
        assert first.returncode==0,first.stderr.read()
        second.wait(timeout=30);assert second.returncode==0,second.stderr.read()
        second_response=json.loads(second.stdout.read().strip())
        races.append({'caso':label,'espera_observada':'Lock','orden':'primera RPC → commit → segunda RPC',
                      'primero':first_response,'segundo':second_response})
        return first_response,second_response
    finally:
        for child in (second,first):
            if child and child.poll() is None: child.kill();child.wait(timeout=5)


try:
    sql("INSERT INTO public.usuario(id,auth_id,nombre,username,rol,activo,organizacion_id) VALUES"
        "(800,'a-http-800','Admin prueba','admin-a','ADMIN',true,NULL),"
        "(801,'a-http-801','Plantador congelado','plantador-a','VOLUNTARIO',true,1),"
        "(802,'a-http-802','Participante congelado','participante-a','VOLUNTARIO',true,NULL),"
        "(803,'a-http-803','Admin sin permiso','admin-b','ADMIN',true,NULL),"
        "(804,'a-http-804','Sin autoridad','outsider-a','VOLUNTARIO',true,NULL),"
        "(805,'a-http-805','Inactivo','inactive-a','ADMIN',false,NULL);"
        "INSERT INTO public.campania VALUES(800,'Campaña INT03-A',NULL);"
        "INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles) "
        "SELECT n,800,'Ámbito INT03-A '||n,'ACTIVA','INT03A-'||n,800,800,1,'Zona sintética',"
        "ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),2 FROM generate_series(800,830) n;"
        "INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) SELECT n,8,100,2 FROM generate_series(800,830) n;"
        "INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) "
        "SELECT n*100,n,81,'PLANTACION_INICIAL',20,800,now()-interval '10 days',(now() AT TIME ZONE 'America/La_Paz')::date-10 FROM generate_series(800,829) n;")
    for scope in range(800,831):
        for actor in (801,802): confirmed(json.loads(sql(access('OTORGAR_PLANTADOR',actor,scope))))
    today=sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date")
    day10=sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date-10")
    yesterday=sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date-1")
    context=rpc('pa_registro_contexto_leer',801,auth(801),800)['data']
    assert context['actor']['fuente_autoridad']=='CONTEXTUAL' and context['especies'][0]['saldo_elegible']==20
    assert rpc('pa_registro_contexto_leer',803,auth(803),800)['data']['actor']['fuente_autoridad']=='GLOBAL'
    assert rpc('pa_registro_contexto_leer',801,auth(801),830)['data']['disponibilidad']=='SIN_STOCK'
    sql("SET ROLE service_role; SELECT public.pa_registro_contexto_leer(804,'a-http-804',800)",'RECURSO_NO_VISIBLE')
    sql("UPDATE public.subcampania SET estado='PAUSADA' WHERE id=829;")
    sql("SET ROLE service_role; SELECT public.pa_registro_contexto_leer(801,'a-http-801',829)",'SUBCAMPANIA_NO_OPERATIVA')
    candidates=rpc('pa_registro_participantes_leer',801,auth(801),800,None,None,21)['data']
    assert '801' not in [p['usuario_id'] for p in candidates] and {'800','802','803'} <= {p['usuario_id'] for p in candidates}
    assert not any(private in json.dumps(context) for private in ('asignacion_id','lote_vivero_id','contacto','auth_id','equipo'))
    ok('contexto/selección por autoridad efectiva, ADMIN global, ACTIVA y SIN_STOCK válido',['PA-ID04','PA-ID06','PA-ID21'])

    # LIFO: igualdad exacta del timestamp se desempata por ID; entrega futura excluida.
    sql("DELETE FROM public.asignacion_vivero_subcampania WHERE subcampania_id=800;"
        "INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) VALUES"
        "(80001,800,81,'PLANTACION_INICIAL',10,800,now()-interval '9 days',"+lit(day10)+"),"
        "(80002,800,82,'PLANTACION_INICIAL',4,800,now()-interval '2 days',"+lit(yesterday)+"),"
        "(80003,800,82,'PLANTACION_INICIAL',5,800,now()-interval '2 days',"+lit(yesterday)+"),"
        "(80004,800,81,'PLANTACION_INICIAL',10,800,now(),"+lit(today)+");")
    key,value=payload(count=7,date=yesterday,cores=['802'])
    value['observaciones']='Nota privada del autor'
    before_vivero=sql('SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l')
    result=confirmed(execute(value,key)); reg=result['registro_plantacion_id']
    assert result['cantidad_total_plantada']==7 and result['gps_dentro_poligono'] and result['revision_inicial']=='0'
    detail=json.loads(sql('SELECT jsonb_agg(jsonb_build_array(asignacion_id,cantidad) ORDER BY asignacion_id) FROM public.registro_plantacion_detalle WHERE registro_plantacion_id='+reg))
    assert detail==[[80002,2],[80003,5]],detail
    assert sql('SELECT total_plantado_inicial FROM public.subcampania WHERE id=800')=='7'
    assert sql('SELECT estado FROM public.subcampania WHERE id=800')=='ACTIVA'
    assert sql('SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l')==before_vivero
    assert sql('SELECT count(*) FROM public.evento_lote_vivero')=='0'
    evidence['saldos_lifo']={'registro_id':reg,'detalles':detail,'vivero_intacto':True,'meta':2,'plantado':7,'estado':'ACTIVA'}
    ok('LIFO timestamp+ID, entrega posterior excluida, meta superable y sin segundo débito M2',['PA-ID21','PA-S01-CA05'])

    frozen=rpc('pa_registro_detalle_propio_leer',801,auth(801),reg)['data']
    assert all(p['afiliacion_estado']=='HISTORICA_NO_DISPONIBLE' for p in frozen['participantes'])
    sql("UPDATE public.usuario SET nombre='Nombre nuevo',organizacion_id=NULL,organizacion='Otra actual' WHERE id=801; UPDATE public.organizacion SET nombre='Organización nueva' WHERE id=1;")
    assert rpc('pa_registro_detalle_propio_leer',801,auth(801),reg)['data']==frozen
    assert rpc('pa_registro_detalle_propio_leer',802,auth(802),reg)['data']['observaciones_autor'] is None
    sql("SET ROLE service_role; SELECT public.pa_registro_detalle_propio_leer(803,'a-http-803',"+reg+")",'RECURSO_NO_VISIBLE')
    ok('snapshots congelados, retroactivo sin historia, cantidad grupal una vez y observación solo autor',['PA-ID22'])

    k,v=payload(801,date=day10); confirmed(execute(v,k))
    k,v=payload(801); v['afiliaciones_declaradas']=[{'usuario_id':'801','afiliacion':{'tipo':'ORGANIZACION_REGISTRADA','organizacion_id':'1'}}]
    r=confirmed(execute(v,k)); snap=rpc('pa_registro_detalle_propio_leer',801,auth(801),r['registro_plantacion_id'])['data']['participantes'][0]
    assert snap['afiliacion_estado']=='DECLARADA' and snap['organizacion_id_snapshot']=='1'
    k,v=payload(801,date=yesterday); v['afiliaciones_declaradas']=[{'usuario_id':'801','afiliacion':{'tipo':'OTRA','nombre':'Otra histórica'}}]
    r=confirmed(execute(v,k)); assert rpc('pa_registro_detalle_propio_leer',801,auth(801),r['registro_plantacion_id'])['data']['participantes'][0]['afiliacion_snapshot']=='Otra histórica'
    k,v=payload(801); v['afiliaciones_declaradas']=[{'usuario_id':'801','afiliacion':None}]
    r=confirmed(execute(v,k)); assert rpc('pa_registro_detalle_propio_leer',801,auth(801),r['registro_plantacion_id'])['data']['participantes'][0]['afiliacion_estado']=='NO_DECLARADA'
    ok('fechas extremas inclusivas y afiliaciones catálogo/Otra/ausencia, sin modificar perfil',['PA-ID21','PA-ID22'])

    for scope,change,code in [(802,{'plan_revision_esperada':'8'},'PLAN_MODIFICADO'),(802,{'fecha_plantacion':'2000-01-01'},'FECHA_NO_ADMITIDA'),(802,{'especies':[{'planta_id':'9','cantidad':1}]},'ESPECIE_FUERA_DEL_PLAN')]:
        k,v=payload(scope);v.update(change);before=state(scope);rejected(execute(v,k),code);assert state(scope)==before
    sql('UPDATE public.asignacion_vivero_subcampania SET fecha_entrega_operativa=NULL WHERE subcampania_id=803')
    k,v=payload(803);before=state(803);rejected(execute(v,k),'CONTEXTO_INCOMPLETO');assert state(803)==before
    sql("SET ROLE service_role; SELECT public.pa_registro_contexto_leer(801,'a-http-801',803)",'CONTEXTO_INCOMPLETO')
    ok('revisión obsoleta, fecha fuera de ventana, especie fuera del plan y entrega no conciliada rechazan sin dominio',['PA-ID21'])

    # Recibo tras pérdida de respuesta/permiso; misma intención se conserva y otra no.
    confirmed(json.loads(sql(access('RETIRAR_PLANTADOR',801,800,1))))
    original=execute(value,key)
    assert original['body']==recovery(key)['body'] and original['body']['resultado']==result
    changed=copy.deepcopy(value);changed['observaciones']='Cambio'
    assert execute(changed,key)['body']['error']['codigo']=='COMANDO_REUTILIZADO'
    assert rpc('pa_registro_detalle_propio_leer',801,auth(801),reg)['data']==frozen
    assert recovery(key,803)['http_status']==404
    ok('recibo/replay idénticos después de retiro, contenido distinto 409 y ajeno invisible incluso ADMIN',['PA-ID14','PA-ID15','PA-ID16','PA-ID23'])

    k,v=payload(804,count=100);before=state(804);rejected(execute(v,k),'STOCK_INSUFICIENTE')
    sql('UPDATE public.asignacion_vivero_subcampania SET cantidad_asignada=200 WHERE subcampania_id=804')
    rejected(execute(v,k),'STOCK_INSUFICIENTE')
    assert sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE subcampania_id=804')=='0'
    kcancel=prepare(804);rpc('pa_cargas_operar',801,auth(801),'DESCARTAR',kcancel,{})
    v['evidencia_ids']=['999999'];rejected(execute(v,kcancel),'PREPARACION_CANCELADA')
    assert sql('SELECT huella IS NULL FROM public.participacion_comando WHERE comando_id='+lit(kcancel))=='t'
    ok('rechazo terminal no cambia al reponer stock y preparación cancelada conserva huella NULL/409',['PA-ID16','PA-ID17'])

    # Ambas formas de concurrencia: dos POST misma clave y dos claves por últimas unidades.
    k,v=payload(805);before=state(805)
    r1,r2=race(initial(v,k),initial(v,k),'doble POST simultáneo misma clave')
    assert r1==r2;confirmed(r1)
    assert json.loads(state(805))['consumo']==1
    sql('UPDATE public.asignacion_vivero_subcampania SET cantidad_asignada=1 WHERE subcampania_id=806')
    k1,v1=payload(806);k2,v2=payload(806)
    r1,r2=race(initial(v1,k1),initial(v2,k2),'dos comandos compiten por última unidad')
    confirmed(r1);rejected(r2,'STOCK_INSUFICIENTE');assert json.loads(state(806))['consumo']==1
    ok('doble POST un hecho/consumo/terminal y últimas unidades sin sobreconsumo',['PA-ID14','PA-ID21'])

    # Retiro del actor y de seleccionado en ambos órdenes, usando RPC C real.
    k,v=payload(807);r1,r2=race(access('RETIRAR_PLANTADOR',801,807,1),initial(v,k),'retiro actor antes de registro')
    confirmed(r1);rejected(r2,'CAPACIDAD_INSUFICIENTE')
    k,v=payload(808);r1,r2=race(initial(v,k),access('RETIRAR_PLANTADOR',801,808,1),'registro antes de retiro actor')
    confirmed(r1);confirmed(r2)
    k,v=payload(809,cores=['802']);r1,r2=race(access('RETIRAR_PLANTADOR',802,809,1),initial(v,k),'retiro participante antes de registro')
    confirmed(r1);rejected(r2,'PARTICIPANTE_NO_ELEGIBLE')
    k,v=payload(810,cores=['802']);r1,r2=race(initial(v,k),access('RETIRAR_PLANTADOR',802,810,1),'registro antes de retiro participante')
    confirmed(r1);confirmed(r2)
    ok('barreras DB para retiro/registro y seleccionado en ambos órdenes con permiso C real',['PA-ID11','PA-ID13'])

    # Cuenta/perfil también comparte la primera etapa de locks con el registro.
    k,v=payload(817)
    profile="WITH u AS (UPDATE public.usuario SET nombre='Perfil antes' WHERE id=801 RETURNING id) SELECT jsonb_build_object('body',jsonb_build_object('estado','PERFIL_CAMBIADO')) FROM u;"
    r1,r2=race(profile,initial(v,k),'perfil antes de captura snapshot')
    r=confirmed(r2);assert rpc('pa_registro_detalle_propio_leer',801,auth(801),r['registro_plantacion_id'])['data']['participantes'][0]['nombre_snapshot']=='Perfil antes'
    k,v=payload(818)
    profile="WITH u AS (UPDATE public.usuario SET nombre='Perfil después' WHERE id=801 RETURNING id) SELECT jsonb_build_object('body',jsonb_build_object('estado','PERFIL_CAMBIADO')) FROM u;"
    r1,r2=race(initial(v,k),profile,'captura snapshot antes de cambio perfil')
    r=confirmed(r1);assert rpc('pa_registro_detalle_propio_leer',801,auth(801),r['registro_plantacion_id'])['data']['participantes'][0]['nombre_snapshot']=='Perfil antes'
    k,v=payload(819,actor=803)
    role={'usuario_destino_id':'803','revision_esperada':'0','motivo':'Ensayo de carrera global','rol_global':'VOLUNTARIO'}
    role_sql="SET ROLE service_role; SELECT public.pa_autoridad_ejecutar(800,"+lit(auth(800))+",'CAMBIAR_ROL_GLOBAL',"+lit(str(uuid.uuid4()))+","+lit(role)+"::jsonb,"+lit(json.dumps(role,sort_keys=True,separators=(',',':')))+");"
    r1,r2=race(role_sql,initial(v,k,803),'cambio rol antes de registro global sin permiso')
    confirmed(r1);rejected(r2,'CAPACIDAD_INSUFICIENTE')
    # Restaurar por RPC real, conservando historia y revisión.
    role.update(revision_esperada='1',rol_global='ADMIN')
    confirmed(rpc('pa_autoridad_ejecutar',800,auth(800),'CAMBIAR_ROL_GLOBAL',str(uuid.uuid4()),role,json.dumps(role,sort_keys=True,separators=(',',':'))))
    k,v=payload(819,actor=803)
    role.update(revision_esperada='2',rol_global='VOLUNTARIO')
    role_sql="SET ROLE service_role; SELECT public.pa_autoridad_ejecutar(800,"+lit(auth(800))+",'CAMBIAR_ROL_GLOBAL',"+lit(str(uuid.uuid4()))+","+lit(role)+"::jsonb,"+lit(json.dumps(role,sort_keys=True,separators=(',',':')))+");"
    r1,r2=race(initial(v,k,803),role_sql,'registro global antes de cambio rol sin permiso')
    confirmed(r1);confirmed(r2)
    role.update(revision_esperada='3',rol_global='ADMIN')
    confirmed(rpc('pa_autoridad_ejecutar',800,auth(800),'CAMBIAR_ROL_GLOBAL',str(uuid.uuid4()),role,json.dumps(role,sort_keys=True,separators=(',',':'))))
    ok('perfil/snapshot en ambos órdenes y cambio rol serializado con cuenta/registro',['PA-ID11','PA-ID13','PA-ID22'])

    # Timeout desconocido bajo barrera real: no se fabrica terminal de negocio.
    k,v=payload(827);before=state(827)
    holder=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    try:
        holder.stdin.write('BEGIN; SELECT id FROM public.subcampania WHERE id=827 FOR UPDATE;\n\\echo HELD\n');holder.stdin.flush()
        assert select.select([holder.stdout],[],[],30)[0]
        assert holder.stdout.readline().strip()=='827' and holder.stdout.readline().strip()=='HELD'
        sql("SET statement_timeout='200ms'; "+initial(v,k),'canceling statement due to statement timeout')
        assert recovery(k)['http_status']==202 and state(827)==before
    finally:
        holder.stdin.write('ROLLBACK;\n\\quit\n');holder.stdin.flush();holder.stdin.close();holder.wait(timeout=10)
    confirmed(execute(v,k))
    ok('timeout de sentencia bajo lock real conserva resultado inconcluso y misma clave converge',['PA-ID15','PA-ID17'])

    # Fallo de negocio/desconocido después del INSERT de hecho y consumo.
    sql("CREATE FUNCTION public.pa_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=811 THEN PERFORM public.pa_c_rechazar(409,'FALLO_SINTETICO','Fallo tras efecto parcial.'); END IF; RETURN NEW; END $$; CREATE TRIGGER pa_fixture_failure BEFORE UPDATE ON public.subcampania FOR EACH ROW EXECUTE FUNCTION public.pa_fixture_failure()")
    k,v=payload(811);before=state(811);rejected(execute(v,k),'FALLO_SINTETICO');assert state(811)==before
    sql('DROP TRIGGER pa_fixture_failure ON public.subcampania; DROP FUNCTION public.pa_fixture_failure()')
    rejected(execute(v,k),'FALLO_SINTETICO')
    sql("CREATE FUNCTION public.pa_fixture_unknown() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=812 THEN RAISE EXCEPTION 'PA_FIXTURE_INFRA' USING ERRCODE='XX000'; END IF; RETURN NEW; END $$; CREATE TRIGGER pa_fixture_unknown BEFORE UPDATE ON public.subcampania FOR EACH ROW EXECUTE FUNCTION public.pa_fixture_unknown()")
    k,v=payload(812);before=state(812);sql(initial(v,k),'PA_FIXTURE_INFRA');assert state(812)==before
    assert recovery(k)['http_status']==202
    sql('DROP TRIGGER pa_fixture_unknown ON public.subcampania; DROP FUNCTION public.pa_fixture_unknown()')
    confirmed(execute(v,k))
    ok('rechazo tras efecto parcial revierte dominio y conserva terminal; desconocido deja preparación inconclusa y misma clave converge',['PA-ID17'])

    # PostGIS real evalúa fuera y dentro. Solo el fallo confirmado se inyecta como ausencia.
    k,v=payload(813);v['longitud']=-67.5;r=confirmed(execute(v,k));assert r['gps_dentro_poligono'] is False and r['gps_distancia_a_poligono_m']>0
    sql("ALTER FUNCTION public.gps_dentro_poligono_con_tolerancia(bigint,numeric,numeric) RENAME TO pa_fixture_gps_real; CREATE FUNCTION public.gps_dentro_poligono_con_tolerancia(bigint,numeric,numeric) RETURNS TABLE(dentro boolean,distancia_m numeric) LANGUAGE SQL AS $$ SELECT d.dentro,d.distancia_m FROM public.pa_fixture_gps_real($1,$2,$3) d WHERE $1<>814 $$")
    k,v=payload(814);before=state(814);rejected(execute(v,k),'EVALUADOR_NO_DISPONIBLE');assert state(814)==before
    sql('DROP FUNCTION public.gps_dentro_poligono_con_tolerancia(bigint,numeric,numeric); ALTER FUNCTION public.pa_fixture_gps_real(bigint,numeric,numeric) RENAME TO gps_dentro_poligono_con_tolerancia')
    ok('PostGIS real dentro/fuera; ausencia confirmada del evaluador inyectada produce rechazo durable 503 sin consumo',['PA-ID20'])

    # Fotos de otro actor/preparación no se apropian; omitidas se clausuran en el commit.
    k,v=payload(815);kforeign=prepare(815,803);v['evidencia_ids']=[photo(kforeign,803)];before=state(815);rejected(execute(v,k),'EVIDENCIA_NO_DISPONIBLE');assert state(815)==before
    for invalid in ('tipo','ambito','vinculo','eliminada'):
        k,v=payload(815)
        image=v['evidencia_ids'][0]
        if invalid=='tipo': sql('UPDATE public.evidencias_trazabilidad SET tipo_entidad_id=2 WHERE id='+image)
        elif invalid=='ambito':
            another=prepare(824);v['evidencia_ids']=[photo(another)]
        elif invalid=='vinculo': sql('UPDATE public.evidencias_trazabilidad SET entidad_id=1 WHERE id='+image)
        else: sql('UPDATE public.evidencias_trazabilidad SET eliminado_en=clock_timestamp() WHERE id='+image)
        before=state(815);rejected(execute(v,k),'EVIDENCIA_NO_DISPONIBLE');assert state(815)==before
    k,v=payload(816); omitted=photo(k); confirmed(execute(v,k))
    assert sql('SELECT estado FROM public.participacion_carga WHERE evidencia_id='+omitted)=='DESCARTE_PENDIENTE'
    assert sql('SELECT estado FROM public.participacion_carga_generacion WHERE carga_interna_id=(SELECT id FROM public.participacion_carga WHERE evidencia_id='+omitted+')')=='OBSOLETA'
    sql('DELETE FROM public.participacion_carga WHERE evidencia_id='+omitted,'PA_CARGA_CONSERVACION_OBLIGATORIA')
    ok('evidencia ajena rechaza aun ADMIN; cargas omitidas/generaciones se clausuran sin borrar tombstones',['PA-ID18','PA-ID19','PA-ID23'])

    for role in ('anon','authenticated','pa_int02b_public_probe'):
        sql('SET ROLE '+role+'; SELECT * FROM public.participacion_carga','permission denied')
        sql('SET ROLE '+role+'; SELECT public.pa_registro_inicial_ejecutar(801,'+lit(auth(801))+','+lit(str(uuid.uuid4()))+",'{}','{}')",'permission denied')
        sql('SET ROLE '+role+"; SELECT public.pa_cargas_mantenimiento('LISTAR','{}')",'permission denied')
    assert sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'pa_registro_%' OR p.proname LIKE 'pa_carga%') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))")=='0'
    assert sql("SELECT count(*) FROM pg_constraint WHERE conrelid IN('public.participacion_carga'::regclass,'public.participacion_carga_generacion'::regclass) AND contype='f' AND (confupdtype<>'r' OR confdeltype<>'r')")=='0'
    assert sql("SELECT count(*) FROM pg_constraint WHERE conrelid='public.participacion_carga'::regclass AND contype='f'")=='6'
    assert sql("SELECT count(*) FROM pg_constraint WHERE conrelid='public.participacion_carga_generacion'::regclass AND contype='f'")=='1'
    evidence['catalogo_cargas']={'FK_RESTRICT_carga':6,'FK_RESTRICT_generacion':1,'instalacion_y_repeticion':'074–076'}
    sql("INSERT INTO storage.objects(bucket_id,name) VALUES('participacion_evidencias','original-privado-fixture')")
    assert sql("SELECT public FROM storage.buckets WHERE id='participacion_evidencias'")=='f'
    for role in ('anon','authenticated'):
        assert sql('SET ROLE '+role+"; SELECT count(*) FROM storage.objects WHERE bucket_id='participacion_evidencias'")=='0'
        assert sql('SET ROLE '+role+"; SELECT count(*) FROM storage.objects WHERE bucket_id='compartido_legado'")=='1'
        sql('SET ROLE '+role+"; INSERT INTO storage.objects(bucket_id,name) VALUES('participacion_evidencias','intrusion')",'row-level security')
    assert sql("SET ROLE service_role; SELECT count(*) FROM storage.objects WHERE bucket_id='participacion_evidencias'")=='1'
    evidence['catalogo_cargas']['Storage_RLS_adversario']='Política permisiva legada + restrictiva074 probadas SQL reales; bucket privado; otro bucket preservado'
    ok('denegaciones SQL/RPC reales, todas sobrecargas privadas y FKs nuevas RESTRICT',['PA-ID23'])
    # La RPC física real 076 preserva DATE de entrada independientemente de TZ.
    sql("INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento) VALUES(81,'EMBOLSADO',"+lit(day10)+");")
    evidence_delivery=json.loads(sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,creado_por_usuario_id) VALUES(2,0,'fixture','salida','FOTO',800) RETURNING id"))
    physical=json.loads(sql("SET TIME ZONE 'UTC'; SET ROLE service_role; SELECT to_jsonb(t) FROM public.fn_vivero_asignar_stock_subcampania(81,830,2,'PLANTACION_INICIAL',800,"+lit(today)+",ARRAY["+str(evidence_delivery)+"]::bigint[],NULL) t"))
    assignment=physical['asignacion_id']
    assert sql('SELECT fecha_entrega_operativa::text FROM public.asignacion_vivero_subcampania WHERE id='+str(assignment))==today
    assert physical['saldo_vivo_antes']==100 and physical['saldo_vivo_despues']==98
    ok('RPC física 076 real conserva DATE de entrada sin cast/backfill legado y descuenta M2 solo en entrega',['PA-ID21'])
    evidence['sql_estado']='CORRECTO'
finally:
    Path(a.evidence).write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
