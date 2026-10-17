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
d_case_start,d_race_start=len(cases),len(races)


def lit(value):
    if value is None: return 'NULL'
    if isinstance(value, (dict,list)): value=json.dumps(value,ensure_ascii=False,separators=(',',':'))
    return "'"+str(value).replace("'","''")+"'"


def sql(statement, error=None):
    result = subprocess.run(base, input="SET statement_timeout='30s'; "+statement, text=True,capture_output=True,timeout=35)
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


def old(statement):
    return 'SET ROLE service_role; SELECT public.pa_d_test_ejecutar('+lit(statement)+');'
def call(statement): return json.loads(sql(old(statement)))
def success(value):
    assert value.get('error') is None,value
    return value['data']
def failed(value,code=None):
    assert value.get('error'),value
    if code: assert code in json.dumps(value['error'],ensure_ascii=False),value
    return value

def revise(scope,total=3,actor=800):
    return old('SELECT public.fn_subcampania_revisar_plan('+str(scope)+','+str(total)+','+lit([{'planta_id':8,'porcentaje_objetivo':100,'cantidad_objetivo':total}])+'::jsonb,'+str(actor)+',0)')
def close(scope,actor=800):
    value={'estado_final':'COMPLETADA','fecha_cierre_operativo':today+'T00:00:00Z','fecha_fin_mantenimiento':today}
    return old('SELECT public.pa_d_subcampania_cerrar('+str(scope)+','+str(actor)+','+lit(value)+'::jsonb)')
def giveback(scope,count=20,actor=800):
    return old(f"SELECT to_jsonb(t) FROM public.fn_m3_devolver_asignacion_vivero({scope*100},{count},'OTRO',{actor},{lit(today)},NULL) t")
def physical(scope,count=5,actor=800):
    eid=sql(f"INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,bucket,ruta_archivo,creado_por_usuario_id) VALUES(2,'recoleccion_fotos','sintetica-entrega',{actor}) RETURNING id")
    return old(f"SELECT to_jsonb(t) FROM public.fn_vivero_asignar_stock_subcampania(81,{scope},{count},'PLANTACION_INICIAL',{actor},{lit(today)},ARRAY[{eid}]::bigint[],NULL) t")
def deactivate(campaign):
    return old(f"SELECT to_jsonb(t) FROM public.fn_campania_desactivar_sin_plantaciones({campaign},800,'Cierre sintético D') t")
def cancel(scope):
    return old(f"SELECT to_jsonb(public.fn_subcampania_cancelar({scope},800,'Cierre sintético D'))")


def race_before_campaign_fk(first_sql, second_sql, scope, label):
    """Pausa la física tras sus locks y antes de la FK real hacia campaña.

    Ejecutar primero toda la RPC y retener solo su commit no detecta la
    inversión: para entonces la FK ya tomó KEY SHARE de la campaña.
    """
    gate, first, second = None, None, None
    name = 'pa_d_fk_' + uuid.uuid4().hex[:10]
    sql("CREATE FUNCTION public.pa_d_fixture_antes_fk() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN "
        f"IF NEW.subcampania_id={scope} THEN PERFORM pg_advisory_xact_lock(77077,{scope}); END IF;RETURN NEW;END$$;"
        'CREATE TRIGGER pa_d_fixture_antes_fk BEFORE INSERT ON public.evento_lote_vivero '
        'FOR EACH ROW EXECUTE FUNCTION public.pa_d_fixture_antes_fk();')
    try:
        gate = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        gate.stdin.write(f'SELECT pg_advisory_lock(77077,{scope});\n\\echo READY\n');gate.stdin.flush()
        assert select.select([gate.stdout], [], [], 5)[0], 'barrera FK sin respuesta'
        gate.stdout.readline();assert gate.stdout.readline().strip() == 'READY'
        first = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, env=dict(os.environ, PGAPPNAME=name+'_fisica'))
        first.stdin.write(first_sql);first.stdin.close()
        for _ in range(100):
            at_gate = sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid "
                          f"WHERE a.application_name={lit(name+'_fisica')} AND l.locktype='advisory' "
                          f"AND l.classid=77077 AND l.objid={scope} AND NOT l.granted)") == 't'
            if at_gate: break
            assert first.poll() is None, 'física terminó antes de la barrera FK'
            time.sleep(.03)
        assert at_gate, 'física no alcanzó la barrera anterior a la FK'
        second = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, env=dict(os.environ, PGAPPNAME=name+'_desactivacion'))
        second.stdin.write(second_sql);second.stdin.close()
        for _ in range(100):
            blocked = sql('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='+
                          lit(name+'_desactivacion')+" AND wait_event_type='Lock')") == 't'
            if blocked: break
            assert second.poll() is None, 'desactivación terminó sin esperar'
            time.sleep(.03)
        assert blocked, 'no se observó espera de la desactivación'
        gate.stdin.write('\\quit\n');gate.stdin.flush();gate.stdin.close();gate.wait(timeout=5)
        first.wait(timeout=15);second.wait(timeout=15)
        assert first.returncode == 0, first.stderr.read()
        assert second.returncode == 0, second.stderr.read()
        first_response, second_response = json.loads(first.stdout.read()), json.loads(second.stdout.read())
        races.append({'caso':label, 'espera_observada':'Lock',
                      'barrera':'BEFORE INSERT evento_lote_vivero, anterior a FK real de campaña',
                      'orden':'física adquiere locks → desactivación espera → física confirma → desactivación',
                      'primero':first_response, 'segundo':second_response})
        return first_response, second_response
    finally:
        for child in (second, first, gate):
            if child and child.poll() is None: child.kill();child.wait(timeout=5)
        sql('DROP TRIGGER pa_d_fixture_antes_fk ON public.evento_lote_vivero;DROP FUNCTION public.pa_d_fixture_antes_fk();')


