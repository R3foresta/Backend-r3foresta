#!/usr/bin/env python3
"""T5 incorporación: PostgreSQL privado100+, sin TCP/.env ni servicios externos."""
import argparse
from datetime import datetime
from zoneinfo import ZoneInfo
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import select
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ['092_usuario_acceso_recoleccion.sql','093_recoleccion_acceso_explicito.sql','094_usuario_vivero.sql','095_vivero_operacion_por_ambito.sql','096_recoleccion_recepcion.sql']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--sql-only', action='store_true', help='Omite HTTP local cuando existe harness T5.')
    parser.add_argument('--postgis', action='store_true',help='Extensión PostGIS real y regresión M3 de consumo sin M2; falla si falta la extensión.')
    args = parser.parse_args()
    binaries = {n: str(args.pg_bin/n) if args.pg_bin else shutil.which(n) for n in ('initdb','pg_ctl','psql')}
    if not all(binaries.values()): parser.error('Faltan binarios PostgreSQL; use --pg-bin.')
    if args.evidence and args.evidence.exists(): parser.error('La evidencia debe ser nueva.')
    migrations = MIGRATIONS.copy()
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C',PGPASSFILE=os.devnull,PGSERVICEFILE=os.devnull,PGAPPNAME='t5_aislado')
    directory = Path(tempfile.mkdtemp(prefix='t5-incorporacion-',dir='/tmp')).resolve()
    cluster,socket = directory/'pg',directory/'socket'; socket.mkdir(mode=0o700)
    checks=[]; races=[]; children=[]; started=False; http=None; version=None; postgis_version=None; postflight=None; http_bigint_fixture=None; diagnostico107={}

    def run(cmd, timeout=60):
        r=subprocess.run(cmd,env=env,text=True,capture_output=True,timeout=timeout)
        if r.returncode: raise RuntimeError(r.stderr[-3500:])
        return r.stdout.strip()

    def command(): return [binaries['psql'],'-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h',str(socket),'-p','55444','-U','postgres','-d','postgres']
    def sql(s, error=None, service=False):
        r=subprocess.run(command()+['-c',('SET ROLE service_role; ' if service else '')+s],env=env,text=True,capture_output=True,timeout=30)
        if error:
            if not r.returncode or error.lower() not in r.stderr.lower(): raise AssertionError(f'Esperado {error}: {r.stderr[-1500:]}')
        elif r.returncode: raise RuntimeError(r.stderr[-3500:])
        return r.stdout.strip()
    def check(ok,label):
        if not ok: raise AssertionError(label)
        checks.append(label)
    def lit(x): return "'"+json.dumps(x,ensure_ascii=False).replace("'","''")+"'::jsonb"
    def access(dest,op='OTORGAR',rev='0',actor=1,key=None):
        auth={1:'fixture-admin',2:'fixture-general',3:'fixture-voluntario',4:'fixture-validador',5:'fixture-inactivo',6:'fixture-coordinador'}.get(actor,'fixture-t1-'+str(actor))
        payload={'usuario_destino_id':str(dest),'revision_esperada':str(rev),'motivo':'Ensayo sintético T1'}
        return f"SELECT public.m1_acceso_ejecutar({actor},'{auth}','{op}_ACCESO_RECOLECCION','{key or uuid.uuid4()}',{lit(payload)});"
    def call(s): return json.loads(sql(s,service=True))
    def read(user,actor=None):
        actor=user if actor is None else actor
        auth={1:'fixture-admin',2:'fixture-general',3:'fixture-voluntario',4:'fixture-validador',5:'fixture-inactivo',6:'fixture-coordinador'}.get(actor,'fixture-t1-'+str(actor))
        return call(f"SELECT public.m1_acceso_leer({actor},'{auth}',{user},NULL,20);")
    def save(actor,action='CREAR',record=None,rev=0,payload=None,photos=None):
        if payload is None: payload={'fecha':sql("SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date"),'tipo_material':'SEMILLA','ubicacion_id':1,'vivero_id':1,'metodo_id':1,'planta_id':1,'unidad_canonica':'G','cantidad_inicial_canonica':100,'codigo_trazabilidad':'T1-'+str(uuid.uuid4()),'nombre_recolector_snapshot':'Autor sintético'}
        if photos is None: photos=[{'ruta_archivo':str(uuid.uuid4())+'.jpg','mime_type':'image/jpeg','tamano_bytes':20} for _ in range(2)] if action=='CREAR' else []
        return f"SELECT public.m1_recoleccion_guardar({actor},'{action}',{record or 'NULL'},{rev},{lit(payload)},{lit(photos)});"
    def start(s,name):
        p=subprocess.Popen(command(),env=dict(env,PGAPPNAME=name),text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        children.append(p);p.stdin.write(s+'\n');p.stdin.flush();return p
    def marker(p):
        end=time.monotonic()+20
        pending=b''
        while time.monotonic()<end:
            if select.select([p.stdout],[],[],max(0,end-time.monotonic()))[0]:
                chunk=os.read(p.stdout.fileno(),65536)
                if not chunk: raise RuntimeError('La sesión terminó antes de confirmar el lock')
                pending+=chunk
                if b'LOCK_HELD' in pending.splitlines(): return
        raise AssertionError('No se confirmó el lock inicial')
    def blocked(name):
        end=time.monotonic()+5
        while time.monotonic()<end:
            if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock'")=='1': return
            time.sleep(.02)
        raise AssertionError('No se observó lock: '+name)
    def race(first,second,name,expected_error=None):
        first=first.rstrip().rstrip(';')+';';second=second.rstrip().rstrip(';')+';'
        p=start("BEGIN; SET LOCAL statement_timeout='15s'; SET ROLE service_role; "+first+" SELECT 'LOCK_HELD';",name+'_primero');marker(p)
        q=start("SET statement_timeout='15s'; SET ROLE service_role; "+second,name+'_segundo');blocked(name+'_segundo')
        p.stdin.write('COMMIT;\n\\q\n');p.stdin.flush();out,err=p.communicate(timeout=20)
        if p.returncode: raise RuntimeError(err)
        q.stdin.close();q.stdin=None;out,err=q.communicate(timeout=20)
        if expected_error:
            if expected_error.lower() not in err.lower(): raise AssertionError(name+': '+out+err)
        elif q.returncode: raise RuntimeError(err)
        races.append(name)
        return out
    def assign(user,vivero=1,op='OTORGAR',rev=None,actor=1,key=None):
        if rev is None: rev=sql(f'SELECT coalesce((SELECT revision FROM public.usuario_vivero_revision WHERE usuario_id={user}),0)')
        payload={'usuario_destino_id':str(user),'vivero_id':str(vivero),'revision_esperada':str(rev),'motivo':'Ensayo sintético T2'}
        auth='fixture-admin' if actor==1 else 'fixture-t2-operario' if actor==20 else 'fixture-validador'
        return f"SELECT public.m2_acceso_ejecutar({actor},'{auth}','{op}_ACCESO_VIVERO','{key or uuid.uuid4()}',{lit(payload)});"
    def prepare(actor,viv=1,lote=None,event='INICIO'):
        f=[{'ruta_archivo':f'vivero/eventos/pendientes/{actor}/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':10}]
        return f"SELECT public.m2_evidencias_preparar({actor},{viv},{lote or 'NULL'},'{event}',{lit(f)});"
    def evidence(actor,viv=1,lote=None,event='INICIO'): return call(prepare(actor,viv,lote,event))
    def inicio(actor,rec=100,viv=1,ids=None,exacto=False):
        ids=ids if ids is not None else evidence(actor,viv)
        argumentos=f"{rec},{viv},{actor},CURRENT_DATE,CURRENT_DATE,5,'G',NULL,ARRAY[{','.join(map(str,ids))}]::bigint[]"
        if exacto: return f'SELECT public.m2_inicio_lote_exacto({argumentos});'
        return f'SELECT to_jsonb(x) FROM public.fn_vivero_crear_lote_desde_recoleccion({argumentos}) x;'
    def evento(actor,lote,event='MERMA',viv=1,qty=1,ids=None):
        ids=ids if ids is not None else ([] if event=='ADAPTABILIDAD' else evidence(actor,viv,lote,event))
        common=f"{lote},CURRENT_DATE,{actor}"
        tail=f"ARRAY[{','.join(map(str,ids))}]::bigint[]"
        args={'EMBOLSADO':f'{common},{qty},NULL,{tail}',
              'MERMA':f"{common},{qty},'PLAGA',NULL,{tail}",
              'ADAPTABILIDAD':f"{common},'SOMBRA',NULL,{tail}",
              'DESPACHO':f"{common},{qty},'OTRO','Salida sintética',NULL,NULL,{tail}",
              'DESCARTE_PRE_EMBOLSADO':f"{common},5,'G','NO_GERMINACION',NULL,{tail}"}[event]
        return f'SELECT to_jsonb(x) FROM public.fn_vivero_registrar_{event.lower()}({args}) x;'
    def entrega(actor,lote,sub=11,ids=None,proposito='PLANTACION_INICIAL',qty=2):
        ids=ids if ids is not None else evidence(actor,1,lote,'DESPACHO')
        return f"SELECT to_jsonb(x) FROM public.fn_vivero_asignar_stock_subcampania({lote},{sub},{qty},'{proposito}',{actor},CURRENT_DATE,ARRAY[{','.join(map(str,ids))}]::bigint[],NULL) x;"
    def devolucion(actor,asig,qty=1): return f"SELECT to_jsonb(x) FROM public.fn_m3_devolver_asignacion_vivero({asig},{qty},'SOBRANTE_OPERATIVO',{actor},CURRENT_DATE,NULL) x;"
    def extract(file,name):
        s=(ROOT/'migrations'/file).read_text();start=re.search(r'CREATE(?: OR REPLACE)? FUNCTION public\.'+re.escape(name)+r'\(',s).start();end=s.index('$$;',s.index('AS $$',start))+3
        return s[start:end]
    def probar_fecha_compatible(migracion102,instalada=False):
        original=extract('010_vivero_operational_rules.sql','fn_vivero_assert_fecha_operativa')
        variante=re.sub(r'(?m)^  --[^\n]*\n','',original)
        firma='public.fn_vivero_assert_fecha_operativa(date,date)'
        esperado_original='e62b14d2c5d963a0d9c49be78a766d1077e6b1219061da0449c99d825c3e7273'
        esperado_variante='b0195755dbff0ec1d6da9518324884e654209936237dc9a0ce45c27b47c105a1'
        def huella(definicion):
            return hashlib.sha256(definicion.split('AS $$',1)[1].rsplit('$$;',1)[0].encode()).hexdigest()
        check(huella(original)==esperado_original and huella(variante)==esperado_variante,
              'Variante aportada b019 difiere del helper010 únicamente por sus cinco comentarios TODO')
        phase='repetición con hechos' if instalada else 'instalación inicial aislada'
        for nombre,definicion,esperada in [('010 original',original,esperado_original),('variante aportada sin comentarios',variante,esperado_variante)]:
            sql(definicion)
            before=sql("SELECT jsonb_build_array(to_regclass('public.vivero_incorporacion')::text,(SELECT count(*) FROM public.lote_vivero),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.evidencias_trazabilidad))")
            sql('BEGIN; '+migracion102+' ROLLBACK;')
            check(before==sql("SELECT jsonb_build_array(to_regclass('public.vivero_incorporacion')::text,(SELECT count(*) FROM public.lote_vivero),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.evidencias_trazabilidad))")
                  and sql("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='"+firma+"'::regprocedure")==esperada,
                  '102 admite '+nombre+' en '+phase+' sin reescribir el helper ni el dominio del ensayo revertido')
            sql('SELECT public.fn_vivero_assert_fecha_operativa(CURRENT_DATE,NULL); SELECT public.fn_vivero_assert_fecha_operativa(CURRENT_DATE-10,NULL); SELECT public.fn_vivero_assert_fecha_operativa(CURRENT_DATE-10,CURRENT_DATE-10)')
            for argumentos,error in [('NULL,NULL','obligatoria'),('CURRENT_DATE+1,NULL','futura'),('CURRENT_DATE-11,NULL','10 dias'),('CURRENT_DATE-1,CURRENT_DATE','fecha habilitante')]:
                sql('SELECT public.fn_vivero_assert_fecha_operativa('+argumentos+')',error=error)
            check(True,'Fechas de '+nombre+': bordes hoy/10d y mínima inclusivos; NULL/futuro/11d/previa a mínima rechazados')
            diag=run(command()+['-f',str(ROOT/'scripts/qa/vivero-incorporacion-102-antecedentes.sql')])
            linea=next(row.split('|') for row in diag.splitlines() if row.startswith(firma+'|'))
            diag107=json.loads(run(command()+['-f',str(ROOT/'scripts/qa/vivero-incorporacion-107-diagnostico.sql')]))
            check(linea[1]=='COINCIDE' and next(f['cuerpo_coincide'] for f in diag107['funciones'] if f['firma']==firma),
                  'Diagnósticos102/107 reconocen '+nombre+' en solo lectura')
            if instalada:
                sql('BEGIN; '+migracion102+' COMMIT;')
                check(before==sql("SELECT jsonb_build_array(to_regclass('public.vivero_incorporacion')::text,(SELECT count(*) FROM public.lote_vivero),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.evidencias_trazabilidad))")
                      and sql("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid='"+firma+"'::regprocedure")==esperada,
                      '102 confirma repetición con '+nombre+' y conserva hechos y cuerpo del helper exacto')
        sql(original)
        ataques=[
            ('no-op',original.split('AS $$',1)[0]+'AS $$ BEGIN RETURN; END $$;'),
            ('ventana30',original.replace('CURRENT_DATE - 10','CURRENT_DATE - 30')),
            ('SECURITY DEFINER',original.replace('LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER')),
            ('helper ausente','DROP FUNCTION '+firma+';'),
        ]
        for nombre,cambio in ataques:
            before=sql("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')||':'||prosecdef FROM pg_proc WHERE oid='"+firma+"'::regprocedure")
            before_domain=sql("SELECT jsonb_build_array(to_regclass('public.vivero_incorporacion')::text,(SELECT count(*) FROM public.lote_vivero),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.evidencias_trazabilidad))")
            sql('BEGIN; '+cambio+' '+migracion102,error='antecedente crítico '+firma)
            check(before==sql("SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')||':'||prosecdef FROM pg_proc WHERE oid='"+firma+"'::regprocedure")
                  and before_domain==sql("SELECT jsonb_build_array(to_regclass('public.vivero_incorporacion')::text,(SELECT count(*) FROM public.lote_vivero),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.evidencias_trazabilidad))"),
                  '102 rechaza '+nombre+' en '+phase+' y rollback conserva helper y catálogo')
    def photo_inc(actor,key,viv=1):
        files=[{'ruta_archivo':f'vivero/incorporaciones/{actor}/{key}/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':20}]
        return call(f"SELECT public.m2_incorporacion_evidencias_preparar({actor},{viv},'{key}',{lit(files)})")
    def payload(actor=20,key=None,qty=100,modalidad='RECEPCION',procedencia='COMPRA',**more):
        key=key or str(uuid.uuid4())
        return key,dict(vivero_id='1',planta_id='1',modalidad=modalidad,procedencia=procedencia,
                        fecha_evento=today,cantidad=qty,evidencia_ids=photo_inc(actor,key),**more)
    def create(actor,key,p):
        return f"SELECT public.m2_incorporacion_crear({actor},'{key}',{lit(p)})"
    def recover(actor,key):
        return call(f"SELECT public.m2_incorporacion_recuperar({actor},'{key}')")
    def new(actor=20,**kwargs):
        key,p=payload(actor=actor,**kwargs); r=call(create(actor,key,p));
        check(r['estado']=='CONFIRMADO','Alta confirmada '+str(p['modalidad'])+'/'+str(p['procedencia']))
        return key,p,r['data']
    def counts():
        return sql("SELECT jsonb_build_array((SELECT count(*) FROM public.lote_vivero),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.vivero_incorporacion),(SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id<>0))")
    def lifecycle(op,user=20,role='VOLUNTARIO'):
        data={'usuario_destino_id':str(user),'revision_esperada':sql(f'SELECT revision_autoridad FROM public.usuario WHERE id={user}'),'motivo':'Cambio sintético T5'}
        if op=='CAMBIAR_ROL_GLOBAL':data['rol_global']=role
        canon=json.dumps(data,ensure_ascii=False,separators=(',',':'),sort_keys=True)
        return f"SELECT public.pa_autoridad_ejecutar(1,'fixture-admin','{op}','{uuid.uuid4()}',{lit(data)},'{canon}')"
    failed=True
    try:
        run([binaries['initdb'],'-D',str(cluster),'-U','postgres','--auth-local=trust','--auth-host=reject','--locale=en_US.UTF-8','--encoding=UTF8'])
        run([binaries['pg_ctl'],'-D',str(cluster),'-l',str(directory/'pg.log'),'-w','-t','20','start','-o',f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55444 -c unix_socket_permissions=0700 -c timezone=America/La_Paz"])
        started=True;version=sql('SHOW server_version');print('T5 PostgreSQL aislado '+version,flush=True)
        run(command()+['-f',str(ROOT/'test/db/vivero-acceso-fixture.sql')])
        # 015 se aplicó antes de007 en el fixture T2; aquí representamos el catálogo DATE real.
        sql('ALTER TABLE public.lote_vivero ALTER COLUMN created_at TYPE date USING created_at::date,ALTER COLUMN updated_at TYPE date USING updated_at::date; ALTER TABLE public.evento_lote_vivero ALTER COLUMN created_at TYPE date USING created_at::date')
        if args.postgis:
            run(command()+['-f',str(ROOT/'test/db/vivero-acceso-postgis-fixture.sql')])
            postgis_version=sql('SELECT postgis_full_version()')
        sql("ALTER TABLE public.tipos_entidad_evidencia ADD COLUMN descripcion text; ALTER TABLE public.tipos_entidad_evidencia ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY; SELECT setval(pg_get_serial_sequence('public.tipos_entidad_evidencia','id'),(SELECT max(id) FROM public.tipos_entidad_evidencia));")
        sql(extract('010_vivero_operational_rules.sql','fn_vivero_assert_fecha_operativa'))
        sql(extract('010_vivero_operational_rules.sql','fn_vivero_cerrar_lote_si_corresponde'))
        for num in ('018','019','021','026','046','055'):
            run(command()+['-f',str(next((ROOT/'migrations').glob(num+'_*')))])
        sql("CREATE FUNCTION public.fn_subcampania_obtener_plan(bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")
        run(command()+['-f',str(ROOT/'migrations/077_pa_int02d_operaciones_compartidas.sql')])
        for migration in MIGRATIONS:run(command()+['-f',str(ROOT/'migrations'/migration)])
        for num in ('097','099'):
            migration=next((ROOT/'migrations').glob(num+'_*'));migrations.append(migration.name);run(command()+['-f',str(migration)])
        # Solamente fixture desechable:100 exige vacío inicial; no se reinicia ningún destino real.
        sql('DELETE FROM public.recoleccion WHERE id=9000; ALTER TABLE public.recoleccion ADD COLUMN blockchain_url text,ADD COLUMN token_id text,ADD COLUMN transaction_hash text')
        migration=ROOT/'migrations/100_recoleccion_recepcion_unica.sql';migrations.append(migration.name)
        run(command()+['-f',str(migration)])
        # Antecedente010 real de CHECKs/trigger/helpers; omitir sus antiguas RPC.
        # El fixtureT2 original sólo importaba dos helpers y no estos invariantes.
        original010=(ROOT/'migrations/010_vivero_operational_rules.sql').read_text()
        sql(original010[:original010.index('CREATE OR REPLACE FUNCTION public.fn_vivero_registrar_embolsado(')])
        run(command()+['-f',str(ROOT/'migrations/056_fix_devolucion_saldo_constraint.sql')])
        today=sql("SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date")
        for user in (20,22,24,9007199254740995):call(assign(user))
        call(access(21))
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica,nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,nombre_comunidad_snapshot,nombre_recolector_snapshot) SELECT i,21,CURRENT_DATE,'PENDIENTE_VALIDACION','REC-T5-'||i,'SEMILLA',1,1,1,1,'G',100,'Especie sintética','Tara','Variedad histórica','Zona','Autor M1' FROM generate_series(100,102) i;")
        sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id) SELECT 1,r.id,'recoleccion_fotos','origen/'||r.id||'/'||n,'FOTO','image/jpeg',21 FROM public.recoleccion r CROSS JOIN generate_series(1,2) n WHERE r.id BETWEEN 100 AND 102;")
        for rec in (100,101):
            files=[{'ruta_archivo':f'recepcion/pendientes/22/{rec}/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':20}]
            ids=call(f'SELECT public.m1_recepcion_evidencias_preparar(22,{rec},0,{lit(files)})')
            p={'accion':'RECIBIR','recoleccion_id':str(rec),'revision_esperada':'0','cantidad_recibida':100,'unidad_recibida':'G','fecha_recepcion':today,'evidencia_ids':ids}
            r=call(f"SELECT public.m1_recepcion_ejecutar(22,'fixture-t2-ambos','{uuid.uuid4()}',{lit(p)})")
            check(r['body']['estado']=='CONFIRMADO','Recepción100 real para antecedenteM1')
        m1_lote=call(inicio(20,100))['lote_vivero_id']
        embolsar=evento(20,m1_lote,'EMBOLSADO',qty=30)
        previo=sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evidencias_trazabilidad e))")
        sql(embolsar,error='chk_evento_lote_vivero_saldos_eventos_vivos_requeridos',service=True)
        check(previo==sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evidencias_trazabilidad e))"),'CHECK010 real reproduce conflictoEMBOLSADO095 y revierte saldo/evento/vínculos')
        historico=call(inicio(20,101))['lote_vivero_id']
        sql(f"BEGIN; UPDATE public.lote_vivero SET plantas_vivas_iniciales=2,saldo_vivo_actual=2 WHERE id={historico}; INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues) VALUES({historico},'EMBOLSADO',CURRENT_DATE,20,2,'UNIDAD',0,2); COMMIT")
        historico_previo=sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={historico}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={historico}))")
        previo=sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evidencias_trazabilidad e))")
        diag=json.loads(run(command()+['-f',str(ROOT/'scripts/qa/vivero-incorporacion-107-diagnostico.sql')]))
        diagnostico107['antes']={'transaccion_solo_lectura':diag['transaccion_solo_lectura'],'cuerpo_embolsado_coincide':next(f['cuerpo_coincide'] for f in diag['funciones'] if f['fuente']=='095' and 'registrar_embolsado' in f['firma'])}
        check(diagnostico107['antes']['transaccion_solo_lectura']=='on' and diagnostico107['antes']['cuerpo_embolsado_coincide'],'Diagnóstico107 lee catálogo en transacciónREADONLY y confirma cuerpoEMBOLSADO095')
        # 107 se instala antes de esta operación en el antecedente focal095/100;
        # en destino se ordena después de101–106 según la guía de aplicación.
        migration=next((ROOT/'migrations').glob('107_*'));migrations.append(migration.name)
        run(command()+['-f',str(migration)]);run(command()+['-f',str(migration)])
        diag=json.loads(run(command()+['-f',str(ROOT/'scripts/qa/vivero-incorporacion-107-diagnostico.sql')]))
        diagnostico107['despues']={'transaccion_solo_lectura':diag['transaccion_solo_lectura'],'checks':[{k:c[k] for k in ('nombre','validada','definicion')} for c in diag['restricciones'] if c['nombre'] in ('chk_evento_lote_vivero_saldos_eventos_vivos_requeridos','chk_evento_lote_vivero_embolsado_consistente')]}
        check(diagnostico107['despues']['transaccion_solo_lectura']=='on' and all(c['validada'] for c in diagnostico107['despues']['checks']),'Diagnóstico107 posterior confirma dosCHECKs validados sinmutaciones')
        check(historico_previo==sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={historico}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={historico}))"),'107 conserva bytes/IDs/saldo cero previo deEMBOLSADO histórico010 sinbackfill')
        check(previo==sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evidencias_trazabilidad e))"),'107 instalación/repetición preserva loteM1/enproceso/fotos/IDs sin reescribirhechos')
        call(embolsar)
        check(sql(f"SELECT saldo_vivo_antes IS NULL AND saldo_vivo_despues=30 AND cantidad_afectada=30 AND unidad_medida_evento='UNIDAD' FROM public.evento_lote_vivero WHERE lote_id={m1_lote} AND tipo_evento='EMBOLSADO'")=='t','107 alineaCHECK conEMBOLSADO095: saldoanteriorNULL y nacimiento30sin inventarsaldo0')
        proceso_lote=call(inicio(20,101))['lote_vivero_id']
        # La corrección no puede abrir incrementos incoherentes ni convertir
        # MERMA/DESPACHO sin saldos en movimientos válidos. Este lote M1 aún no
        # tiene base, por lo que cada rechazo demuestra el CHECK en cuestión.
        previo_adversarios=sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={proceso_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={proceso_lote}))")
        for cantidad,antes,despues,unidad in [('0','NULL','0','UNIDAD'),('1.5','NULL','1','UNIDAD'),('-1','NULL','1','UNIDAD'),('1','1','1','UNIDAD'),('1','NULL','1','G'),('1','NULL','2','UNIDAD'),('1','NULL','NULL','UNIDAD'),('1','NULL','1','NULL')]:
            unidad_sql='NULL' if unidad=='NULL' else "'"+unidad+"'"
            sql(f"INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues) VALUES({proceso_lote},'EMBOLSADO',CURRENT_DATE,20,{cantidad},{unidad_sql},{antes},{despues})",error='check constraint')
        check(True,'107 rechaza EMBOLSADO cero/fraccional/negativo, saldoantespositivo, unidadG/NULL y saldo posterior distinto/NULL')
        for tipo in ('MERMA','DESPACHO'):
            for antes,despues in [('NULL','0'),('1','NULL')]:
                extra_col=",causa_merma" if tipo=='MERMA' else ",destino_tipo,destino_referencia"
                extra_val=",'PLAGA'" if tipo=='MERMA' else ",'OTRO','Ensayo107'"
                sql(f"INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues{extra_col}) VALUES({proceso_lote},'{tipo}',CURRENT_DATE,20,1,'UNIDAD',{antes},{despues}{extra_val})",error='chk_evento_lote_vivero_saldos_eventos_vivos_requeridos')
        check(previo_adversarios==sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={proceso_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={proceso_lote}))"),'107 conserva MERMA/DESPACHO con ambos saldos obligatorios y ningún adversario modifica lote/historial')
        preserved=sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={m1_lote}),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.recoleccion_movimiento m))")
        migration=next((ROOT/'migrations').glob('101_*'));migrations.append(migration.name);run(command()+['-f',str(migration)])
        migracion102=next((ROOT/'migrations').glob('102_*'))
        cuerpo102=migracion102.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
        probar_fecha_compatible(cuerpo102)
        migrations.append(migracion102.name);run(command()+['-f',str(migracion102)])
        check(preserved==sql(f"SELECT jsonb_build_array((SELECT to_jsonb(l) FROM public.lote_vivero l WHERE id={m1_lote}),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e WHERE lote_id={m1_lote}),(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.recoleccion_movimiento m))"),'101/102 preservan IDs/códigos/saldos/eventos y ledgerM1 representativos')
        for num in ('101','102'):run(command()+['-f',str(next((ROOT/'migrations').glob(num+'_*')))])
        migration=next((ROOT/'migrations').glob('105_*'));migrations.append(migration.name)
        run(command()+['-f',str(migration)]);run(command()+['-f',str(migration)])
        check(sql('SELECT count(*) FROM public.vivero_incorporacion')=='0','Instalación/repetición sin backfill inventado')
        key,p,compra=new(tercero_origen='Proveedor histórico',referencia_documental='Factura compartida')
        lote=compra['lote_vivero_id'];ev=compra['evento_incorporacion_id']
        check(sql(f"SELECT recoleccion_id IS NULL AND tipo_material_snapshot IS NULL AND cantidad_inicial_en_proceso IS NULL AND unidad_medida_inicial IS NULL AND plantas_vivas_iniciales=100 AND saldo_vivo_actual=100 FROM public.lote_vivero WHERE id={lote}")=='t','Compra100 nace viva sin semilla/recolección/cantidad ficticia')
        check(sql(f"SELECT tipo_evento||':'||cantidad_afectada||':'||saldo_vivo_antes||':'||saldo_vivo_despues FROM public.evento_lote_vivero WHERE id={ev}")=='INCORPORACION:100:0:100','EventoINCORPORACION inaugura saldo100 exactamente una vez')
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='95','AltaT5 no vuelve a consumirM1')
        check(call(create(20,key,p))=={'estado':'CONFIRMADO','data':compra} and recover(20,key)=={'estado':'CONFIRMADO','data':compra},'Replay y recuperación conservan mismo recibo inicial')
        for tz in ('UTC','Pacific/Kiritimati'):
            check(call(f"SET TIME ZONE '{tz}'; SELECT public.m2_incorporacion_recuperar(20,'{key}')")['data']==compra,'Recibo propio idéntico incluso al cambiarTimezone'+tz)
        before=counts();sql(create(20,key,dict(p,cantidad=101)),error='INTENCION',service=True);check(before==counts(),'UUID usado con otra intención conflicto sin cambio')
        sql(create(22,key,p),error='CAPACIDAD',service=True)
        sql(f"SELECT public.m2_incorporacion_recuperar(22,'{key}')",error='CAPACIDAD',service=True);check(True,'Otro actor con UUID no obtiene hecho ajeno')
        call(evento(20,lote,'MERMA',qty=10));call(evento(20,lote,'ADAPTABILIDAD'))
        check(call(create(20,key,p))['data']==compra and recover(20,key)['data']==compra,'Replay tras movimientos recupera saldo inicial100 y mismosIDs sin recalcular saldo90')
        # Un proveedor/documento puede originar dos entregas legítimas, cada una en lote nuevo.
        _,_,otra=new(tercero_origen='Proveedor histórico',referencia_documental='Factura compartida')
        check(otra['lote_vivero_id']!=lote,'Mismo proveedor/documento crea lote separado sin clave documental única')
        nk,np=payload(tercero_origen=' Proveedo\u0301r ',referencia_documental='',observaciones='  Conteo conservado  ')
        np['evidencia_ids']+=photo_inc(20,nk)
        normalized=call(create(20,nk,np))
        replay_payload=dict(np,tercero_origen='Proveedór',referencia_documental=None,observaciones='Conteo conservado',evidencia_ids=list(reversed(np['evidencia_ids'])))
        check(normalized==call(create(20,nk,replay_payload)),'HuellaJSONBv1 normalizaNFC/espacios/vacío-null yconjunto ordenadodefotos')
        _,_,saldo=new(qty=210,modalidad='SALDO_INICIAL',procedencia='COMPRA',observaciones='Compra antigua300; conteo real210. Historia previa no registrada.')
        check(sql(f"SELECT plantas_vivas_iniciales||':'||saldo_vivo_actual FROM public.lote_vivero WHERE id={saldo['lote_vivero_id']}")=='210:210','Existencia inicial210 no inventa compra300 ni merma90')
        for proc in ('DONACION','PRODUCCION_PROPIA','DESCONOCIDA'):new(qty=3,modalidad='SALDO_INICIAL',procedencia=proc,observaciones='Historia previa no registrada; procedencia no acreditada.')
        for changes in ({'procedencia':'PRODUCCION_PROPIA'},{'procedencia':'DESCONOCIDA'},{'cantidad':0},{'cantidad':-1},{'cantidad':1.5},{'cantidad':2147483648},{'fecha_evento':'2099-01-01'},{'fecha_evento':'2000-01-01'},{'fecha_evento':'2026-02-30'},{'vivero_id':'999'},{'planta_id':'999'}):
            k,q=payload();q.update(changes);before=counts();sql(create(20,k,q),error='ERROR',service=True);check(before==counts(),'Entrada inválida revierte dominio '+json.dumps(changes))
        # No se habilita material en proceso mediante incorporación o por operación viva.
        for kind in ('MERMA','DESPACHO','ADAPTABILIDAD'):
            sql(evento(20,proceso_lote,kind),error='EMBOLSADO',service=True)
        sql(evento(20,lote,'EMBOLSADO',qty=1),error='INICIO',service=True)
        before=counts()
        sql(f"INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues) VALUES({lote},'EMBOLSADO',CURRENT_DATE,20,1,'UNIDAD',NULL,1)",error='base_viva',service=True)
        sql(f"INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id,cantidad_afectada,unidad_medida_evento,saldo_vivo_antes,saldo_vivo_despues) VALUES({lote},'INCORPORACION',CURRENT_DATE,20,1,'UNIDAD',0,1)",error='base_viva',service=True)
        check(before==counts(),'SQL privilegiado no crea dos bases ni mezclaEMBOLSADO/INCORPORACION')
        sql(f"INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id) VALUES({lote},'INICIO',CURRENT_DATE,20)",error='BASE_VIVA_INCORPORACION_INVALIDA',service=True)
        m1_evento=sql(f"SELECT id FROM public.evento_lote_vivero WHERE lote_id={m1_lote} AND tipo_evento='INICIO'")
        sql(f"UPDATE public.evento_lote_vivero SET tipo_evento='INCORPORACION' WHERE id={m1_evento}",error='INCORPORACION_EVENTO_INMUTABLE',service=True)
        sql(f"UPDATE public.evento_lote_vivero SET lote_id={lote} WHERE id={m1_evento}",error='INCORPORACION_EVENTO_INMUTABLE',service=True)
        merma_evento=sql(f"SELECT id FROM public.evento_lote_vivero WHERE lote_id={lote} AND tipo_evento='MERMA'")
        sql(f"INSERT INTO public.vivero_incorporacion(evento_id,modalidad,procedencia,solicitud_id,huella_solicitud) SELECT {merma_evento},modalidad,procedencia,'{uuid.uuid4()}',huella_solicitud FROM public.vivero_incorporacion WHERE evento_id={ev}",error='EXTENSION_REQUIERE_EVENTO_INCORPORACION')
        check(before==counts(),'INICIO/UPDATE M1/traslado y extensión sobreMERMA no eluden integridaddeferred')
        sql('DELETE FROM public.vivero_incorporacion',error='permission denied',service=True)
        sql('DELETE FROM public.vivero_incorporacion',error='append-only')
        sql(f"UPDATE public.evento_lote_vivero SET observaciones='Reescribir' WHERE id={ev}",error='INMUTABLE',service=True)
        check(True,'Hecho confirmado y evento no se editan/borran')
        # Las fotos pendientes pertenecen a una solicitud, actor y vivero determinados.
        k,q=payload();other=str(uuid.uuid4());q['evidencia_ids']=photo_inc(20,other)
        sql(create(20,k,q),error='EVIDENCIA',service=True)
        k,q=payload();q['evidencia_ids']=photo_inc(22,k);sql(create(20,k,q),error='EVIDENCIA',service=True)
        call(assign(20,2));k,q=payload();q['evidencia_ids']=photo_inc(20,k,2);sql(create(20,k,q),error='EVIDENCIA',service=True)
        k,q=payload();q['evidencia_ids']=p['evidencia_ids'];sql(create(20,k,q),error='EVIDENCIA',service=True)
        check(True,'Fotos de solicitud/actor/vivero ajenos y vinculadas se rechazan')
        # Fallo al insertar la extensión después de lote/evento revierte todo el dominio.
        sql("CREATE FUNCTION public.t5_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_T5'; END $$; CREATE TRIGGER t5_fallar BEFORE INSERT ON public.vivero_incorporacion FOR EACH ROW EXECUTE FUNCTION public.t5_fallar()")
        k,q=payload();before=counts();sql(create(20,k,q),error='FALLO_T5',service=True);check(before==counts() and recover(20,k)['estado']=='SIN_RESULTADO','Fallo antescommit revierte lote/evento/extensión/vínculo; foto previa sigue pendiente')
        sql('DROP TRIGGER t5_fallar ON public.vivero_incorporacion');call(create(20,k,q))
        # Solicitud única se serializa incluso después de pérdida de la primera respuesta.
        k,q=payload();out=race(create(20,k,q),create(20,k,q),'misma_solicitud');check(sql(f"SELECT count(*) FROM public.vivero_incorporacion WHERE solicitud_id='{k}'")=='1','Dos altas concurrentes mismaUUID producen un solo lote/evento/base')
        k,q=payload();race(create(20,k,q),create(20,k,dict(q,cantidad=101)),'misma_uuid_otra_intencion','INTENCION')
        for op in ('INACTIVAR_CUENTA','CAMBIAR_ROL_GLOBAL'):
            k,q=payload();race(lifecycle(op),create(20,k,q),op.lower()+'_antes_alta','CUENTA' if op=='INACTIVAR_CUENTA' else 'cuenta interna')
            check(sql(f"SELECT count(*) FROM public.vivero_incorporacion WHERE solicitud_id='{k}'")=='0','Baja/rol concurrente impide nueva alta')
            sql("UPDATE public.usuario SET activo=true,rol='GENERAL' WHERE id=20")
        k,q=payload();race(assign(20,op='RETIRAR'),create(20,k,q),'retiro_antes_alta','CAPACIDAD');call(assign(20))
        k,q,r=new();race(create(20,k,q),assign(20,op='RETIRAR'),'replay_antes_retiro')
        check(recover(20,k)['data']==r and call(create(20,k,q))['data']==r,'Recuperación/replay propios con cuentaactiva sobreviven retiro sin habilitar escritura nueva')
        k2,q2=payload(actor=22);sql(create(20,k2,q2),error='CAPACIDAD',service=True)
        sql("UPDATE public.usuario SET activo=false WHERE id=20");sql(f"SELECT public.m2_incorporacion_recuperar(20,'{k}')",error='CUENTA',service=True)
        sql("UPDATE public.usuario SET activo=true WHERE id=20");call(assign(20))
        # Rango BIGINT exacto, incluso IDs fuera de Number.MAX_SAFE_INTEGER.
        k,q,r=new(actor=9007199254740995,qty=1);check(isinstance(r['lote_vivero_id'],str),'IDs del recibo son decimales de texto; actorBIGINT exacto')
        # ACL no confunde SECURITY DEFINER privado con bypass público.
        check(sql("SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'm2_incorporacion_%' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))")=='0','RPC/helpersT5 sin EXECUTE público/anon/authenticated')
        check(sql("SELECT count(*) FROM unnest(ARRAY['anon','authenticated']) u WHERE has_table_privilege(u,'public.vivero_incorporacion','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(u,'public.vivero_incorporacion','SELECT,INSERT,UPDATE,REFERENCES')")=='0','Tabla de procedencia no exponelectura/escritura pública')
        if args.postgis:
            sql("CREATE TABLE public.registro_plantacion_participante_efectivo(registro_plantacion_id bigint,usuario_id bigint,estado text); GRANT SELECT ON public.registro_plantacion_participante_efectivo TO service_role")
            sql(extract('085_pa_int07_participantes.sql','pa_p_relacion_propia'))
            sql(extract('075_pa_int03a_registro.sql','pa_r_error'))
            sql('REVOKE ALL ON FUNCTION public.pa_r_error(integer,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.pa_r_error(integer,text,text) TO service_role')
            sql('REVOKE ALL ON FUNCTION public.pa_p_relacion_propia(bigint,bigint) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.pa_p_relacion_propia(bigint,bigint) TO service_role')
            migration=next((ROOT/'migrations').glob('103_*'));migrations.append(migration.name);run(command()+['-f',str(migration)]);run(command()+['-f',str(migration)])
            # El wrapper106 conserva también el descarte de fotos079; instalar
            # el antecedente completo, sin sustituirlo por una función de prueba.
            migration079=ROOT/'migrations/079_pa_int02d_evidencias.sql';migrations.append(migration079.name)
            run(command()+['-f',str(migration079)])
            migration106=next((ROOT/'migrations').glob('106_*'));migrations.append(migration106.name);run(command()+['-f',str(migration106)]);run(command()+['-f',str(migration106)])
            sql("INSERT INTO public.campania(id,nombre) VALUES(4,'Campaña M3 T5'); INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom) VALUES(61,4,'M3 independiente','ACTIVA','SUB-T5-M3',1,1,1,ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326)); INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES(61,1); INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(61,24,'COORDINADOR',1),(61,21,'OPERARIO',1); INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,nombre_responsable_snapshot,codigo_trazabilidad,created_by,cantidad_muerta_acumulada) VALUES(4000,61,21,CURRENT_DATE,100,'Actor M3','T5-GRUPO-LEGADO',21,100)")
            def consume(asig,lote,qty,command_only=False):
                ev=sql(f"INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id,metadata) VALUES(4,0,'participacion_evidencias','{uuid.uuid4()}.jpg','FOTO','image/jpeg',21,jsonb_build_object('subcampania_id','61','proposito','REPOSICION')) RETURNING id")
                details=lit([{'asignacion_id':asig,'lote_vivero_id':lote,'planta_id':1,'cantidad':qty}])
                command=f"SELECT to_jsonb(x) FROM public.fn_m3_registrar_plantacion(61,true,4000,CURRENT_DATE,21,-16.5,-68.1,NULL,ARRAY[]::bigint[],{details},ARRAY[{ev}]::bigint[]) x"
                return command if command_only else call(command)
            _,_,r=new(qty=80,procedencia='DONACION');l=r['lote_vivero_id'];a=call(entrega(24,l,61,proposito='REPOSICION',qty=60))['asignacion_id'];res=consume(a,l,45)
            check(res['gps_dentro_poligono'] and sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={l}')=='20' and sql(f'SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id={a}')=='15','Donación80→entrega60→plantación45 conserva20vivero/15campo/45plantadas sin segundo débito, PostGIS real')
            _,_,r=new(qty=100);l=r['lote_vivero_id'];call(evento(20,l,'MERMA',qty=10));a=call(entrega(24,l,61,proposito='REPOSICION',qty=60))['asignacion_id']
            sql("UPDATE public.planta SET variedad='Variedad cambiada antes de plantar' WHERE id=1")
            res=consume(a,l,45);call(devolucion(24,a,qty=15))
            check(sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={l}')=='45' and sql(f'SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id={a}')=='0','Compra100→merma10→entrega60→plantar45→devolver15 deja45vivero/0campo/45plantadas/10merma mismo lote')
            rid=res['registro_plantacion_id'];pro=call(f"SELECT public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',{rid})")
            check(pro['data']['consumos'][0]['origen']['procedencia']=='COMPRA','AutorM3 sinM2 lee procedencia de detalle persistido y cantidad consumida')
            check(pro['data']['consumos'][0]['variedad_snapshot']==r['variedad_snapshot'],'DetalleM3 nuevo hereda variedad del lote aunque el catálogo cambió antes de plantar')
            check(not any(k in json.dumps(pro['data']) for k in ('tercero_origen','referencia_documental','evidencia_ids','signed_url')),'Lectura propiaM3 no expone ficha ni evidencias privadasM2')
            sql(f"SELECT public.pa_registro_procedencia_propia_leer(20,'fixture-t2-operario',{rid})",error='RECURSO_NO_VISIBLE',service=True)
            sql("UPDATE public.planta SET nombre_cientifico='Cambio catálogo',nombre_comun_principal='Cambio comercial',variedad='Cambio variedad' WHERE id=1")
            after=call(f"SELECT public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',{rid})")
            check(pro['data']==after['data'],'Catálogo cambiado no reescribe nombres/variedad/origen consumidos')
            sql(f"INSERT INTO public.registro_plantacion_coresponsable(registro_plantacion_id,usuario_id) VALUES({rid},22)")
            check(call(f"SELECT public.pa_registro_procedencia_propia_leer(22,'fixture-t2-ambos',{rid})")['data']==pro['data'],'Participante original lee los consumos propios sin autoridadM2 adicional')
            sql(f"INSERT INTO public.registro_plantacion_participante_efectivo VALUES({rid},22,'RETIRADO')")
            sql(f"SELECT public.pa_registro_procedencia_propia_leer(22,'fixture-t2-ambos',{rid})",error='RECURSO_NO_VISIBLE',service=True)
            sql(f"UPDATE public.registro_plantacion_participante_efectivo SET estado='PRESENTE' WHERE registro_plantacion_id={rid} AND usuario_id=22")
            check(call(f"SELECT public.pa_registro_procedencia_propia_leer(22,'fixture-t2-ambos',{rid})")['data']==pro['data'],'Overlay085 retirado pierde lectura y restauradoPRESENTE la recupera')
            _,_,r=new(qty=10);l=r['lote_vivero_id'];out=race(evento(20,l,'MERMA',qty=6),entrega(24,l,61,proposito='REPOSICION',qty=6),'merma_antes_entrega','saldo vivo')
            check(sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={l}')=='4','Merma concurrente conentrega no sobreconsume ni invierte locks')
            _,_,r=new(qty=10);l=r['lote_vivero_id'];a=call(entrega(24,l,61,proposito='REPOSICION',qty=6))['asignacion_id']
            before=sql(f'SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id={a}')
            future=consume(a,l,1,True).replace('true,4000,CURRENT_DATE,',"true,4000,((clock_timestamp() AT TIME ZONE 'America/La_Paz')::date+1),")
            sql('SET TIME ZONE \'Pacific/Kiritimati\'; '+future,error='FECHA',service=True)
            cmd=consume(a,l,1,True).replace('true,4000,CURRENT_DATE,','true,4000,CURRENT_DATE-1,')
            sql(cmd,error='FECHA',service=True)
            check(before==sql(f'SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id={a}'),'M3 no admite futuroLP porTZ cliente ni fecha previa a entrega/nacimiento, rollback sinconsumo')
            race(devolucion(24,a,qty=4),consume(a,l,3,True),'devolucion_antes_consumo','saldo')
            check(sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={l}')=='8' and sql(f'SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id={a}')=='2','Devolución real y consumo concurrentes respetan saldo del mismo lote/asignación')
            _,_,r=new(qty=10);l=r['lote_vivero_id'];a=call(entrega(24,l,61,proposito='REPOSICION',qty=6))['asignacion_id']
            race(consume(a,l,4,True),devolucion(24,a,qty=3),'consumo_antes_devolucion','saldo')
            check(sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={l}')=='4' and sql(f'SELECT saldo_asignado_disponible FROM public.asignacion_vivero_subcampania WHERE id={a}')=='2','Consumo antesdevolución no devuelve plantas ya consumidas ni descuentaM2 otra vez')
            _,_,r=new(qty=2);l=r['lote_vivero_id'];call(evento(20,l,'MERMA',qty=2))
            check(sql(f"SELECT count(*) FROM public.evento_lote_vivero e JOIN public.vivero_incorporacion i ON i.evento_id=e.id WHERE e.lote_id={l}")=='1','Lote agotado conserva incorporación e historial')
            # El transporte JSON recibe texto antes de cualquier parseoNumber en Node.
            for table,value in (('lote_vivero',9007199254741001),('evento_lote_vivero',9007199254742001),('evidencias_trazabilidad',9007199254743001),('asignacion_vivero_subcampania',9007199254744001)):
                sql(f"SELECT setval(pg_get_serial_sequence('public.{table}','id'),{value},false)")
            _,_,r=new(qty=20);l=r['lote_vivero_id']
            for kind,key_id in (('ADAPTABILIDAD','evento_adaptabilidad_id'),('MERMA','evento_merma_id'),('DESPACHO','evento_despacho_id')):
                rpc_sql=evento(20,l,kind).replace('fn_vivero_registrar_'+kind.lower()+'(','fn_vivero_registrar_'+kind.lower()+'_exacto(')
                result=call(rpc_sql)
                check(isinstance(result[key_id],str) and int(result[key_id])>9007199254740991 and result['lote_vivero_id']==l and all(isinstance(i,str) for i in result['evidencia_ids_vinculadas']),'105 '+kind+' conservaIDsBIGINT yarrays exactos de texto')
            result=call(entrega(24,l,61,proposito='REPOSICION',qty=4).replace('fn_vivero_asignar_stock_subcampania(','fn_vivero_asignar_stock_subcampania_exacto('));a=result['asignacion_id']
            check(isinstance(a,str) and int(a)>9007199254740991 and result['lote_vivero_id']==l,'105 entrega conservaasignación/eventos/loteBIGINT exactos')
            result=call(devolucion(24,a,qty=2).replace('fn_m3_devolver_asignacion_vivero(','fn_m3_devolver_asignacion_vivero_exacto('))
            check(result['asignacion_id']==a and result['lote_vivero_id']==l and isinstance(result['evento_lote_vivero_id'],str),'105 devolución devuelve almismolote y conservaIDs exactos')
            run(command()+['-f',str(ROOT/'test/db/vivero-incorporacion-inicial-fixture.sql')])
            migrations.extend(['074_pa_int03a_cargas.sql','075_pa_int03a_registro.sql'])
            spec=importlib.util.spec_from_file_location('t5_inicial',ROOT/'scripts/qa/vivero-incorporacion-inicial-helper.py');initial_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(initial_module)
            inicial=initial_module.InicialT5(call,today)
            sql("INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom) SELECT 62,4,'InicialT5 LIFO','ACTIVA','SUB-T5-LIFO',1,1,1,poligono_geom FROM public.subcampania WHERE id=61; INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES(62,1); INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(62,24,'COORDINADOR',1)")
            grant={'usuario_destino_id':'21','ambitos':[{'subcampania_id':'62','revision_esperada':'0'}]};canon=json.dumps(grant,ensure_ascii=False,separators=(',',':'),sort_keys=True)
            granted=call(f"SELECT public.pa_acceso_ejecutar(1,'fixture-admin','OTORGAR_PLANTADOR','{uuid.uuid4()}',{lit(grant)},'{canon}')")
            check(granted['body']['estado']=='CONFIRMADO' and sql('SELECT public.m2_acceso_efectivo(21,1)')=='f','PermisoPLANTADOR real072 sinM2 habilita inicial075')
            propio=call(entrega(24,m1_lote,62,qty=5))['asignacion_id']
            _,_,comprado=new(qty=7,procedencia='COMPRA');ac=call(entrega(24,comprado['lote_vivero_id'],62,qty=7))['asignacion_id']
            _,_,donado=new(qty=9,procedencia='DONACION');ad=call(entrega(24,donado['lote_vivero_id'],62,qty=9))['asignacion_id']
            before=sql(f"SELECT jsonb_agg(jsonb_build_array(id,saldo_vivo_actual) ORDER BY id) FROM public.lote_vivero WHERE id IN ({m1_lote},{comprado['lote_vivero_id']},{donado['lote_vivero_id']})")
            ik,ip=inicial.payload(21,'fixture-t2-m1',62,12);initial_result=inicial.ejecutar(21,'fixture-t2-m1',ik,ip)
            initial_id=initial_result['registro_plantacion_id']
            projected=call(f"SELECT public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',{initial_id})")['data']
            consumed={row['asignacion_id']:row['cantidad'] for row in projected['consumos']}
            check(consumed=={str(ad):9,str(ac):3} and str(propio) not in consumed,'Inicial075 LIFO real consume donación9+compra3 y conserva loteM1 separado sinconsumo')
            check({row['origen']['procedencia'] for row in projected['consumos']}=={'COMPRA','DONACION'},'103 proyecta procedencias consumidas desde detalles075 persistidos')
            check(before==sql(f"SELECT jsonb_agg(jsonb_build_array(id,saldo_vivo_actual) ORDER BY id) FROM public.lote_vivero WHERE id IN ({m1_lote},{comprado['lote_vivero_id']},{donado['lote_vivero_id']})"),'Inicial075 sobreT5 no debita nuevamenteM2 niM1')
            replay=inicial.ejecutar(21,'fixture-t2-m1',ik,ip)
            check(replay==initial_result and projected==call(f"SELECT public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',{initial_id})")['data'],'Replayinicial conserva recibo y consumos originales sin recalcularLIFO')
            ik,ip=inicial.payload(21,'fixture-t2-m1',62,3)
            race(inicial.comando(21,'fixture-t2-m1',ik,ip),inicial.comando(21,'fixture-t2-m1',ik,ip),'misma_inicial075_T5')
            check(sql(f"SELECT count(*) FROM public.participacion_comando WHERE actor_id=21 AND comando_id='{ik}' AND estado='CONFIRMADO'")=='1' and sql('SELECT sum(cantidad_consumida) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=62')=='15','Inicial075 concurrente enT5 generaunregistro/consumo/recibo')
            ik,ip=inicial.payload(21,'fixture-t2-m1',62,4);jk,jp=inicial.payload(21,'fixture-t2-m1',62,4)
            out=race(inicial.comando(21,'fixture-t2-m1',ik,ip),inicial.comando(21,'fixture-t2-m1',jk,jp),'ultimas_unidades_inicial075_T5')
            check('STOCK_INSUFICIENTE' in out and sql('SELECT sum(saldo_asignado_disponible) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=62')=='2','Iniciales075 concurrentes no sobreconsumen mezcla de procedenciasT5/M1')
            own_result=inicial.ejecutar(21,'fixture-t2-m1',ik,ip)
            own_projection=call(f"SELECT public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',{own_result['registro_plantacion_id']})")['data']
            check(any(d['origen']['tipo']=='RECOLECCION' and d['origen']['recoleccion_id']=='100' for d in own_projection['consumos']),'ConsumoM1 ycompra restantesse mantienen separados porasignación/detalle/origenpersistidos')
            check(projected==call(f"SELECT public.pa_registro_procedencia_propia_leer(21,'fixture-t2-m1',{initial_id})")['data'],'Movimientos posteriores no cambian atribución del primerregistroLIFO')
            drift=migration.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
            sql('BEGIN; ALTER TABLE public.registro_plantacion_detalle DISABLE TRIGGER t5_detalle_snapshot_lote_trg; '+drift,error='T5_M3_TRIGGER_INCOMPATIBLE')
            check(True,'103 aborta ante triggerde snapshots desactivado y revierte deriva delensayo')
            # RegresiónHTTP crítica: dos identidades vecinas se redondeaban al mismoNumber.
            for table in ('lote_vivero','asignacion_vivero_subcampania'):
                sql(f"SELECT setval(pg_get_serial_sequence('public.{table}','id'),9007199255741000,false)")
            _,_,purchase=new(qty=5,procedencia='COMPRA');purchase_asig=call(entrega(24,purchase['lote_vivero_id'],61,proposito='REPOSICION',qty=5))['asignacion_id']
            _,_,donation=new(qty=5,procedencia='DONACION');donation_asig=call(entrega(24,donation['lote_vivero_id'],61,proposito='REPOSICION',qty=5))['asignacion_id']
            evid=sql(f"INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id,metadata) VALUES(4,0,'participacion_evidencias','{uuid.uuid4()}.jpg','FOTO','image/jpeg',21,jsonb_build_object('subcampania_id','61','proposito','REPOSICION')) RETURNING id")
            http_bigint_fixture={'compra_lote':purchase['lote_vivero_id'],'donacion_lote':donation['lote_vivero_id'],'compra_asignacion':str(purchase_asig),'donacion_asignacion':str(donation_asig),'evidencia_id':evid}
            sql("SELECT setval(pg_get_serial_sequence('public.evidencias_trazabilidad','id'),9007199256741000,false)")
            pendientes=[]
            for _ in range(2):
                original=f'reposiciones/21/61/{uuid.uuid4()}/original'
                photo={'ruta_original':original,'ruta_derivada':original.replace('/original','/derivada.jpg'),'hash_original':'a'*64,'hash_derivada':'b'*64,'mime_original':'image/jpeg','tamano_original':20}
                created=call(f"SELECT public.pa_d_evidencias_reposicion_exacto(21,61,'CREAR',{lit({'fotos':[photo]})})")
                check(created['http_status']==201,'106 conserva CREAR079 real y devuelve ID de foto exacto como texto')
                pendientes.append(created['body']['data'][0]['id'])
            http_bigint_fixture['foto_vecina_id'],http_bigint_fixture['foto_descartar_id']=pendientes
            check(http_bigint_fixture['compra_lote']=='9007199255741000' and http_bigint_fixture['donacion_lote']=='9007199255741001','FixtureHTTP conserva vecinosCOMPRA/DONACION exactos por encimaSAFEINTEGER')
        migration=next((ROOT/'migrations').glob('102_*'));drift=migration.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
        uq=sql("SELECT conname FROM pg_constraint WHERE conrelid='public.vivero_incorporacion'::regclass AND contype='u'")
        sql('BEGIN; ALTER TABLE public.vivero_incorporacion DROP CONSTRAINT '+uq+'; '+drift,error='T5_CATALOGO_INCOMPATIBLE')
        sql('BEGIN; DROP INDEX public.evento_lote_base_viva_unica_t5; CREATE INDEX evento_lote_base_viva_unica_t5 ON public.evento_lote_vivero(lote_id); '+drift,error='T5_CATALOGO_INCOMPATIBLE')
        check(True,'102 aborta ante ausenciaUNIQUEsolicitud o índicebase falso sin reparar catálogo silenciosamente')
        for num in ('101','102'):run(command()+['-f',str(next((ROOT/'migrations').glob(num+'_*')))])
        check(True,'Repetición101/102 con incorporaciones y movimientos poblados conserva hechos')
        probar_fecha_compatible(drift,instalada=True)
        run(command()+['-f',str(next((ROOT/'migrations').glob('107_*')))])
        migration107=next((ROOT/'migrations').glob('107_*'));drift107=migration107.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
        sql('BEGIN; ALTER TABLE public.evento_lote_vivero DROP CONSTRAINT chk_evento_lote_vivero_saldos_eventos_vivos_requeridos; '+drift107,error='T5_EMBOLSADO_107_CHECK_INCOMPATIBLE')
        check(True,'107 detecta CHECK ausente y revierte deriva delensayo sin repararcatalogo silenciosamente')
        # Cierre108 posterior a107: conservar todos los hechos del ensayo y
        # ejecutar también HTTP sobre los CHECKs definitivos no negativos.
        antes108=sql("SELECT jsonb_build_object('lotes',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l),'eventos',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e),'fotos',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.evidencias_trazabilidad f))")
        migration108=next((ROOT/'migrations').glob('108_*'));migrations.append(migration108.name)
        run(command()+['-f',str(migration108)]);run(command()+['-f',str(migration108)])
        check(antes108==sql("SELECT jsonb_build_object('lotes',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l),'eventos',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e),'fotos',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.evidencias_trazabilidad f))"),'108 instalación/repetición conserva todos los lotes/eventos/fotos T5 poblados')
        lote108=call(inicio(24,100))['lote_vivero_id']
        call(evento(24,lote108,'EMBOLSADO',qty=7))
        check(sql(f"SELECT saldo_vivo_antes IS NULL AND saldo_vivo_despues=7 AND cantidad_afectada=7 AND unidad_medida_evento='UNIDAD' FROM public.evento_lote_vivero WHERE lote_id={lote108} AND tipo_evento='EMBOLSADO'")=='t','108 conserva INICIO/EMBOLSADO095 real con evidencia y nacimientoNULL a7')
        # Integración frontend: nuevo cierre de autoridad después de probar los
        # antecedentes históricos. Desde aquí no se reaplica102 ni107.
        domain_snapshot="SELECT md5(jsonb_build_array((SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l),(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM public.evento_lote_vivero e),(SELECT jsonb_agg(to_jsonb(i) ORDER BY evento_id) FROM public.vivero_incorporacion i),(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM public.evidencias_trazabilidad f))::text)"
        def definitions():
            return sql("SELECT md5(jsonb_agg(jsonb_build_array(oid::text,prosrc,proconfig,proacl) ORDER BY oid)::text) FROM pg_proc WHERE pronamespace='public'::regnamespace")
        for num in (('109','110') if args.postgis else ('109',)):
            migration=next((ROOT/'migrations').glob(num+'_*'));body_migration=migration.read_text().replace('BEGIN;','',1).rsplit('COMMIT;',1)[0]
            before_domain=sql(domain_snapshot);before_defs=definitions()
            sql('BEGIN; '+body_migration+' ROLLBACK;')
            check(before_domain==sql(domain_snapshot) and before_defs==definitions(),num+' ensayo ROLLBACK conserva catálogo, ACL y todos los hechos')
            migrations.append(migration.name);run(command()+['-f',str(migration)]);installed=definitions();run(command()+['-f',str(migration)])
            check(before_domain==sql(domain_snapshot) and installed==definitions(),num+' instalación/repetición conserva hechos e IDs y no agrega inventario ni backfill')
            if num=='109':
                attacks=[("CREATE OR REPLACE FUNCTION public.m2_incorporacion_crear(p_actor_id bigint,p_solicitud_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' SET TimeZone='America/La_Paz' AS $$ BEGIN RETURN '{}'::jsonb; END $$;",'T5_ADMIN_109_ANTECEDENTE_INCOMPATIBLE'),
                         ("CREATE OR REPLACE FUNCTION public.pa_d_cuenta(p_id bigint) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN RETURN 'ADMIN'; END $$;",'T5_ADMIN_109_ANTECEDENTE_INCOMPATIBLE'),
                         ("GRANT EXECUTE ON FUNCTION public.m2_incorporacion_crear(bigint,uuid,jsonb) TO PUBLIC;",'T5_ADMIN_109_ACL_INCOMPATIBLE')]
            else:
                attacks=[("CREATE OR REPLACE FUNCTION public.pa_registro_procedencia_administrativa_leer(p_actor_id bigint,p_auth_id text,p_registro_id bigint) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END $$;",'T5_ADMIN_PROCEDENCIA_FUNCION_INCOMPATIBLE'),
                         ("GRANT EXECUTE ON FUNCTION public.pa_registro_procedencia_administrativa_leer(bigint,text,bigint) TO PUBLIC;",'T5_ADMIN_PROCEDENCIA_FUNCION_EXPUESTA')]
            for attack,expected in attacks:
                sql('BEGIN; '+attack+' '+body_migration,error=expected)
                check(installed==definitions() and before_domain==sql(domain_snapshot),num+' preflight rechaza deriva/ACL y rollback conserva funciones/hechos: '+expected)
        focal=ROOT/'test/db/t5-integracion-admin.sql'
        if focal.exists():
            run(command()+['-f',str(focal)]);check(True,'109 matriz focal de ADMIN/GENERAL/VALIDADOR/VOLUNTARIO/inactivo, recuperación y contexto de fotos')
        if args.postgis:
            focal=ROOT/'test/db/t5-integracion-procedencia.sql'
            if focal.exists():
                run(command()+['-f',str(focal)]);check(True,'110 lectura SQL ADMIN, privacidad, snapshots, orígenes e IDs exactos frente a lectura propia')
        # Rol/baja072 y operación109 comparten la fila de cuenta, observando
        # bloqueos reales. Son cuentas sintéticas de este clúster desechable.
        sql("INSERT INTO public.usuario(id,auth_id,nombre,rol,activo) VALUES(930,'fixture-t5-race-admin','ADMIN carrera sintética','ADMIN',true)")
        for op in ('CAMBIAR_ROL_GLOBAL','INACTIVAR_CUENTA'):
            k,q=payload(actor=930);before=counts()
            race(lifecycle(op,user=930,role='GENERAL'),create(930,k,q),'109_'+op.lower()+'_antes_alta','CUENTA' if op=='INACTIVAR_CUENTA' else 'CAPACIDAD')
            check(before==counts() and recover(1,k)['estado']=='SIN_RESULTADO','109 retiro de autoridad previo impide alta y no persiste rechazo durable '+op)
            if op=='INACTIVAR_CUENTA':
                # Preparación de fixture para el próximo ensayo;072 no publica reactivación.
                sql('UPDATE public.usuario SET activo=true WHERE id=930')
            else:call(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='ADMIN'))
        k,q=payload(actor=930)
        race(create(930,k,q),lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='GENERAL'),'109_alta_antes_retiro_admin')
        confirmed=recover(930,k)
        check(confirmed['estado']=='CONFIRMADO' and call(create(930,k,q))==confirmed,'109 alta ganadora conserva replay y GET propio tras perder ADMIN sin exigir M2')
        sql(create(930,str(uuid.uuid4()),q),error='CAPACIDAD',service=True)
        call(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='ADMIN'))
        def prepare_inc_statement(actor,key):
            files=[{'ruta_archivo':f'vivero/incorporaciones/{actor}/{key}/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':20}]
            return f"SELECT public.m2_incorporacion_evidencias_preparar({actor},1,'{key}',{lit(files)})"
        k=str(uuid.uuid4());before=sql('SELECT count(*) FROM public.evidencias_trazabilidad')
        race(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='VALIDADOR'),prepare_inc_statement(930,k),'109_retiro_admin_antes_fotos','CAPACIDAD')
        check(before==sql('SELECT count(*) FROM public.evidencias_trazabilidad'),'109 rol retirado antes de preparar fotos no inserta evidencia ni contexto')
        call(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='ADMIN'))
        k=str(uuid.uuid4())
        race(prepare_inc_statement(930,k),lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='GENERAL'),'109_fotos_antes_retiro_admin')
        sql(f"SELECT public.m2_incorporacion_evidencias_leer(930,1,'{k}')",error='CAPACIDAD',service=True)
        check(sql(f"SELECT count(*) FROM public.m2_evidencia_contexto WHERE actor_id=930 AND solicitud_id='{k}'")=='1','109 preparación ganadora conserva contexto inmutable; lectura pendiente se cierra al perder ADMIN')
        if args.postgis:
            rid=sql('SELECT min(registro_plantacion_id) FROM public.registro_plantacion_detalle')
            admin_read=f"SELECT public.pa_registro_procedencia_administrativa_leer(930,'fixture-t5-race-admin',{rid})"
            call(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='ADMIN'))
            race(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='GENERAL'),admin_read,'110_retiro_admin_antes_lectura','CAPACIDAD')
            call(lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='ADMIN'))
            race(admin_read,lifecycle('CAMBIAR_ROL_GLOBAL',user=930,role='GENERAL'),'110_lectura_antes_retiro_admin')
            check(True,'110 lectura comparte lock de cuenta con autoridad072 en ambos órdenes sin requerir relación propia ni M2')
        # M2 explícito no cambia por cerrar únicamente las operacionesT5.
        call(evento(20,lote108,'ADAPTABILIDAD'))
        check(True,'109 conserva operación M2 GENERAL con vigencia fuera de incorporación')
        if not args.sql_only:
            sql("CREATE FUNCTION public.t5_http_transport(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r jsonb; detalle text; BEGIN EXECUTE p_sql INTO r; RETURN jsonb_build_object('data',r,'error',NULL); EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS detalle=PG_EXCEPTION_DETAIL; RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',SQLSTATE,'message',SQLERRM,'details',detalle)); END $$")
            http_env=dict(env,T5_DB_SOCKET=str(socket),T5_DB_PORT='55444',T5_DB_PSQL=binaries['psql'],NODE_ENV='test',T5_HTTP_POSTGIS=str(args.postgis).lower())
            if http_bigint_fixture:http_env['T5_HTTP_BIGINT_FIXTURE']=json.dumps(http_bigint_fixture)
            suite='test/db/vivero-incorporacion-http.spec.ts'
            jest=['node',str(ROOT/'node_modules/jest/bin/jest.js'),'--config',str(ROOT/'test/jest-vivero-incorporacion-db.json'),'--runInBand','--cacheDirectory=/private/tmp/r3-jest']
            r=subprocess.run(jest,cwd=ROOT,env=http_env,timeout=180)
            http={'exit_code':r.returncode,'suite':suite}
            if r.returncode:raise AssertionError('Falló HTTP T5 aislado')
        failed=False
    finally:
        for p in children:
            if p.poll() is None:p.kill();p.wait(timeout=5)
        if started or (cluster/'postmaster.pid').exists():run([binaries['pg_ctl'],'-D',str(cluster),'-w','-t','15','stop','-m','fast'])
        stopped=not (cluster/'postmaster.pid').exists()
        if stopped:shutil.rmtree(directory)
        if args.evidence:
            files=list((ROOT/'src/lotes-vivero').rglob('*.ts'))+list((ROOT/'src/plantaciones').rglob('*.ts'))+list((ROOT/'src/participacion').rglob('*.ts'))+[ROOT/'migrations'/m for m in migrations]+list((ROOT/'test/db').glob('t5-integracion-*.sql'))+[Path(__file__).resolve(),ROOT/'migrations/010_vivero_operational_rules.sql',ROOT/'migrations/056_fix_devolucion_saldo_constraint.sql',ROOT/'scripts/qa/vivero-incorporacion-102-antecedentes.sql',ROOT/'scripts/qa/vivero-incorporacion-107-diagnostico.sql',ROOT/'scripts/qa/vivero-incorporacion-inicial-helper.py',ROOT/'test/db/vivero-incorporacion-inicial-fixture.sql',ROOT/'test/db/vivero-incorporacion-http.spec.ts',ROOT/'test/jest-vivero-incorporacion-db.json']
            evidence={'tarea':'T5_INCORPORACION_PLANTAS_VIVAS','estado':'FALLIDO' if failed else 'CORRECTO','fecha':datetime.now(ZoneInfo('America/La_Paz')).date().isoformat(),'zona_horaria':'America/La_Paz',
                'entorno':{'tipo':'SINTETICO_LOCAL','node':run(['node','--version']),'postgres':version,'tcp':False,'sin_env':True,'postgis':postgis_version or False,'cluster_detenido':stopped,'directorio_eliminado':not directory.exists()},
                'base':run(['git','-C',str(ROOT),'rev-parse','HEAD']),'migraciones':migrations,'comprobaciones':checks,'carreras':races,'http':http,'diagnostico107':diagnostico107,
                'limites':['Antecedente focal100 sobre fixtureT2/077; no replay productivo001–100.','Incluye CHECKs/trigger/helpers010 reales y056.107 se instala tras095/100 antes del primerEMBOLSADO real para reproducir/arreglar el conflicto; destino ordena101–107.','Storage sintético: contexto/vínculos SQL y metadatos074; sin bytes ni Supabase Storage remoto.','Con --postgis instala074/075 íntegramente sobre100+T5 y ejercita inicialLIFO y reposición077/106 con PostGIS real, incluyendo HTTP con vecinosBIGINT exactos.','103 usa helper085 exacto y overlay082 mínimo representativo; no instala085 completo.'],
                'sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files)) if p.exists()}}
            args.evidence.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    print(f'T5: {len(checks)} grupos SQL y {len(races)} carreras aprobados.',flush=True)

if __name__=='__main__':main()
