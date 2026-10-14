"""Conciliación + 064 con cuentas sintéticas. Solo socket local; nunca carga .env."""
import argparse
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--database', required=True)
args = parser.parse_args()
if not re.fullmatch(r'pa_int02a_[a-z0-9_]+', args.database):
    raise SystemExit('Solo bases de fixture pa_int02a_*')
root = Path(__file__).resolve().parents[2]
base = ['psql', '-X', '-qAt', '-h', '/tmp', '-p', '6543', '-U', 'postgres',
        '-d', args.database, '-v', 'ON_ERROR_STOP=1']


def query(sql):
    return subprocess.check_output(base + ['-c', sql], text=True).strip()


if query("SELECT to_regclass('public.pa_int02a_conciliacion_marker') IS NOT NULL") != 't':
    raise SystemExit('Falta marcador de base sintética de conciliación')


def script(path, error=None):
    result = subprocess.run(base + ['-f', str(root / path)], text=True, capture_output=True)
    if error:
        assert result.returncode != 0 and error in result.stderr, result
        return
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout) if result.stdout.strip() else None


def snapshot(table):
    return json.loads(query('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),\'[]\'::jsonb) '
                            'FROM public.' + table + ' t'))


def reject(error):
    before = snapshot('usuario')
    script('scripts/sql/pa-int02a-conciliar-usuarios-legados.sql', error)
    assert snapshot('usuario') == before, 'Rechazo produjo cambios'


initial = snapshot('usuario')
history = snapshot('pa_int02a_historia_fixture')
manifest = script('scripts/sql/pa-int02a-conciliacion-auth-id.sql')
assert manifest['cuentas_afectadas'] == 8 and manifest['duplicados_no_vacios'] == 0
assert manifest['cuentas_con_credenciales'] == 1
assert {m['usuario_id'] for m in manifest['manifest']} == {str(i) for i in range(1, 9)}
assert {m['estado_auth_id'] for m in manifest['manifest']} == {'VACIO'}
assert manifest['manifest'][0]['requiere_revision_identidad'] is True
reject('CUENTA_CON_CREDENCIAL_REQUIERE_REVISION')
query('DELETE FROM public.usuario_credencial WHERE id=1')  # Solo dato sintético.
query('INSERT INTO public.usuario_credencial VALUES(39,39)')

query("UPDATE public.usuario SET auth_id='fixture_38' WHERE id=39")
manifest = script('scripts/sql/pa-int02a-conciliacion-auth-id.sql')
assert manifest['cuentas_afectadas'] == 10 and manifest['duplicados_no_vacios'] == 1
reject('IDENTIDAD_DUPLICADA_NO_VACIA_REQUIERE_REVISION')
query("UPDATE public.usuario SET auth_id='fixture_39' WHERE id=39")

query("UPDATE public.usuario SET rol='ADMIN' WHERE id=1")
reject('MANIFEST_IDENTIDAD_CAMBIADO_REQUIERE_REVISION')
query("UPDATE public.usuario SET rol='GENERAL' WHERE id=1")
query('UPDATE public.usuario SET auth_id=NULL WHERE id=39')
reject('IDENTIDAD_AFECTADA_FUERA_DEL_MANIFEST')
query("UPDATE public.usuario SET auth_id='fixture_39' WHERE id=39")
query("UPDATE public.usuario SET auth_id='pa_legacy_1' WHERE id=39")
reject('IDENTIFICADOR_LEGADO_OCUPADO')
query("UPDATE public.usuario SET auth_id='fixture_39' WHERE id=39")

# Una FK a la identidad textual requiere conciliación particular, aun sin passkeys.
query("UPDATE public.usuario SET auth_id='temporal_'||id WHERE id<=7")
query('UPDATE public.usuario SET auth_id=NULL WHERE id=8')
query('ALTER TABLE public.usuario ADD CONSTRAINT fixture_auth_uq UNIQUE(auth_id)')
query('CREATE TABLE public.pa_int02a_fk_auth_fixture(auth_ref TEXT REFERENCES public.usuario(auth_id))')
manifest = script('scripts/sql/pa-int02a-conciliacion-auth-id.sql')
assert len(manifest['fk_que_referencian_auth_id']) == 1
reject('FK_AUTH_ID_REQUIERE_REVISION')
query('DROP TABLE public.pa_int02a_fk_auth_fixture')
query('ALTER TABLE public.usuario DROP CONSTRAINT fixture_auth_uq')
query("UPDATE public.usuario SET auth_id='' WHERE id<=8")

before_credentials = snapshot('usuario_credencial')
success = script('scripts/sql/pa-int02a-conciliar-usuarios-legados.sql')
assert success['resultado'] == 'CONCILIACION_CONFIRMADA' and success['cuentas_actualizadas'] == 8
assert {m['usuario_id'] for m in success['manifest']} == {str(i) for i in range(1, 9)}
after = snapshot('usuario')
for old, new in zip(initial, after):
    assert new['auth_id'] == ('pa_legacy_' + str(old['id']) if old['id'] <= 8 else old['auth_id'])
    assert {k: v for k, v in new.items() if k != 'auth_id'} == {
        k: v for k, v in old.items() if k != 'auth_id'}, 'Cambió perfil, PK o autoridad'
assert snapshot('usuario_credencial') == before_credentials
assert snapshot('pa_int02a_historia_fixture') == history
repeat = script('scripts/sql/pa-int02a-conciliar-usuarios-legados.sql')
assert repeat['cuentas_actualizadas'] == 0 and repeat['manifest'] == []
assert snapshot('usuario') == after

script('migrations/064_pa_int02a_identidad_perfil.sql')
state = script('scripts/sql/pa-int02a-estado-aplicado.sql')
assert state['controles_datos']['cuentas'] == 39
assert state['controles_datos']['auth_id_nulos_o_vacios'] == 0 and state['auth_id_duplicados'] == 0
assert state['roles'] == [{'rol': 'ADMIN', 'cuentas': 5}, {'rol': 'GENERAL', 'cuentas': 32},
                          {'rol': 'VOLUNTARIO', 'cuentas': 2}]
assert len(state['rpc_esperadas']) == 5 and len(state['sobrecargas_actuales']) == 5
assert all(r['existe'] and r['argumentos_coinciden'] and r['huella_textual_coincide']
           for r in state['rpc_esperadas'])
assert all(not r['insert'] and not r['update'] for r in state['privilegios_efectivos']
           if r['tabla'] == 'usuario' and r['rol'] in ('anon', 'authenticated'))
for old, new in zip(after, snapshot('usuario')):
    assert all(new[k] == v for k, v in old.items()), '064 alteró datos previos'
assert snapshot('usuario_credencial') == before_credentials
assert snapshot('pa_int02a_historia_fixture') == history
actor = json.loads(query("SET ROLE service_role; SELECT public.pa_actor_verificar('pa_legacy_1')"))
assert actor == {'usuario_id': '1', 'rol': 'GENERAL', 'activo': True}
print('OK: manifest acotado, seis rechazos sin cambios, ocho identidades conciliadas, repetición vacía y 064; '
      '39 cuentas, roles 5/32/2, perfiles, historia y credenciales conservados')