def repos(scope,origin,evidence,actor=901,count=1):
    details=[{'asignacion_id':scope*100+1,'lote_vivero_id':81,'planta_id':8,'cantidad':count}]
    return old('SELECT to_jsonb(t) FROM public.fn_m3_registrar_plantacion('+str(scope)+',true,'+str(origin)+','+lit(today)+','+str(actor)+',-16.5,-68.1,NULL,ARRAY[]::bigint[],'+lit(details)+'::jsonb,ARRAY['+str(evidence)+']::bigint[]) t')
try:
    today=sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date")
    sql("""CREATE OR REPLACE FUNCTION public.pa_d_test_ejecutar(s TEXT) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER AS $$
      DECLARE d JSONB;c TEXT;m TEXT; BEGIN EXECUTE s INTO d;RETURN jsonb_build_object('data',d,'error',NULL);
      EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS c=RETURNED_SQLSTATE,m=MESSAGE_TEXT;
      RETURN jsonb_build_object('data',NULL,'error',jsonb_build_object('code',c,'message',m));END $$;
      REVOKE ALL ON FUNCTION public.pa_d_test_ejecutar(TEXT) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.pa_d_test_ejecutar(TEXT) TO service_role;
      INSERT INTO public.usuario(id,auth_id,nombre,rol,activo) VALUES
      (901,'a-http-901','General D','GENERAL',true),(902,'a-http-902','Validador D','VALIDADOR',true),
      (903,'a-http-903','Voluntario logístico D','VOLUNTARIO',true),(904,'a-http-904','Admin inactivo D','ADMIN',false);
      INSERT INTO public.campania(id,nombre) VALUES(900,'Campaña D');
      INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles)
      SELECT n,900,'Ámbito D '||n,'ACTIVA','INT02D-'||n,800,800,1,'Zona sintética',
      ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),2 FROM generate_series(900,950)n;
      INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) SELECT n,8,100,2 FROM generate_series(900,950)n;
      INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa)
      SELECT n*100,n,81,'PLANTACION_INICIAL',20,800,now()-interval '1 day',(now() AT TIME ZONE 'America/La_Paz')::date-1 FROM generate_series(900,940)n;
      INSERT INTO public.subcampania_equipo(subcampania_id,usuario_id,rol,agregado_by)
      SELECT n,u,'OPERARIO',800 FROM generate_series(900,950)n CROSS JOIN unnest(ARRAY[901,902,903]::bigint[])u;
      INSERT INTO public.evento_lote_vivero(lote_id,tipo_evento,fecha_evento,responsable_id) VALUES(81,'EMBOLSADO',CURRENT_DATE-1,800);
      UPDATE public.lote_vivero SET saldo_vivo_actual=1000 WHERE id=81;
      SELECT setval(pg_get_serial_sequence('public.asignacion_vivero_subcampania','id'),1000000);
    """)
    for scope in range(900,951): confirmed(json.loads(sql(access('OTORGAR_PLANTADOR',801,scope))))
    #080 exacta no crea grants de servicio/RLS. Verifica denegación efectiva
    # tras grants adversarios de tabla/columna/vista en fixture previo.
    targets=['asignacion_vivero_subcampania','registro_plantacion','registro_plantacion_detalle','registro_plantacion_coresponsable','evento_plantacion','evidencias_trazabilidad','subcampania_equipo','subcampania','lote_vivero','evento_lote_vivero']
    for role in ('anon','authenticated','pa_int02b_public_probe'):
      for table in targets:
        sql('SET ROLE '+role+';SELECT * FROM public.'+table+' LIMIT 0','permission denied')
        assert sql('SELECT has_any_column_privilege('+lit(role)+','+lit('public.'+table)+",'SELECT')")=='f'
      sql('SET ROLE '+role+';SELECT * FROM public.v_lote_vivero_saldos LIMIT 0','permission denied')
      assert sql('SELECT has_table_privilege('+lit(role)+",'public.campania_estado','SELECT')")=='t'
      assert sql('SELECT has_table_privilege('+lit(role)+",'public.planta','SELECT')")=='t'
      sql('SET ROLE '+role+";UPDATE public.planta SET especie='NO' WHERE false",'permission denied')
    preflight=root/'scripts/sql/pa-int02d-superficie-preflight.sql'
    def preflight_fails(grant,cleanup,expected):
      before=sql("SELECT md5(string_agg(c.oid::text||coalesce(c.relacl::text,''),',' ORDER BY c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")
      sql(grant)
      snapshot=sql("SELECT md5(string_agg(c.oid::text||coalesce(c.relacl::text,''),',' ORDER BY c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")
      result=subprocess.run(base+['-f',str(preflight)],text=True,capture_output=True,timeout=10)
      assert result.returncode and expected in result.stderr,result.stderr
      assert sql("SELECT md5(string_agg(c.oid::text||coalesce(c.relacl::text,''),',' ORDER BY c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")==snapshot
      sql(cleanup)
      evidence.setdefault('preflight_adversarios',[]).append({'caso':expected,'fallo_sin_mutacion':True})
    preflight_fails('GRANT SELECT(planta_id) ON public.subcampania_meta_especie TO anon','REVOKE SELECT(planta_id) ON public.subcampania_meta_especie FROM anon','PA_D_FUERA_ALCANCE_SELECT_PUBLICO')
    preflight_fails('GRANT UPDATE(nombre) ON public.campania TO authenticated','REVOKE UPDATE(nombre) ON public.campania FROM authenticated','PA_D_FUERA_ALCANCE_DML_PUBLICO')
    preflight_fails('GRANT INSERT ON public.campania_organizacion TO anon','REVOKE INSERT ON public.campania_organizacion FROM anon','PA_D_FUERA_ALCANCE_DML_PUBLICO')
    preflight_fails('GRANT UPDATE(campania_id) ON public.campania_estado TO anon','REVOKE UPDATE(campania_id) ON public.campania_estado FROM anon','PA_D_FUERA_ALCANCE_DML_PUBLICO')
    preflight_fails('CREATE VIEW public.pa_d_vista_adversaria AS SELECT id,ruta_archivo FROM public.evidencias_trazabilidad;GRANT SELECT ON public.pa_d_vista_adversaria TO PUBLIC','DROP VIEW public.pa_d_vista_adversaria','PA_D_VISTA_PUBLICA_NO_AUTORIZADA')
    preflight_fails("CREATE FUNCTION public.pa_d_definer_adversario() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$SELECT max(id) FROM public.registro_plantacion$$",'DROP FUNCTION public.pa_d_definer_adversario()','PA_D_DEFINER_PUBLICO_NO_AUTORIZADO')
    sql('CREATE ROLE pa_d_acl_heredada NOLOGIN;GRANT SELECT ON public.asignacion_vivero_subcampania TO pa_d_acl_heredada;GRANT pa_d_acl_heredada TO anon;')
    result=subprocess.run(base+['-f',str(root/'migrations/080_pa_int02d_superficie_privada.sql')],text=True,capture_output=True,timeout=10)
    assert result.returncode and 'PA_D_PRIVILEGIO_HEREDADO_REQUIERE_REVISION' in result.stderr,result.stderr
    assert sql("SELECT has_table_privilege('anon','public.asignacion_vivero_subcampania','SELECT')")=='t'
    sql('REVOKE pa_d_acl_heredada FROM anon;DROP OWNED BY pa_d_acl_heredada;DROP ROLE pa_d_acl_heredada;')
    # Si el servicio dependía de PUBLIC,080 debe revertir íntegra, no crear GRANT.
    sql('REVOKE UPDATE ON public.lote_vivero FROM service_role;GRANT UPDATE ON public.lote_vivero TO PUBLIC;')
    result=subprocess.run(base+['-f',str(root/'migrations/080_pa_int02d_superficie_privada.sql')],text=True,capture_output=True,timeout=10)
    assert result.returncode and 'PA_D_SERVICE_SIN_PRIVILEGIO' in result.stderr,result.stderr
    assert sql("SELECT has_table_privilege('anon','public.lote_vivero','UPDATE')")=='t'
    sql('REVOKE UPDATE ON public.lote_vivero FROM PUBLIC;GRANT UPDATE ON public.lote_vivero TO service_role;')
    evidence.setdefault('preflight_adversarios',[]).append({'caso':'servicio dependía solo dePUBLIC','rollback_integral_sin_grants_nuevos':True})
    result=subprocess.run(base+['-f',str(preflight)],text=True,capture_output=True,timeout=10);assert result.returncode==0,result.stderr
    evidence['preflight_local']=json.loads(result.stdout.strip())
    ok('080 cierra diez tablas/una vista/cuatro catálogos; extras/grants heredados abortan sin mutarlos',['PA-ID23','PA-ID05'])
    # Las nuevas entradas siguen siendo privadas en TODAS las firmas.
    sensitive=['pa_d_cuenta','fn_m3_registrar_plantacion','fn_m3_devolver_asignacion_vivero','fn_m2_m3_aplicar_devolucion_fisica','fn_vivero_asignar_stock_subcampania','fn_subcampania_revisar_plan','fn_subcampania_obtener_plan','fn_subcampania_cancelar','fn_subcampania_cancelar_interna','fn_campania_desactivar_sin_plantaciones','fn_subcampania_setear_poligono','pa_foto_publica']
    acl=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('firma',p.oid::regprocedure::text,'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'public',has_function_privilege('pa_int02b_public_probe',p.oid,'execute'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname=ANY("+lit('{'+','.join(sensitive)+'}')+"::text[]) OR left(p.proname,5)='pa_d_')"))
    assert acl and all(not(x['anon'] or x['authenticated'] or x['public']) for x in acl),acl
    evidence['acl_compartidas']=acl
    sql("SET ROLE anon;SELECT public.pa_d_cuenta(800)",'permission denied')
    sql("SET ROLE authenticated;SELECT public.fn_subcampania_obtener_plan(900)",'permission denied')
    ok('ACL reales de todas las firmas compartidas, nuevas y getter plan',['PA-ID23'])
    before=state(900)
    failed(call("SELECT to_jsonb(t) FROM public.fn_m3_registrar_plantacion(900,false,NULL,CURRENT_DATE,800,-16.5,-68.1,NULL,ARRAY[]::bigint[],'[]'::jsonb,ARRAY[]::bigint[])t"),'CLIENTE_INCOMPATIBLE')
    assert state(900)==before
    for actor in (801,903,904): failed(json.loads(sql(physical(900,1,actor))),'AUTORIDAD_INTERNA_REQUERIDA' if actor!=904 else 'CUENTA_NO_DISPONIBLE')
    failed(json.loads(sql(giveback(900,1,901))),'COORDINADOR')
    failed(json.loads(sql(revise(900,3,904))),'CUENTA_NO_DISPONIBLE')
    ok('inicial legada clausurada y permiso contextual/rol inactivo no heredan logística',['PA-ID05','PA-ID24'])
    # Plan y cierre en ambos órdenes frente a inicial real y recibo durable.
    k,v=payload(900);first,second=race(revise(900),initial(v,k),'plan primero → inicial revisión obsoleta');success(first);rejected(second,'PLAN_MODIFICADO');assert sql('SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id=90000')=='0'
    k,v=payload(901);first,second=race(initial(v,k),revise(901),'inicial primero → plan revalida');confirmed(first);success(second);assert sql('SELECT total_plantado_inicial FROM public.subcampania WHERE id=901')=='1'
    k,v=payload(902);first,second=race(close(902),initial(v,k),'cierre primero → inicial rechazada');success(first);rejected(second,'SUBCAMPANIA_NO_OPERATIVA')
    k,v=payload(903);first,second=race(initial(v,k),close(903),'inicial primero → cierre conserva hecho/permisos');confirmed(first);success(second);assert rpc('pa_comando_recuperar',801,auth(801),'REGISTRAR_PLANTACION_INICIAL',k)['body']['estado']=='CONFIRMADO'
    ok('plan/cierre serializados en ambos órdenes, hechos/recibos/permisos conservados',['PA-ID21','PA-ID15'])
    # Devolución física compite por ámbito y después por asignación/lote.
    k,v=payload(904);first,second=race(giveback(904),initial(v,k),'devolución primero → inicial sin stock');success(first);rejected(second,'STOCK_INSUFICIENTE')
    k,v=payload(905);first,second=race(initial(v,k),giveback(905),'inicial primero → devolución revalida saldo');confirmed(first);failed(second,'excede');assert sql('SELECT cantidad_devuelta FROM public.asignacion_vivero_subcampania WHERE id=90500')=='0'
    k,v=payload(906,count=22);first,second=race(physical(906),initial(v,k),'entrega primero → inicial consume stock nuevo sin segundo débito');success(first);confirmed(second)
    k,v=payload(907);first,second=race(initial(v,k),physical(907),'inicial primero → entrega preserva saldos');confirmed(first);success(second)
    ok('entrega/devolución frente a inicial en ambos órdenes sin doble débito ni saldo negativo',['PA-ID21'])
    # Dos ámbitos con lote compartido: entregas/devueltos no invierten cuentas/ámbito/lote.
    first,second=race(physical(908),giveback(909,3),'entrega y devolución de otro ámbito comparten lote');success(first);success(second)
    first,second=race(giveback(910,3),physical(911),'devolución y entrega de otro ámbito comparten lote');success(first);success(second)
    ok('operaciones físicas entre ámbitos serializan lote sin inversión de locks',['PA-ID21'])
    # FKs reales de051: física y cancelación individual no pueden descubrir
    # campaña después de retener la hija, cuando la masiva hace el recorrido inverso.
    assert sql("SELECT count(*) FROM pg_constraint WHERE conrelid='public.evento_lote_vivero'::regclass "
               "AND confrelid='public.campania'::regclass AND contype='f'") == '1'
    for scope, operation, unavailable in ((960,physical,'no encontrada'),(962,giveback,'DEVUELTA'),(964,cancel,'no encontrada')):
      for campaign_first in (False, True):
        current=scope+int(campaign_first)
        sql(f"INSERT INTO public.campania(id,nombre) VALUES({current},'Campaña FK D');"
            f"INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,poligono_geom,meta_total_arboles) "
            f"SELECT {current},{current},'Ámbito FK D','ACTIVA','INT02D-FK-{current}',800,800,1,poligono_geom,2 FROM public.subcampania WHERE id=900;"
            f"INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) VALUES({current},8,100,2);"
            f"INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) "
            f"VALUES({current*100},{current},81,'PLANTACION_INICIAL',20,800,now()-interval '1 day',CURRENT_DATE-1)")
        balance=int(sql('SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=81'))
        command=operation(current,3) if operation is giveback else operation(current)
        if campaign_first:
          first,second=race(deactivate(current),command,'desactivación primero → '+operation.__name__+' revalida con FK real')
          success(first);failed(second,unavailable)
        else:
          first,second=race_before_campaign_fk(command,deactivate(current),current,operation.__name__+' antes de FK → desactivación espera campaña')
          success(first);success(second)
        assert int(sql('SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=81'))==balance+20
        assert sql(f'SELECT bool_and(cantidad_devuelta=cantidad_asignada AND cantidad_consumida=0) FROM public.asignacion_vivero_subcampania WHERE subcampania_id={current}')=='t'
        assert sql(f"SELECT estado::text='CANCELADA' AND deleted_at IS NOT NULL FROM public.subcampania WHERE id={current}")=='t'
        assert sql(f'SELECT deleted_at IS NOT NULL FROM public.campania WHERE id={current}')=='t'
        assert sql(f"SELECT count(*) FROM public.subcampania_historial WHERE subcampania_id={current} AND tipo_historial::text='SUBCAMPANIA_CANCELADA'")=='1'
    ok('entrega/devolución/cancelación y desactivación masiva en ambos órdenes con FK real, sin deadlock ni doble retorno',['PA-ID21'])
    # Reposición: ni permiso inicial ni origen de otra subcampaña autorizan.
    origins={}
    for scope in (912,913):
      origins[scope]=int(sql('INSERT INTO public.registro_plantacion(subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,cantidad_muerta_acumulada,codigo_trazabilidad,created_by) VALUES('+str(scope)+',800,CURRENT_DATE,5,5,'+lit('ORIGEN-D-'+str(scope))+',800) RETURNING id'))
    sql("INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) VALUES(91201,912,81,'REPOSICION',5,800,now()-interval '1 day',CURRENT_DATE-1)")
    def repo_photo(actor=901,scope=912,typ=1):
      return int(sql('INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,bucket,ruta_archivo,creado_por_usuario_id,metadata) VALUES('+str(typ)+",'participacion_evidencias','reposicion-sintetica',"+str(actor)+','+lit({'subcampania_id':str(scope),'proposito':'REPOSICION'})+'::jsonb) RETURNING id'))
    ev=repo_photo();before=state(912)
    failed(json.loads(sql(repos(912,origins[913],ev))),'ámbito autorizado');assert state(912)==before
    for actor in (801,903,904):
      failed(json.loads(sql(repos(912,origins[912],ev,actor))),'AUTORIDAD_INTERNA_REQUERIDA' if actor!=904 else 'CUENTA_NO_DISPONIBLE')
    failed(json.loads(sql(repos(912,origins[912],repo_photo(902)))),'Todas las evidencias')
    failed(json.loads(sql(repos(912,origins[912],repo_photo(901,913)))),'Todas las evidencias')
    failed(json.loads(sql(repos(912,origins[912],repo_photo(901,912,2)))),'Todas las evidencias')
    before_m2=sql('SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=81')
    result=success(json.loads(sql(repos(912,origins[912],ev))))
    assert result['cantidad_total_plantada']==1 and sql('SELECT cantidad_repuesta_acumulada FROM public.registro_plantacion WHERE id='+str(origins[912]))=='1'
    assert sql('SELECT total_repuesto FROM public.subcampania WHERE id=912')=='1'
    assert sql('SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id=81')==before_m2
    ok('reposición interna preservada, origen/tipo/ámbito/propietario estrictos sin segundo débito',['PA-ID25','PA-ID18'])
    # Ciclo de vida: la nueva exclusión protege TOCTOU de activación/equipo/edición.
    sql("UPDATE public.subcampania SET estado='BORRADOR' WHERE id IN(941,942,943,944,945,946);")
    add=old("SELECT public.pa_d_equipo_agregar(941,800,'[{\"usuario_id\":901,\"rol\":\"COORDINADOR\"}]'::jsonb)")
    # Quitar los OPERARIO de fixture para poder elegir coordinador.
    sql('DELETE FROM public.subcampania_equipo WHERE subcampania_id=941 AND usuario_id=901')
    success(json.loads(sql(add)))
    before_permission=sql('SELECT count(*) FROM public.subcampania_permiso WHERE subcampania_id=941')
    success(call('SELECT public.pa_d_subcampania_activar(941,800)'))
    assert sql('SELECT count(*) FROM public.subcampania_permiso WHERE subcampania_id=941')==before_permission
    failed(call('SELECT public.pa_d_equipo_quitar(941,800,901)'),'coordinador')
    failed(call('SELECT public.pa_d_subcampania_activar(941,800)'),'BORRADOR')
    failed(call('SELECT public.pa_d_subcampania_editar(941,800,'+lit({'nombre':'No editable'})+'::jsonb)'),'editables')
    success(call('SELECT public.pa_d_subcampania_editar(942,800,'+lit({'nombre':'Nombre válido D'})+'::jsonb)'))
    failed(call('SELECT public.pa_d_subcampania_borrar(941,800)'),'BORRADOR')
    success(call('SELECT public.pa_d_subcampania_borrar(942,800)'))
    failed(call('SELECT public.fn_subcampania_setear_poligono(943,'+lit({'type':'Polygon','coordinates':[[[-68.2,-16.6],[-68,-16.6],[-68,-16.4],[-68.2,-16.4],[-68.2,-16.6]]]})+'::jsonb,901)'),'ADMIN')
    ok('activación/equipo/edición/borrado/polígono mantienen reglas y no crean permisos',['PA-ID07','PA-ID05'])
    # Rol/baja frente a operación interna: cuenta SHARE congela autorización.
    # Comprobación de actividad efectiva sin fixture de rol: lock real de cuenta y función DB privada.
    def inactivate(actor):
      value={'usuario_destino_id':str(actor),'revision_esperada':'0','motivo':'Baja sintética INT02-D'}
      return 'SET ROLE service_role;SELECT public.pa_autoridad_ejecutar(800,'+lit(auth(800))+','+lit('INACTIVAR_CUENTA')+','+lit(str(uuid.uuid4()))+','+lit(value)+'::jsonb,'+lit(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')))+');'
    first,second=race(inactivate(902),old("SELECT public.pa_d_cuenta(902)"),'baja C primero → operación interna denegada');confirmed(first);failed(second,'CUENTA_NO_DISPONIBLE')
    next_photo=repo_photo()
    first,second=race(repos(912,origins[912],next_photo),inactivate(901),'reposición primero → baja C espera cuenta y preserva hecho');success(first);confirmed(second)
    failed(json.loads(sql(repos(912,origins[912],repo_photo()))),'CUENTA_NO_DISPONIBLE')
    assert sql('SELECT count(*) FROM public.asignacion_vivero_subcampania WHERE saldo_asignado_disponible<0')=='0'
    ok('cuenta activa revalidada tras espera y saldos físicos no negativos',['PA-ID13','PA-ID21'])
    # Medición real con configuración de entrada en conexión limpia. El trigger
    # sintético retrasa una escritura REAL de077, no una función que simula el dominio.
    sql("CREATE FUNCTION public.pa_d_fixture_lenta() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.subcampania_id=918 THEN PERFORM pg_sleep(31); END IF;RETURN NEW;END$$;CREATE TRIGGER pa_d_fixture_lenta BEFORE INSERT ON public.asignacion_vivero_subcampania FOR EACH ROW EXECUTE FUNCTION public.pa_d_fixture_lenta();")
    timed_command=physical(918,1)
    before=state(918);started=time.monotonic()
    timed=subprocess.run(base,input="SET statement_timeout='30s';SET lock_timeout='5s';"+timed_command,text=True,capture_output=True,timeout=36)
    elapsed=time.monotonic()-started
    assert timed.returncode and 'statement timeout' in timed.stderr and 29<=elapsed<34,(elapsed,timed.stdout,timed.stderr)
    assert state(918)==before
    sql('DROP TRIGGER pa_d_fixture_lenta ON public.asignacion_vivero_subcampania;DROP FUNCTION public.pa_d_fixture_lenta();')
    holder=subprocess.Popen(base,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1)
    try:
      holder.stdin.write("BEGIN;SELECT to_jsonb(s.id) FROM public.subcampania s WHERE id=919 FOR UPDATE;\n\\echo READY\n");holder.stdin.flush()
      assert select.select([holder.stdout],[],[],5)[0]
      holder.stdout.readline();assert holder.stdout.readline().strip()=='READY'
      timed_command=physical(919,1);started=time.monotonic()
      timed=subprocess.run(base,input="SET statement_timeout='30s';SET lock_timeout='5s';"+timed_command,text=True,capture_output=True,timeout=9)
      lock_elapsed=time.monotonic()-started
      assert timed.returncode==0 and 4.5<=lock_elapsed<8,(lock_elapsed,timed.stderr)
      failed(json.loads(timed.stdout),'lock timeout')
    finally:
      if holder.poll() is None: holder.stdin.write('ROLLBACK;\n\\quit\n');holder.stdin.flush();holder.stdin.close();holder.wait(timeout=5)
    evidence['timeouts_compartidos']={'statement_segundos':round(elapsed,3),'lock_segundos':round(lock_elapsed,3),'entrada':'conexión limpia con SET previo según rol/proconfig,077 real con trigger lento sintético','rollback_verificado':True,'limite':'PostgREST remoto/configuración hoisted/catálogo pendientes de cotejo'}
    ok('statement30s y lock5s medidos antes de077, sin efecto parcial ni rechazo fabricado',['PA-ID17','PA-ID21'])
    evidence['d_resultados']={'grupos_sql':len(cases)-d_case_start,'carreras_reales':len(races)-d_race_start,'espera':'Lock observada','superficie_080':'VERIFICADA_LOCAL_ALCANCE_FIJO_EXTRAS_CONDICIONADOS_AL_PREFLIGHT'}
finally:
    Path(a.evidence).write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
