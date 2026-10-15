"""Casos INT02-B, exclusivamente en el cluster propio del runner; sin .env."""
import argparse
import copy
import json
from pathlib import Path
import subprocess
import uuid

parser = argparse.ArgumentParser()
for name in ('socket', 'cluster', 'port', 'database', 'psql'):
    parser.add_argument('--' + name, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
assert args.database == 'pa_int02b_ensayo'
assert Path(args.socket).resolve().parent == Path(args.cluster).resolve().parent
assert Path(args.cluster).resolve().parent.name.startswith('pa-int02b-')
base = [args.psql, '-X', '-qAt', '-h', args.socket, '-p', args.port,
        '-U', 'postgres', '-d', args.database, '-v', 'ON_ERROR_STOP=1']
cases = []


def query(sql, error=None):
    result = subprocess.run(base, input=sql, text=True, capture_output=True, timeout=35)
    if error:
        assert result.returncode != 0 and error in result.stderr, result.stderr
        return result.stderr
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


assert Path(query('SHOW data_directory')).resolve() == Path(args.cluster).resolve()
assert query("SELECT fixture FROM public.pa_int02b_fixture_marker") == 'SINTETICO_AISLADO_INT02B'


def script(path):
    result = subprocess.run(base + ['-f', str(root / path)], text=True,
                            capture_output=True, timeout=35)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def snap(table, omit=()):
    rows = json.loads(query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public."
                            + table + ' t'))
    return [{k: v for k, v in row.items() if k not in omit} for row in rows]


def state():
    return [snap(t) for t in ['participacion_comando', 'subcampania_permiso',
                             'subcampania_historial', 'subcampania']]+[query(
        "SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY subcampania_id,usuario_id),'[]') "
        'FROM public.subcampania_permiso_revision t')]


def passed(name):
    cases.append(name)
    print('OK: ' + name, flush=True)


previous = {t: snap(t) for t in ['usuario', 'subcampania_equipo', 'registro_plantacion',
                                 'subcampania_historial', 'subcampania']}
migrations = ['migrations/068_pa_participacion_comando.sql', 'migrations/069_pa_int02b_eventos_acceso.sql',
              'migrations/070_pa_int02b_permisos_contextuales.sql', 'migrations/071_pa_int02b_bootstrap_controlado.sql']
for path in migrations:
    script(path)
for path in migrations:
    script(path)
for table in previous:
    omit = ('participacion_comando_id',) if table == 'subcampania_historial' else (
        ('participacion_inicializada_en', 'participacion_inicializada_por') if table == 'subcampania' else ())
    assert snap(table, omit) == previous[table], table
assert query('SELECT count(*) FROM public.subcampania_permiso') == '0'
passed('instalacion aditiva 068–071 y segunda ejecucion sin asignaciones ni cambios legados')

assert query("SELECT count(*) FROM pg_constraint WHERE conrelid IN "
             "('public.subcampania_permiso'::regclass,'public.subcampania_permiso_revision'::regclass) "
             "AND contype='f' AND (confdeltype<>'r' OR confupdtype<>'r' OR NOT convalidated)") == '0'
passed('FK nuevas validadas RESTRICT en ambas direcciones')
before = state()
assert query('SELECT coalesce((SELECT revision FROM public.subcampania_permiso_revision '
             'WHERE subcampania_id=11 AND usuario_id=3),0)') == '0'
assert state() == before
passed('ausencia revision 0 por lectura sin escritura')


def person(user=2, role='ADMINISTRADOR_SUBCAMPANIA'):
    return {'usuario_id': str(user), 'permiso_propuesto': role, 'revision_esperada': '0',
            'justificacion': 'Correspondencia sintetica revisada para ensayo aislado',
            'fuente_legada': 'FIXTURE sintetico, no autorizacion de personas reales',
            'decision_revisor': {'estado': 'APROBADA', 'revisor': 'Pablo',
                                 'referencia': 'DECISION SINTETICA NO REAL'}}


def manifest(scope=17, status='ACTIVA', people=None):
    return {'version': 1, 'ambitos': [{'subcampania_id': str(scope), 'estado_esperado': status,
                                     'correspondencias': people or [person()]}]}


def call(m, key=None, actor=1, error=None):
    key = key or str(uuid.uuid4())
    payload = json.dumps(m, ensure_ascii=False).replace("'", "''")
    sql = ("SET ROLE service_role; SELECT public.pa_inicializar_participacion_legada("
           + str(actor) + ",'" + key + "','" + payload + "'::jsonb)")
    if error:
        before = state()
        query(sql, error)
        assert state() == before, 'Rechazo con cambios parciales: ' + error
        passed('rechazo sin cambios: ' + error)
        return
    return json.loads(query(sql))


