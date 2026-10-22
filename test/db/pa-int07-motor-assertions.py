"""Motor INT07 real: atomicidad, replay, ACL y carreras con locks observados."""
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
OP = 'CORREGIR_OBSERVACIONES_PLANTACION'


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


def payload(record=910000, revision=0, text='EFECTIVO_PRIVADO_INT07'):
    return {'registro_plantacion_id': str(record), 'revision_esperada': str(revision),
            'motivo': 'MOTIVO_PRIVADO_INT07', 'observaciones': text}


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


before = state(910000)
key = str(uuid.uuid4())
value = payload()
reply = execute(value, key)
result = confirmed(reply)
after = state(910000)
assert result['revision_anterior'] == '0' and result['revision_nueva'] == '1', result
assert result['revision_grupo_anterior'] == result['revision_grupo_nueva'] == '0', result
assert after['original']['observaciones'] == before['original']['observaciones']
assert after['stock'] == before['stock'] and after['vivero'] == before['vivero']
assert after['historia'] == 1 and after['original']['revision_registro'] == 1
assert after['efectivo']['observaciones_efectivas'] == value['observaciones']
assert not any(secret in json.dumps(reply) for secret in ('MOTIVO_PRIVADO_INT07', 'EFECTIVO_PRIVADO_INT07', 'ORIGINAL_PRIVADO_INT07'))
assert execute(value, key) == reply and recover(key) == reply
assert state(910000) == after
observed('Cambio atómico conserva original/stock/Vivero y recibo mínimo; replay/GET idénticos sin duplicar historial')

same = execute(payload(revision=1))
unchanged = confirmed(same, 'SIN_CAMBIOS')
assert unchanged['correccion_id'] is None and unchanged['revision_anterior'] == unchanged['revision_nueva'] == '1'
assert state(910000) == after
reused = execute(payload(revision=1, text='OTRA_INTENCION'), key)
assert reused['http_status'] == 409 and reused['body']['error']['codigo'] == 'COMANDO_REUTILIZADO'
assert recover(key) == reply
rejected(execute(payload()), 'REVISION_OBSOLETA')
observed('SIN_CAMBIOS no fabrica historia; revisión obsoleta durable y clave reutilizada conserva terminal')

for actor in (801, 804):
    denied = execute(payload(911000), actor=actor)
    assert denied['http_status'] in (403, 404), denied
    assert denied['body']['estado'] == 'RECHAZADO', denied
contextual = execute(payload(revision=1), actor=802)
rejected(contextual, 'CAPACIDAD_INSUFICIENTE')
assert execute(payload(999999999))['body']['error']['codigo'] == 'RECURSO_NO_VISIBLE'
inactive = execute(payload(911000), actor=805)
assert inactive['http_status'] == 403 and inactive['body']['error']['codigo'] == 'CUENTA_INACTIVA'
closed = execute(payload(827000))
rejected(closed, 'SUBCAMPANIA_NO_OPERATIVA')
observed('Autor/ajeno/contextual/inactivo no corrigen observaciones; ACTIVA y objeto exacto se revalidan')

context = json.loads(sql("SET ROLE service_role; SELECT public.pa_correccion_contexto_leer(802,'a-http-802',910000)"))
assert context['data']['observaciones_visibles'] is False
assert context['data']['original']['observaciones'] is None and context['data']['efectivo']['observaciones'] is None
history = json.loads(sql("SET ROLE service_role; SELECT public.pa_correccion_historial_leer(802,'a-http-802',910000)"))
assert len(history['data']) == 1
entry = history['data'][0]
assert entry['motivo'] is None and entry['antes']['observaciones'] is None and entry['despues']['observaciones'] is None
observed('Contexto e historial contextual omiten textos/motivo y no conceden facultad global')

