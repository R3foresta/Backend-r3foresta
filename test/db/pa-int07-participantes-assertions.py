"""Participantes INT07: contratos, lecturas efectivas y carreras PostgreSQL reales."""
import argparse
import json
import os
from pathlib import Path
import select
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
for field in ('socket', 'port', 'database', 'psql', 'evidence'):
    parser.add_argument('--'+field, required=True)
args = parser.parse_args()
assert args.database == 'pa_int03a_ensayo'
assert Path(args.socket).resolve().parent.name.startswith('pa-int03a-')
base = [args.psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', args.socket,
        '-p', args.port, '-U', 'postgres', '-d', args.database]
path = Path(args.evidence)
evidence = json.loads(path.read_text())
OP = 'CORREGIR_PARTICIPANTES_PLANTACION'


def lit(value):
    if value is None:
        return 'NULL'
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    return "'"+str(value).replace("'", "''")+"'"


def sql(statement, fail=None):
    result = subprocess.run(base, input="SET statement_timeout='30s';"+statement,
                            capture_output=True, text=True, timeout=35)
    if fail:
        assert result.returncode and fail in result.stderr, result.stderr
        return result.stderr
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def observed(label):
    evidence['casos'].append({'caso': label, 'resultado': 'CORRECTO'})
    path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
    print('OK: '+label, flush=True)


def payload(record=940000, revision=0, people=None):
    return {'registro_plantacion_id': str(record), 'revision_esperada': str(revision),
            'motivo': 'MOTIVO_PRIVADO_PART_INT07',
            'coresponsable_ids': [str(p) for p in (people if people is not None else [9312, 9313])]}


def command(value, key=None, actor=800, canonical=None, operation=OP):
    key = key or str(uuid.uuid4())
    if canonical is None:
        canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return ('SET ROLE service_role; SELECT public.pa_correccion_ejecutar('+str(actor)+','+
            lit('a-http-'+str(actor))+','+lit(operation)+','+lit(key)+','+lit(value)+'::jsonb,'+lit(canonical)+');')


def execute(value, key=None, actor=800):
    return json.loads(sql(command(value, key, actor)))


def confirmed(reply, change='CAMBIO_APLICADO'):
    assert reply['http_status'] == 200 and reply['body']['estado'] == 'CONFIRMADO', reply
    result = reply['body']['resultado']
    assert result['tipo'] == 'CORRECCION_PLANTACION' and result['cambio'] == change, result
    return result


def rejected(reply, code):
    assert reply['body']['estado'] == 'RECHAZADO' and reply['body']['error']['codigo'] == code, reply


def recover(key, actor=800):
    return json.loads(sql('SET ROLE service_role; SELECT public.pa_comando_recuperar('+str(actor)+','+
                         lit('a-http-'+str(actor))+','+lit(OP)+','+lit(key)+');'))


def state(record):
    return json.loads(sql("SELECT jsonb_build_object('original',(SELECT to_jsonb(r) FROM public.registro_plantacion r WHERE id="+str(record)+
        "),'efectivo',(SELECT to_jsonb(e) FROM public.registro_plantacion_efectivo e WHERE registro_plantacion_id="+str(record)+
        "),'historia',(SELECT count(*) FROM public.registro_plantacion_correccion WHERE registro_plantacion_id="+str(record)+
        "),'stock',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.asignacion_vivero_subcampania a WHERE subcampania_id="+str(record//1000)+
        "),'vivero',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.lote_vivero l))"))


def race(first_sql, second_sql, label):
    """Retiene el commit de una RPC real y observa al competidor esperando Lock."""
    first = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, bufsize=1)
    second = None
    name = 'pa_int07_'+uuid.uuid4().hex[:10]
    try:
        first.stdin.write('BEGIN;\n'+first_sql+'\n\\echo READY\n')
        first.stdin.flush()
        assert select.select([first.stdout], [], [], 15)[0], 'RPC inicial sin respuesta'
        first_reply = json.loads(first.stdout.readline())
        assert first.stdout.readline().strip() == 'READY'
        second = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, env=dict(os.environ, PGAPPNAME=name))
        second.stdin.write(second_sql)
        second.stdin.close()
        blocked = False
        for _ in range(70):
            blocked = sql('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='+lit(name)+
                          " AND wait_event_type='Lock')") == 't'
            if blocked:
                break
            assert second.poll() is None, 'Competidor terminó sin esperar lock'
            time.sleep(.03)
        assert blocked, 'No se observó exclusión PostgreSQL real'
        first.stdin.write('COMMIT;\n\\quit\n')
        first.stdin.flush()
        first.stdin.close()
        first.wait(timeout=15)
        assert first.returncode == 0, first.stderr.read()
        second.wait(timeout=15)
        assert second.returncode == 0, second.stderr.read()
        second_reply = json.loads(second.stdout.read().strip())
        evidence['carreras'].append({'caso': label, 'espera_observada': 'Lock',
                                     'primero': public_test_result(first_reply),
                                     'segundo': public_test_result(second_reply)})
        return first_reply, second_reply
    finally:
        for child in (second, first):
            if child and child.poll() is None:
                child.kill()
                child.wait(timeout=5)