call(manifest(17, people=[person(5)]), error='PA_BOOTSTRAP_DESTINO_INACTIVO')
call(manifest(17, people=[person(1)]), error='PA_BOOTSTRAP_ADMIN_GLOBAL_ES_DERIVADO')
call(manifest(17), actor=2, error='PA_BOOTSTRAP_REQUIERE_ADMIN_GLOBAL')
call(manifest(17), actor=7, error='PA_BOOTSTRAP_ACTOR_INACTIVO')
call(manifest(9999), error='PA_BOOTSTRAP_AMBITO_INEXISTENTE')
call(manifest(17, people=[person(9999)]), error='PA_BOOTSTRAP_USUARIO_INEXISTENTE')
call(manifest(30), error='PA_BOOTSTRAP_ESTADO_AMBITO_CAMBIADO')
call(manifest(17, 'BORRADOR'), error='PA_BOOTSTRAP_ESTADO_AMBITO_CAMBIADO')
call(manifest(15, 'PAUSADA'), error='PA_MANIFEST_AMBITO_INVALIDO')
call(manifest(12, 'COMPLETADA', [person(), person(3, 'PLANTADOR')]),
     error='PA_BOOTSTRAP_CERRADO_NO_ADMITE_PLANTADORES')
call(manifest(17, people=[person(3, 'PLANTADOR')]), error='PA_BOOTSTRAP_REQUIERE_ADMINISTRADOR_CONTEXTUAL')
call(manifest(17, people=[person(), person()]), error='PA_MANIFEST_PERSONA_DUPLICADA')
m = manifest()
m['ambitos'] *= 2
call(m, error='PA_MANIFEST_AMBITO_DUPLICADO')
m = manifest()
m['ambitos'][0]['correspondencias'][0]['decision_revisor']['estado'] = 'PENDIENTE'
call(m, error='PA_MANIFEST_CORRESPONDENCIA_NO_REVISADA_O_INVALIDA')
m = manifest()
m['ambitos'].append(manifest(18, people=[person(5)])['ambitos'][0])
call(m, error='PA_BOOTSTRAP_DESTINO_INACTIVO')

seed = json.loads((root / 'test/db/fixtures/pa-int02b-manifest-sintetico.json').read_text())
key = str(uuid.uuid4())
receipt = call(seed, key)
assert len(receipt['ambitos']) == 5
assert query('SELECT count(*) FROM public.subcampania_permiso') == '7'
assert query('SELECT count(*) FROM public.subcampania_historial WHERE participacion_comando_id IS NOT NULL') == '5'
assert query('SELECT count(*) FROM public.participacion_comando') == '1'
assert query("SELECT count(*) FROM public.subcampania_permiso p JOIN public.usuario u ON u.id=p.usuario_id "
             "WHERE p.revocado_en IS NULL AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' AND u.activo "
             'AND p.subcampania_id=11') == '1'
assert query("SELECT count(*) FROM public.subcampania_permiso p JOIN public.usuario u ON u.id=p.usuario_id "
             "WHERE p.revocado_en IS NULL AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' AND u.activo "
             'AND p.subcampania_id=12') == '2'
assert query('SELECT count(*) FROM public.subcampania_permiso WHERE usuario_id IN (1,5,6,7)') == '0'
assert query('SELECT participacion_inicializada_en IS NULL FROM public.subcampania WHERE id=17') == 't'
passed('bootstrap acotado abierto/cerrados, un/dos administradores efectivos, ADMIN global y coordinador sin filas')
assert query("BEGIN; UPDATE public.usuario SET activo=false WHERE id=2; SELECT count(*) "
             "FROM public.subcampania_permiso p JOIN public.usuario u ON u.id=p.usuario_id "
             "WHERE p.subcampania_id=11 AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' "
             "AND p.revocado_en IS NULL AND u.activo; ROLLBACK;") == '0'
passed('administrador contextual con cuenta inactiva no cuenta; fixture no acredita proteccion de baja C/D')
before = state()
reordered = copy.deepcopy(seed)
reordered['ambitos'].reverse()
for scope in reordered['ambitos']:
    scope['correspondencias'].reverse()
