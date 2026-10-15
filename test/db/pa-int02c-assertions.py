"""INT02-C: RPC privadas reales y carreras en el clúster propio del runner.

No carga .env, no usa un catálogo remoto y no acredita INT02-D/PostGIS/Storage.
Las barreras conservan una transacción abierta y verifican una espera Lock real.
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import select
import subprocess
import time
import unicodedata
import uuid


parser = argparse.ArgumentParser()
for name in ('socket', 'cluster', 'port', 'database', 'psql', 'evidence'):
    parser.add_argument('--' + name, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
assert args.database == 'pa_int02c_ensayo'
assert Path(args.socket).resolve().parent == Path(args.cluster).resolve().parent
assert Path(args.cluster).resolve().parent.name.startswith('pa-int02c-')
assert Path(args.evidence).resolve() == root / 'docs/evidencia/pa-int02c-local.json'
base = [args.psql, '-X', '-qAt', '-h', args.socket, '-p', args.port,
        '-U', 'postgres', '-d', args.database, '-v', 'ON_ERROR_STOP=1']
cases, races = [], []
migrations = [
    'migrations/068_pa_participacion_comando.sql',
    'migrations/069_pa_int02b_eventos_acceso.sql',
    'migrations/070_pa_int02b_permisos_contextuales.sql',
    'migrations/071_pa_int02b_bootstrap_controlado.sql',
    'migrations/072_pa_int02c_comandos_acceso.sql',
    'migrations/073_pa_int02c_lecturas.sql',
]
evidence = {
    'tarea': 'PA-T-INT02-C', 'estado': 'EN_EJECUCION',
    'fecha_utc': datetime.now(timezone.utc).isoformat(),
    'comando': 'python3 scripts/qa/pa-int02c-db-test.py',
    'entorno': {'aislado': True, 'tcp': False, 'env_cargado': False,
                'antecedente': 'test/db/pa-int02c-fixture.sql',
                'naturaleza': 'SINTETICO_AISLADO_POST_067'},
    'migraciones': migrations, 'casos': cases, 'carreras': races,
    'limites': ['Sin aplicación remota ni catálogo real',
                'Sin reconstrucción completa de 001–067',
                'Sin PostGIS, Storage, registro INT03-A ni carreras de INT02-D',
                'Continuidad cooperativa entre RPC: service_role privado conserva escritura SQL de autoridad por SECURITY INVOKER; SQL/importaciones ajenos al orden no están cubiertos',
                'La ejecución HTTP se acredita por separado'],
}


def query(sql, error=None):
    result = subprocess.run(base, input="SET statement_timeout='30s'; " + sql,
                            text=True, capture_output=True, timeout=35)
    if error:
        assert result.returncode != 0 and error in result.stderr, result.stderr
        return result.stderr
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def script(path):
    result = subprocess.run(base + ['-f', str(root / path)], text=True,
                            capture_output=True, timeout=35)
    assert result.returncode == 0, result.stderr


def passed(name):
    cases.append(name)
    print('OK: ' + name, flush=True)


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def canonical(payload):
    normalized = copy.deepcopy(payload)
    if 'ambitos' in normalized:
        normalized['ambitos'].sort(key=lambda row: int(row['subcampania_id']))
    if 'motivo' in normalized:
        normalized['motivo'] = unicodedata.normalize('NFC', normalized['motivo']).strip()
    return json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def call_sql(operation, payload, actor=1, key=None, auth=None, content=None):
    key = key or str(uuid.uuid4())
    function = 'pa_autoridad_ejecutar' if operation in (
        'CAMBIAR_ROL_GLOBAL', 'INACTIVAR_CUENTA') else 'pa_acceso_ejecutar'
    auth = auth or query('SELECT auth_id FROM public.usuario WHERE id=' + str(actor))
    content = canonical(payload) if content is None else content
    sql = ('SET ROLE service_role; SELECT public.' + function + '(' + str(actor) + ','
           + literal(auth) + ',' + literal(operation) + ',' + literal(key) + ','
           + literal(json.dumps(payload, ensure_ascii=False)) + '::jsonb,' + literal(content) + ');')
    return sql, key


def execute(operation, payload, actor=1, key=None, auth=None, content=None):
    sql, key = call_sql(operation, payload, actor, key, auth, content)
    response = json.loads(query(sql))
    assert set(response) == {'http_status', 'body'}, response
    body = response['body']
    if 'estado' in body and body['estado'] in ('CONFIRMADO', 'RECHAZADO'):
        assert set(body) == {'comando_id', 'operacion', 'estado', 'resultado', 'error', 'finalizado_en'}, body
        assert body['comando_id'] == key and body['operacion'] == operation
        assert body['finalizado_en'] is not None
        assert (body['resultado'] is None) != (body['error'] is None)
        if body['estado'] == 'CONFIRMADO':
            assert response['http_status'] == 200
            if body['resultado']['tipo'] == 'ACCESO':
                changes = body['resultado']['cambios']
                assert [int(c['subcampania_id']) for c in changes] == sorted(
                    int(c['subcampania_id']) for c in changes)
                for scope in changes:
                    assert isinstance(scope['subcampania_id'], str)
                    assert [int(u['usuario_id']) for u in scope['usuarios']] == sorted(
                        int(u['usuario_id']) for u in scope['usuarios'])
                    for user in scope['usuarios']:
                        assert set(user) == {'usuario_id', 'permiso_anterior', 'permiso_nuevo',
                                             'revision_anterior', 'revision_nueva', 'cambio',
                                             'conserva_acceso_global'}, user
                        assert all(isinstance(user[field], str) for field in (
                            'usuario_id', 'revision_anterior', 'revision_nueva'))
    return response


def payload(user, scopes):
    return {'usuario_destino_id': str(user), 'ambitos': [
        {'subcampania_id': str(scope), 'revision_esperada': str(revision)}
        for scope, revision in scopes]}


def replacement(outgoing, incoming, scopes, treatment='SIN_ACCESO'):
    return {'usuario_saliente_id': str(outgoing), 'usuario_reemplazo_id': str(incoming),
            'tratamiento_saliente': treatment, 'ambitos': [
                {'subcampania_id': str(scope), 'revision_saliente_esperada': str(old),
                 'revision_reemplazo_esperada': str(new)} for scope, old, new in scopes]}


def authority(user, revision=0, role=None, reason='Ensayo sintético de autoridad'):
    value = {'usuario_destino_id': str(user), 'revision_esperada': str(revision), 'motivo': reason}
    if role:
        value['rol_global'] = role
    return value


def domain_state():
    tables = ('usuario', 'subcampania', 'subcampania_permiso_revision',
              'subcampania_permiso', 'subcampania_historial')
    result = []
    for table in tables:
        result.append(query('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'
                            "'[]') FROM public." + table + ' t'))
    if query("SELECT to_regclass('public.usuario_autoridad_historial') IS NOT NULL") == 't':
        result.append(query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') "
                            'FROM public.usuario_autoridad_historial t'))
    return result


def revision(scope, user):
    return query('SELECT coalesce((SELECT revision FROM public.subcampania_permiso_revision '
                 'WHERE subcampania_id=' + str(scope) + ' AND usuario_id=' + str(user) + '),0)')


def permission(scope, user):
    return query('SELECT coalesce((SELECT rol_contextual FROM public.subcampania_permiso '
                 'WHERE subcampania_id=' + str(scope) + ' AND usuario_id=' + str(user)
                 + " AND revocado_en IS NULL),'SIN_ACCESO')")


def effective(scope):
    return int(query('SELECT count(*) FROM public.subcampania_permiso p JOIN public.usuario u '
                     'ON u.id=p.usuario_id WHERE p.subcampania_id=' + str(scope)
                     + " AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' AND p.revocado_en IS NULL AND u.activo"))


def confirmed(response):
    assert response['http_status'] == 200 and response['body']['estado'] == 'CONFIRMADO', response
    return response['body']['resultado']


def reject(operation, value, code, actor=1, key=None):
    before = domain_state()
    response = execute(operation, value, actor=actor, key=key)
    assert response['body']['estado'] == 'RECHAZADO', response
    assert response['body']['error']['codigo'] == code, response
    assert domain_state() == before, 'rechazo modificó el dominio: ' + code
    assert response['body']['resultado'] is None
    return response


def recovery(operation, key, actor=1):
    auth = query('SELECT auth_id FROM public.usuario WHERE id=' + str(actor))
    return json.loads(query('SET ROLE service_role; SELECT public.pa_comando_recuperar('
                           + str(actor) + ',' + literal(auth) + ',' + literal(operation) + ','
                           + literal(key) + ');'))


def read(function, parameters):
    before = domain_state()
    value = json.loads(query('SET ROLE service_role; SELECT public.' + function + '(' + parameters + ')'))
    assert set(value) == {'data', 'observado_en'} and value['observado_en'].endswith('Z'), value
    assert domain_state() == before, 'lectura con efectos: ' + function
    return value['data']


def readings():
    own = read('pa_capacidades_leer', "37,'fixture-c-37',NULL,NULL,101")
    assert own['subcampanias'] == [] and own['actor']['usuario_id'] == '37'
    global_scopes = read('pa_capacidades_leer', "1,'fixture-admin',NULL,NULL,101")
    assert global_scopes['capacidades_globales'] == {
        'asignar_roles': True, 'designar_administradores': True, 'leer_plan': True}
    assert not any(scope['subcampania_id'] == '30' for scope in global_scopes['subcampanias'])
    paused = next(scope for scope in global_scopes['subcampanias'] if scope['subcampania_id'] == '15')
    assert not any(paused['acciones'].values())
    first_page = read('pa_capacidades_leer', "1,'fixture-admin',1,NULL,2")['subcampanias']
    next_page = read('pa_capacidades_leer', "1,'fixture-admin',1,12,2")['subcampanias']
    assert [scope['subcampania_id'] for scope in first_page] == ['11', '12']
    assert [scope['subcampania_id'] for scope in next_page] == ['13', '14']
    assert all(scope['fuente_autoridad'] == 'GLOBAL' for scope in first_page)
    volunteer = read('pa_capacidades_leer', "3,'fixture-voluntario',NULL,NULL,101")
    active = next(scope for scope in volunteer['subcampanias'] if scope['subcampania_id'] == '11')
    assert active['acciones']['registrar_inicial'] and not active['acciones']['incorporar_plantador']
    assert active['permiso_contextual'] == 'PLANTADOR' and active['revision_permiso'] == '1'
    manager = read('pa_capacidades_leer', "2,'fixture-general',NULL,NULL,101")
    assert {scope['subcampania_id'] for scope in manager['subcampanias']} == {'11', '12', '16'}
    assert all(scope['fuente_autoridad'] == 'CONTEXTUAL' for scope in manager['subcampanias'])
    # ACTIVA has no stock fact in this fixture; it remains in the authority list.
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(1, [(27, 0)])))
    members = read('pa_miembros_participacion_leer', "1,'fixture-admin',27,NULL,101")
    assert len(members) == 1 and members[0]['usuario_id'] == '1'
    assert members[0]['acceso_global'] and members[0]['permiso_contextual'] == 'ADMINISTRADOR_SUBCAMPANIA'
    assert members[0]['etiqueta_acceso_global'] == 'Administrador · Acceso global'
    members = read('pa_miembros_participacion_leer', "2,'fixture-general',11,NULL,101")
    assert {row['usuario_id'] for row in members} == {'1', '2', '3', '6'}
    coordinator = next(row for row in members if row['usuario_id'] == '6')
    assert coordinator['responsabilidad_logistica'] == 'COORDINADOR' and coordinator['permiso_contextual'] is None
    for row in members:
        assert set(row) == {'usuario_id', 'nombre', 'organizacion', 'permiso_contextual',
                            'revision_permiso', 'acceso_global', 'etiqueta_acceso_global',
                            'responsabilidad_logistica'}, row
    query("SET ROLE service_role; SELECT public.pa_miembros_participacion_leer(3,'fixture-voluntario',11,NULL,101)",
          'CAPACIDAD_INSUFICIENTE')
    query("SET ROLE service_role; SELECT public.pa_miembros_participacion_leer(2,'fixture-general',19,NULL,101)",
          'CAPACIDAD_INSUFICIENTE')
    query("SET ROLE service_role; SELECT public.pa_capacidades_leer(5,'fixture-inactivo',NULL,NULL,101)",
          'CUENTA_INACTIVA')
    passed('capacidades privadas/paginadas, sin contexto vacío, PAUSADA, saldo cero, miembros deduplicados/logística mínima')

    found = read('pa_personas_buscar', "1,'fixture-admin','CORREO_EXACTO','  COLISION@example.invalid  ',"
                 "'OTORGAR_PLANTADOR',ARRAY[14,17]::bigint[],NULL,21")
    assert {row['usuario_id'] for row in found} == {'31', '32'}
    for row in found:
        assert set(row) == {'usuario_id', 'nombre', 'organizacion'}, row
    decomposed_name = literal('  JOSE\u0301  ')
    found = read('pa_personas_buscar', "1,'fixture-admin','NOMBRE'," + decomposed_name + ','
                 "'OTORGAR_PLANTADOR',ARRAY[14]::bigint[],NULL,21")
    assert {row['usuario_id'] for row in found} == {'31', '32'}
    found = read('pa_personas_buscar', "1,'fixture-admin','NOMBRE','%persona',"
                 "'OTORGAR_PLANTADOR',ARRAY[14]::bigint[],NULL,21")
    assert [row['usuario_id'] for row in found] == ['34']
    absent = read('pa_personas_buscar', "1,'fixture-admin','CORREO_EXACTO','colision',"
                  "'OTORGAR_PLANTADOR',ARRAY[14]::bigint[],NULL,21")
    assert absent == []
    assert query("SELECT count(*) FROM pg_index WHERE indrelid='public.usuario'::regclass "
                 "AND indisunique AND pg_get_indexdef(indexrelid) ILIKE '%correo%'") == '0'
    reviewed = read('pa_accesos_revisar', "2,'fixture-general',3,ARRAY[12,11]::bigint[]")
    assert [row['subcampania_id'] for row in reviewed['ambitos']] == ['11', '12']
    assert reviewed['ambitos'][0]['revision_permiso'] == '1'
    assert reviewed['ambitos'][1]['revision_permiso'] == '0'
    query("SET ROLE service_role; SELECT public.pa_personas_buscar(2,'fixture-general','NOMBRE','Persona',"
          "'OTORGAR_PLANTADOR',ARRAY[11,19]::bigint[],NULL,21)", 'CAPACIDAD_INSUFICIENTE')
    query("SET ROLE service_role; SELECT public.pa_personas_buscar(1,'fixture-admin','NOMBRE','Persona',"
          "'OTORGAR_PLANTADOR',ARRAY[12]::bigint[],NULL,21)", 'ESTADO_NO_ADMITE_ACCESO')
    query("SET ROLE service_role; SELECT public.pa_accesos_revisar(2,'fixture-general',3,ARRAY[11,19]::bigint[])",
          'CAPACIDAD_INSUFICIENTE')
    query("SET ROLE service_role; SELECT public.pa_accesos_revisar(1,'fixture-admin',3,ARRAY[11,11]::bigint[])",
          'ENTRADA_INVALIDA')
    passed('búsqueda correo exacto sin índice único/colisiones, nombre NFC y comodín literal; revisión completa privada')


def race(first_sql, second_sql, label):
    """First RPC holds its own uncommitted result; second must visibly wait on Lock."""
    env = dict(os.environ)
    tag = 'pa_int02c_' + uuid.uuid4().hex[:10]
    env['PGAPPNAME'] = tag
    first = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, bufsize=1)
    second = None
    try:
        first.stdin.write('BEGIN;\n' + first_sql + '\n\\echo PA_FIRST_READY\n')
        first.stdin.flush()
        assert select.select([first.stdout], [], [], 35)[0], 'primera transacción no responde'
        first_response = json.loads(first.stdout.readline())
        assert first.stdout.readline().strip() == 'PA_FIRST_READY'
        second = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, env=env)
        second.stdin.write(second_sql)
        second.stdin.close()
        blocked = False
        started = time.monotonic()
        while time.monotonic() - started < 3:
            blocked = query('SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='
                            + literal(tag) + " AND wait_event_type='Lock')") == 't'
            if blocked:
                break
            assert second.poll() is None, 'segunda transacción terminó sin esperar Lock'
            time.sleep(0.03)
        assert blocked, 'no se observó bloqueo PostgreSQL real'
        first.stdin.write('COMMIT;\n\\quit\n')
        first.stdin.flush()
        first.stdin.close()
        first.wait(timeout=35)
        assert first.returncode == 0, first.stderr.read()
        second.wait(timeout=35)
        stderr = second.stderr.read()
        assert second.returncode == 0, stderr
        second_response = json.loads(second.stdout.read().strip())
        races.append({'caso': label, 'espera_observada': 'Lock',
                      'primero': first_response['body']['estado'],
                      'segundo': second_response['body'].get('estado'),
                      'error_segundo': (second_response['body'].get('error') or {}).get('codigo')})
        return first_response, second_response
    finally:
        for child in (second, first):
            if child is not None and child.poll() is None:
                child.kill()
                child.wait(timeout=5)


def lock_timeout_case():
    holder = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, bufsize=1)
    try:
        holder.stdin.write('BEGIN; SELECT id FROM public.subcampania WHERE id=28 FOR UPDATE;\n\\echo PA_SCOPE_READY\n')
        holder.stdin.flush()
        assert select.select([holder.stdout], [], [], 35)[0]
        assert holder.stdout.readline().strip() == '28'
        assert holder.stdout.readline().strip() == 'PA_SCOPE_READY'
        before = domain_state()
        sql, key = call_sql('OTORGAR_PLANTADOR', payload(40, [(28, 0)]))
        started = time.monotonic()
        query(sql, 'canceling statement due to lock timeout')
        elapsed = time.monotonic() - started
        assert 4.7 <= elapsed <= 8, elapsed
        assert domain_state() == before
        assert recovery('OTORGAR_PLANTADOR', key)['http_status'] == 404
        holder.stdin.write('ROLLBACK;\n\\quit\n')
        holder.stdin.flush()
        holder.stdin.close()
        holder.wait(timeout=10)
        assert holder.returncode == 0, holder.stderr.read()
        confirmed(execute('OTORGAR_PLANTADOR', payload(40, [(28, 0)]), key=key))
        evidence['timeouts'] = {'lock_timeout_segundos': 5, 'medido_segundos': round(elapsed, 3),
                                'statement_timeout_previo': query('SHOW statement_timeout'),
                                'rechazo_durable_fabricado': False, 'misma_clave_converge': True}
        passed('lock_timeout real ≈5s es inconcluso/404 y misma clave converge; statement_timeout previo30s')
    finally:
        if holder.poll() is None:
            holder.kill()
            holder.wait(timeout=5)


def seed_and_install():
    assert Path(query('SHOW data_directory')).resolve() == Path(args.cluster).resolve()
    assert query('SELECT fixture FROM public.pa_int02b_fixture_marker') == 'SINTETICO_AISLADO_INT02B'
    assert query('SELECT fixture FROM public.pa_int02c_fixture_marker') == 'SINTETICO_AISLADO_INT02C'
    evidence['entorno']['postgresql'] = query('SHOW server_version')
    evidence['entorno']['lc_ctype'] = query('SHOW lc_ctype')
    evidence['entorno']['lc_collate'] = query('SHOW lc_collate')
    for migration in migrations[:4]:
        script(migration)
    # Cuentas adicionales creadas solo por la fixture, nunca a través de acceso/baja.
    query("INSERT INTO public.usuario(id,auth_id,nombre,rol,activo) "
          "SELECT id,'fixture-c-'||id,'Persona sintética '||id,'VOLUNTARIO',true "
          'FROM generate_series(8,50) id;')
    query("UPDATE public.usuario SET nombre='José Uno',correo='  Colision@example.invalid ' WHERE id=31; "
          "UPDATE public.usuario SET nombre='José Dos',correo='COLISION@example.invalid' WHERE id=32; "
          "UPDATE public.usuario SET nombre='José Inactivo',correo='colision@example.invalid',activo=false WHERE id=33; "
          "UPDATE public.usuario SET nombre='%Persona literal' WHERE id=34;")
    script(migrations[4])
    script(migrations[5])
    before = domain_state()
    script(migrations[4])
    # 072 puede reejecutarse después de instalar 073: el prefijo de helpers
    # debe ser literal pa_c_, sin abarcar pa_capacidades_leer por un LIKE amplio.
    read_names = "('pa_lecturas_actor','pa_lecturas_ambitos_validar','pa_capacidades_leer'," \
                 "'pa_miembros_participacion_leer','pa_personas_buscar','pa_accesos_revisar')"
    privileges = json.loads(query("SELECT jsonb_build_object('cantidad',count(*),"
                                  "'servicio',bool_and(has_function_privilege('service_role',p.oid,'EXECUTE')),"
                                  "'publicos',bool_or(has_function_privilege('anon',p.oid,'EXECUTE') OR "
                                  "has_function_privilege('authenticated',p.oid,'EXECUTE'))) "
                                  'FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace '
                                  "WHERE n.nspname='public' AND p.proname IN " + read_names))
    assert privileges == {'cantidad': 6, 'servicio': True, 'publicos': False}, privileges
    after_reapply = read('pa_capacidades_leer', "1,'fixture-admin',NULL,NULL,101")
    assert after_reapply['actor'] == {'usuario_id': '1', 'rol_global': 'ADMIN'}
    reviewed = read('pa_accesos_revisar', "1,'fixture-admin',29,ARRAY[26]::bigint[]")
    assert reviewed['ambitos'][0]['revision_permiso'] == '0'
    assert domain_state() == before
    passed('reinstalar072 después073 conserva EXECUTE de todas las lecturas privadas y su ejecución real')
    script(migrations[5])
    assert domain_state() == before
    seed = json.loads((root / 'test/db/fixtures/pa-int02b-manifest-sintetico.json').read_text())
    query('SET ROLE service_role; SELECT public.pa_inicializar_participacion_legada(1,'
          + literal(uuid.uuid4()) + ',' + literal(json.dumps(seed, ensure_ascii=False)) + '::jsonb)')
    passed('migraciones 068–073, repetición C aditiva y bootstrap sintético acotado')


def main():
    seed_and_install()
    readings()

    # C04/C05: no-op revalida revisión, historial conservado, replay no reotorga.
    key = str(uuid.uuid4())
    original = execute('OTORGAR_PLANTADOR', payload(8, [(14, 0), (17, 0)]), key=key)
    confirmed(original)
    assert permission(14, 8) == 'PLANTADOR' and revision(14, 8) == '1'
    assert revision(17, 8) == '1'
    before = domain_state()
    reordered = payload(8, [(17, 0), (14, 0)])
    assert execute('OTORGAR_PLANTADOR', reordered, key=key) == original
    assert domain_state() == before
    expected_hash = hashlib.sha256(('PA-COMANDO/1\nOTORGAR_PLANTADOR\n' + canonical(reordered)).encode()).hexdigest()
    assert query('SELECT encode(huella,\'hex\') FROM public.participacion_comando WHERE comando_id='
                 + literal(key)) == expected_hash
    no_change = confirmed(execute('OTORGAR_PLANTADOR', payload(8, [(14, 1), (17, 1)])))
    assert all(u['cambio'] == 'SIN_CAMBIOS' for c in no_change['cambios'] for u in c['usuarios'])
    assert domain_state() == before
    reject('OTORGAR_PLANTADOR', payload(8, [(14, 0)]), 'REVISION_OBSOLETA')
    confirmed(execute('RETIRAR_PLANTADOR', payload(8, [(14, 1), (17, 1)])))
    assert permission(14, 8) == 'SIN_ACCESO' and revision(14, 8) == '2'
    before = domain_state()
    assert execute('OTORGAR_PLANTADOR', reordered, key=key) == original
    assert recovery('OTORGAR_PLANTADOR', key) == original
    assert domain_state() == before and permission(14, 8) == 'SIN_ACCESO'
    conflict = execute('OTORGAR_PLANTADOR', payload(8, [(14, 1)]), key=key)
    assert conflict['http_status'] == 409 and conflict['body']['error']['codigo'] == 'COMANDO_REUTILIZADO'
    assert conflict['body']['resultado_concluyente'] is False and domain_state() == before
    confirmed(execute('RETIRAR_PLANTADOR', payload(8, [(14, 2)])))
    assert revision(14, 8) == '2'
    reject('RETIRAR_PLANTADOR', payload(8, [(14, 1)]), 'REVISION_OBSOLETA')
    passed('C04/C05, canonicalización multiámbito, replay/GET tras retiro, no-op y revisión obsoleta')

    vector_key = str(uuid.uuid4())
    vector = payload(9007199254740993, [(10, 5), (2, 0)])
    reject('OTORGAR_PLANTADOR', vector, 'RECURSO_NO_VISIBLE', key=vector_key)
    assert query("SELECT encode(huella,'hex') FROM public.participacion_comando WHERE comando_id="
                 + literal(vector_key)) == '19cdd018044379d5bf6717017c52c48d90bcd015e0a30621335f861972e54cd0'
    passed('vector compartido PA-COMANDO/1, BIGINT fuera de precisión JS y orden numérico2/10')

    reject('OTORGAR_PLANTADOR', payload(8, [(18, 0), (12, 0)]), 'ESTADO_NO_ADMITE_ACCESO')
    reject('OTORGAR_PLANTADOR', payload(8, [(18, 0), (14, 1)]), 'REVISION_OBSOLETA')
    reject('OTORGAR_PLANTADOR', payload(8, [(18, 0), (30, 0)]), 'RECURSO_NO_VISIBLE')
    reject('OTORGAR_PLANTADOR', payload(5, [(18, 0)]), 'DESTINO_INACTIVO')
    reject('OTORGAR_PLANTADOR', payload(2, [(11, 1)]), 'TIPO_PERMISO_INCOMPATIBLE')
    reject('RETIRAR_PLANTADOR', payload(2, [(11, 1)]), 'TIPO_PERMISO_INCOMPATIBLE')
    reject('OTORGAR_PLANTADOR', payload(8, [(15, 0)]), 'ESTADO_NO_ADMITE_ACCESO')
    reject('DESIGNAR_ADMINISTRADOR', payload(8, [(12, 0)]), 'ESTADO_NO_ADMITE_ACCESO')
    # Un gestor contextual solo puede operar en todo el conjunto autorizado.
    confirmed(execute('OTORGAR_PLANTADOR', payload(8, [(11, 0)]), actor=2))
    response = reject('OTORGAR_PLANTADOR', payload(9, [(11, 0), (19, 0)]),
                      'CAPACIDAD_INSUFICIENTE', actor=2)
    assert response['body']['error']['ambitos'] == []
    reject('DESIGNAR_ADMINISTRADOR', payload(9, [(11, 0)]), 'CAPACIDAD_INSUFICIENTE', actor=2)
    reject('OTORGAR_PLANTADOR', payload(9, [(11, 0)]), 'CAPACIDAD_INSUFICIENTE', actor=8)
    reject('OTORGAR_PLANTADOR', payload(9, [(11, 0)]), 'CAPACIDAD_INSUFICIENTE', actor=6)
    passed('todo-o-nada ante estado/revisión/eliminada, inactividad, PAUSADA y autoridad propia/ajena')

    # C06 inicialización, no-op, C07/C08 y último contextual independiente de ADMIN global.
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(9, [(18, 0)])))
    assert query('SELECT participacion_inicializada_en IS NOT NULL FROM public.subcampania WHERE id=18') == 't'
    before = domain_state()
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(9, [(18, 1)])))
    assert domain_state() == before
    reject('DESIGNAR_ADMINISTRADOR', payload(9, [(18, 0)]), 'REVISION_OBSOLETA')
    reject('RETIRAR_ADMINISTRADOR', payload(9, [(18, 1)]), 'ULTIMO_ADMINISTRADOR_CONTEXTUAL')
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(10, [(18, 0)])))
    confirmed(execute('CAMBIAR_ADMINISTRADOR_A_PLANTADOR', payload(9, [(18, 1)])))
    assert permission(18, 9) == 'PLANTADOR' and revision(18, 9) == '2' and effective(18) == 1
    reject('CAMBIAR_ADMINISTRADOR_A_PLANTADOR', payload(9, [(18, 2)]), 'TIPO_PERMISO_INCOMPATIBLE')
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(11, [(18, 0)])))
    confirmed(execute('RETIRAR_ADMINISTRADOR', payload(10, [(18, 1)])))
    assert permission(18, 10) == 'SIN_ACCESO' and revision(18, 10) == '2' and effective(18) == 1
    reject('RETIRAR_ADMINISTRADOR', payload(10, [(18, 2)]), 'TIPO_PERMISO_INCOMPATIBLE')
    passed('C06/C07/C08, primera designación/no-op, degradación frente a retiro y último contextual')

    # C09 permite reemplazo en cerrada/cancelada con ambas revisiones, sin reabrir.
    reject('REEMPLAZAR_ADMINISTRADOR', replacement(2, 12, [(16, 1, 1)]), 'REVISION_OBSOLETA')
    confirmed(execute('REEMPLAZAR_ADMINISTRADOR', replacement(2, 12, [(16, 1, 0)], 'PLANTADOR')))
    assert permission(16, 2) == 'PLANTADOR' and permission(16, 12) == 'ADMINISTRADOR_SUBCAMPANIA'
    assert effective(16) == 1 and query('SELECT estado FROM public.subcampania WHERE id=16') == 'FINALIZADA_PARCIAL'
    reject('REEMPLAZAR_ADMINISTRADOR', replacement(3, 5, [(13, 1, 0)]), 'DESTINO_INACTIVO')
    confirmed(execute('REEMPLAZAR_ADMINISTRADOR', replacement(3, 13, [(13, 1, 0)])))
    assert effective(13) == 1 and permission(13, 3) == 'SIN_ACCESO'
    confirmed(execute('REEMPLAZAR_ADMINISTRADOR', replacement(2, 4, [(12, 1, 1)])))
    assert effective(12) == 1 and revision(12, 4) == '1'
    confirmed(execute('RETIRAR_PLANTADOR', payload(2, [(16, 2)])))
    passed('C09 cerrada/cancelada, entrante activo/ambas revisiones, entrante existente deduplicado')

    # Dos retiros concurrentes de los últimos dos contextuales: uno rechaza.
    for user in (14, 15):
        confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(user, [(19, 0)])))
    first, second = race(call_sql('RETIRAR_ADMINISTRADOR', payload(14, [(19, 1)]))[0],
                         call_sql('RETIRAR_ADMINISTRADOR', payload(15, [(19, 1)]))[0],
                         'dos retiros de últimos contextuales')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'ULTIMO_ADMINISTRADOR_CONTEXTUAL', second
    assert effective(19) == 1 and revision(19, 15) == '1'
    passed('concurrencia real: dos retiros conservan administrador efectivo e historia íntegra')

    # Baja primero: una designación que esperaba no agrega un ámbito a cuenta inactiva.
    first, second = race(call_sql('INACTIVAR_CUENTA', authority(16))[0],
                         call_sql('DESIGNAR_ADMINISTRADOR', payload(16, [(20, 0)]))[0],
                         'baja antes de designación')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'DESTINO_INACTIVO', second
    assert permission(20, 16) == 'SIN_ACCESO' and revision(20, 16) == '0'
    # Designación primero: baja descubre el nuevo ámbito y protege su último admin.
    first, second = race(call_sql('DESIGNAR_ADMINISTRADOR', payload(17, [(21, 0)]))[0],
                         call_sql('INACTIVAR_CUENTA', authority(17))[0],
                         'designación antes de baja')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'ULTIMO_ADMINISTRADOR_CONTEXTUAL', second
    assert query('SELECT activo FROM public.usuario WHERE id=17') == 't' and effective(21) == 1
    # Baja de un administrador y retiro del otro en el mismo ámbito.
    for user in (18, 19):
        confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(user, [(22, 0)])))
    first, second = race(call_sql('INACTIVAR_CUENTA', authority(18))[0],
                         call_sql('RETIRAR_ADMINISTRADOR', payload(19, [(22, 1)]))[0],
                         'baja versus retiro del otro administrador')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'ULTIMO_ADMINISTRADOR_CONTEXTUAL', second
    assert effective(22) == 1 and permission(22, 18) == 'ADMINISTRADOR_SUBCAMPANIA'
    passed('concurrencia real: baja/designación en ambos órdenes y baja/retiro sin cero efectivos')

    # Baja de último en uno de varios ámbitos rechaza la selección de cuentas completa.
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(20, [(23, 0), (24, 0)])))
    confirmed(execute('DESIGNAR_ADMINISTRADOR', payload(21, [(23, 0)])))
    reject('INACTIVAR_CUENTA', authority(20), 'ULTIMO_ADMINISTRADOR_CONTEXTUAL')
    assert effective(23) == 2 and effective(24) == 1
    confirmed(execute('REEMPLAZAR_ADMINISTRADOR', replacement(20, 22, [(24, 1, 0)])))
    confirmed(execute('INACTIVAR_CUENTA', authority(20)))
    assert permission(23, 20) == 'ADMINISTRADOR_SUBCAMPANIA' and effective(23) == 1
    assert query('SELECT revision_autoridad FROM public.usuario WHERE id=20') == '1'
    before = domain_state()
    confirmed(execute('INACTIVAR_CUENTA', authority(20, revision=1)))
    assert domain_state() == before
    reject('INACTIVAR_CUENTA', authority(20), 'REVISION_OBSOLETA')
    passed('baja verifica todos los ámbitos, conserva permisos/historia y no-op valida autoridad')

    # Autoridad global: invariantes, no-op, dos cambios por la misma revisión y actor degradado.
    reject('CAMBIAR_ROL_GLOBAL', authority(1, role='VOLUNTARIO'), 'ULTIMO_ADMIN_GLOBAL')
    reject('INACTIVAR_CUENTA', authority(1), 'ULTIMO_ADMIN_GLOBAL')
    role_key = str(uuid.uuid4())
    role_original = execute('CAMBIAR_ROL_GLOBAL', authority(23, role='ADMIN'), key=role_key)
    confirmed(role_original)
    before = domain_state()
    confirmed(execute('CAMBIAR_ROL_GLOBAL', authority(23, revision=1, role='ADMIN')))
    assert domain_state() == before
    reject('CAMBIAR_ROL_GLOBAL', authority(23, role='ADMIN'), 'REVISION_OBSOLETA')
    first, second = race(call_sql('CAMBIAR_ROL_GLOBAL', authority(24, role='GENERAL'))[0],
                         call_sql('CAMBIAR_ROL_GLOBAL', authority(24, role='VALIDADOR'))[0],
                         'dos cambios de autoridad con misma revisión')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'REVISION_OBSOLETA', second
    assert query("SELECT rol::text||':'||revision_autoridad FROM public.usuario WHERE id=24") == 'GENERAL:1'
    # Ambos globales intentan degradarse: después del primero, el otro es el último.
    first, second = race(call_sql('CAMBIAR_ROL_GLOBAL', authority(23, revision=1, role='VOLUNTARIO'), actor=23)[0],
                         call_sql('CAMBIAR_ROL_GLOBAL', authority(1, role='VOLUNTARIO'))[0],
                         'dos degradaciones de últimos ADMIN globales')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'ULTIMO_ADMIN_GLOBAL', second
    assert query("SELECT count(*) FROM public.usuario WHERE activo AND rol='ADMIN'") == '1'
    reject('CAMBIAR_ROL_GLOBAL', authority(24, revision=1, role='VALIDADOR'),
           'CAPACIDAD_INSUFICIENTE', actor=23)
    assert recovery('CAMBIAR_ROL_GLOBAL', role_key) == role_original
    passed('roles/baja separados, último ADMIN global, revisión concurrente y autoridad vigente')

    # Propiedad/replay tras pérdida de la facultad y cuenta inactiva no recupera.
    grant_key = str(uuid.uuid4())
    historical = execute('OTORGAR_PLANTADOR', payload(25, [(11, 0)]), actor=2, key=grant_key)
    confirmed(historical)
    confirmed(execute('REEMPLAZAR_ADMINISTRADOR', replacement(2, 26, [(11, 1, 0)])))
    before = domain_state()
    assert recovery('OTORGAR_PLANTADOR', grant_key, actor=2) == historical
    assert execute('OTORGAR_PLANTADOR', payload(25, [(11, 0)]), actor=2, key=grant_key) == historical
    assert domain_state() == before
    own_missing = recovery('OTORGAR_PLANTADOR', str(uuid.uuid4()), actor=1)
    foreign = recovery('OTORGAR_PLANTADOR', grant_key, actor=1)
    assert own_missing['http_status'] == foreign['http_status'] == 404
    assert own_missing['body']['error'] == foreign['body']['error']
    assert foreign['body']['error']['codigo'] == 'COMANDO_NO_CONFIRMADO'
    assert recovery('OTORGAR_PLANTADOR', grant_key, actor=16)['http_status'] == 403
    assert recovery('OTORGAR_PLANTADOR', grant_key, actor=16)['body']['error']['codigo'] == 'CUENTA_INACTIVA'
    reject('OTORGAR_PLANTADOR', payload(27, [(11, 0)]), 'CAPACIDAD_INSUFICIENTE', actor=2)
    serialized = json.dumps(historical)
    for private in ('contacto', 'auth_id', 'doc_identidad', 'stock', 'wallet', 'equipo', 'motivo'):
        assert private not in serialized, serialized
    passed('recuperación propia/replay tras retiro, ajeno indistinguible, inactivo rechazado y recibo mínimo')

    # Mismo UUID para otro actor/operación no es clave global accidental.
    confirmed(execute('OTORGAR_PLANTADOR', payload(28, [(25, 0)]), key=grant_key))
    confirmed(execute('RETIRAR_PLANTADOR', payload(28, [(25, 1)]), key=grant_key))
    assert query('SELECT count(*) FROM public.participacion_comando WHERE comando_id='
                 + literal(grant_key)) == '3'
    passed('identidad de comando por actor/operación/UUID, sin clave global ni duplicación de efecto')

    concurrent_key = str(uuid.uuid4())
    intent = payload(29, [(26, 0)])
    first, second = race(call_sql('OTORGAR_PLANTADOR', intent, key=concurrent_key)[0],
                         call_sql('OTORGAR_PLANTADOR', intent, key=concurrent_key)[0],
                         'misma clave/contenido en dos conexiones')
    assert first == second
    assert revision(26, 29) == '1'
    assert query('SELECT count(*) FROM public.participacion_comando WHERE comando_id='
                 + literal(concurrent_key)) == '1'
    assert query('SELECT count(*) FROM public.subcampania_historial WHERE participacion_comando_id='
                 '(SELECT id FROM public.participacion_comando WHERE comando_id=' + literal(concurrent_key) + ')') == '1'
    concurrent_key = str(uuid.uuid4())
    first, second = race(call_sql('OTORGAR_PLANTADOR', payload(35, [(26, 0)]), key=concurrent_key)[0],
                         call_sql('OTORGAR_PLANTADOR', payload(36, [(26, 0)]), key=concurrent_key)[0],
                         'misma clave con contenido distinto en dos conexiones')
    confirmed(first)
    assert second['body']['error']['codigo'] == 'COMANDO_REUTILIZADO'
    assert permission(26, 36) == 'SIN_ACCESO'
    passed('dos POST concurrentes: misma clave confirma una vez y contenido distinto no sobrescribe')

    # Fallo posterior a un efecto parcial: subtransacción revierte el conjunto,
    # el rechazo identificado es durable y un error desconocido es inconcluso.
    query("CREATE FUNCTION public.fixture_c_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
          "IF NEW.subcampania_id=29 THEN RAISE EXCEPTION 'fixture negocio después de primer ámbito' "
          "USING ERRCODE='PZ001',DETAIL='{\"http_status\":409,\"error\":{\"codigo\":\"ESTADO_NO_ADMITE_ACCESO\","
          "\"mensaje\":\"Rechazo sintetico tras efecto parcial.\",\"campos\":[],\"ambitos\":[],"
          "\"reintento\":\"NUEVA_CONFIRMACION\"}}'; END IF; RETURN NEW; END $$;"
          'CREATE TRIGGER fixture_c_failure BEFORE INSERT ON public.subcampania_permiso '
          'FOR EACH ROW EXECUTE FUNCTION public.fixture_c_failure();')
    failure_key = str(uuid.uuid4())
    failure = reject('OTORGAR_PLANTADOR', payload(38, [(28, 0), (29, 0)]),
                     'ESTADO_NO_ADMITE_ACCESO', key=failure_key)
    assert recovery('OTORGAR_PLANTADOR', failure_key)['body'] == failure['body']
    assert permission(28, 38) == 'SIN_ACCESO' and revision(28, 38) == '0'
    query('DROP TRIGGER fixture_c_failure ON public.subcampania_permiso; DROP FUNCTION public.fixture_c_failure();')
    assert execute('OTORGAR_PLANTADOR', payload(38, [(28, 0), (29, 0)]), key=failure_key) == failure
    query("CREATE FUNCTION public.fixture_c_unknown() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
          "RAISE EXCEPTION 'fixture infraestructura' USING ERRCODE='XX000'; END $$;"
          'CREATE TRIGGER fixture_c_unknown BEFORE INSERT ON public.subcampania_permiso '
          'FOR EACH ROW EXECUTE FUNCTION public.fixture_c_unknown();')
    before = domain_state()
    unknown_sql, unknown_key = call_sql('OTORGAR_PLANTADOR', payload(39, [(28, 0)]))
    query(unknown_sql, 'fixture infraestructura')
    assert domain_state() == before
    unknown = recovery('OTORGAR_PLANTADOR', unknown_key)
    assert unknown['http_status'] == 404 and unknown['body']['resultado_concluyente'] is False
    query('DROP TRIGGER fixture_c_unknown ON public.subcampania_permiso; DROP FUNCTION public.fixture_c_unknown();')
    confirmed(execute('OTORGAR_PLANTADOR', payload(39, [(28, 0)]), key=unknown_key))
    passed('subtransacción: fallo tras efecto parcial revierte todo; desconocido no fabrica rechazo y misma clave converge')
    lock_timeout_case()

    # Preparación del motor compartido tiene lectura inconclusa, sin fingir EN_CURSO.
    prepared_key = str(uuid.uuid4())
    query("SET ROLE service_role; INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,estado,subcampania_preparacion_id) "
          "VALUES(1,'REGISTRAR_PLANTACION_INICIAL'," + literal(prepared_key) + ",'PREPARADO',28)")
    pending = recovery('REGISTRAR_PLANTACION_INICIAL', prepared_key)
    assert pending['http_status'] == 202
    assert pending['body'] == {'comando_id': prepared_key, 'operacion': 'REGISTRAR_PLANTACION_INICIAL',
                               'estado': 'SIN_RESULTADO', 'resultado': None, 'error': None, 'finalizado_en': None}
    # Conservamos esa preparación sintética; C no incluye su cancelación ni cargas.
    passed('GET preparación compartida es 202/SIN_RESULTADO e inconcluso, sin estado EN_CURSO ficticio')

    # La baja no borra filas de gestión históricas ni deriva acceso global inactivo.
    inactive_member = read('pa_miembros_participacion_leer', "1,'fixture-admin',22,NULL,101")
    former = next(row for row in inactive_member if row['usuario_id'] == '18')
    assert not former['acceso_global'] and former['permiso_contextual'] == 'ADMINISTRADOR_SUBCAMPANIA'
    inspected = json.loads(query("SET ROLE service_role; SELECT public.pa_autoridad_leer(1,'fixture-admin',24)"))
    assert inspected['http_status'] == 200
    assert set(inspected['body']['data']) == {'usuario_id', 'nombre', 'rol_global', 'activo', 'revision_autoridad'}
    assert inspected['body']['data']['revision_autoridad'] == '1'
    before_authority = query("SELECT rol::text||':'||activo||':'||revision_autoridad FROM public.usuario WHERE id=24")
    query("SET ROLE service_role; SELECT public.pa_perfil_actualizar(24,'fixture-c-24',true,'Perfil actualizado',"
          "false,NULL,false,NULL,NULL,'{}'::jsonb)")
    assert query("SELECT rol::text||':'||activo||':'||revision_autoridad FROM public.usuario WHERE id=24") == before_authority
    passed('miembro inactivo conserva gestión mínima, GET autoridad privado y perfil no muta autoridad')

    # Los roles públicos no alcanzan datos/entrypoints. service_role es frontera
    # privada privilegiada: INVOKER necesita escritura; su SQL ajeno no acredita continuidad.
    for role in ('anon', 'authenticated', 'pa_int02b_public_probe'):
        for table in ('participacion_comando', 'subcampania_permiso_revision', 'subcampania_permiso'):
            query('SET ROLE ' + role + '; SELECT * FROM public.' + table + ' LIMIT 0', 'permission denied')
        sql, _key = call_sql('OTORGAR_PLANTADOR', payload(29, [(26, 0)]))
        query(sql.replace('SET ROLE service_role;', 'SET ROLE ' + role + ';'), 'permission denied')
        query('SET ROLE ' + role + "; SELECT public.pa_comando_recuperar(1,'fixture-admin','OTORGAR_PLANTADOR',"
              + literal(grant_key) + ')', 'permission denied')
    before = domain_state()
    query("BEGIN; SET LOCAL ROLE service_role; UPDATE public.usuario SET rol='ADMIN' WHERE id=25; "
          'UPDATE public.usuario SET activo=false WHERE id=25; ROLLBACK;')
    assert domain_state() == before
    evidence['frontera_service_role'] = {
        'privada_privilegiada': True, 'sql_autoridad_directo_permitido': True,
        'verificacion': 'UPDATE rol/activo de fixture con ROLLBACK',
        'garantia': 'RPC cooperativas; importaciones/SQL directos privados deben respetar la misma disciplina',
        'security_invoker_conservado': True}
    passed('ACL SQL reales PUBLIC/anon/authenticated; límite service_role privilegiado INVOKER registrado sin efectos')

    before = domain_state()
    script(migrations[4])
    script(migrations[5])
    assert domain_state() == before
    assert query('SELECT count(*) FROM public.subcampania_equipo') == '2'
    assert query('SELECT count(*) FROM public.registro_plantacion') == '1'
    assert query("SELECT count(*) FROM public.subcampania_historial WHERE metadata ? 'legado' "
                 "OR metadata ? 'equipo_historico'") == '2'
    assert query("SELECT count(*) FROM public.participacion_comando WHERE estado='PREPARADO'") == '1'
    passed('reinstalación C conserva terminales, historia/equipo/registro legados y no crea EN_CURSO')
    evidence['conteos'] = json.loads(query("SELECT jsonb_build_object('comandos',"
                                        '(SELECT count(*) FROM public.participacion_comando),'
                                        "'vigencias',(SELECT count(*) FROM public.subcampania_permiso),"
                                        "'historial',(SELECT count(*) FROM public.subcampania_historial))"))
    evidence['sha256'] = {path: hashlib.sha256((root / path).read_bytes()).hexdigest()
                          for path in migrations + ['test/db/pa-int02c-assertions.py',
                                                     'scripts/qa/pa-int02c-db-test.py',
                                                     'test/db/pa-int02b-fixture.sql',
                                                     'test/db/pa-int02c-fixture.sql',
                                                     'migrations/064_pa_int02a_identidad_perfil.sql']}


try:
    main()
    evidence['estado'] = 'CORRECTO'
except BaseException as error:
    evidence['estado'] = 'FALLIDO'
    evidence['fallo'] = str(error)
    raise
finally:
    target = Path(args.evidence)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