def public_test_result(reply):
    """La evidencia conserva IDs/revisiones/estados; nunca textos del dominio."""
    if 'body' not in reply:
        return {key: reply[key] for key in ('id', 'estado') if key in reply}
    body = reply['body']
    result = body.get('resultado') or {}
    allowed = ('tipo', 'caso', 'cambio', 'correccion_id', 'registro_plantacion_id',
               'subcampania_id', 'usuario_id', 'estado_logico', 'revision_anterior',
               'revision_nueva', 'revision_grupo_anterior', 'revision_grupo_nueva')
    return {'http_status': reply['http_status'], 'estado': body.get('estado'),
            'error_codigo': (body.get('error') or {}).get('codigo'),
            'resultado': {key: result[key] for key in allowed if key in result}}


def authority(actor, inactive=False):
    value = {'usuario_destino_id': str(actor), 'revision_esperada': '0', 'motivo': 'Retiro sintético INT07'}
    operation = 'INACTIVAR_CUENTA' if inactive else 'CAMBIAR_ROL_GLOBAL'
    if not inactive:
        value['rol_global'] = 'VOLUNTARIO'
    return 'SET ROLE service_role; SELECT public.pa_autoridad_ejecutar(800,\'a-http-800\','+lit(operation)+','+lit(str(uuid.uuid4()))+','+lit(value)+'::jsonb,'+lit(value)+');'


def close(scope):
    day = sql("SELECT ((now() AT TIME ZONE 'America/La_Paz')::date)::text")
    value = {'estado_final': 'COMPLETADA', 'fecha_cierre_operativo': day+'T00:00:00Z',
             'fecha_fin_mantenimiento': day}
    return 'SET ROLE service_role; SELECT public.pa_d_subcampania_cerrar('+str(scope)+",800,"+lit(value)+'::jsonb);'


def read(name, *params):
    return json.loads(sql('SET ROLE service_role; SELECT public.'+name+'('+','.join(lit(p) for p in params)+');'))


def read_denied(name, *params):
    statement = 'SELECT public.'+name+'('+','.join(lit(p) for p in params)+')'
    result = read('pa_a_http_transport', statement)
    assert result['data'] is None and result['error']['code'] == 'PT404', result


def context(record, actor=9301):
    return read('pa_correccion_contexto_leer', actor, 'a-http-'+str(actor), record)['data']


def current_people(record):
    return {p['usuario_id']: p for p in context(record)['efectivo']['participantes'] if not p['es_responsable']}


def original_rows(record):
    return sql('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),\'[]\'::jsonb) FROM public.registro_plantacion_coresponsable x WHERE registro_plantacion_id='+str(record))


def observations(record, revision, value):
    p = {'registro_plantacion_id': str(record), 'revision_esperada': str(revision),
         'motivo': 'MOTIVO_PRIVADO_OBS_ALTERNADA', 'observaciones': value}
    return command(p, operation='CORREGIR_OBSERVACIONES_PLANTACION')


def retire(scope, actor=9301):
    p = {'usuario_destino_id': str(actor), 'ambitos': [{'subcampania_id': str(scope), 'revision_esperada': '1'}]}
    return 'SET ROLE service_role; SELECT public.pa_acceso_ejecutar(800,\'a-http-800\',\'RETIRAR_ADMINISTRADOR\','+lit(str(uuid.uuid4()))+','+lit(p)+'::jsonb,'+lit(p)+');'


