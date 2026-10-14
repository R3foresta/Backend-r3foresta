"""Ensayo de 065 en el fixture sintético local. Nunca carga .env."""
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


def script(path):
    result = subprocess.run(base + ['-f', str(root / path)], text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def snapshot():
    return query("SELECT jsonb_build_object('usuario',"
                 "(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.usuario u),"
                 "'historia',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM public.pa_int02a_historia_fixture h),"
                 "'credenciales',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.usuario_credencial c))")


query('GRANT TRUNCATE, REFERENCES, TRIGGER ON public.usuario TO anon,authenticated')
query('GRANT REFERENCES(auth_id) ON public.usuario TO PUBLIC')
if int(query("SHOW server_version_num")) >= 170000:
    query('GRANT MAINTAIN ON public.usuario TO anon,authenticated')
before = snapshot()
state = script('scripts/sql/pa-int02a-estado-aplicado.sql')
assert all(p['truncate'] and p['references'] and p['trigger'] for p in state['privilegios_tabla']
           if p['tabla'] == 'usuario' and p['rol'] in ('anon', 'authenticated'))
result = script('migrations/065_pa_int02a_usuario_privilegios_residuales.sql')
assert result['resultado'] == 'PERMISOS_RESIDUALES_CONFIRMADOS' and result['cuentas'] == 39
assert snapshot() == before, '065 cambió datos, autoridad, historia o credenciales'
for role in result['usuario_privilegios']:
    if role['rol'] in ('anon', 'authenticated'):
        assert role['select'] is True
        assert all(role[p] is False for p in ('insert', 'update', 'delete', 'truncate', 'references', 'trigger'))
        assert role['maintain'] in (False, None)
    else:
        assert role['insert'] and role['update'] and role['delete'] and role['truncate']
repeat = script('migrations/065_pa_int02a_usuario_privilegios_residuales.sql')
assert repeat['usuario_privilegios'] == result['usuario_privilegios']
assert snapshot() == before

# Probar denegaciones reales como roles SQL, dentro de transacciones que se revierten.
query("CREATE OR REPLACE FUNCTION public.pa_int02a_fixture_trigger() RETURNS trigger LANGUAGE plpgsql "
      "AS $$ BEGIN RETURN NEW; END $$")
query('GRANT EXECUTE ON FUNCTION public.pa_int02a_fixture_trigger() TO anon,authenticated')
for role in ('anon', 'authenticated'):
    schema = 'pa_int02a_fixture_' + role
    query('CREATE SCHEMA IF NOT EXISTS ' + schema + ' AUTHORIZATION ' + role)
    for statement in (
            'TRUNCATE public.usuario CASCADE',
            'ALTER TABLE ' + schema + '.ref_denegada ADD FOREIGN KEY(usuario_id) REFERENCES public.usuario(id)',
            'CREATE TRIGGER pa_int02a_denegado BEFORE UPDATE ON public.usuario '
            'FOR EACH ROW EXECUTE FUNCTION public.pa_int02a_fixture_trigger()'):
        sql = 'BEGIN; SET LOCAL ROLE ' + role + '; '
        sql += 'CREATE TABLE ' + schema + '.ref_denegada(usuario_id bigint); '
        sql += 'DO $$ BEGIN BEGIN ' + statement + '; '
        sql += "RAISE EXCEPTION 'PRIVILEGIO_PUBLICO_ABIERTO'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$; ROLLBACK;"
        query(sql)
    query('DROP SCHEMA ' + schema)
query('DROP FUNCTION public.pa_int02a_fixture_trigger()')
assert snapshot() == before
state = script('scripts/sql/pa-int02a-estado-aplicado.sql')
assert all(r['existe'] and r['argumentos_coinciden'] and r['huella_textual_coincide'] for r in state['rpc_esperadas'])
assert state['roles'] == result['roles']
query("SET ROLE service_role; SELECT public.pa_perfil_leer(1,'pa_legacy_1')")
print('OK: 065 idempotente, seis denegaciones SQL reales, datos/roles/historia/credenciales y RPC '
      'conservados; SELECT público pendiente explícito')