# Falla al commit: para entonces ya se escribieron terminal/historia/overlay y
# revisión. El constraint trigger sintético no sustituye validaciones de dominio.
broken_key = str(uuid.uuid4())
snapshot = state(912000)
sql("CREATE FUNCTION public.pa_int07_fixture_fallar() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'INT07 fallo inesperado' USING ERRCODE='XX000'; END$$; CREATE CONSTRAINT TRIGGER pa_int07_fixture_fallar AFTER INSERT ON public.registro_plantacion_correccion DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.pa_int07_fixture_fallar();")
try:
    sql('BEGIN;'+command(payload(912000), broken_key)+'COMMIT;', 'INT07 fallo inesperado')
    assert state(912000) == snapshot
    assert recover(broken_key)['http_status'] == 404
finally:
    sql('DROP TRIGGER pa_int07_fixture_fallar ON public.registro_plantacion_correccion; DROP FUNCTION public.pa_int07_fixture_fallar();')
observed('Fallo inesperado al commit revierte overlay/revisión/historia/comando; recuperación404 inconclusa')

# Replay propio debe preceder a la nueva comprobación de rol y de ACTIVA.
retired_key = str(uuid.uuid4())
retired_value = payload(913000)
retired_reply = execute(retired_value, retired_key, 9200)
confirmed(retired_reply)
assert json.loads(sql(authority(9200)))['body']['estado'] == 'CONFIRMADO'
assert execute(retired_value, retired_key, 9200) == retired_reply
assert recover(retired_key, 9200) == retired_reply
assert execute(payload(913000, 1, 'NUEVA'), actor=9200)['http_status'] in (403, 404)
observed('Retiro del rol global conserva replay/recuperación propia y no concede nueva escritura')

# SQL comparte los bytes exactos de TS: NFC, Unicode sin escapes alternativos y
# JSON compacto. Las variantes rechazadas no crean una identidad durable.
unicode_value = payload(927000, text='Árbol "corregido" / 🌳\nlínea\tsegunda')
unicode_value['motivo'] = 'Motivo áé "entre comillas" / 🌱'
invalid_canons = [json.dumps(unicode_value, ensure_ascii=False, sort_keys=True),
                  json.dumps(unicode_value, ensure_ascii=True, sort_keys=True, separators=(',', ':')),
                  '']
for canonical in invalid_canons:
    bad_key = str(uuid.uuid4())
    bad = json.loads(sql(command(unicode_value, bad_key, canonical=canonical)))
    assert bad['http_status'] == 422 and bad['body']['resultado_concluyente'] is False, bad
    assert recover(bad_key)['http_status'] == 404
    assert state(927000)['historia'] == 0
for text in ('', ' A\u0301rbol ', 'A\u0301rbol'):
    bad_key = str(uuid.uuid4())
    bad = execute(payload(927000, text=text), bad_key)
    assert bad['http_status'] == 422 and bad['body']['resultado_concluyente'] is False, bad
    assert recover(bad_key)['http_status'] == 404
normalized = confirmed(execute(unicode_value))
assert normalized['revision_nueva'] == '1'
assert state(927000)['efectivo']['observaciones_efectivas'] == unicode_value['observaciones']
cleared = confirmed(execute(payload(927000, 1, None)))
assert cleared['revision_nueva'] == '2'
assert state(927000)['efectivo']['observaciones_efectivas'] is None
unsupported_key = str(uuid.uuid4())
unsupported = json.loads(sql(command(payload(928000), unsupported_key, operation='CORREGIR_CANTIDAD_PLANTACION')))
assert unsupported['http_status'] == 422 and recover(unsupported_key)['http_status'] == 404
observed('SQL valida bytes compactos/Unicode/NFC exactos, vacío/null y operación futura sin terminal ficticio')