before = state(940000)
original = original_rows(940000)
key = str(uuid.uuid4())
value = payload()
reply = execute(value, key, 9301)
result = confirmed(reply)
after = state(940000)
assert result['caso'] == 'PARTICIPANTES' and result['revision_nueva'] == '1', result
assert result['revision_grupo_anterior'] == result['revision_grupo_nueva'] == '0'
assert original_rows(940000) == original
assert before['stock'] == after['stock'] and before['vivero'] == after['vivero']
old_original, new_original = before['original'].copy(), after['original'].copy()
old_original.pop('revision_registro'); new_original.pop('revision_registro')
assert old_original == new_original
assert set(current_people(940000)) == {'9312', '9313'}
assert execute(value, key, 9301) == reply and recover(key, 9301) == reply
assert state(940000) == after
assert not any(x in json.dumps(reply) for x in ('MOTIVO_PRIVADO', 'coresponsable_ids', 'nombre_snapshot', 'participantes'))
observed('Administrador contextual cambia set con cuenta inactiva, original/responsable/stock intactos y replay mínimo')

same = confirmed(execute(payload(revision=1), actor=9301), 'SIN_CAMBIOS')
assert same['correccion_id'] is None and same['revision_nueva'] == '1'
assert state(940000) == after
rejected(execute(payload(), actor=9301), 'REVISION_OBSOLETA')
reused = execute(payload(revision=1, people=[]), key, 9301)
assert reused['http_status'] == 409 and reused['body']['error']['codigo'] == 'COMANDO_REUTILIZADO'
observed('SIN_CAMBIOS conserva historia/revisión; obsoleta durable y clave reutilizada no cambian terminal')

# La primera alta captura nombre actual pero no traslada su afiliación presente
# al día del trabajo. La restauración conserva exactamente esa captura inicial.
first_capture = current_people(940000)['9312']
assert first_capture['procedencia'] == 'ALTA_CORRECCION' and first_capture['capturado_en'] is not None
assert first_capture['nombre_snapshot'] is None and first_capture['nombre_capturado_correccion'] is not None
assert first_capture['afiliacion_estado'] == 'HISTORICA_NO_DISPONIBLE'
assert first_capture['organizacion_id_snapshot'] is None
sql("UPDATE public.usuario SET nombre='Perfil posterior alta INT07',organizacion_id=1 WHERE id=9312")
confirmed(execute(payload(revision=1, people=[9313]), actor=9301))
confirmed(execute(payload(revision=2, people=[9312, 9313]), actor=9301))
restored = current_people(940000)['9312'].copy()
assert restored.pop('procedencia') == 'RESTAURACION'
expected_capture = first_capture.copy(); expected_capture.pop('procedencia')
assert restored == expected_capture
assert sql('SELECT activo FROM public.usuario WHERE id=9313') == 'f'
assert sql('SELECT count(*) FROM public.subcampania_permiso WHERE usuario_id IN(9312,9313)') == '0'
observed('Alta/restauración preserva captura y afiliación histórica desconocida sin reactivar cuentas ni conceder permisos')

before_restore = json.loads(original_rows(940000))
confirmed(execute(payload(revision=3, people=[9310, 9311]), actor=800))
people = current_people(940000)
assert set(people) == {'9310', '9311'}
for person in people.values():
    original_person = next(p for p in before_restore if str(p['usuario_id']) == person['usuario_id'])
    assert person['procedencia'] == 'RESTAURACION' and person['capturado_en'] is None
    assert person['nombre_snapshot'] == original_person['nombre_snapshot']
    assert person['afiliacion_snapshot'] == original_person['afiliacion_snapshot']
    assert person['organizacion_id_snapshot'] == (str(original_person['organizacion_id_snapshot']) if original_person['organizacion_id_snapshot'] else None)
assert original_rows(940000) == original
observed('Restauración original reutiliza nombres/afiliaciones históricas exactos y mantiene filas originales')

for actor in (801, 9303):
    assert execute(payload(941000), actor=actor)['http_status'] == 404
for people_ids, code in (([801], 'CASO_NO_SOPORTADO'), ([999999999], 'PARTICIPANTE_NO_REGISTRADO')):
    rejected(execute(payload(941000, people=people_ids), actor=9301), code)
closed = execute(payload(827000), actor=800)
rejected(closed, 'SUBCAMPANIA_NO_OPERATIVA')
for invalid in ([9312, 9312], [9313, 9312]):
    bad_key = str(uuid.uuid4())
    bad = execute(payload(941000, people=invalid), bad_key)
    assert bad['http_status'] == 422 and bad['body']['resultado_concluyente'] is False, bad
    assert recover(bad_key)['http_status'] == 404
