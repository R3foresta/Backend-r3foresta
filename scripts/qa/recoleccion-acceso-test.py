#!/usr/bin/env python3
"""T1/092/093: clúster PostgreSQL privado, sin TCP, .env ni servicios reales."""
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
MIGRATIONS = ['092_usuario_acceso_recoleccion.sql', '093_recoleccion_acceso_explicito.sql']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    parser.add_argument('--sql-only', action='store_true')
    args = parser.parse_args()
    binaries = {n: str(args.pg_bin/n) if args.pg_bin else shutil.which(n) for n in ('initdb','pg_ctl','psql')}
    if not all(binaries.values()): parser.error('Faltan binarios PostgreSQL; use --pg-bin.')
    if args.evidence and args.evidence.exists(): parser.error('La evidencia debe ser nueva.')
    env = {k:v for k,v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C',PGPASSFILE=os.devnull,PGSERVICEFILE=os.devnull,PGAPPNAME='t1_aislado')
    directory = Path(tempfile.mkdtemp(prefix='t1-m1-',dir='/tmp')).resolve()
    cluster,socket = directory/'pg',directory/'socket'; socket.mkdir(mode=0o700)
    checks=[]; races=[]; children=[]; started=False; http=None; version=None

    def run(cmd, timeout=60):
        r=subprocess.run(cmd,env=env,text=True,capture_output=True,timeout=timeout)
        if r.returncode: raise RuntimeError(r.stderr[-3500:])
        return r.stdout.strip()

    def command(): return [binaries['psql'],'-X','-w','-qAt','-v','ON_ERROR_STOP=1','-h',str(socket),'-p','55443','-U','postgres','-d','postgres']
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
    failed=True
    try:
        run([binaries['initdb'],'-D',str(cluster),'-U','postgres','--auth-local=trust','--auth-host=reject','--locale=en_US.UTF-8','--encoding=UTF8'])
        run([binaries['pg_ctl'],'-D',str(cluster),'-l',str(directory/'pg.log'),'-w','-t','20','start','-o',f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55443 -c unix_socket_permissions=0700"])
        started=True;version=sql('SHOW server_version'); print('T1 PostgreSQL aislado '+version,flush=True)
        run(command()+['-f',str(ROOT/'test/db/recoleccion-acceso-fixture.sql')])
        baseline=sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.registro_plantacion x),(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.subcampania_equipo x))")
        for _ in range(2):
            for migration in MIGRATIONS: run(command()+['-f',str(ROOT/'migrations'/migration)])
        check(sql('SELECT count(*) FROM public.usuario_acceso_recoleccion')=='0','Instalación repetida sin backfill de accesos')
        # Captura requiere M1, nunca solo GENERAL/VALIDADOR.
        sql(save(2),error='acceso M1',service=True);sql(save(4),error='acceso M1',service=True)
        check(True,'GENERAL y VALIDADOR sin M1 no capturan por RPC')
        grant_key=str(uuid.uuid4());g=call(access(2,key=grant_key));assert g['body']['estado']=='CONFIRMADO'
        check(call(access(2,key=grant_key))==g,'Replay exacto no duplica vigencia ni auditoría')
        check(call(access(6,key=grant_key))['http_status']==409,'Misma clave con destino distinto se rechaza')
        check(call(access(2,rev=1))['body']['resultado']['cambio']=='SIN_CAMBIOS','Otra intención equivalente no abre dos vigencias')
        for user in (1,3,5): check(call(access(user))['http_status']==409,f'Destino {user} no obtiene vigencia operativa inelegible/derivada')
        for actor in (2,3,4,6): check(call(access(6,actor=actor))['http_status']==403,f'Actor no ADMIN {actor} rechazado por RPC')
        check(read(2)['body']['data']['acceso_efectivo'],'Lectura propia efectiva M1')
        check(read(2,actor=6)['http_status']==403,'Lectura ajena rechazada')
        check(read(1)['body']['data']['origen']=='ADMIN','ADMIN deriva acceso sin vigencia')
        sql("SELECT public.fn_recoleccion_rechazar_validacion(9000,4,'Rechazo antiguo sintético');",service=True)
        check(sql("SELECT estado_registro::text||':'||revision_captura::text FROM public.recoleccion WHERE id=9000")=='RECHAZADO:1','Rechazo antiguo 090 conserva excepción de fecha con revisión técnica 093')
        call(save(2,'FOTOS',9000,rev=1,payload={},photos=[{'ruta_archivo':'rechazado-antiguo.jpg','mime_type':'image/jpeg','tamano_bytes':20}]))
        sql(save(2,'EDITAR',9000,rev=1,payload={'observaciones':'sin corregir fecha'}),error='chk_fecha_rango',service=True)
        check(True,'Fotos no editan ficha rechazada antigua; editar exige corregir su fecha')
        rec=call(save(2))['id']; call(access(4));val=call(save(4))['id']; adminrec=call(save(1))['id']
        check(sql(f'SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id={rec}')=='1','Captura y fotos/historial atómicos')
        sql(save(6,'EDITAR',rec,payload={'observaciones':'ajena'}),error='acceso M1',service=True)
        call(access(6));sql(save(6,'EDITAR',rec,payload={'observaciones':'ajena'}),error='Solo el creador',service=True)
        check(True,'M1 no mantiene ficha ajena')
        call(save(2,'EDITAR',rec,payload={'observaciones':'propia'}));call(save(2,'ENVIAR',rec,rev=1,payload={}))
        sql(save(2,'EDITAR',rec,rev=2,payload={'observaciones':'tarde'}),error='Solo se mantiene',service=True)
        call(save(4,'ENVIAR',val,payload={}))
        sql(save(4,'APROBAR',val,rev=1,payload={}),error='propia',service=True)
        call(save(1,'ENVIAR',adminrec,payload={}))
        sql(save(1,'APROBAR',adminrec,rev=1,payload={}),error='propia',service=True)
        call(save(4,'APROBAR',rec,rev=2,payload={}))
        check(True,'Autor no confirma como VALIDADOR ni ADMIN; otro revisor sí')
        sql(f'SELECT * FROM public.fn_recoleccion_registrar_desecho({rec},10,2);',error='Solo ADMIN',service=True)
        call(f'SELECT to_jsonb(x) FROM public.fn_recoleccion_registrar_desecho({rec},10,1) x;')
        check(sql(f'SELECT saldo_actual FROM public.recoleccion WHERE id={rec}')=='90','DESECHO autor rechazado; ADMIN conserva ledger y saldo')
        # Rollback real ante fallo de auditoría, sin acceso ni terminal parcial.
        sql("CREATE FUNCTION public.t1_fallar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'AUDITORIA_T1_FALLA'; END $$; CREATE TRIGGER t1_fallar BEFORE INSERT ON public.usuario_acceso_recoleccion_historial FOR EACH ROW EXECUTE FUNCTION public.t1_fallar();")
        sql(access(2,op='RETIRAR',rev=1),error='AUDITORIA_T1_FALLA',service=True)
        sql('DROP TRIGGER t1_fallar ON public.usuario_acceso_recoleccion_historial;')
        check(read(2)['body']['data']['revision_acceso']=='1' and read(2)['body']['data']['acceso_efectivo'],'Fallo de auditoría revierte retiro, revisión y recibo')
        retiro=call(access(2,op='RETIRAR',rev=1));sql(save(2),error='acceso M1',service=True)
        call(access(2,rev=2));check(sql('SELECT count(*) FROM public.usuario_acceso_recoleccion WHERE usuario_id=2')=='2','Reotorgar abre nueva vigencia y conserva la retirada')
        check(call(access(2,rev=0))['body']['error']['codigo']=='REVISION_OBSOLETA','Revisión obsoleta conserva rechazo recuperable')
        # La revisión M1 no se reinterpreta como rol; 072 sigue siendo la autoridad.
        payload={'usuario_destino_id':'2','rol_global':'VOLUNTARIO','revision_esperada':'0','motivo':'Ensayo rol T1'}
        canon=json.dumps(payload,ensure_ascii=False,separators=(',',':'),sort_keys=True)
        role=f"SELECT public.pa_autoridad_ejecutar(1,'fixture-admin','CAMBIAR_ROL_GLOBAL','{uuid.uuid4()}',{lit(payload)},'{canon}');"
        call(role);sql(save(2),error='acceso M1',service=True)
        check(read(2)['body']['data']['revision_acceso']=='3','Rol inelegible suspende acceso efectivo sin borrar vigencia/revisión M1')
        sql("UPDATE public.usuario SET rol='GENERAL' WHERE id=2")
        # Carreras observadas con RPC reales; ambos órdenes retiro/escritura.
        race(access(2,op='RETIRAR',rev=3),save(2),'retiro_antes_captura','acceso M1')
        call(access(2,rev=4))
        race(save(2),access(2,op='RETIRAR',rev=5),'captura_antes_retiro')
        call(access(2,rev=6))
        def deactivate():
            rev=sql('SELECT revision_autoridad FROM public.usuario WHERE id=2')
            payload={'usuario_destino_id':'2','revision_esperada':rev,'motivo':'Baja sintética T1'}
            canon=json.dumps(payload,ensure_ascii=False,separators=(',',':'),sort_keys=True)
            return f"SELECT public.pa_autoridad_ejecutar(1,'fixture-admin','INACTIVAR_CUENTA','{uuid.uuid4()}',{lit(payload)},'{canon}');"
        race(deactivate(),save(2),'baja_072_antes_captura','acceso M1')
        sql('UPDATE public.usuario SET activo=true WHERE id=2')
        race(save(2),deactivate(),'captura_antes_baja_072')
        sql('UPDATE public.usuario SET activo=true WHERE id=2')
        def access_revision(): return sql('SELECT revision FROM public.usuario_acceso_recoleccion_revision WHERE usuario_id=2')
        for action in ('EDITAR','ENVIAR','FOTOS','ELIMINAR'):
            row=call(save(2))['id']
            statement=(f'SELECT public.fn_recoleccion_eliminar_borrador({row},2);' if action=='ELIMINAR' else
                save(2,action,row,payload={'observaciones':'Corregida'} if action=='EDITAR' else {},photos=[{'ruta_archivo':str(uuid.uuid4())+'.jpg','mime_type':'image/jpeg','tamano_bytes':20}] if action=='FOTOS' else []))
            race(access(2,op='RETIRAR',rev=access_revision()),statement,'retiro_antes_'+action.lower(),'acceso M1')
            call(access(2,rev=access_revision()))
        race(access(2,op='RETIRAR',rev=access_revision()),deactivate(),'retiro_antes_baja_072')
        check(not read(2,actor=1)['body']['data']['acceso_efectivo'],'Retiro y baja reales serializan sin restaurar acceso')
        sql('UPDATE public.usuario SET activo=true WHERE id=2')
        call(access(2,rev=access_revision()))
        key=str(uuid.uuid4());s=access(6,rev=1,key=key)
        race(s,s,'mismo_comando_concurrente')
        own=call(save(2))['id']
        race(save(2,'FOTOS',own,payload={},photos=[{'ruta_archivo':'race.jpg','mime_type':'image/jpeg','tamano_bytes':20}]),f'SELECT public.fn_recoleccion_eliminar_borrador({own},2);','foto_antes_borrado')
        own=call(save(2))['id']
        race(f'SELECT public.fn_recoleccion_eliminar_borrador({own},2);',save(2,'FOTOS',own,payload={},photos=[{'ruta_archivo':'late.jpg','mime_type':'image/jpeg','tamano_bytes':20}]),'borrado_antes_foto','no encontrada')
        # La nueva revisión no modifica permisos de Plantación ni equipo/historia.
        check(sql("SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.registro_plantacion x),(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.subcampania_equipo x))")==baseline,'Registros, snapshots y equipo de Plantación conservados')
        page=call("SELECT public.m1_acceso_leer(2,'fixture-general',2,NULL,1);")['body']['data']
        check(len(page['historial'])==1 and page['siguiente_antes_de_id'] is not None,'Historia de M1 paginada sin borrar vigencias retiradas')
        # Preflight ante drift: la repetición falla y no cambia permisos/filas.
        sql("ALTER TABLE public.recoleccion DROP CONSTRAINT recoleccion_revision_captura_check; ALTER TABLE public.recoleccion ALTER COLUMN revision_captura DROP DEFAULT; ALTER TABLE public.recoleccion ALTER COLUMN revision_captura TYPE text;")
        sql((ROOT/'migrations'/MIGRATIONS[1]).read_text(),error='T1_CATALOGO_INCOMPATIBLE')
        sql("ALTER TABLE public.recoleccion ALTER COLUMN revision_captura TYPE bigint USING revision_captura::bigint; ALTER TABLE public.recoleccion ALTER COLUMN revision_captura SET DEFAULT 0; ALTER TABLE public.recoleccion ADD CONSTRAINT recoleccion_revision_captura_check CHECK(revision_captura>=0);")
        check(True,'Preflight 093 rechaza drift de revisión')
        # ACL reales; ni SQL directo ni helpers conceden autoridad pública.
        for r in ('anon','authenticated'):
            sql(f"SET ROLE {r}; SELECT public.m1_acceso_efectivo(2);",error='permission denied')
            sql(f"SET ROLE {r}; SELECT * FROM public.usuario_acceso_recoleccion;",error='permission denied')
        sql('UPDATE public.usuario_acceso_recoleccion SET revocado_en=NULL WHERE id=1',error='Solo se permite')
        sql('DELETE FROM public.recoleccion_acceso_comando;',error='append-only')
        check(True,'ACL privadas e inmutabilidad de vigencias/terminales')
        sql('CREATE ROLE t1_publico NOLOGIN; GRANT t1_publico TO anon; GRANT SELECT ON public.usuario_acceso_recoleccion TO t1_publico;')
        sql((ROOT/'migrations'/MIGRATIONS[0]).read_text(),error='T1_PRIVILEGIO_TABLA_INESPERADO')
        sql('REVOKE SELECT ON public.usuario_acceso_recoleccion FROM t1_publico; REVOKE t1_publico FROM anon; DROP ROLE t1_publico;')
        check(True,'Postflight 092 detecta permisos heredados sin normalizarlos silenciosamente')
        sql('CREATE ROLE t1_rpc_publico NOLOGIN; GRANT t1_rpc_publico TO anon; GRANT EXECUTE ON FUNCTION public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb) TO t1_rpc_publico;')
        sql((ROOT/'migrations'/MIGRATIONS[1]).read_text(),error='T1_PRIVILEGIO_FUNCION_INESPERADO')
        sql('REVOKE EXECUTE ON FUNCTION public.m1_recoleccion_guardar(bigint,text,bigint,bigint,jsonb,jsonb) FROM t1_rpc_publico; REVOKE t1_rpc_publico FROM anon; DROP ROLE t1_rpc_publico;')
        check(True,'Postflight 093 detecta ejecución heredada que el REVOKE directo no cierra')
        if not args.sql_only:
            http_env=dict(env,T1_DB_SOCKET=str(socket),T1_DB_PORT='55443',T1_DB_PSQL=binaries['psql'],NODE_ENV='test')
            r=subprocess.run(['node',str(ROOT/'node_modules/jest/bin/jest.js'),'--config',str(ROOT/'test/jest-recoleccion-acceso-db.json'),'--runInBand','--cacheDirectory=/private/tmp/t1-jest'],cwd=ROOT,env=http_env,timeout=180)
            http={'exit_code':r.returncode,'suite':'test/db/recoleccion-acceso-http.spec.ts'}
            if r.returncode: raise AssertionError('Falló HTTP aislado T1')
        failed=False
    finally:
        for p in children:
            if p.poll() is None: p.kill();p.wait(timeout=5)
        if started or (cluster/'postmaster.pid').exists():
            run([binaries['pg_ctl'],'-D',str(cluster),'-w','-t','15','stop','-m','fast'])
        stopped=not (cluster/'postmaster.pid').exists()
        if stopped: shutil.rmtree(directory)
        if args.evidence:
            args.evidence.write_text(json.dumps({'estado':'FALLIDO' if failed else 'CORRECTO','fecha':time.strftime('%Y-%m-%d'),'entorno':{'tipo':'SINTETICO_LOCAL','postgres':version,'tcp':False,'sin_env':True,'cluster_detenido':stopped,'directorio_eliminado':not directory.exists()},'base':run(['git','-C',str(ROOT),'rev-parse','HEAD']),'migraciones':MIGRATIONS,'comprobaciones':checks,'carreras':races,'http':http,'sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set([ROOT/'migrations'/m for m in MIGRATIONS]+list((ROOT/'src/recolecciones').rglob('*.ts'))+list((ROOT/'src/evidencias-trazabilidad').glob('*.ts'))+[Path(__file__).resolve(),ROOT/'test/db/recoleccion-acceso-fixture.sql',ROOT/'test/db/recoleccion-acceso-http.spec.ts',ROOT/'scripts/qa/recoleccion-acceso-openapi.cjs',ROOT/'docs/recoleccion-acceso-openapi.json']))}},ensure_ascii=False,indent=2)+'\n')
    print(f'T1: {len(checks)} grupos SQL y {len(races)} carreras aprobados.',flush=True)


if __name__=='__main__': main()