assert call(reordered, key) == receipt and state() == before
passed('repeticion mismo manifest en otro orden recupera recibo sin duplicados')
m = copy.deepcopy(seed)
m['ambitos'][0]['correspondencias'][0]['justificacion'] = 'Otra decision sintetica'
call(m, key, error='PA_BOOTSTRAP_COMANDO_REUTILIZADO')
call(seed, error='PA_BOOTSTRAP_AMBITO_YA_INICIALIZADO_O_CON_HISTORIA')


def reject(sql, error, name):
    before = state()
    query('BEGIN; ' + sql + '; ROLLBACK;', error)
    assert state() == before, name
    passed(name)


permit = ('INSERT INTO public.subcampania_permiso(subcampania_id,usuario_id,rol_contextual,otorgado_por,comando_otorgamiento_id) '
          "VALUES(11,3,'PLANTADOR',1,(SELECT id FROM public.participacion_comando LIMIT 1))")
reject(permit, 'subcampania_permiso_un_vigente_idx', 'duplicado vigente rechazado')
reject(permit.replace("'PLANTADOR'", "'COORDINADOR'"), 'violates check constraint', 'catalogo contextual cerrado')
reject(permit.replace('VALUES(11,3,', 'VALUES(11,9999,'), 'violates foreign key', 'FK usuario inexistente rechazada')
reject(permit.replace('VALUES(11,3,', 'VALUES(17,3,'), 'subcampania_permiso_revision_fk', 'FK revision persona/ambito requerida')
reject("UPDATE public.subcampania_permiso SET revocado_en=clock_timestamp() WHERE subcampania_id=11 AND usuario_id=3",
       'subcampania_permiso_retiro_chk', 'retiro incompleto rechazado')
reject("UPDATE public.subcampania_permiso SET revocado_en=otorgado_en-interval '1 second',revocado_por=1,"
       'comando_retiro_id=comando_otorgamiento_id WHERE subcampania_id=11 AND usuario_id=3',
       'subcampania_permiso_retiro_chk', 'retiro anterior al otorgamiento rechazado')
reject('UPDATE public.subcampania_permiso_revision SET revision=revision+2 WHERE subcampania_id=11 AND usuario_id=3',
       'PA_REVISION_DEBE_AVANZAR_UNA_VEZ', 'revision creciente una vez por cambio')
reject('DELETE FROM public.subcampania_permiso_revision WHERE subcampania_id=11 AND usuario_id=3',
       'PA_REVISION_ESTABLE_NO_BORRABLE', 'revision estable no borrable')
reject('UPDATE public.subcampania SET participacion_inicializada_por=1 WHERE id=17',
       'subcampania_participacion_inicializada_chk', 'marca inicializacion pareja consistente')
reject('UPDATE public.subcampania SET participacion_inicializada_por=2 WHERE id=11',
       'PA_INICIALIZACION_INMUTABLE', 'marca inicializacion inmutable')
reject("INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial) VALUES(11,'PERMISO_OTORGADO')",
       'subcampania_historial_acceso_chk', 'evento acceso requiere comando y antes/despues')
reject('INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,estado_origen,estado_destino,actor_user_id,participacion_comando_id,metadata) '
       "SELECT subcampania_id,tipo_historial,estado_origen,estado_destino,actor_user_id,participacion_comando_id,metadata FROM public.subcampania_historial WHERE participacion_comando_id IS NOT NULL LIMIT 1",
       'subcampania_historial_comando_acceso_idx', 'un evento de acceso por ambito/comando')
reject('UPDATE public.subcampania_historial SET metadata=metadata WHERE id=1',
       'append-only', 'historial anterior append-only')
reject("UPDATE public.participacion_comando SET resultado='{}'", 'PA_COMANDO_TERMINAL_INMUTABLE', 'recibo terminal inmutable')
reject('DELETE FROM public.participacion_comando', 'PA_COMANDO_CONSERVACION_OBLIGATORIA', 'comando conserva tombstone')
prepared = ("INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,estado,subcampania_preparacion_id) "
            "VALUES(1,'REGISTRAR_PLANTACION_INICIAL','11111111-1111-1111-1111-111111111111','PREPARADO',17)")
reject(prepared.replace("'PREPARADO'", "'EN_CURSO'"), 'violates check constraint', 'comando no admite EN_CURSO ficticio')
reject(prepared.replace("'REGISTRAR_PLANTACION_INICIAL'", "'OPERACION_NO_REGISTRADA'"),
       'violates check constraint', 'catalogo de comandos cerrado')
