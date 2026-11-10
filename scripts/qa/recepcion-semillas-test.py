#!/usr/bin/env python3
"""Recepción T4 y conciliación histórica en PostgreSQL privado, sin TCP ni .env."""
import argparse
import hashlib
import json
import os
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
    parser.add_argument('--sql-only', action='store_true')
    parser.add_argument('--postgis', action='store_true',help='Extensión PostGIS real y regresión M3 de consumo sin M2; falla si falta la extensión.')
    parser.add_argument('--conciliacion', action='store_true', help='Añade 097, remanentes sintéticos y regresiones SQL/HTTP de conciliación.')
    parser.add_argument('--revision-conciliacion', action='store_true', help='Ejecuta la suite de conciliación y añade 099 y su regresión de orígenes.')
    args = parser.parse_args()
    args.conciliacion = args.conciliacion or args.revision_conciliacion
    binaries = {n: str(args.pg_bin/n) if args.pg_bin else shutil.which(n) for n in ('initdb','pg_ctl','psql')}
    if not all(binaries.values()): parser.error('Faltan binarios PostgreSQL; use --pg-bin.')
    if args.evidence and args.evidence.exists(): parser.error('La evidencia debe ser nueva.')
    migrations = MIGRATIONS.copy()
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C',PGPASSFILE=os.devnull,PGSERVICEFILE=os.devnull,PGAPPNAME='t4_aislado')
    directory = Path(tempfile.mkdtemp(prefix='t4-recepcion-',dir='/tmp')).resolve()
    cluster,socket = directory/'pg',directory/'socket'; socket.mkdir(mode=0o700)
    checks=[]; races=[]; children=[]; started=False; http=None; version=None; postgis_version=None; postflight=None

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
    def entrega(actor,lote,sub=11,ids=None,proposito='PLANTACION_INICIAL'):
        ids=ids if ids is not None else evidence(actor,1,lote,'DESPACHO')
        return f"SELECT to_jsonb(x) FROM public.fn_vivero_asignar_stock_subcampania({lote},{sub},2,'{proposito}',{actor},CURRENT_DATE,ARRAY[{','.join(map(str,ids))}]::bigint[],NULL) x;"
    def devolucion(actor,asig): return f"SELECT to_jsonb(x) FROM public.fn_m3_devolver_asignacion_vivero({asig},1,'SOBRANTE_OPERATIVO',{actor},CURRENT_DATE,NULL) x;"
    def extract(file,name):
        s=(ROOT/'migrations'/file).read_text();start=s.index('CREATE OR REPLACE FUNCTION public.'+name+'(');end=s.index('$$;',s.index('AS $$',start))+3
        return s[start:end]
    failed=True
    try:
        run([binaries['initdb'],'-D',str(cluster),'-U','postgres','--auth-local=trust','--auth-host=reject','--locale=en_US.UTF-8','--encoding=UTF8'])
        run([binaries['pg_ctl'],'-D',str(cluster),'-l',str(directory/'pg.log'),'-w','-t','20','start','-o',f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55444 -c unix_socket_permissions=0700"])
        started=True;version=sql('SHOW server_version');print('T4 PostgreSQL aislado '+version,flush=True)
        run(command()+['-f',str(ROOT/'test/db/vivero-acceso-fixture.sql')])
        if args.postgis:
            run(command()+['-f',str(ROOT/'test/db/vivero-acceso-postgis-fixture.sql')])
            postgis_version=sql('SELECT postgis_full_version()')
        sql("ALTER TABLE public.tipos_entidad_evidencia ADD COLUMN descripcion text; ALTER TABLE public.tipos_entidad_evidencia ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY; SELECT setval(pg_get_serial_sequence('public.tipos_entidad_evidencia','id'),(SELECT max(id) FROM public.tipos_entidad_evidencia));")
        sql(extract('010_vivero_operational_rules.sql','fn_vivero_assert_fecha_operativa'))
        sql(extract('010_vivero_operational_rules.sql','fn_vivero_cerrar_lote_si_corresponde'))
        for num in ('018','019','021','026','046','055'):
            run(command()+['-f',str(next((ROOT/'migrations').glob(num+'_*')))])
        # 077 real con antecedentes focales; el helper del plan no interviene en esta suite.
        sql("CREATE FUNCTION public.fn_subcampania_obtener_plan(bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")
        run(command()+['-f',str(ROOT/'migrations/077_pa_int02d_operaciones_compartidas.sql')])
        for _ in range(2):
            for migration in MIGRATIONS: run(command()+['-f',str(ROOT/'migrations'/migration)])
        for user in (20,22,24,9007199254740995): call(assign(user))
        call(access(21));call(access(22))
        today=sql("SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date")
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica,nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,nombre_comunidad_snapshot,nombre_recolector_snapshot) SELECT i,21,CURRENT_DATE,'PENDIENTE_VALIDACION','T4-ORIGEN-'||i,'SEMILLA',1,1,1,1,'G',100,'Especie sintética','Tara','comun','Zona','Autor M1' FROM generate_series(100,180) i;")
        sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id) SELECT 1,r.id,'recoleccion_fotos','origen/'||r.id||'/'||n,'FOTO','image/jpeg',21 FROM public.recoleccion r CROSS JOIN generate_series(1,2) n WHERE r.id BETWEEN 100 AND 180;")
        def photos(actor,rec):
            fs=[{'ruta_archivo':f'recepcion/pendientes/{actor}/{rec}/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':20}]
            return call(f'SELECT public.m1_recepcion_evidencias_preparar({actor},{rec},{lit(fs)})')
        def payload(rec=100,qty=100,unit='G',rev=None,ids=None,actor=20,**more):
            return dict(recoleccion_id=str(rec),revision_esperada=str(rev if rev is not None else sql(f'SELECT revision_captura FROM public.recoleccion WHERE id={rec}')),
                        cantidad_recibida=qty,unidad_recibida=unit,fecha_recepcion=today,evidencia_ids=ids if ids is not None else photos(actor,rec),**more)
        def receive(actor,p,key=None):
            auth={1:'fixture-admin',3:'fixture-voluntario',5:'fixture-inactivo',20:'fixture-t2-operario',21:'fixture-t2-m1',22:'fixture-t2-ambos',23:'fixture-t2-sin-vivero',24:'fixture-t2-coordinador',9007199254740995:'fixture-t2-big',9007199254740996:'fixture-t2-big2'}.get(actor,'fixture-validador')
            return f"SELECT public.m1_recepcion_ejecutar({actor},'{auth}','{key or uuid.uuid4()}',{lit(p)})"
        def receipt(actor,p,expected='CONFIRMADO',key=None):
            r=call(receive(actor,p,key));check(r['body']['estado']==expected,f'{actor}/{p["recoleccion_id"]}: {expected}');return r
        def snap(rec):
            return sql(f"SELECT jsonb_build_array((SELECT to_jsonb(r) FROM public.recoleccion r WHERE id={rec}),(SELECT count(*) FROM public.recoleccion_recepcion),(SELECT count(*) FROM public.recoleccion_recepcion_observacion),(SELECT count(*) FROM public.recoleccion_historial),(SELECT count(*) FROM public.recoleccion_recepcion_comando),(SELECT count(*) FROM public.recoleccion_recepcion_evidencia))")
        check(sql('SELECT count(*) FROM public.recoleccion_recepcion')=='0','096 repetible sin backfill físico ni saldo inventado')
        queue=call('SELECT public.m1_recepcion_leer(20,NULL,NULL,2)')
        check(len(queue['data'])==2 and 'correo' not in json.dumps(queue),'GENERAL solo M2 tiene cola/proyección mínima sin M1')
        for actor in (3,5,21,23,9007199254740996):
            sql(f'SELECT public.m1_recepcion_leer({actor},100,NULL,20)',error='cuenta interna' if actor in (3,5) else 'CAPACIDAD_INSUFICIENTE',service=True)
        check(True,'Solo M1, VOLUNTARIO, inactivo, otro ámbito y vecinos BIGINT no leen cola/detalle')
        p=payload(qty=.1,unit='KG');key=str(uuid.uuid4());r=receipt(20,p,key=key)
        check(call(receive(20,p,key))==r,'Replay mismo UUID/carga idéntico y sin duplicar efectos')
        check(call(receive(20,dict(p,cantidad_recibida=101),key))['body']['estado']=='CONFLICTO_CLAVE','Otra intención no reutiliza UUID')
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='100' and sql('SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=100')=='0','Conforme KG/G conserva saldo original y no acredita otro inventario')
        check(sql('SELECT usuario_id||\':\'||usuario_validacion_id FROM public.recoleccion WHERE id=100')=='21:20','Autor M1 y receptor/validador permanecen separados')
        receipt(22,payload(101,actor=22))
        receipt(1,payload(102,actor=1))
        # Prohibición de autorrecepción, también ADMIN y ambos accesos.
        for rec,actor in ((103,22),(104,1),(105,20)):
            sql(f'UPDATE public.recoleccion SET usuario_id={actor} WHERE id={rec}')
            bad=payload(rec,ids=['1']);r=receipt(actor,bad,'RECHAZADO');check(r['body']['error']['codigo']=='AUTORRECEPCION_PROHIBIDA','Autorrecepción nunca habilitada por rol/accesos')
        for rec,actor in ((106,21),(107,23),(108,3)):
            r=receipt(actor,payload(rec,ids=['1']),'RECHAZADO');check(r['http_status']==403,'Escritura RPC también deniega sin M2/rol')
        sql('UPDATE public.recoleccion SET vivero_id=2 WHERE id=109')
        receipt(20,payload(109,ids=['1']),'RECHAZADO')
        before=sql('SELECT saldo_actual FROM public.recoleccion WHERE id=110')
        r=receipt(20,payload(110,qty=80),'INCIDENCIA');inc=r['body']['resultado']['incidencia_id']
        check(sql("SELECT estado_registro||':'||saldo_actual FROM public.recoleccion WHERE id=110")=='PENDIENTE_VALIDACION:'+before,'Diferencia conserva pendiente, saldo y observado sin rechazo automático')
        sql("UPDATE public.recoleccion SET cantidad_inicial_canonica=80 WHERE id=110",error='CONGELADA')
        sql("SELECT public.m1_recoleccion_guardar(22,'APROBAR',110,1,'{}','[]')",error='INCIDENCIA_ABIERTA',service=True)
        bad=receipt(20,payload(110,qty=80,incidencia_id=inc,motivo_resolucion='No coincide todavía'),'RECHAZADO')
        check(bad['body']['error']['codigo']=='INCIDENCIA_REQUIERE_COMPROBACION_CONFORME','Resolución no inventa aceptación parcial')
        receipt(20,payload(110,incidencia_id=inc,motivo_resolucion='Nueva comprobación física conforme'))
        check(sql('SELECT count(*) FROM public.recoleccion_recepcion_observacion WHERE recoleccion_id=110')=='2','Resolución conserva incidencia original y vincula evidencia nueva')
        receipt(20,payload(111,rev=99),'RECHAZADO')
        for rec,qty,unit in ((112,1.5,'UNIDAD'),(113,0,'G'),(114,1,'GR')):
            r=receipt(20,payload(rec,qty=qty,unit=unit),'RECHAZADO');check(r['http_status']==422,'Cantidad/unidad inválida no tiene efectos')
        sql("UPDATE public.recoleccion SET tipo_material='ESQUEJE',unidad_canonica='UNIDAD' WHERE id IN(115,116)")
        receipt(20,payload(115,qty=100,unit='UNIDAD'));receipt(20,payload(116),'RECHAZADO')
        for rec,date in ((117,'2099-01-01'),(118,'2000-01-01'),(119,'2026-02-30')):
            receipt(20,dict(payload(rec),fecha_recepcion=date),'RECHAZADO')
        wrong=photos(22,120);receipt(20,payload(120,ids=wrong),'RECHAZADO')
        wrong=photos(20,121);receipt(20,payload(122,ids=wrong),'RECHAZADO')
        check(True,'Evidencia exige actor, origen, custodia y pendiente sin vínculo anterior')
        # Antiguo VALIDADO con movimiento: antecedente insertado solo en fixture privado.
        sql("UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id IN(123,124); ALTER TABLE public.recoleccion_movimiento DISABLE TRIGGER recepcion_exigida; INSERT INTO public.recoleccion_movimiento(recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,created_by) VALUES(123,'CONSUMO_A_VIVERO',-10,'G',20); ALTER TABLE public.recoleccion_movimiento ENABLE TRIGGER recepcion_exigida;")
        old=sql('SELECT saldo_actual FROM public.recoleccion WHERE id=123')
        receipt(20,payload(123),'RECHAZADO')
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=123')==old and any(x['recoleccion_id']=='123' for x in call('SELECT public.m1_recepcion_diagnostico(1,NULL,100)')),'Conciliación histórica diagnostica sin reponer lo consumido')
        sql('SELECT public.fn_recoleccion_registrar_desecho(124,1,20)',error='RECEPCION_CONFORME_REQUERIDA',service=True)
        sql(inicio(20,124),error='RECEPCION_CONFORME_REQUERIDA',service=True)
        sql("INSERT INTO public.recoleccion_movimiento(recoleccion_id,tipo_movimiento,delta,created_by) VALUES(124,'DESECHO',-1,20)",error='RECEPCION_CONFORME_REQUERIDA',service=True)
        check(not any(x['recoleccion_id']=='124' for x in call('SELECT public.m2_origenes_leer(20,1,NULL,1,50)')['data']),'Orígenes y bypass ledger/RPC legados exigen recepción')
        lote=call(inicio(20,100))['lote_vivero_id'];call('SELECT to_jsonb(x) FROM public.fn_recoleccion_registrar_desecho(100,1,20) x')
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='94','Consumo y desecho elegibles preservan ledger/saldo M1')
        sql("UPDATE public.recoleccion SET estado_registro='VALIDADO',usuario_validacion_id=4,fecha_validacion=CURRENT_DATE-1 WHERE id=141")
        receipt(20,payload(141))
        check(sql("SELECT usuario_validacion_id||':'||fecha_validacion::text FROM public.recoleccion WHERE id=141")=='4:'+sql('SELECT (CURRENT_DATE-1)::text'),'VALIDADO legado sin movimientos registra comprobación real sin sobrescribir autor/fecha de aprobación')
        sql(inicio(20,100,2,ids=['1']),error='CAPACIDAD_INSUFICIENTE',service=True)
        call(inicio(1,100,2))
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='89','ADMIN conserva destino operativo explícito distinto de custodia sin traslado implícito ordinario')
        # Fallo después de recepción/aprobación pero antes del terminal: rollback total.
        sql("CREATE FUNCTION public.t4_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_T4'; END $$; CREATE TRIGGER t4_fallar BEFORE INSERT ON public.recoleccion_recepcion_comando FOR EACH ROW EXECUTE FUNCTION public.t4_fallar();")
        p=payload(125);before=snap(125);sql(receive(20,p),error='FALLO_T4',service=True)
        check(before==snap(125),'Fallo terminal revierte recepción, aprobación, snapshot, revisión, historia, vínculo y auditoría')
        sql('DROP TRIGGER t4_fallar ON public.recoleccion_recepcion_comando')
        sql('CREATE TRIGGER t4_fallar BEFORE INSERT ON public.recoleccion_historial FOR EACH ROW EXECUTE FUNCTION public.t4_fallar();')
        p=payload(140);before=snap(140);sql(receive(20,p),error='FALLO_T4',service=True)
        check(before==snap(140),'Fallo intermedio de historia revierte también el terminal; no se disfraza de rechazo de negocio')
        sql('DROP TRIGGER t4_fallar ON public.recoleccion_historial')
        # Dos receptores y el mismo comando compiten bajo locks observados.
        a=payload(126,actor=20);b=payload(126,actor=22)
        out=race(receive(20,a),receive(22,b),'dos_receptores')
        check('REVISION_OBSOLETA' in out and sql('SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id=126')=='1','Dos receptores confirman una sola recepción')
        p=payload(127);k=str(uuid.uuid4());out=race(receive(20,p,k),receive(20,p,k),'mismo_comando')
        check(sql('SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id=127')=='1','Doble envío concurrente confirma recibo único')
        def lifecycle(op,user=24):
            payload={'usuario_destino_id':str(user),'revision_esperada':sql(f'SELECT revision_autoridad FROM public.usuario WHERE id={user}'),'motivo':'Cambio sintético T4'}
            if op=='CAMBIAR_ROL_GLOBAL': payload['rol_global']='VOLUNTARIO'
            canon=json.dumps(payload,ensure_ascii=False,separators=(',',':'),sort_keys=True)
            return f"SELECT public.pa_autoridad_ejecutar(1,'fixture-admin','{op}','{uuid.uuid4()}',{lit(payload)},'{canon}');"
        p=payload(128,actor=24);race(assign(24,op='RETIRAR'),receive(24,p),'retiro_antes_recepcion')
        check(sql('SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id=128')=='0','Retiro previo impide recepción en la misma custodia')
        call(assign(24));p=payload(129,actor=24);race(receive(24,p),assign(24,op='RETIRAR'),'recepcion_antes_retiro');call(assign(24))
        for i,op in enumerate(('INACTIVAR_CUENTA','CAMBIAR_ROL_GLOBAL')):
            p=payload(130+i,actor=24);race(lifecycle(op),receive(24,p),op.lower()+'_antes_recepcion', 'CUENTA_NO_DISPONIBLE' if op=='INACTIVAR_CUENTA' else None)
            check(sql(f'SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id={130+i}')=='0','Baja/rol serializa y deniega recepción posterior')
            sql("UPDATE public.usuario SET activo=true,rol='GENERAL' WHERE id=24")
            p=payload(132+i,actor=24);race(receive(24,p),lifecycle(op),'recepcion_antes_'+op.lower())
            sql("UPDATE public.usuario SET activo=true,rol='GENERAL' WHERE id=24")
        p=payload(134,actor=24);k=str(uuid.uuid4());r=receipt(24,p,key=k);call(assign(24,op='RETIRAR'));call(lifecycle('CAMBIAR_ROL_GLOBAL'))
        recovered=call(f"SELECT public.m1_recepcion_recuperar(24,'fixture-t2-coordinador','{k}')")
        check(recovered['body']==r['body'],'Recuperación propia tras retiro M2 y rol no presta autorización vigente')
        check(call(f"SELECT public.m1_recepcion_recuperar(20,'fixture-t2-operario','{k}')")['http_status']==202,'Recuperación no revela terminal ajeno')
        sql("UPDATE public.usuario SET activo=true,rol='GENERAL' WHERE id=24");call(assign(24))
        sql('SELECT public.m1_recepcion_leer(9007199254740996,100,NULL,20)',error='CAPACIDAD_INSUFICIENTE',service=True)
        sql("INSERT INTO public.vivero(id,codigo,nombre) VALUES(9007199254740992,'BIG-A','Vivero BIG A'),(9007199254740993,'BIG-B','Vivero BIG B')")
        call(assign(9007199254740995,9007199254740992))
        sql('UPDATE public.recoleccion SET vivero_id=9007199254740993 WHERE id=135')
        receipt(9007199254740995,payload(135,ids=['1']),'RECHAZADO')
        sql('UPDATE public.recoleccion SET vivero_id=9007199254740992,revision_captura=9007199254740992 WHERE id=135')
        p=payload(135,actor=9007199254740995);r=receipt(9007199254740995,p)
        check(r['body']['resultado']['revision_nueva']=='9007199254740993' and r['body']['resultado']['vivero_id']=='9007199254740992','Custodias y revisiones BIGINT vecinos exactos sin Number')
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica,nombre_cientifico_snapshot,nombre_comercial_snapshot) SELECT i,21,CURRENT_DATE,'PENDIENTE_VALIDACION','T4-BIG-ORIGEN-'||i,'SEMILLA',1,i,1,1,'G',100,'Especie sintética','Tara' FROM unnest(ARRAY[9007199254740992,9007199254740993]::bigint[]) i; INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id) SELECT 1,r.id,'recoleccion_fotos','big/'||r.id||'/'||n,'FOTO','image/jpeg',21 FROM public.recoleccion r CROSS JOIN generate_series(1,2) n WHERE r.id>9007199254740991;")
        sql('SELECT public.m1_recepcion_leer(9007199254740995,9007199254740993,NULL,20)',error='CAPACIDAD_INSUFICIENTE',service=True)
        r=receipt(9007199254740995,payload(9007199254740992,actor=9007199254740995))
        check(r['body']['resultado']['recoleccion_id']=='9007199254740992','Orígenes BIGINT vecinos mayores a MAX_SAFE_INTEGER también conservan identidad exacta')
        sql('SELECT public.m1_recepcion_proyectar(20,100,true)',error='permission denied',service=True)
        sql('DELETE FROM public.recoleccion_recepcion',error='append-only')
        check(sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'm1_recepcion_%' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))")=='0','RPC/helpers sin EXECUTE público/autenticado e historia inmutable')
        sql('CREATE ROLE t4_heredado NOLOGIN; GRANT t4_heredado TO anon; GRANT SELECT ON public.recoleccion_recepcion_observacion TO t4_heredado;')
        sql((ROOT/'migrations/096_recoleccion_recepcion.sql').read_text(),error='T4_PRIVILEGIO_TABLA_INESPERADO')
        sql('REVOKE SELECT ON public.recoleccion_recepcion_observacion FROM t4_heredado; REVOKE t4_heredado FROM anon; DROP ROLE t4_heredado;')
        sql('ALTER TABLE public.recoleccion_recepcion_observacion ALTER COLUMN clase TYPE varchar;')
        sql((ROOT/'migrations/096_recoleccion_recepcion.sql').read_text(),error='T4_CATALOGO_INCOMPATIBLE')
        sql('ALTER TABLE public.recoleccion_recepcion_observacion ALTER COLUMN clase TYPE text;')
        check(True,'096 aborta ante drift de catálogo y ACL heredadas sin corregirlos silenciosamente')
        if args.postgis:
            call(evento(20,lote,'EMBOLSADO',qty=30))
            sql("INSERT INTO public.campania(id,nombre) VALUES(4,'Campaña M3 T4'); INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom) VALUES(61,4,'M3 independiente','ACTIVA','SUB-T4-M3',1,1,1,ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326)); INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES(61,1); INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(61,24,'COORDINADOR',1),(61,21,'OPERARIO',1); INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,nombre_responsable_snapshot,codigo_trazabilidad,created_by,cantidad_muerta_acumulada) VALUES(4000,61,21,CURRENT_DATE,2,'Actor M3','T4-GRUPO-LEGADO',21,2);")
            asig=call(entrega(24,lote,61,proposito='REPOSICION'))['asignacion_id']
            ev=sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id,metadata) VALUES(4,0,'participacion_evidencias','plantacion-t4.jpg','FOTO','image/jpeg',21,jsonb_build_object('subcampania_id','61','proposito','REPOSICION')) RETURNING id")
            before=sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}');m1=sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')
            details=lit([{'asignacion_id':asig,'lote_vivero_id':lote,'planta_id':1,'cantidad':1}])
            r=call(f"SELECT to_jsonb(x) FROM public.fn_m3_registrar_plantacion(61,true,4000,CURRENT_DATE,21,-16.5,-68.1,NULL,ARRAY[]::bigint[],{details},ARRAY[{ev}]::bigint[]) x")
            check(r['gps_dentro_poligono'] and before==sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}') and m1==sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100'),'M3 consume asignación sin M2/recepción adicional ni doble débito; PostGIS real')
        if args.conciliacion:
            from vivero_conciliacion_checks import comprobar_conciliacion, instalar_conciliacion

            fixture = ROOT/'test/db/vivero-conciliacion-fixture.sql'
            run(command()+['-f',str(fixture)])
            # Hechos de prueba válidos bajo las reglas antiguas antes de simular su antigüedad.
            sql('ALTER TABLE public.recoleccion_movimiento DISABLE TRIGGER recepcion_exigida')
            lote_historico=call(inicio(20,201))['lote_vivero_id']
            sql("""
                INSERT INTO public.recoleccion_movimiento
                  (recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,motivo,created_by)
                VALUES (203,'DESECHO',-10,'G','DESECHO_OTRO',20),
                       (208,'CONSUMO_A_VIVERO',-10,'G','CONSUMO_PARA_VIVERO',20),
                       (214,'DESECHO',-10,'G','DESECHO_OTRO',20),
                       (219,'DESECHO',-10,'G','DESECHO_OTRO',20),
                       (227,'CORRECCION',-10,'G','DESECHO_OTRO',20),
                       (228,'CORRECCION',10,'G','DESECHO_OTRO',20),
                       (229,'AJUSTE_MIGRACION',-10,'G','DESECHO_OTRO',20),
                       (230,'AJUSTE_MIGRACION',10,'G','DESECHO_OTRO',20);
                ALTER TABLE public.recoleccion_movimiento ENABLE TRIGGER recepcion_exigida;
            """)
            call(evento(20,lote_historico,'EMBOLSADO',qty=30))
            sql("UPDATE public.subcampania_equipo SET usuario_id=24 WHERE subcampania_id=11 AND rol='COORDINADOR'")
            asignacion_historica=call(entrega(24,lote_historico))['asignacion_id']
            receipt(20,payload(209))
            # Se simula el paso del tiempo únicamente en el fixture. 090 vuelve a
            # regir antes de instalar 097 y conserva su definición de catálogo.
            sql("""
                DO $fixture$
                DECLARE regla text;
                BEGIN
                  SELECT pg_get_constraintdef(oid) INTO STRICT regla
                    FROM pg_constraint WHERE conrelid='public.recoleccion'::regclass
                    AND conname='chk_fecha_rango';
                  ALTER TABLE public.recoleccion DROP CONSTRAINT chk_fecha_rango;
                  ALTER TABLE public.recoleccion DISABLE TRIGGER recepcion_congelar;
                  UPDATE public.recoleccion SET fecha=CURRENT_DATE-70,
                    fecha_validacion=CASE WHEN estado_registro='VALIDADO' THEN CURRENT_DATE-69 END
                    WHERE (id BETWEEN 201 AND 234 AND id<>214)
                       OR id IN (9007199254741000,9007199254741001);
                  ALTER TABLE public.recoleccion ENABLE TRIGGER recepcion_congelar;
                  EXECUTE 'ALTER TABLE public.recoleccion ADD CONSTRAINT chk_fecha_rango ' || regla;
                END $fixture$;
            """)
            sql(inicio(20,209),error='chk_fecha_rango',service=True)
            check(True,'096 reproduce el bloqueo de saldo en un origen ordinario T4 envejecido')
            migration = next((ROOT/'migrations').glob('097_*'))
            migrations.append(migration.name)
            preflight = ROOT/'scripts/qa/vivero-conciliacion-preflight.sql'
            catalogo_antes = json.loads(run(command()+['-f',str(preflight)]))
            check(catalogo_antes['entorno']['transaccion_solo_lectura']=='on'
                  and catalogo_antes['comprobaciones']['enums_requeridos_presentes']
                  and not catalogo_antes['comprobaciones']['enums_sin_extras']
                  and not catalogo_antes['objetos_097_encontrados'],
                  'Preflight de solo lectura distingue valores requeridos de extras antes de 097')
            instalar_conciliacion(sql=sql, check=check, migracion=migration.read_text())
            catalogo_despues = json.loads(run(command()+['-f',str(preflight)]))
            check(catalogo_despues['entorno']['transaccion_solo_lectura']=='on'
                  and bool(catalogo_despues['objetos_097_encontrados'])
                  and all(
                      tabla['permisos_efectivos'][rol]['privilegios_servidor']['SELECT']
                      and not tabla['permisos_efectivos'][rol]['privilegios_servidor']['INSERT']
                      for tabla in catalogo_despues['tablas_y_acl']
                      if tabla['nombre'] in ('recoleccion','recoleccion_movimiento')
                      for rol in ('anon','authenticated')
                  ),
                  'Preflight posterior muestra objetos 097 y el cierre efectivo sin modificar el catálogo')
            postflight_file = ROOT/'scripts/qa/vivero-conciliacion-postflight.sql'
            postflight = json.loads(run(command()+['-f',str(postflight_file)]))
            check(postflight['entorno']['transaccion_solo_lectura']=='on'
                  and all(value is True for value in postflight['comprobaciones'].values())
                  and postflight['conteos']=={'eventos_totales':0,'origenes_en_padron':0},
                  'Postflight de solo lectura verifica la instalación nueva y el padrón vacío')
            comprobar_conciliacion(
                sql=sql, call=call, lit=lit, check=check, race=race, assign=assign,
                inicio=inicio, evento=evento, entrega=entrega, today=today,
                lote_historico=lote_historico, asignacion_historica=asignacion_historica,
                postgis=args.postgis,
            )
            postflight = json.loads(run(command()+['-f',str(postflight_file)]))
            check(all(value is True for value in postflight['comprobaciones'].values())
                  and postflight['conteos']['eventos_totales']>0,
                  'Postflight conserva controles y cuenta hechos después de las operaciones sintéticas')
            if args.revision_conciliacion:
                from vivero_conciliacion_checks import comprobar_requisitos_inicio

                migration = next((ROOT/'migrations').glob('099_*'))
                run(command()+['-f',str(migration)])
                migrations.append(migration.name)
                comprobar_requisitos_inicio(sql=sql, call=call, check=check, inicio=inicio)
        if not args.sql_only:
            sql("CREATE FUNCTION public.t4_http_transport(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r jsonb; BEGIN EXECUTE p_sql INTO r; RETURN jsonb_build_object('data',r,'error',NULL); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',SQLSTATE,'message',SQLERRM)); END $$;")
            http_env=dict(env,T4_DB_SOCKET=str(socket),T4_DB_PORT='55444',T4_DB_PSQL=binaries['psql'],NODE_ENV='test')
            if args.revision_conciliacion:
                http_env['T4_DB_REVISION_CONCILIACION']='1'
            jest=['node',str(ROOT/'node_modules/jest/bin/jest.js'),'--config',str(ROOT/'test/jest-recepcion-semillas-db.json'),'--runInBand','--cacheDirectory=/private/tmp/t4-jest']
            http=[]
            suites=['test/db/recepcion-semillas-http.spec.ts']
            if args.conciliacion:
                suites.insert(0,'test/db/vivero-conciliacion-http.spec.ts')
            for suite in suites:
                r=subprocess.run(jest+['--testMatch=**/'+suite,'--runTestsByPath',suite],
                                 cwd=ROOT,env=http_env,timeout=180)
                http.append({'exit_code':r.returncode,'suite':suite})
                if r.returncode: raise AssertionError('Falló HTTP aislado: '+suite)
        failed=False
    finally:
        for p in children:
            if p.poll() is None: p.kill();p.wait(timeout=5)
        if started or (cluster/'postmaster.pid').exists():run([binaries['pg_ctl'],'-D',str(cluster),'-w','-t','15','stop','-m','fast'])
        stopped=not (cluster/'postmaster.pid').exists()
        if stopped: shutil.rmtree(directory)
        if args.evidence:
            files=list((ROOT/'src/recolecciones').rglob('*.ts'))+[ROOT/'migrations'/m for m in migrations]+[Path(__file__).resolve(),ROOT/'test/db/recepcion-semillas-http.spec.ts']
            if args.conciliacion:
                files+=list((ROOT/'src/lotes-vivero').rglob('*conciliacion*.ts'))
                files += [ROOT/p for p in (
                    'scripts/qa/vivero-conciliacion-preflight.sql',
                    'scripts/qa/vivero-conciliacion-postflight.sql',
                    'scripts/qa/vivero_conciliacion_checks.py',
                    'src/lotes-vivero/api/vivero-accesos.controller.ts',
                    'src/lotes-vivero/application/vivero-accesos.service.ts',
                    'src/lotes-vivero/application/vivero-inicio.service.ts',
                    'test/db/vivero-conciliacion-fixture.sql',
                    'test/db/vivero-conciliacion-http.spec.ts',
                )]
            evidence = {
                'tarea': 'VIVERO_CONCILIACION_HISTORICA' if args.conciliacion else 'T4_RECEPCION_SEMILLAS',
                'estado': 'FALLIDO' if failed else 'CORRECTO',
                'fecha': time.strftime('%Y-%m-%d'),
                'entorno': {
                    'tipo': 'SINTETICO_LOCAL', 'postgres': version, 'tcp': False, 'sin_env': True,
                    'postgis': postgis_version or False, 'cluster_detenido': stopped,
                    'directorio_eliminado': not directory.exists(),
                },
                'base': run(['git','-C',str(ROOT),'rev-parse','HEAD']),
                'migraciones': migrations,
                'comprobaciones': checks,
                'carreras': races,
                'http': http,
                'postflight': postflight,
                'sha256': {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in sorted(set(files)) if p.exists()
                },
            }
            args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
    suite = 'T4 y conciliación histórica' if args.conciliacion else 'T4'
    print(f'{suite}: {len(checks)} grupos SQL y {len(races)} carreras aprobados.',flush=True)

if __name__=='__main__': main()
