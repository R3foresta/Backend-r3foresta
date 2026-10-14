"""Carreras deterministas sobre el fixture local. Nunca carga .env."""
import argparse
import os
import re
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--database', required=True)
args = parser.parse_args()
if not re.fullmatch(r'pa_int02a_[a-z0-9_]+', args.database):
    raise SystemExit('Solo bases de fixture pa_int02a_*')
base = ['psql', '-X', '-qAt', '-h', '/tmp', '-p', '6543', '-U', 'postgres',
        '-d', args.database, '-v', 'ON_ERROR_STOP=1']


def query(sql):
    return subprocess.check_output(base + ['-c', sql], text=True).strip()


if query("SELECT to_regclass('public.pa_int02a_fixture_marker') IS NOT NULL") != 't':
    raise SystemExit('Falta marcador de base sintética aislada')


def holder(sql):
    process = subprocess.Popen(base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, bufsize=1)
    process.stdin.write('BEGIN;\n' + sql + ';\n\\echo BARRERA\n')
    process.stdin.flush()
    while True:
        line = process.stdout.readline()
        if line.strip() == 'BARRERA':
            return process
        if not line:
            raise AssertionError('El holder falló: ' + process.stderr.read())


def contender(sql, label):
    task_env = dict(os.environ, PGAPPNAME=label)
    return subprocess.Popen(base + ['-c', sql], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=task_env)


def wait_for_lock(process, label):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if query("SELECT coalesce(bool_or(wait_event_type='Lock'),false) "
                 "FROM pg_stat_activity WHERE application_name='" + label + "'") == 't':
            return
        if process.poll() is not None:
            raise AssertionError('No esperó el lock: ' + str(process.communicate()))
        time.sleep(0.03)
    raise AssertionError('No se observó barrera de lock')


def release(process):
    process.stdin.write('COMMIT;\n\\q\n')
    process.stdin.flush()
    process.wait(timeout=5)
    if process.returncode:
        raise AssertionError(process.stderr.read())


def abort(process):
    if process and process.poll() is None:
        process.terminate()
        process.wait(timeout=5)


first = second = None
try:
    query('UPDATE public.organizacion SET activo=true WHERE id=11')
    # La selección gana: mantiene SHARE y la inactivación espera hasta commit.
    first = holder("SELECT public.pa_perfil_actualizar(3,'vol',false,null,false,null,true,11,null)")
    second = contender('UPDATE public.organizacion SET activo=false WHERE id=11', 'pa_org_inactivar_1')
    wait_for_lock(second, 'pa_org_inactivar_1')
    release(first)
    _, error = second.communicate(timeout=5)
    assert second.returncode == 0, error
    assert query("SELECT organizacion_id=11 FROM public.usuario WHERE id=3") == 't'
    query("SELECT public.pa_perfil_actualizar(3,'vol',true,'Edición conservada',false,null,false,null,null)")

    query('UPDATE public.organizacion SET activo=true WHERE id=11')
    before = query("SELECT public.pa_perfil_leer(3,'vol')")
    # La inactivación gana: selección espera y revalida, sin escritura parcial.
    first = holder('UPDATE public.organizacion SET activo=false WHERE id=11')
    second = contender("SELECT public.pa_perfil_actualizar(3,'vol',true,'No guardar',false,null,true,11,null)", 'pa_org_elegir_2')
    wait_for_lock(second, 'pa_org_elegir_2')
    release(first)
    _, error = second.communicate(timeout=5)
    assert second.returncode != 0 and 'ORGANIZACION_NO_SELECCIONABLE' in error, error
    assert query("SELECT public.pa_perfil_leer(3,'vol')") == before
    print('OK: ambas carreras selección/inactivación, con barreras de locks PostgreSQL')
finally:
    abort(first)
    abort(second)