reject(prepared.replace(",17)", ",9999)"), 'participacion_comando_preparacion_fk', 'scope comando exige FK valida')
reject(prepared + "; UPDATE public.participacion_comando SET huella='a'::bytea WHERE estado='PREPARADO'",
       'violates check constraint', 'huella comando SHA256 y ciclo coherente')
reject(prepared + "; UPDATE public.participacion_comando SET resultado='{}' WHERE estado='PREPARADO'",
       'participacion_comando_ciclo_ck', 'PREPARADO no tiene recibo terminal')
reject(prepared + "; UPDATE public.participacion_comando SET subcampania_preparacion_id=18 WHERE estado='PREPARADO'",
       'PA_COMANDO_IDENTIDAD_INMUTABLE', 'scope preparacion inmutable')

# Transiciones SINTETICAS, no motor de gestion C ni prueba de continuidad concurrente.
def change(revoke):
    operation = 'RETIRAR_PLANTADOR' if revoke else 'OTORGAR_PLANTADOR'
    command = str(uuid.uuid4())
    pre = '1' if revoke else '2'
    post = '2' if revoke else '3'
    event = 'PERMISO_RETIRADO' if revoke else 'PERMISO_OTORGADO'
    if revoke:
        effect = "UPDATE public.subcampania_permiso SET revocado_en=clock_timestamp(),revocado_por=1,comando_retiro_id=c WHERE subcampania_id=11 AND usuario_id=3 AND revocado_en IS NULL;"
    else:
        effect = "INSERT INTO public.subcampania_permiso(subcampania_id,usuario_id,rol_contextual,otorgado_por,comando_otorgamiento_id) VALUES(11,3,'PLANTADOR',1,c);"
    query("SET ROLE service_role; DO $$ DECLARE c BIGINT; BEGIN "
          'INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,resultado,http_terminal,creado_en,finalizado_en) '
          + "VALUES(1,'" + operation + "','" + command + "',sha256('fixture'::bytea),'CONFIRMADO','{\"tipo\":\"ACCESO\"}',200,now(),now()) RETURNING id INTO c;"
          + effect + ' UPDATE public.subcampania_permiso_revision SET revision=revision+1,actualizado_en=clock_timestamp(),actualizado_por=1 WHERE subcampania_id=11 AND usuario_id=3;'
          + ' INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,estado_origen,estado_destino,actor_user_id,participacion_comando_id,metadata) '
          + "VALUES(11,'" + event + "','ACTIVA','ACTIVA',1,c,jsonb_build_object('anterior',jsonb_build_array(jsonb_build_object('usuario_id','3','revision','" + pre + "')),'nuevo',jsonb_build_array(jsonb_build_object('usuario_id','3','revision','" + post + "')))); END $$;")


change(True)
before = state()
assert call(seed, key) == receipt and state() == before
assert query('SELECT count(*) FROM public.subcampania_permiso WHERE subcampania_id=11 AND usuario_id=3 AND revocado_en IS NULL') == '0'
passed('replay despues de retiro no reactiva permiso ni reinicia revision')
change(False)
assert query('SELECT revision FROM public.subcampania_permiso_revision WHERE subcampania_id=11 AND usuario_id=3') == '3'
assert query('SELECT count(*) FROM public.subcampania_permiso WHERE subcampania_id=11 AND usuario_id=3') == '2'
reject('UPDATE public.subcampania_permiso SET revocado_en=NULL,revocado_por=NULL,comando_retiro_id=NULL WHERE revocado_en IS NOT NULL',
       'PA_VIGENCIA_INMUTABLE_O_CERRADA', 'vigencia cerrada nunca se reabre')
passed('retiro y rehabilitacion con nueva vigencia; historia y revision 1→2→3 conservadas')

denials = 0
for role in ['anon', 'authenticated', 'pa_int02b_public_probe']:
    for table in ['participacion_comando', 'subcampania_permiso_revision', 'subcampania_permiso', 'subcampania_historial']:
        column = 'revision' if table == 'subcampania_permiso_revision' else 'id'
        for sql in ['SELECT * FROM public.' + table + ' LIMIT 0',
                    'INSERT INTO public.' + table + ' DEFAULT VALUES',
                    'UPDATE public.' + table + ' SET ' + column + '=' + column + ' WHERE false',
                    'DELETE FROM public.' + table + ' WHERE false',
                    'TRUNCATE public.' + table]:
            query('SET ROLE ' + role + '; ' + sql, 'permission denied')
            denials += 1
    for sql in ["SELECT public.pa_inicializar_participacion_legada(1,'00000000-0000-0000-0000-000000000001','{}')",
                "SELECT public.pa_inicializar_participacion_legada('fixture')",
                'UPDATE public.subcampania SET participacion_inicializada_en=now() WHERE false']:
        query('SET ROLE ' + role + '; ' + sql, 'permission denied')
        denials += 1
    for table in ['participacion_comando', 'subcampania_permiso', 'subcampania_historial']:
        query('SET ROLE ' + role + "; SELECT nextval(pg_get_serial_sequence('public." + table + "','id'))", 'permission denied')
        denials += 1