observed('Objeto/autoridad/ACTIVA, responsable y cuentas inexistentes; SQL exige set canónico único ordenado')

# P01 se prueba en cada familia privada: raw no puede rescatar una participación
# RETIRADA y el responsable conserva autoría aun si hubo fila duplicada legada.
confirmed(execute(payload(941000, people=[]), actor=9301))
for name in ('pa_registro_detalle_propio_leer', 'pa_registro_estado_propio_leer', 'pa_registro_historial_propio_leer'):
    read_denied(name, 9310, 'a-http-9310', 941000)
assert read('pa_registro_detalle_propio_leer', 801, 'a-http-801', 941000)['data']['relaciones'] == ['AUTOR']
own = read('pa_mis_registros_leer', 9310, 'a-http-9310', None, 100)['data']['registros']
assert '941000' not in {p['id'] for p in own}
states = read('pa_mis_registros_estado_leer', 9310, 'a-http-9310', None, 50)['data']
assert '941000' not in {p['registro_plantacion_id'] for p in states}
confirmed(execute(payload(941000, 1, [9310]), actor=800))
assert read('pa_registro_estado_propio_leer', 9310, 'a-http-9310', 941000)['data']['relaciones'] == ['PARTICIPANTE']
own_history = read('pa_registro_historial_propio_leer', 9310, 'a-http-9310', 941000)['data']
assert len(own_history) == 2 and all('motivo' not in p and 'antes' not in p and 'despues' not in p for p in own_history)
observed('P01 retira todas las lecturas propias y restauración las recupera; autoría e historia reducida conservadas')

# Intercalar ambas variantes no puede usar COALESCE para sustituir un NULL
# efectivo por la observación original ni materializar un overlay incompleto.
confirmed(json.loads(sql(observations(942000, 0, None))))
confirmed(execute(payload(942000, 1, [9312]), actor=9301))
assert context(942000, 800)['efectivo']['observaciones'] is None
confirmed(json.loads(sql(observations(942000, 2, 'OTRO_TEXTO_PRIVADO'))))
assert set(current_people(942000)) == {'9312'}
assert context(942000)['revision_registro'] == '3' and context(942000)['revision_grupo'] == '0'
confirmed(execute(payload(943000), actor=9301))
assert context(943000, 800)['efectivo']['observaciones'] == 'OBSERVACION_PRIVADA_PART_943'
confirmed(json.loads(sql(observations(943000, 1, None))))
assert set(current_people(943000)) == {'9312', '9313'}
contextual_history = read('pa_correccion_historial_leer', 9301, 'a-http-9301', 942000)['data']
for item in contextual_history:
    if item['caso'] == 'OBSERVACIONES':
        assert item['motivo'] is None and item['antes']['observaciones'] is None and item['despues']['observaciones'] is None
    else:
        assert item['motivo'] is not None
observed('OBS↔PART preserva overlay null/participantes, revisión compartida y redacción de auditoría contextual')

snapshot = state(944000)
broken_key = str(uuid.uuid4())
sql("CREATE FUNCTION public.pa_part_fixture_fallar() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'PART fallo inesperado' USING ERRCODE='XX000'; END$$; CREATE CONSTRAINT TRIGGER pa_part_fixture_fallar AFTER INSERT ON public.registro_plantacion_correccion DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pa_part_fixture_fallar();")
try:
    sql('BEGIN;'+command(payload(944000), broken_key, 9301)+'COMMIT;', 'PART fallo inesperado')
    assert state(944000) == snapshot
    assert recover(broken_key, 9301)['http_status'] == 404
    assert sql('SELECT count(*) FROM public.registro_plantacion_participante_efectivo WHERE registro_plantacion_id=944000') == '0'
finally:
    sql('DROP TRIGGER pa_part_fixture_fallar ON public.registro_plantacion_correccion; DROP FUNCTION public.pa_part_fixture_fallar();')
observed('Fallo al commit revierte participantes/overlay/revisión/historia/terminal íntegramente')

