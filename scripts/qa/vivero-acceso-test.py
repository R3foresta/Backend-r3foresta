#!/usr/bin/env python3
"""T2/094/095: clúster PostgreSQL privado, sin TCP, .env ni servicios reales."""
import argparse
import hashlib
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
MIGRATIONS = ['092_usuario_acceso_recoleccion.sql','093_recoleccion_acceso_explicito.sql','094_usuario_vivero.sql','095_vivero_operacion_por_ambito.sql']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--sql-only', action='store_true')
    parser.add_argument('--postgis', action='store_true',help='Extensión PostGIS real y regresión M3 de consumo sin M2; falla si falta la extensión.')
    args = parser.parse_args()
    binaries = {n: str(args.pg_bin/n) if args.pg_bin else shutil.which(n) for n in ('initdb','pg_ctl','psql')}
    if not all(binaries.values()): parser.error('Faltan binarios PostgreSQL; use --pg-bin.')
    if args.evidence and args.evidence.exists(): parser.error('La evidencia debe ser nueva.')
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C',PGPASSFILE=os.devnull,PGSERVICEFILE=os.devnull,PGAPPNAME='t2_aislado')
    directory = Path(tempfile.mkdtemp(prefix='t2-vivero-',dir='/tmp')).resolve()
    cluster,socket = directory/'pg',directory/'socket'; socket.mkdir(mode=0o700)
    checks=[]; races=[]; children=[]; started=False; http=None; version=None; postgis_version=None

    def run(cmd, timeout=60):
        r=subprocess.run(cmd,env=env,text=True,capture_output=True,timeout=timeout)
        if r.returncode: raise RuntimeError(r.stderr[-3500:])
        return r.stdout.strip()

    def command(): return [binaries['psql'],'-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h',str(socket),'-p','55444','-U','postgres','-d','postgres']
    def sql(s, error=None, service=False):
        r=subprocess.run(command()+['-c',('SET ROLE service_role; ' if service else '')+s],env=env,text=True,capture_output=True,timeout=30)
        if error:
            if not r.returncode or error not in r.stderr: raise AssertionError(f'Esperado {error}: {r.stderr[-1500:]}')
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
            if expected_error not in err: raise AssertionError(name+': '+out+err)
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
    def inicio(actor,rec=100,viv=1,ids=None):
        ids=ids if ids is not None else evidence(actor,viv)
        return f"SELECT to_jsonb(x) FROM public.fn_vivero_crear_lote_desde_recoleccion({rec},{viv},{actor},CURRENT_DATE,CURRENT_DATE,5,'G',NULL,ARRAY[{','.join(map(str,ids))}]::bigint[]) x;"
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
    def entrega(actor,lote,sub=11,ids=None,proposito='PLANTACION_INICIAL'):
        ids=ids if ids is not None else evidence(actor,1,lote,'DESPACHO')
        return f"SELECT to_jsonb(x) FROM public.fn_vivero_asignar_stock_subcampania({lote},{sub},2,'{proposito}',{actor},CURRENT_DATE,ARRAY[{','.join(map(str,ids))}]::bigint[],NULL) x;"
    def devolucion(actor,asig): return f"SELECT to_jsonb(x) FROM public.fn_m3_devolver_asignacion_vivero({asig},1,'SOBRANTE_OPERATIVO',{actor},CURRENT_DATE,NULL) x;"
    def extract(file,name):
        s=(ROOT/'migrations'/file).read_text();match=re.search(r'CREATE(?: OR REPLACE)? FUNCTION public\.'+re.escape(name)+r'\(',s);start=match.start();end=s.index('$$;',s.index('AS $$',start))+3
        return s[start:end]
    failed=True
    try:
        run([binaries['initdb'],'-D',str(cluster),'-U','postgres','--auth-local=trust','--auth-host=reject','--locale=en_US.UTF-8','--encoding=UTF8'])
        run([binaries['pg_ctl'],'-D',str(cluster),'-l',str(directory/'pg.log'),'-w','-t','20','start','-o',f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55444 -c unix_socket_permissions=0700"])
        started=True;version=sql('SHOW server_version');print('T2 PostgreSQL aislado '+version,flush=True)
        run(command()+['-f',str(ROOT/'test/db/vivero-acceso-fixture.sql')])
        if args.postgis:
            run(command()+['-f',str(ROOT/'test/db/vivero-acceso-postgis-fixture.sql')])
            postgis_version=sql('SELECT postgis_full_version()')
        sql(extract('010_vivero_operational_rules.sql','fn_vivero_assert_fecha_operativa'))
        sql(extract('010_vivero_operational_rules.sql','fn_vivero_cerrar_lote_si_corresponde'))
        for num in ('018','019','021','026','046','055'):
            run(command()+['-f',str(next((ROOT/'migrations').glob(num+'_*')))])
        # 077 real con antecedentes focales; el helper del plan no interviene en esta suite.
        sql("CREATE FUNCTION public.fn_subcampania_obtener_plan(bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")
        run(command()+['-f',str(ROOT/'migrations/077_pa_int02d_operaciones_compartidas.sql')])
        for _ in range(2):
            for migration in MIGRATIONS: run(command()+['-f',str(ROOT/'migrations'/migration)])
        check(sql('SELECT count(*) FROM public.usuario_vivero')=='0','094/095 repetibles sin backfill ni permisos por rol')
        key=str(uuid.uuid4());r=call(assign(20,key=key,rev=0));assert r['body']['estado']=='CONFIRMADO'
        check(call(assign(20,key=key,rev=0))==r,'Replay exacto conserva recibo y vigencia únicos')
        check(call(assign(20,2,key=key,rev=0))['http_status']==409,'Clave reutilizada no cambia vivero ni intención')
        check(call(assign(20,2,rev=0))['http_status']==409,'Revisión por usuario rechaza otra intención obsoleta')
        call(assign(20,2));check(sql('SELECT count(*) FROM public.usuario_vivero WHERE usuario_id=20 AND revocado_en IS NULL')=='2','Una persona opera dos viveros con iguales capacidades')
        check(call(assign(20))['body']['resultado']['cambio']=='SIN_CAMBIOS','Otorgamiento equivalente no duplica historial')
        for actor in (20,4): check(call(assign(22,actor=actor))['http_status']==403,f'Actor {actor} sin ADMIN no administra asignaciones')
        for dest in (1,3,5): check(call(assign(dest))['http_status']==409,f'Destino {dest} inelegible/ADMIN no obtiene vigencia')
        check(call(assign(20,99))['http_status']==404,'Vivero inexistente conserva rechazo durable')
        call(access(21));call(access(22));call(assign(22));call(assign(24))
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica,nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,nombre_comunidad_snapshot,nombre_recolector_snapshot) SELECT i,21,CURRENT_DATE,'VALIDADO','T2-ORIGEN-'||i,'SEMILLA',1,CASE WHEN i=101 THEN 2 WHEN i=102 THEN NULL ELSE 1 END,1,1,'G',100,'Especie sintética','Tara','comun','Zona','Autor M1' FROM generate_series(100,105) i;")
        sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id) SELECT 1,r.id,'recoleccion_fotos','origen/'||r.id||'/'||n,'FOTO','image/jpeg',21 FROM public.recoleccion r CROSS JOIN generate_series(1,2) n WHERE r.id BETWEEN 100 AND 105;")
        sql(save(20),error='acceso M1',service=True);sql(inicio(21,ids=[1]),error='CAPACIDAD_INSUFICIENTE',service=True)
        check(True,'Solo M2 no captura M1; solo M1 no inicia M2')
        rec=call(save(22))['id']; check(rec is not None,'Ambos accesos permiten captura M1 además de operación M2')
        origins=call('SELECT public.m2_origenes_leer(20,1,NULL,1,2)')
        check(origins['pagination']['total']==4 and len(origins['data'])==2 and 'observaciones' not in origins['data'][0],'Material ajeno mínimo filtrado antes de total/página, sin editar M1')
        call(assign(20,1,op='RETIRAR'));sql('SELECT public.m2_origenes_leer(20,1,NULL,1,20)',error='CAPACIDAD_INSUFICIENTE',service=True)
        check(call('SELECT public.m2_ambitos(20)')=={'global':False,'viveros':['2']},'Retiro A conserva B sin borrar historia')
        call(assign(20,1));check(sql('SELECT count(*) FROM public.usuario_vivero WHERE usuario_id=20 AND vivero_id=1')=='2','Reotorgar abre otra vigencia y conserva la retirada')
        lote=call(inicio(20))['lote_vivero_id'];lote_b=call(inicio(20,101,2))['lote_vivero_id']
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='95','INICIO consume M1 una vez y conserva transacción de lote/evento/ledger')
        call(assign(20,2,op='RETIRAR'));sql(evento(20,lote_b,'EMBOLSADO',ids=[1]),error='CAPACIDAD_INSUFICIENTE',service=True)
        sql(inicio(20,101,1),error='camino ordinario',service=True)
        check(True,'Operario no opera B por ID ni usa origen B en A; ADMIN conserva destino explícito')
        admin_cross=call(inicio(1,101,1));assert admin_cross['lote_vivero_id']
        eid=evidence(20,1,lote,'EMBOLSADO')
        sql(evento(22,lote,'EMBOLSADO',ids=eid),error='EVIDENCIA_FUERA_DE_AMBITO',service=True)
        sql(evento(20,lote,'MERMA',ids=eid),error='EVIDENCIA_FUERA_DE_AMBITO',service=True)
        check(True,'Evidencia pendiente exige mismo actor, vivero, lote y evento real')
        call(evento(20,lote,'EMBOLSADO',qty=30,ids=eid));call(evento(20,lote,'ADAPTABILIDAD'));call(evento(20,lote,'MERMA'));call(evento(20,lote,'DESPACHO'))
        desc=call(inicio(20,103))['lote_vivero_id'];call(evento(20,desc,'DESCARTE_PRE_EMBOLSADO'))
        check(sql(f"SELECT estado_lote||':'||coalesce(saldo_vivo_actual::text,'NULL') FROM public.lote_vivero WHERE id={desc}")=='FINALIZADO:NULL','Descarte pre-embolsado no crea plantas; eventos reales M2 autorizados')
        sql('SELECT public.fn_recoleccion_registrar_desecho(100,1,21)',error='CAPACIDAD_INSUFICIENTE',service=True)
        sql('SELECT public.fn_recoleccion_registrar_desecho(101,1,20)',error='CAPACIDAD_INSUFICIENTE',service=True)
        sql('SELECT public.fn_recoleccion_registrar_desecho(102,1,20)',error='CAPACIDAD_INSUFICIENTE',service=True)
        call('SELECT to_jsonb(x) FROM public.fn_recoleccion_registrar_desecho(100,2,20) x')
        sql('SELECT public.fn_recoleccion_registrar_desecho(100,999,20)',error='superar el saldo',service=True)
        check(sql("SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=100 AND tipo_movimiento='DESECHO'")=='1','DESECHO por operario ajeno al autor, sin M1; saldo/ámbito obligatorios y ledger M1')
        sql(f"UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION' WHERE id IN (104,105)")
        sql("SELECT public.m1_recoleccion_guardar(23,'APROBAR',104,0,'{}','[]')",error='CAPACIDAD_INSUFICIENTE',service=True)
        call("SELECT public.m1_recoleccion_guardar(22,'APROBAR',104,0,'{}','[]')")
        sql(f"SELECT public.m1_recoleccion_guardar(22,'APROBAR',{rec},0,'{{}}','[]')",error='propia',service=True)
        sql("UPDATE public.recoleccion SET usuario_id=1 WHERE id=105")
        sql("SELECT public.m1_recoleccion_guardar(1,'APROBAR',105,0,'{}','[]')",error='propia',service=True)
        sql("SELECT public.fn_recoleccion_rechazar_validacion(105,23,'Rechazo documental sintético')",error='CAPACIDAD_INSUFICIENTE',service=True)
        check(True,'Revisión legada exige VALIDADOR asignado; aprobación propia denegada incluso ADMIN')
        ids=evidence(20,1,lote,'DESPACHO');sql(entrega(20,lote,ids=ids),error='COORDINADOR',service=True)
        sql('UPDATE public.subcampania_equipo SET usuario_id=24 WHERE subcampania_id=11 AND rol=\'COORDINADOR\'')
        asig=call(entrega(24,lote))['asignacion_id'];call(devolucion(24,asig))
        sql(devolucion(20,asig),error='COORDINADOR',service=True)
        check(True,'Entrega y devolución explícitas exigen intersección M2/COORDINADOR; no basta ninguna por separado')
        # Fallo forzado confirma rollback completo después de preparar saldo/ledger.
        before=sql(f"SELECT jsonb_build_array((SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.asignacion_vivero_subcampania),(SELECT count(*) FROM public.evento_plantacion))")
        sql("CREATE FUNCTION public.t2_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_SINTETICO'; END $$; CREATE TRIGGER t2_fallar BEFORE INSERT ON public.evento_plantacion FOR EACH ROW EXECUTE FUNCTION public.t2_fallar();")
        sql(entrega(24,lote),error='FALLO_SINTETICO',service=True)
        sql('DROP TRIGGER t2_fallar ON public.evento_plantacion')
        after=sql(f"SELECT jsonb_build_array((SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}),(SELECT count(*) FROM public.evento_lote_vivero),(SELECT count(*) FROM public.asignacion_vivero_subcampania),(SELECT count(*) FROM public.evento_plantacion))")
        check(before==after,'Fallo de evento M3 revierte saldo, entrega y evento M2 juntos')
        rev_before=sql('SELECT revision FROM public.usuario_vivero_revision WHERE usuario_id=22')
        sql("CREATE TRIGGER t2_fallar BEFORE INSERT ON public.usuario_vivero_historial FOR EACH ROW EXECUTE FUNCTION public.t2_fallar();")
        count_before=sql('SELECT count(*) FROM public.vivero_acceso_comando')
        sql(assign(22,1,op='RETIRAR'),error='FALLO_SINTETICO',service=True)
        sql('DROP TRIGGER t2_fallar ON public.usuario_vivero_historial')
        check(count_before==sql('SELECT count(*) FROM public.vivero_acceso_comando') and rev_before==sql('SELECT revision FROM public.usuario_vivero_revision WHERE usuario_id=22') and sql('SELECT m2_acceso_efectivo(22,1)')=='t','Fallo de auditoría revierte retiro, revisión y recibo juntos')
        call(assign(22,1,op='RETIRAR'));check(sql('SELECT public.m1_acceso_efectivo(22)')=='t','Retirar M2 conserva la vigencia M1 de una cuenta combinada');call(assign(22))
        # Locks observados en los dos órdenes, sin sleeps como evidencia de bloqueo.
        race(assign(20,1,op='RETIRAR'),evento(20,lote,'ADAPTABILIDAD'), 'retiro_antes_evento','CAPACIDAD_INSUFICIENTE')
        call(assign(20,1));race(evento(20,lote,'ADAPTABILIDAD'),assign(20,1,op='RETIRAR'),'evento_antes_retiro')
        call(assign(20,1));race(assign(20,1,op='RETIRAR'),inicio(20,ids=evidence(20)),'retiro_antes_inicio','CAPACIDAD_INSUFICIENTE')
        call(assign(20,1));race(assign(20,1,op='RETIRAR'),prepare(20),'retiro_antes_foto','CAPACIDAD_INSUFICIENTE')
        call(assign(20,1));race(assign(20,1,op='RETIRAR'),'SELECT public.fn_recoleccion_registrar_desecho(100,1,20)','retiro_antes_desecho','CAPACIDAD_INSUFICIENTE')
        call(assign(24,1,op='RETIRAR'));call(assign(24,1))
        stmt=entrega(24,lote);race(assign(24,1,op='RETIRAR'),stmt,'retiro_antes_entrega','CAPACIDAD_INSUFICIENTE')
        call(assign(24,1));race(assign(24,1,op='RETIRAR'),devolucion(24,asig),'retiro_antes_devolucion','CAPACIDAD_INSUFICIENTE')
        call(assign(24,1))
        def lifecycle(op,user=24):
            payload={'usuario_destino_id':str(user),'revision_esperada':sql(f'SELECT revision_autoridad FROM public.usuario WHERE id={user}'),'motivo':'Cambio sintético T2'}
            if op=='CAMBIAR_ROL_GLOBAL': payload['rol_global']='VOLUNTARIO'
            canon=json.dumps(payload,ensure_ascii=False,separators=(',',':'),sort_keys=True)
            return f"SELECT public.pa_autoridad_ejecutar(1,'fixture-admin','{op}','{uuid.uuid4()}',{lit(payload)},'{canon}');"
        for op in ('INACTIVAR_CUENTA','CAMBIAR_ROL_GLOBAL'):
            for action in ('inicio','evento','foto','desecho','entrega','devolucion'):
                stmt={'inicio':lambda:inicio(24),'evento':lambda:evento(24,lote,'ADAPTABILIDAD'),
                  'foto':lambda:prepare(24),'desecho':lambda:'SELECT public.fn_recoleccion_registrar_desecho(100,1,24);',
                  'entrega':lambda:entrega(24,lote),'devolucion':lambda:devolucion(24,asig)}[action]()
                error=('CUENTA_NO_DISPONIBLE' if op=='INACTIVAR_CUENTA' else 'AUTORIDAD_INTERNA_REQUERIDA') if action in ('entrega','devolucion') else 'cuenta interna'
                race(lifecycle(op),stmt,op.lower()+'_072_antes_'+action,error)
                sql("UPDATE public.usuario SET activo=true,rol='GENERAL' WHERE id=24")
        race('SELECT public.fn_subcampania_cancelar(11,1,\'Cancelación sintética\');',devolucion(24,asig),'cancelacion_antes_devolucion','DEVUELTA')
        check(sql(f"SELECT cantidad_devuelta= cantidad_asignada-cantidad_consumida-cantidad_mermada FROM public.asignacion_vivero_subcampania WHERE id={asig}")=='t','Cancelación administrativa devuelve atómicamente sin exigir pertenecer al vivero')
        # Campañas nuevas y sin plantaciones para la desactivación masiva administrativa real.
        for camp,sub in ((2,51),(3,52)):
            sql(f"INSERT INTO public.campania(id,nombre) VALUES({camp},'Campaña masiva sintética'); INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id) VALUES({sub},{camp},'Sub masiva','ACTIVA','T2-MASIVA-{sub}',1,1,1); INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES({sub},1); INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES({sub},24,'COORDINADOR',1);")
        masiva_asig=call(entrega(24,lote,51))['asignacion_id']
        race("SELECT public.fn_campania_desactivar_sin_plantaciones(2,1,'Desactivación sintética');",devolucion(24,masiva_asig),'masiva_antes_devolucion','DEVUELTA')
        race(entrega(24,lote,52),"SELECT public.fn_campania_desactivar_sin_plantaciones(3,1,'Desactivación sintética');",'entrega_antes_masiva')
        check(sql('SELECT count(*) FROM public.asignacion_vivero_subcampania WHERE subcampania_id IN (51,52) AND saldo_asignado_disponible>0')=='0','Desactivación masiva conserva devoluciones atómicas bajo locks compartidos')
        if args.postgis:
            sql("INSERT INTO public.campania(id,nombre) VALUES(4,'Campaña M3 sin acceso M2'); INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom) VALUES(61,4,'M3 independiente','ACTIVA','SUB-T2-M3',1,1,1,ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326)); INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES(61,1); INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(61,24,'COORDINADOR',1),(61,21,'OPERARIO',1); INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,nombre_responsable_snapshot,codigo_trazabilidad,created_by,cantidad_muerta_acumulada) VALUES(4000,61,21,CURRENT_DATE,2,'Actor M3','T2-GRUPO-LEGADO',21,2);")
            asig_m3=call(entrega(24,lote,61,proposito='REPOSICION'))['asignacion_id']
            ev=sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id,metadata) VALUES(4,0,'participacion_evidencias','plantacion-sintetica.jpg','FOTO','image/jpeg',21,jsonb_build_object('subcampania_id','61','proposito','REPOSICION')) RETURNING id;")
            saldo_m2=sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}');eventos_m2=sql('SELECT count(*) FROM public.evento_lote_vivero')
            details=lit([{'asignacion_id':asig_m3,'lote_vivero_id':lote,'planta_id':1,'cantidad':1}])
            planted=call(f"SELECT to_jsonb(x) FROM public.fn_m3_registrar_plantacion(61,true,4000,CURRENT_DATE,21,-16.5,-68.1,NULL,ARRAY[]::bigint[],{details},ARRAY[{ev}]::bigint[]) x;")
            check(planted['gps_dentro_poligono'] and sql('SELECT public.m2_acceso_efectivo(21,1)')=='f' and saldo_m2==sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}') and eventos_m2==sql('SELECT count(*) FROM public.evento_lote_vivero') and sql(f'SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id={asig_m3}')=='1','RPC M3 real consume asignación sin M2, sin segundo débito ni evento de vivero; PostGIS real decide GPS')
            check(sql('SELECT dentro FROM public.gps_dentro_poligono_con_tolerancia(61,-17.5,-69.1)')=='f','PostGIS real rechaza punto exterior sin mock geográfico')
        # Cierre ACL incluye sobrecargas/herencia, tablas privadas y helpers internos.
        check(sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'm2_%' OR p.proname LIKE 'fn_vivero_registrar_%') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))")=='0','RPC M2 sin EXECUTE público/autenticado')
        sql('SELECT public.fn_m2_m3_aplicar_devolucion_fisica(1,1,\'OTRO\',20,CURRENT_DATE,NULL)',error='permission denied',service=True)
        sql('SELECT * FROM public.usuario_vivero',error='permission denied',service=True)
        sql('DELETE FROM public.usuario_vivero',error='no se borran')
        call(assign(9007199254740995));check(sql('SELECT public.m2_acceso_efectivo(9007199254740996,1)',service=True)=='f','BIGINT vecinos conservan ámbitos independientes exactos')
        # Rechazo de drift y ACL heredadas, sin normalizarlas ni dejar instalación parcial.
        sql('CREATE ROLE t2_publico NOLOGIN; GRANT t2_publico TO anon; GRANT SELECT ON public.usuario_vivero TO t2_publico;')
        sql((ROOT/'migrations/094_usuario_vivero.sql').read_text(),error='T2_PRIVILEGIO_TABLA_INESPERADO')
        sql('REVOKE SELECT ON public.usuario_vivero FROM t2_publico; REVOKE t2_publico FROM anon; DROP ROLE t2_publico;')
        check(True,'094 aborta ante permisos heredados sin reinterpretar el catálogo')
        sql('CREATE ROLE t2_rpc_publico NOLOGIN; GRANT t2_rpc_publico TO anon; GRANT EXECUTE ON FUNCTION public.m2_origenes_leer(bigint,bigint,bigint,integer,integer) TO t2_rpc_publico;')
        sql((ROOT/'migrations/095_vivero_operacion_por_ambito.sql').read_text(),error='T2_PRIVILEGIO_FUNCION_INESPERADO')
        sql('REVOKE EXECUTE ON FUNCTION public.m2_origenes_leer(bigint,bigint,bigint,integer,integer) FROM t2_rpc_publico; REVOKE t2_rpc_publico FROM anon; DROP ROLE t2_rpc_publico;')
        check(True,'095 aborta ante EXECUTE heredado, incluida proyección de orígenes')
        sql('ALTER TABLE public.m2_evidencia_contexto ALTER COLUMN evento TYPE varchar;')
        sql((ROOT/'migrations/095_vivero_operacion_por_ambito.sql').read_text(),error='T2_CATALOGO_INCOMPATIBLE')
        sql('ALTER TABLE public.m2_evidencia_contexto ALTER COLUMN evento TYPE text;')
        check(True,'095 detecta contexto previo incompatible y revierte la instalación')
        sql("CREATE FUNCTION public.fn_vivero_registrar_merma(bigint) RETURNS text LANGUAGE sql AS $$ SELECT 'LEGADO' $$; GRANT EXECUTE ON FUNCTION public.fn_vivero_registrar_merma(bigint) TO service_role;")
        run(command()+['-f',str(ROOT/'migrations/095_vivero_operacion_por_ambito.sql')])
        sql('SELECT public.fn_vivero_registrar_merma(1)',error='permission denied',service=True)
        sql('DROP FUNCTION public.fn_vivero_registrar_merma(bigint)')
        check(True,'Sobrecarga legada cerrada sin recuperar privilegios por nombre')
        sql("INSERT INTO public.usuario(id,auth_id,nombre,rol,activo) VALUES(30,'fixture-t2-admin-temporal','Administrador temporal','ADMIN',true)")
        recovery_key=str(uuid.uuid4());payload={'usuario_destino_id':'23','vivero_id':'1','revision_esperada':'0','motivo':'Asignación recuperable T2'}
        original=call(f"SELECT public.m2_acceso_ejecutar(30,'fixture-t2-admin-temporal','OTORGAR_ACCESO_VIVERO','{recovery_key}',{lit(payload)})")
        call(lifecycle('CAMBIAR_ROL_GLOBAL',30))
        recovered=call(f"SELECT public.m2_acceso_recuperar(30,'fixture-t2-admin-temporal','{recovery_key}')")
        check(original['body']==recovered['body'] and recovered['http_status']==200,'Terminal propio recuperable después de perder ADMIN mediante 072 real')
        check(call(f"SELECT public.m2_acceso_recuperar(20,'fixture-t2-operario','{recovery_key}')")['http_status']==202,'Recuperación no revela terminal de otra cuenta')
        paged=call("SELECT public.m2_acceso_leer(1,'fixture-admin',20,NULL,1)")['body']['data']
        next_page=call(f"SELECT public.m2_acceso_leer(1,'fixture-admin',20,{paged['siguiente_antes_de_id']},1)")['body']['data']
        check(len(paged['historial'])==1 and int(next_page['historial'][0]['id'])<int(paged['historial'][0]['id']),'Historial M2 pagina por cursor exacto sin mezclar revisiones de rol/M1')
        # HTTP ejecuta las mismas RPC reales a través de un adaptador SQL local y JWT real.
        if not args.sql_only:
            # El antecedente sigue probando 094/095. Estas proyecciones actuales
            # alinean capacidades e IDs de INICIO; no instalan recepción
            # ni acreditan la migración 100 completa sobre este fixture histórico.
            sql(extract('100_recoleccion_recepcion_unica.sql','m2_acceso_leer'))
            sql(extract('097_vivero_conciliacion_historica.sql','m2_inicio_lote_exacto'))
            sql('REVOKE ALL ON FUNCTION public.m2_inicio_lote_exacto(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.m2_inicio_lote_exacto(bigint,bigint,bigint,date,date,numeric,public.unidad_medida,text,bigint[],text) TO service_role;')
            check(True,'HTTP usa lector de capacidades 100 y proyección de IDs 097 sobre antecedente T2, sin instalar recepción/conciliación')
            http_env=dict(env,T2_DB_SOCKET=str(socket),T2_DB_PORT='55444',T2_DB_PSQL=binaries['psql'],NODE_ENV='test')
            r=subprocess.run(['node',str(ROOT/'node_modules/jest/bin/jest.js'),'--config',str(ROOT/'test/jest-vivero-acceso-db.json'),'--runInBand','--cacheDirectory=/private/tmp/t2-jest'],cwd=ROOT,env=http_env,timeout=180)
            http={'exit_code':r.returncode,'suite':'test/db/vivero-acceso-http.spec.ts'}
            if r.returncode: raise AssertionError('Falló HTTP aislado T2')
        failed=False
    finally:
        for p in children:
            if p.poll() is None: p.kill();p.wait(timeout=5)
        if started or (cluster/'postmaster.pid').exists():run([binaries['pg_ctl'],'-D',str(cluster),'-w','-t','15','stop','-m','fast'])
        stopped=not (cluster/'postmaster.pid').exists()
        if stopped: shutil.rmtree(directory)
        if args.evidence:
            files=list((ROOT/'src/lotes-vivero').rglob('*.ts'))+list((ROOT/'src/recolecciones').rglob('*.ts'))+list((ROOT/'src/evidencias-trazabilidad').rglob('*.ts'))+[ROOT/'migrations'/m for m in MIGRATIONS]+[Path(__file__).resolve(),ROOT/'test/db/vivero-acceso-fixture.sql',ROOT/'test/db/vivero-acceso-postgis-fixture.sql',ROOT/'test/db/vivero-acceso-http.spec.ts',ROOT/'test/jest-vivero-acceso-db.json',ROOT/'migrations/100_recoleccion_recepcion_unica.sql',ROOT/'migrations/097_vivero_conciliacion_historica.sql']
            args.evidence.write_text(json.dumps({'tarea':'T2_ACCESO_VIVEROS','estado':'FALLIDO' if failed else 'CORRECTO','fecha':time.strftime('%Y-%m-%d'),'entorno':{'tipo':'SINTETICO_LOCAL','postgres':version,'tcp':False,'sin_env':True,'postgis':postgis_version or False,'cluster_detenido':stopped,'directorio_eliminado':not directory.exists()},'base':run(['git','-C',str(ROOT),'rev-parse','HEAD']),'base_arbol':'docs/evidencia/t2-acceso-viveros-base-2026-11-05.json','migraciones':MIGRATIONS,'proyecciones_actuales_http':[] if args.sql_only else ['100:m2_acceso_leer','097:m2_inicio_lote_exacto'],'comprobaciones':checks,'carreras':races,'http':http,'sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}},ensure_ascii=False,indent=2)+'\n')
    print(f'T2: {len(checks)} grupos SQL y {len(races)} carreras aprobados.',flush=True)

if __name__=='__main__': main()