# El snapshot del corrector conserva el nombre capturado al ejecutar, aunque el
# perfil cambie después. No se publica ese nombre en esta evidencia.
actor_name = sql('SELECT nombre FROM public.usuario WHERE id=9211')
snapshot_result = confirmed(execute(payload(928000), actor=9211))
sql("UPDATE public.usuario SET nombre='Perfil posterior sintético INT07' WHERE id=9211")
snapshot_history = json.loads(sql("SET ROLE service_role; SELECT public.pa_correccion_historial_leer(800,'a-http-800',928000)"))
assert snapshot_history['data'][0]['actor'] == {'usuario_id': '9211', 'nombre_snapshot': actor_name}
assert snapshot_history['data'][0]['correccion_id'] == snapshot_result['correccion_id']
observed('Nombre snapshot del corrector no sigue cambios posteriores de perfil')

reposition_before = state(826001)
origin_before = state(826000)
reposition = confirmed(execute(payload(826001)))
assert reposition['revision_anterior'] == '0' and reposition['revision_nueva'] == '1'
assert reposition['revision_grupo_anterior'] == reposition['revision_grupo_nueva'] == '0'
reposition_after = state(826001)
assert reposition_after['original']['revision_registro'] == 1
assert reposition_after['original']['observaciones'] == reposition_before['original']['observaciones']
assert reposition_after['stock'] == reposition_before['stock'] and reposition_after['vivero'] == reposition_before['vivero']
assert state(826000) == origin_before
observed('Observaciones de reposición avanzan solo revisión del registro; grupo/origen/stock permanecen iguales')

# Dos intenciones por la misma revisión: siempre gana exactamente una.
for scope, swap in ((914, False), (915, True)):
    one, two = payload(scope*1000, text='PRIMERA'), payload(scope*1000, text='SEGUNDA')
    if swap:
        one, two = two, one
    first, second = race(command(one), command(two), 'Dos correcciones misma revisión: '+('B→A' if swap else 'A→B'))
    confirmed(first)
    rejected(second, 'REVISION_OBSOLETA')
    assert state(scope*1000)['historia'] == 1
observed('Dos órdenes de correcciones concurrentes: una revisión/historia, segundo rechazo durable')

for scope, inverse in ((916, False), (917, True)):
    correction, closing = command(payload(scope*1000)), close(scope)
    first, second = race(closing if inverse else correction, correction if inverse else closing,
                         'Cierre↔observaciones '+('cierre primero' if inverse else 'corrección primero'))
    if inverse:
        rejected(second, 'SUBCAMPANIA_NO_OPERATIVA')
        assert state(scope*1000)['historia'] == 0
    else:
        confirmed(first)
        assert second['estado'] == 'COMPLETADA'
observed('Ambos órdenes con cierre real respetan ACTIVA sin efectos tardíos')

for inactive_flag, initial_scope in ((False, 918), (True, 920)):
    for offset, inverse in enumerate((False, True)):
        scope, actor = initial_scope+offset, 9201+(initial_scope-918)+offset
        correction, changing = command(payload(scope*1000), actor=actor), authority(actor, inactive_flag)
        first, second = race(changing if inverse else correction, correction if inverse else changing,
                             ('Inactivación' if inactive_flag else 'Retiro rol')+'↔observaciones '+('autoridad primero' if inverse else 'corrección primero'))
        if inverse:
            assert second['http_status'] in (403, 404), second
            assert state(scope*1000)['historia'] == 0
        else:
            confirmed(first)
            assert second['body']['estado'] == 'CONFIRMADO', second
observed('Ambos órdenes con retiro global e inactivación reales: locks de cuenta impiden autoridad obsoleta')

# Ninguna audiencia SQL pública obtiene tablas o funciones nuevas de corrección.
for role in ('anon', 'authenticated'):
    sql('SET ROLE '+role+'; SELECT * FROM public.registro_plantacion_correccion', 'permission denied')
    sql('SET ROLE '+role+"; SELECT public.pa_correccion_contexto_leer(800,'a-http-800',910000)", 'permission denied')
sql('SET ROLE service_role; DELETE FROM public.registro_plantacion_correccion', 'permission denied')
observed('ACL/RLS privadas: público sin tablas/RPC y servicio sin borrado de historia')
path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