assert query("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' "
             "AND p.proname IN ('pa_permiso_revision_proteger','pa_permiso_vigencia_proteger',"
             "'pa_participacion_marca_proteger','pa_participacion_comando_proteger','fn_subcampania_historial_prevent_mutation') "
             "AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))") == '0'
passed(str(denials) + ' denegaciones SQL reales PUBLIC/anon/authenticated (tablas, bootstrap/sobrecarga, marca, secuencias)')

# Defensa ante drift adversario en una segunda instalacion. Exclusivamente fixture.
query('CREATE ROLE fixture_heredado; GRANT SELECT ON public.subcampania_permiso TO fixture_heredado; GRANT fixture_heredado TO anon;')
before = state()
query((root / migrations[2]).read_text(), 'PA_INT02B_PRIVILEGIO_HEREDADO')
assert state() == before
query('REVOKE fixture_heredado FROM anon; REVOKE SELECT ON public.subcampania_permiso FROM fixture_heredado; DROP ROLE fixture_heredado;')
passed('ACL heredada detectada: migracion aborta sin cambios')
query('CREATE VIEW public.fixture_vista_privada AS SELECT * FROM public.subcampania_permiso; GRANT SELECT ON public.fixture_vista_privada TO anon;')
before = state()
query((root / migrations[2]).read_text(), 'PA_INT02B_VISTA_PRIVADA_PUBLICA')
assert state() == before
query('DROP VIEW public.fixture_vista_privada;')
passed('vista que elude frontera privada detectada: migracion aborta')
query('CREATE POLICY fixture_publica ON public.subcampania_permiso FOR SELECT TO anon USING (true);')
before = state()
query((root / migrations[2]).read_text(), 'PA_INT02B_POLITICA_PUBLICA_INCOMPATIBLE')
assert state() == before
query('DROP POLICY fixture_publica ON public.subcampania_permiso;')
passed('politica RLS publica incompatible detectada: migracion aborta')

before = state()
for path in migrations:
    script(path)
assert state() == before
for table in ['usuario', 'subcampania_equipo', 'registro_plantacion']:
    assert snap(table) == previous[table]
assert snap('subcampania_historial', ('participacion_comando_id',))[:2] == previous['subcampania_historial']
assert snap('subcampania', ('participacion_inicializada_en', 'participacion_inicializada_por')) == previous['subcampania']
script('scripts/sql/pa-int02b-catalog-preflight.sql')
remote_state = json.loads(script('scripts/sql/pa-int02b-estado.sql'))
assert remote_state['solo_lectura'] == 'on' and len(remote_state['relaciones']) == 4
assert all(not f['anon_ejecuta'] and not f['authenticated_ejecuta'] for f in remote_state['funciones'])
proposal = json.loads(script('scripts/sql/pa-int02b-manifest-propuesta.sql'))
assert proposal['estado'] == 'PROPUESTA_SIN_REVISAR_NO_APLICABLE'
assert all(row['decision_revisor'] == 'PENDIENTE' and row['permiso_propuesto'] is None
           for row in proposal['correspondencias_pendientes'] + proposal['excepciones'])
passed('export manifest versionado de solo lectura sin permisos inferidos ni decisiones aprobadas')
passed('reinstalacion tras bootstrap/retiro: sin alteracion; roles/equipo/perfiles/hechos/historia legados intactos; catalogo ejecutable')
print(json.dumps({'entrega': 'PA-T-INT02-B', 'casos_aprobados': len(cases),
                  'denegaciones_reales': denials, 'entorno': 'PostgreSQL sintetico aislado',
                  'limites': ['sin catalogo remoto', 'sin transicion real', 'sin HTTP/motor C',
                             'sin concurrencia ultimo administrador C/D', 'sin replay completo 001–067'],
                  'casos': cases}, ensure_ascii=False))
