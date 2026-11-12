#!/usr/bin/env python3
"""Recepción única100 en PostgreSQL privado, sin TCP ni .env."""
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
    args = parser.parse_args()
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
        started=True;version=sql('SHOW server_version');print('Recepción única PostgreSQL aislado '+version,flush=True)
        run(command()+['-f',str(ROOT/'test/db/vivero-acceso-fixture.sql')])
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
        for migration in MIGRATIONS: run(command()+['-f',str(ROOT/'migrations'/migration)])
        for num in ('097','099'):
            migration=next((ROOT/'migrations').glob(num+'_*'));migrations.append(migration.name)
            run(command()+['-f',str(migration)])
        migration=ROOT/'migrations/100_recoleccion_recepcion_unica.sql';migrations.append(migration.name)
        sql(migration.read_text(),error='RECEPCION_UNICA_REQUIERE_RESET_REVISADO')
        check(sql("SELECT to_regclass('public.recoleccion_recepcion_observacion') IS NOT NULL")=='t','100 aborta con datos de prueba existentes y revierte esquema sin borrarlos')
        # Sólo fixture aislado: retirar el único origen heredado, sin fabricación de recepción.
        sql('DELETE FROM public.recoleccion WHERE id=9000; ALTER TABLE public.recoleccion ADD COLUMN blockchain_url text,ADD COLUMN token_id text,ADD COLUMN transaction_hash text')
        for _ in range(2):run(command()+['-f',str(migration)])
        check(sql("SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('recoleccion_recepcion_observacion','recoleccion_conciliacion_comando','recoleccion_conciliacion_evento','recoleccion_conciliacion_evidencia_contexto','recoleccion_conciliacion_evidencia')")=='0','100 repetible retira las cinco tablas obsoletas sin CASCADE')
        check(sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'm2_conciliacion_%' OR proname IN ('fn_recoleccion_rechazar_validacion','m1_recepcion_diagnostico'))")=='0','Funciones exclusivas y bypass de rechazo/diagnóstico retirados')
        check(sql("SELECT count(*) FROM pg_attribute WHERE attrelid='public.recoleccion'::regclass AND NOT attisdropped AND attname IN ('usuario_validacion_id','fecha_validacion')")=='0','Actor y momento de recepción se conservan en el hecho sin columnas duplicadas')
        # El antecedente20 era GENERAL: en target es un receptor VALIDADOR.
        sql("UPDATE public.usuario SET rol='VALIDADOR' WHERE id=20")
        for user in (20,22,24,9007199254740995):call(assign(user))
        call(access(21));call(access(22))
        today=sql("SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date")
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad,tipo_material,ubicacion_id,vivero_id,metodo_id,planta_id,unidad_canonica,cantidad_inicial_canonica,nombre_cientifico_snapshot,nombre_comercial_snapshot,variedad_snapshot,nombre_comunidad_snapshot,nombre_recolector_snapshot) SELECT i,21,CURRENT_DATE,'PENDIENTE_VALIDACION','REC-UNICA-'||i,'SEMILLA',1,1,1,1,'G',100,'Especie sintética','Tara','comun','Zona','Autor M1' FROM generate_series(100,180) i;")
        sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id) SELECT 1,r.id,'recoleccion_fotos','origen/'||r.id||'/'||n,'FOTO','image/jpeg',21 FROM public.recoleccion r CROSS JOIN generate_series(1,2) n WHERE r.id BETWEEN 100 AND 180;")
        def photos(actor,rec):
            fs=[{'ruta_archivo':f'recepcion/pendientes/{actor}/{rec}/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':20}]
            return call(f'SELECT public.m1_recepcion_evidencias_preparar({actor},{rec},(SELECT revision_captura FROM public.recoleccion WHERE id={rec}),{lit(fs)})')
        def payload(rec=100,qty=100,unit='G',rev=None,ids=None,actor=20,**more):
            return dict(accion='RECIBIR',recoleccion_id=str(rec),revision_esperada=str(rev if rev is not None else sql(f'SELECT revision_captura FROM public.recoleccion WHERE id={rec}')),
                        cantidad_recibida=qty,unidad_recibida=unit,fecha_recepcion=today,evidencia_ids=ids if ids is not None else photos(actor,rec),**more)
        def reject(rec,actor=20,rev=None):
            return {'accion':'RECHAZAR','recoleccion_id':str(rec),'revision_esperada':str(rev if rev is not None else sql(f'SELECT revision_captura FROM public.recoleccion WHERE id={rec}')),'motivo_rechazo':'La cantidad declarada no corresponde a la entrega.'}
        def receive(actor,p,key=None):
            auth={1:'fixture-admin',3:'fixture-voluntario',5:'fixture-inactivo',20:'fixture-t2-operario',21:'fixture-t2-m1',22:'fixture-t2-ambos',23:'fixture-t2-sin-vivero',24:'fixture-t2-coordinador',9007199254740995:'fixture-t2-big',9007199254740996:'fixture-t2-big2'}.get(actor,'fixture-validador')
            return f"SELECT public.m1_recepcion_ejecutar({actor},'{auth}','{key or uuid.uuid4()}',{lit(p)})"
        def receipt(actor,p,expected='CONFIRMADO',key=None):
            r=call(receive(actor,p,key));check(r['body']['estado']==expected,f'{actor}/{p["recoleccion_id"]}: {expected}');return r
        def snap(rec):
            return sql(f"SELECT jsonb_build_array((SELECT to_jsonb(r) FROM public.recoleccion r WHERE id={rec}),(SELECT count(*) FROM public.recoleccion_recepcion),(SELECT count(*) FROM public.recoleccion_historial),(SELECT count(*) FROM public.recoleccion_recepcion_comando),(SELECT count(*) FROM public.recoleccion_recepcion_evidencia))")
        created=call(save(21));created_id=created['id'];call(save(21,'ENVIAR',created_id,0,{},[]))
        check(sql(f"SELECT estado_registro FROM public.recoleccion WHERE id={created_id}")=='PENDIENTE_VALIDACION','Creación con evidencia y envío conservan capturaM1')
        check(len(call('SELECT public.m1_recepcion_leer(20,NULL,NULL,2)')['data'])==2,'VALIDADOR con vigencia tiene bandeja sin acceso M1')
        for actor in (3,5,21,23,24,9007199254740995,9007199254740996):
            sql(f'SELECT public.m1_recepcion_leer({actor},100,NULL,20)',error='cuenta interna' if actor in (3,5) else 'CAPACIDAD_INSUFICIENTE',service=True)
        check(True,'GENERAL con M2, solo M1, inactivo y VALIDADOR sin vigencia no consultan recepción')
        p=payload(qty=.1,unit='KG');key=str(uuid.uuid4());r=receipt(20,p,key=key)
        replay=call(receive(20,p,key));check(replay['body']==r['body'] and r['ejecucion_nueva'] is True and replay['ejecucion_nueva'] is False,'Replay preserva recibo y marca que no debe repetir anclaje externo')
        check(call(receive(20,dict(p,cantidad_recibida=101),key))['body']['estado']=='CONFLICTO_CLAVE','Misma clave con carga distinta genera conflicto')
        check(call(receive(20,reject(100,rev=0),key))['body']['estado']=='CONFLICTO_CLAVE','Misma clave con otra acción genera conflicto')
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='100' and sql('SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=100')=='0','Recepción G/KG conforme conserva saldo sin entrada inventada')
        check(sql("SELECT usuario_id||':'||c.recibido_por FROM public.recoleccion r JOIN public.recoleccion_recepcion c ON c.recoleccion_id=r.id WHERE r.id=100")=='21:20','Autor y receptor permanecen separados')
        sql("UPDATE public.recoleccion SET blockchain_url='https://example.invalid/token',token_id='1',transaction_hash='fixture-hash' WHERE id=100",service=True)
        sql("UPDATE public.recoleccion SET observaciones='Prohibida' WHERE id=100",error='DECLARACION_RECIBIDA_CONGELADA',service=True)
        check(sql("SELECT token_id FROM public.recoleccion WHERE id=100")=='1','Anclaje privado persiste sus tres campos sin abrir edición de ficha validada')
        receipt(22,payload(101,actor=22));receipt(1,payload(102,actor=1))
        sql('UPDATE public.recoleccion SET vivero_id=2 WHERE id=103');receipt(1,payload(103,actor=1))
        check(True,'ADMIN puede recibir cualquier vivero sin asignación')
        for rec,actor in ((104,22),(105,1),(106,20)):
            sql(f'UPDATE public.recoleccion SET usuario_id={actor} WHERE id={rec}')
            r=receipt(actor,payload(rec,ids=['1']),'RECHAZADO');check(r['body']['error']['codigo']=='AUTORRECEPCION_PROHIBIDA','Autorrecepción prohibida incluso ADMIN')
        for actor in (21,23,24,3):receipt(actor,payload(107,ids=['1']),'RECHAZADO')
        # Rechazo no necesita evidencia y conserva 100 antes de la corrección a90.
        old_location=sql('SELECT to_jsonb(u) FROM public.ubicacion u WHERE id=1')
        r=receipt(20,reject(110));check(r['body']['resultado']['estado_registro']=='RECHAZADO' and r['body']['resultado']['recepcion_id'] is None,'Rechazar ficha es comando CONFIRMADO y no crea recepción')
        correction={'cantidad_inicial_canonica':90,'observaciones':'Cantidad corregida'}
        call(save(21,'EDITAR',110,1,correction,[]))
        check(sql("SELECT cantidad_inicial_canonica||':'||ubicacion_id||':'||(motivo_rechazo IS NULL) FROM public.recoleccion WHERE id=110")=='90:1:true' and old_location==sql('SELECT to_jsonb(u) FROM public.ubicacion u WHERE id=1'),'Corrección misma ficha limpia motivo actual y conserva ubicación íntegra')
        call(save(21,'ENVIAR',110,2,{},[]));receipt(20,reject(110));call(save(21,'EDITAR',110,4,{'observaciones':'Segundo ajuste'},[]));call(save(21,'ENVIAR',110,5,{},[]))
        receipt(20,payload(110,qty=90))
        check(sql("SELECT string_agg(metadata->'ficha_revisada'->>'cantidad_inicial_canonica',',' ORDER BY id) FROM public.recoleccion_historial WHERE recoleccion_id=110 AND tipo_historial='VALIDACION_RECHAZADA'")=='100,90','Múltiples rechazos conservan snapshots100 y90 y mismo código/origen')
        r=receipt(20,payload(111,qty=80),'RECHAZADO');check(r['body']['error']['codigo']=='RECEPCION_NO_CONFORME' and sql('SELECT estado_registro FROM public.recoleccion WHERE id=111')=='PENDIENTE_VALIDACION','Diferencia no acepta ni ajusta ni rechaza ficha automáticamente')
        for rec,qty,unit in ((112,1.5,'UNIDAD'),(113,0,'G'),(114,1,'GR'),(115,.0000001,'G')):receipt(20,payload(rec,qty=qty,unit=unit),'RECHAZADO')
        sql("UPDATE public.recoleccion SET tipo_material='ESQUEJE',unidad_canonica='UNIDAD' WHERE id IN(116,117)")
        receipt(20,payload(116,qty=100,unit='UNIDAD'));receipt(20,payload(117),'RECHAZADO')
        sql('UPDATE public.recoleccion SET cantidad_inicial_canonica=0.000001,saldo_actual=0.000001 WHERE id=118');receipt(20,payload(118,qty=.000000001,unit='KG'))
        check(True,'G permite seis decimales exactos, KG normaliza y UNIDAD/ESQUEJE exigen enteros')
        for rec,date in ((119,'2099-01-01'),(120,'2000-01-01'),(121,'2026-02-30')):receipt(20,dict(payload(rec),fecha_recepcion=date),'RECHAZADO')
        wrong=photos(22,122);receipt(20,payload(122,ids=wrong),'RECHAZADO')
        wrong=photos(20,123);receipt(20,payload(124,ids=wrong),'RECHAZADO')
        stale=photos(20,125);receipt(20,reject(125));call(save(21,'EDITAR',125,1,{'observaciones':'Conservo cantidad'},[]));call(save(21,'ENVIAR',125,2,{},[]));receipt(20,payload(125,ids=stale),'RECHAZADO')
        stale_files=[{'ruta_archivo':f'recepcion/pendientes/20/125/{uuid.uuid4()}.jpg','mime_type':'image/jpeg','tamano_bytes':20}]
        sql(f'SELECT public.m1_recepcion_evidencias_preparar(20,125,0,{lit(stale_files)})',error='REVISION_OBSOLETA',service=True)
        check(True,'Carga iniciada antes del cambio de versión no se reetiqueta a la revisión nueva')
        receipt(20,payload(125))
        check(True,'Fotos se validan por actor/origen/vivero/revisión; versión anterior no se reutiliza')
        # Envejecimiento sintético equivale a captura válida conservada al pasar los días.
        sql('ALTER TABLE public.recoleccion DISABLE TRIGGER trg_recoleccion_acotar_excepcion_fecha_rechazo; UPDATE public.recoleccion SET fecha=CURRENT_DATE-70 WHERE id=126; ALTER TABLE public.recoleccion ENABLE TRIGGER trg_recoleccion_acotar_excepcion_fecha_rechazo')
        receipt(20,reject(126));call(save(21,'EDITAR',126,1,{'observaciones':'Antigua conservada'},[]));call(save(21,'ENVIAR',126,2,{},[]));receipt(20,payload(126))
        check(sql('SELECT fecha=(CURRENT_DATE-70) FROM public.recoleccion WHERE id=126')=='t','Captura envejecida conserva fecha al corregir/reenviar/recibir')
        sql("UPDATE public.recoleccion SET fecha=CURRENT_DATE-46 WHERE id=127",error='Fecha fuera de rango')
        sql(save(21,payload={'fecha':sql('SELECT (CURRENT_DATE-46)::text'),'tipo_material':'SEMILLA','ubicacion_id':1,'vivero_id':1,'metodo_id':1,'planta_id':1,'unidad_canonica':'G','cantidad_inicial_canonica':100,'codigo_trazabilidad':'REC-FECHA-FUERA'}),error='Fecha fuera de rango',service=True)
        sql("UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=127",error='RECEPCION_CONFORME_REQUERIDA')
        sql("SELECT public.m1_recoleccion_guardar(22,'APROBAR',127,0,'{}','[]')",error='Entrada inválida',service=True)
        check(True,'Crear/cambiar fecha mantiene45d y VALIDADO no se obtiene por APROBAR/DML sin recepción')
        # Rollback de toda la decisión y terminal ante fallos de infraestructura/catálogo.
        sql("CREATE FUNCTION public.t4_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_T4'; END $$; CREATE TRIGGER t4_fallar BEFORE INSERT ON public.recoleccion_recepcion_comando FOR EACH ROW EXECUTE FUNCTION public.t4_fallar();")
        p=payload(128);before=snap(128);sql(receive(20,p),error='FALLO_T4',service=True);check(before==snap(128),'Fallo terminal revierte recepción/snapshot/revisión/historial/evidencias')
        sql('DROP TRIGGER t4_fallar ON public.recoleccion_recepcion_comando; CREATE TRIGGER t4_fallar BEFORE INSERT ON public.recoleccion_historial FOR EACH ROW EXECUTE FUNCTION public.t4_fallar()')
        before=snap(129);sql(receive(20,reject(129)),error='FALLO_T4',service=True);check(before==snap(129),'Fallo historia rechazada no fabrica recibo de rollback')
        sql('DROP TRIGGER t4_fallar ON public.recoleccion_historial')
        a=payload(130,actor=20);b=payload(130,actor=22);out=race(receive(20,a),receive(22,b),'dos_receptores');check('REVISION_OBSOLETA' in out,'Dos receptores producen recepción única y revisión obsoleta')
        p=payload(131);k=str(uuid.uuid4());out=race(receive(20,p,k),receive(20,p,k),'mismo_comando');check(sql('SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id=131')=='1','UUID concurrente no duplica recepción')
        out=race(receive(20,payload(132)),receive(22,reject(132)),'recibir_antes_rechazar');check('REVISION_OBSOLETA' in out,'Recibir contra rechazar serializa una sola decisión')
        out=race(receive(20,reject(133)),receive(22,payload(133,actor=22)),'rechazar_antes_recibir');check('REVISION_OBSOLETA' in out,'Rechazar contra recibir serializa una sola decisión')
        out=race(receive(20,reject(134)),save(21,'EDITAR',134,1,{'cantidad_inicial_canonica':90},[]),'rechazar_antes_corregir');check(sql('SELECT estado_registro FROM public.recoleccion WHERE id=134')=='BORRADOR','Corrección espera rechazo y mantiene la misma ficha')
        # Reenvío y decisión vieja no se mezclan entre ciclos.
        out=race(save(21,'ENVIAR',134,2,{},[]),receive(22,reject(134,rev=1)),'reenviar_antes_decision_vieja');check('REVISION_OBSOLETA' in out,'Reenvío invalida decisión de revisión anterior')
        p=payload(135);out=race(assign(20,op='RETIRAR'),receive(20,p),'retiro_antes_recibir');check('CAPACIDAD_INSUFICIENTE' in out,'Retiro de vigencia bloquea recepción que espera')
        call(assign(20));p=payload(136);race(receive(20,p),assign(20,op='RETIRAR'),'recibir_antes_retiro');call(assign(20))
        def lifecycle(op,user=20):
            data={'usuario_destino_id':str(user),'revision_esperada':sql(f'SELECT revision_autoridad FROM public.usuario WHERE id={user}'),'motivo':'Cambio sintético recepción'}
            if op=='CAMBIAR_ROL_GLOBAL':data['rol_global']='VOLUNTARIO'
            canon=json.dumps(data,ensure_ascii=False,separators=(',',':'),sort_keys=True)
            return f"SELECT public.pa_autoridad_ejecutar(1,'fixture-admin','{op}','{uuid.uuid4()}',{lit(data)},'{canon}')"
        for i,op in enumerate(('INACTIVAR_CUENTA','CAMBIAR_ROL_GLOBAL')):
            p=payload(137+i);out=race(lifecycle(op),receive(20,p),op.lower()+'_antes_recepcion','CUENTA_NO_DISPONIBLE' if op=='INACTIVAR_CUENTA' else None)
            check(sql(f'SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id={137+i}')=='0','Baja/rol serializan recepción')
            sql("UPDATE public.usuario SET activo=true,rol='VALIDADOR' WHERE id=20")
            race(receive(20,payload(139+i)),lifecycle(op),'recepcion_antes_'+op.lower());sql("UPDATE public.usuario SET activo=true,rol='VALIDADOR' WHERE id=20")
        p=reject(141);k=str(uuid.uuid4());r=receipt(20,p,key=k);call(assign(20,op='RETIRAR'));call(lifecycle('CAMBIAR_ROL_GLOBAL'))
        check(call(f"SELECT public.m1_recepcion_recuperar(20,'fixture-t2-operario','{k}')")['body']==r['body'],'Recuperación propia tras pérdida de rol/vivero conserva rechazo confirmado')
        check(call(receive(20,p,k))['body']==r['body'],'Replay propio tras pérdida de rol no permite nueva intención')
        sql('SELECT public.m1_recepcion_leer(20,141,NULL,20)',error='cuenta interna',service=True)
        check(call(f"SELECT public.m1_recepcion_recuperar(22,'fixture-t2-ambos','{k}')")['http_status']==202,'Recuperación no revela comando ajeno')
        sql("UPDATE public.usuario SET activo=false WHERE id=20");sql(f"SELECT public.m1_recepcion_recuperar(20,'fixture-t2-operario','{k}')",error='CUENTA_NO_DISPONIBLE',service=True)
        sql("UPDATE public.usuario SET activo=true,rol='VALIDADOR' WHERE id=20");call(assign(20))
        # Material recibido es operativo para GENERAL con M2, sin rol receptor ni M1.
        lote=call(inicio(24,100))['lote_vivero_id'];call('SELECT to_jsonb(x) FROM public.fn_recoleccion_registrar_desecho(100,1,24) x')
        check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')=='94','GENERAL M2 INICIO/DESECHO preserva débito único y saldo')
        ids=evidence(24);sql(f"SELECT * FROM public.fn_vivero_crear_lote_desde_recoleccion(100,1,24,CURRENT_DATE-1,CURRENT_DATE-1,5,'G',NULL,ARRAY[{','.join(ids)}]::bigint[])",error='INICIO_NO_PUEDE_PRECEDER_RECEPCION',service=True)
        check(True,'INICIO no puede preceder la recepción física aunque entre en ventanaVivero')
        # Un legado inconsistente no es habilitado por lectura ni por escritores.
        sql("ALTER TABLE public.recoleccion DISABLE TRIGGER recepcion_congelar; UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=142; ALTER TABLE public.recoleccion ENABLE TRIGGER recepcion_congelar")
        sql(inicio(24,142),error='RECEPCION_CONFORME_REQUERIDA',service=True)
        sql('SELECT public.fn_recoleccion_registrar_desecho(142,1,24)',error='RECEPCION_CONFORME_REQUERIDA',service=True)
        sql("INSERT INTO public.recoleccion_movimiento(recoleccion_id,tipo_movimiento,delta,created_by) VALUES(142,'DESECHO',-1,24)",error='RECEPCION_CONFORME_REQUERIDA',service=True)
        check(call('SELECT public.m2_origenes_leer(24,1,142,1,20,true,true)')['data'][0]['estado_habilitacion']=='PENDIENTE_RECEPCION','Legado sin recepción visible como bloqueado sin conciliación')
        receipt(20,payload(143));call('SELECT to_jsonb(x) FROM public.fn_recoleccion_registrar_desecho(143,94,24) x')
        out=race(inicio(24,143),inicio(24,143),'inicios_stock_suficiente','saldo suficiente');check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=143')=='1','INICIO concurrente no sobreconsume stock y cada lote tiene un solo débito')
        sql("INSERT INTO public.recoleccion_movimiento(recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,lote_vivero_id,created_by) VALUES(100,'CONSUMO_A_VIVERO',-5,'G',"+str(lote)+",24)",error='VINCULO_CONSUMO_LOTE_INICIO_INCONSISTENTE',service=True)
        sql('DELETE FROM public.recoleccion_recepcion',error='append-only')
        check(sql("SELECT count(*) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'm1_recepcion_%' OR p.proname='m2_movimiento_unidades') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))")=='0','Helpers/RPC privados y recepción inmutable')
        check(sql("SELECT count(*) FROM unnest(ARRAY['anon','authenticated']) u CROSS JOIN unnest(ARRAY['public.recoleccion','public.recoleccion_movimiento']) t WHERE has_table_privilege(u,t,'INSERT,UPDATE,DELETE,TRUNCATE') OR has_any_column_privilege(u,t,'INSERT,UPDATE,REFERENCES')")=='0','100 conserva cierre DML público097')
        if args.postgis:
            call(evento(20,lote,'EMBOLSADO',qty=30))
            sql("INSERT INTO public.campania(id,nombre) VALUES(4,'Campaña M3 T4'); INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom) VALUES(61,4,'M3 independiente','ACTIVA','SUB-T4-M3',1,1,1,ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326)); INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id) VALUES(61,1); INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by) VALUES(61,24,'COORDINADOR',1),(61,21,'OPERARIO',1); INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,nombre_responsable_snapshot,codigo_trazabilidad,created_by,cantidad_muerta_acumulada) VALUES(4000,61,21,CURRENT_DATE,2,'Actor M3','T4-GRUPO-LEGADO',21,2);")
            asig=call(entrega(24,lote,61,proposito='REPOSICION'))['asignacion_id']
            ev=sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id,metadata) VALUES(4,0,'participacion_evidencias','plantacion-t4.jpg','FOTO','image/jpeg',21,jsonb_build_object('subcampania_id','61','proposito','REPOSICION')) RETURNING id")
            before=sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}');m1=sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100')
            details=lit([{'asignacion_id':asig,'lote_vivero_id':lote,'planta_id':1,'cantidad':1}])
            r=call(f"SELECT to_jsonb(x) FROM public.fn_m3_registrar_plantacion(61,true,4000,CURRENT_DATE,21,-16.5,-68.1,NULL,ARRAY[]::bigint[],{details},ARRAY[{ev}]::bigint[]) x")
            check(r['gps_dentro_poligono'] and before==sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}') and m1==sql('SELECT saldo_actual FROM public.recoleccion WHERE id=100'),'M3 consume asignación sin M2/recepción adicional ni doble débito; PostGIS real')
        sql('ALTER TABLE public.recoleccion_recepcion_evidencia_contexto ALTER COLUMN revision_captura TYPE numeric')
        sql(migration.read_text(),error='RECEPCION_UNICA_CATALOGO_INCOMPATIBLE')
        sql('ALTER TABLE public.recoleccion_recepcion_evidencia_contexto ALTER COLUMN revision_captura TYPE bigint')
        check(True,'100 aborta ante drift de la revisión de evidencia sin corregir catálogo silenciosamente')
        sql('UPDATE public.recoleccion SET revision_captura=9007199254740992 WHERE id=144')
        receipt(20,reject(144))
        snapshot = json.loads(sql("SELECT metadata->'ficha_revisada' FROM public.recoleccion_historial WHERE recoleccion_id=144 AND tipo_historial='VALIDACION_RECHAZADA'"))
        exact_fields = ('id','usuario_id','ubicacion_id','vivero_id','planta_id','metodo_id','revision_captura')
        check(all(isinstance(snapshot[field], str) for field in exact_fields)
              and snapshot['revision_captura']=='9007199254740992'
              and isinstance(snapshot['ubicacion']['id'], str),
              'Historial conserva IDs y revisión BIGINT como texto también dentro del snapshot revisado')
        # Repetición sobre target ya poblado conserva hechos y saldos.
        before=snap(100);run(command()+['-f',str(migration)]);check(before==snap(100),'100 reinstalada sobre target poblado no borra ni duplica hechos')
        if not args.sql_only:
            sql("CREATE FUNCTION public.t4_http_transport(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE r jsonb; BEGIN EXECUTE p_sql INTO r; RETURN jsonb_build_object('data',r,'error',NULL); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',SQLSTATE,'message',SQLERRM)); END $$;")
            http_env=dict(env,T4_DB_SOCKET=str(socket),T4_DB_PORT='55444',T4_DB_PSQL=binaries['psql'],NODE_ENV='test')
            suite='test/db/recepcion-semillas-http.spec.ts'
            jest=['node',str(ROOT/'node_modules/jest/bin/jest.js'),'--config',str(ROOT/'test/jest-recepcion-semillas-db.json'),'--runInBand','--cacheDirectory=/private/tmp/r3-jest','--testMatch=**/'+suite,'--runTestsByPath',suite]
            r=subprocess.run(jest,cwd=ROOT,env=http_env,timeout=180)
            http={'exit_code':r.returncode,'suite':suite}
            if r.returncode:raise AssertionError('Falló HTTP aislado: '+suite)
        failed=False
    finally:
        for p in children:
            if p.poll() is None:p.kill();p.wait(timeout=5)
        if started or (cluster/'postmaster.pid').exists():run([binaries['pg_ctl'],'-D',str(cluster),'-w','-t','15','stop','-m','fast'])
        stopped=not (cluster/'postmaster.pid').exists()
        if stopped:shutil.rmtree(directory)
        if args.evidence:
            files=list((ROOT/'src/recolecciones').rglob('*.ts'))+[ROOT/'migrations'/m for m in migrations]+[Path(__file__).resolve(),ROOT/'test/db/recepcion-semillas-http.spec.ts']
            evidence={'tarea':'RECOLECCION_RECEPCION_UNICA','estado':'FALLIDO' if failed else 'CORRECTO','fecha':time.strftime('%Y-%m-%d'),
                'entorno':{'tipo':'SINTETICO_LOCAL','postgres':version,'tcp':False,'sin_env':True,'postgis':postgis_version or False,'cluster_detenido':stopped,'directorio_eliminado':not directory.exists()},
                'base':run(['git','-C',str(ROOT),'rev-parse','HEAD']),'migraciones':migrations,'comprobaciones':checks,'carreras':races,'http':http,
                'sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files)) if p.exists()}}
            args.evidence.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
    print(f'Recepción única: {len(checks)} grupos SQL y {len(races)} carreras aprobados.',flush=True)

if __name__=='__main__':main()