retired_key = str(uuid.uuid4()); retired_value = payload(945000)
retired_reply = execute(retired_value, retired_key, 9301); confirmed(retired_reply)
assert json.loads(sql(retire(945)))['body']['estado'] == 'CONFIRMADO'
assert execute(retired_value, retired_key, 9301) == retired_reply and recover(retired_key, 9301) == retired_reply
assert execute(payload(945000, 1, []), actor=9301)['http_status'] == 404
read_denied('pa_correccion_contexto_leer', 9301, 'a-http-9301', 945000)
observed('Retiro del administrador conserva replay propio pero retira contexto y nueva escritura')

# El caso PARTICIPANTES no hereda las restricciones de cantidad frente a bajas
# o reposiciones históricas y no altera revisiones/contadores del grupo.
for record in (826000, 826001):
    before = state(record)
    applied = confirmed(execute(payload(record, people=[9312, 9313])))
    after = state(record)
    assert applied['revision_grupo_anterior'] == applied['revision_grupo_nueva'] == '0'
    assert before['stock'] == after['stock'] and before['vivero'] == after['vivero']
observed('Participantes admite baja/reposición histórica y no toca consumo ni revisión del grupo')

for scope, reverse in ((946, False), (947, True)):
    one, two = payload(scope*1000, people=[9312]), payload(scope*1000, people=[9313])
    first, second = race(command(two if reverse else one, actor=9301), command(one if reverse else two, actor=9301),
                         'Participantes misma revisión '+('B→A' if reverse else 'A→B'))
    confirmed(first); rejected(second, 'REVISION_OBSOLETA')
    assert state(scope*1000)['historia'] == 1
observed('Dos órdenes entre correcciones de participantes: un efecto y rechazo durable de la revisión competidora')

for scope, reverse in ((948, False), (949, True)):
    part, obs = command(payload(scope*1000), actor=9301), observations(scope*1000, 0, None)
    first, second = race(obs if reverse else part, part if reverse else obs,
                         'Participantes↔observaciones '+('OBS primero' if reverse else 'PART primero'))
    confirmed(first); rejected(second, 'REVISION_OBSOLETA')
    assert state(scope*1000)['historia'] == 1
observed('Ambos órdenes PART/OBS comparten revisión y excluyen correcciones sobre una propuesta obsoleta')

for scope, reverse in ((950, False), (951, True)):
    part, withdraw = command(payload(scope*1000), actor=9301), retire(scope)
    first, second = race(withdraw if reverse else part, part if reverse else withdraw,
                         'Participantes↔retiro contextual '+('retiro primero' if reverse else 'PART primero'))
    if reverse:
        assert second['http_status'] == 404, second
        assert state(scope*1000)['historia'] == 0
    else:
        confirmed(first)
        assert second['body']['estado'] == 'CONFIRMADO'
observed('Ambos órdenes de retiro contextual revalidan autoridad sin perder terminal confirmado')

for scope, reverse in ((952, False), (953, True)):
    part, closing = command(payload(scope*1000), actor=9301), close(scope)
    first, second = race(closing if reverse else part, part if reverse else closing,
                         'Participantes↔cierre '+('cierre primero' if reverse else 'PART primero'))
    if reverse:
        rejected(second, 'SUBCAMPANIA_NO_OPERATIVA')
        assert state(scope*1000)['historia'] == 0
    else:
        confirmed(first)
        assert second['estado'] == 'COMPLETADA'
observed('Ambos órdenes con cierre real preservan ACTIVA como precondición de nueva ejecución')

for scope, actor, reverse in ((954, 9320, False), (955, 9321, True)):
    part, inactive = command(payload(scope*1000), actor=actor), authority(actor, True)
    first, second = race(inactive if reverse else part, part if reverse else inactive,
                         'Participantes↔inactivar ejecutor '+('inactivación primero' if reverse else 'PART primero'))
    if reverse:
        assert second['http_status'] == 403 and second['body']['error']['codigo'] == 'CUENTA_INACTIVA'
        assert state(scope*1000)['historia'] == 0
    else:
        confirmed(first)
        assert second['body']['estado'] == 'CONFIRMADO'
observed('Ambos órdenes con inactivación del ejecutor bloquean cuenta antes del ámbito')

for scope, participant, reverse in ((956, 9322, False), (957, 9323, True)):
    part = command(payload(scope*1000, people=[participant]), actor=9301)
    inactive = authority(participant, True)
    first, second = race(inactive if reverse else part, part if reverse else inactive,
                         'Alta histórica↔inactivar participante '+('inactivación primero' if reverse else 'PART primero'))
    assert first['body']['estado'] == second['body']['estado'] == 'CONFIRMADO'
    assert sql('SELECT activo FROM public.usuario WHERE id='+str(participant)) == 'f'
    assert str(participant) in current_people(scope*1000)
observed('P02 concurrente permite ambas operaciones al inactivar al participante, sin reactivarlo')

for scope, reverse in ((958, False), (959, True)):
    participant = 9315
    original_name = sql('SELECT nombre FROM public.usuario WHERE id=9315')
    changed_name = 'Perfil carrera '+str(scope)
    profile = 'SET ROLE service_role; SELECT public.pa_perfil_actualizar(9315,\'a-http-9315\',true,'+lit(changed_name)+',false,NULL,false,NULL,NULL,\'{}\'::jsonb);'
    part = command(payload(scope*1000, people=[participant]), actor=9301)
    first, second = race(profile if reverse else part, part if reverse else profile,
                         'Alta histórica↔perfil '+('perfil primero' if reverse else 'PART primero'))
    confirmed(second if reverse else first)
    captured = current_people(scope*1000)['9315']['nombre_capturado_correccion']
    assert captured == (changed_name if reverse else original_name)
observed('Ambos órdenes de perfil/captura conservan el nombre de la instantánea protegida por locks')

# Barrera adversaria: si se bloquease el actor9300 antes del participante50,
# el probe NOWAIT del actor fallaría mientras la corrección espera en50.
gate = worker = None
worker_name = 'pa_part_orden_'+uuid.uuid4().hex[:8]
try:
    gate = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, bufsize=1)
    gate.stdin.write('BEGIN; SELECT id FROM public.usuario WHERE id=50 FOR UPDATE;\n\\echo READY\n')
    gate.stdin.flush()
    assert select.select([gate.stdout], [], [], 10)[0]
    assert gate.stdout.readline().strip() == '50' and gate.stdout.readline().strip() == 'READY'
    worker = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, env=dict(os.environ, PGAPPNAME=worker_name))
    worker.stdin.write(command(payload(960000, people=[50]), actor=9300))
    worker.stdin.close()
    blocked = False
    for _ in range(70):
        blocked = sql('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='+lit(worker_name)+" AND wait_event_type='Lock')") == 't'
        if blocked: break
        assert worker.poll() is None
        time.sleep(.03)
    assert blocked
    assert sql('BEGIN; SELECT id FROM public.usuario WHERE id=9300 FOR UPDATE NOWAIT; ROLLBACK;') == '9300'
    gate.stdin.write('ROLLBACK;\n\\quit\n'); gate.stdin.flush(); gate.stdin.close(); gate.wait(timeout=10)
    worker.wait(timeout=15); assert worker.returncode == 0, worker.stderr.read()
    confirmed(json.loads(worker.stdout.read()))
    evidence['carreras'].append({'caso': 'Cuentas ASC con participante50 anterior a actor9300',
                                'espera_observada': 'Lock', 'probe_actor_alto_nowait': 'ADQUIRIDO'})
finally:
    for child in (worker, gate):
        if child and child.poll() is None: child.kill(); child.wait(timeout=5)
observed('Orden de cuentas comprobado con barrera y NOWAIT; no se retiene actor alto antes de cuenta baja')

public_people = read('pa_i_personas', 942000)
assert sum(p['es_responsable'] for p in public_people) == 1
assert all(p['nombre'] is None and p['afiliacion']['estado'] == 'HISTORICA_NO_DISPONIBLE'
           for p in public_people if not p['es_responsable'])
public_state = read('pa_registro_estado_publico_leer', 942000)['data']
assert set(public_state) == {'registro_plantacion_id', 'estado_logico', 'tiene_correcciones',
                              'url_detalle_efectivo', 'registro_vigente'}
assert public_state['tiene_correcciones'] is True
for role in ('anon', 'authenticated'):
    sql('SET ROLE '+role+'; SELECT * FROM public.registro_plantacion_participante_efectivo', 'permission denied')
    sql('SET ROLE '+role+"; SELECT public.pa_registro_estado_propio_leer(9310,'a-http-9310',940000)", 'permission denied')
sql('SET ROLE service_role; DELETE FROM public.registro_plantacion_participante_efectivo', 'permission denied')
observed('Proyección v1 no inventa snapshot histórico; estado público mínimo y tablas/RPC privadas')
path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')


