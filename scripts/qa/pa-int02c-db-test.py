#!/usr/bin/env python3
"""Ensayo INT02-C: crea y destruye un clúster propio, sin red ni .env."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'pa_int02c_ensayo'
PORT = '55434'  # El socket pertenece a un directorio distinto en cada ejecución.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sql-only', action='store_true', help='Solo RPC/concurrencia; HTTP se acredita aparte.')
    args = parser.parse_args()
    # Libpq no hereda destino, credenciales, opciones ni servicios del usuario.
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update({'LC_ALL': 'C', 'PGAPPNAME': 'pa_int02c_aislado'})
    binaries = {name: shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql', 'createdb')}
    missing = [name for name, binary in binaries.items() if binary is None]
    if missing:
        raise RuntimeError('Faltan binarios PostgreSQL locales: ' + ', '.join(missing))
    directory = Path(tempfile.mkdtemp(prefix='pa-int02c-', dir='/tmp')).resolve()
    cluster = directory / 'postgres'
    socket = directory / 'socket'
    socket.mkdir(mode=0o700)
    failed = False
    evidence_path = ROOT / 'docs/evidencia/pa-int02c-local.json'
    evidence_started = False

    def run(command, timeout=60):
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or str(command))
        return result.stdout

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        locale_tool = shutil.which('locale')
        available_locales = run([locale_tool, '-a']).splitlines() if locale_tool else []
        utf8_locale = next((candidate for candidate in
                           ('C.UTF-8', 'C.utf8', 'en_US.UTF-8', 'en_US.utf8')
                           if candidate in available_locales), None)
        if utf8_locale is None:
            raise RuntimeError('Falta locale UTF-8 con case folding Unicode para probar nombres: C.UTF-8/en_US.UTF-8.')
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres',
             '--auth-local=trust', '--auth-host=reject', '--locale=' + utf8_locale, '--encoding=UTF8'])
        options = ("-c listen_addresses='' -c unix_socket_directories='" + str(socket)
                   + "' -c unix_socket_permissions=0700 -c port=" + PORT
                   + ' -c max_connections=12 -c shared_buffers=16MB')
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', options], timeout=30)
        run([binaries['createdb'], '-h', str(socket), '-p', PORT, '-U', 'postgres', DATABASE])
        run([binaries['psql'], '-X', '-q', '-h', str(socket), '-p', PORT, '-U', 'postgres',
             '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', str(ROOT / 'test/db/pa-int02c-fixture.sql')])
        print('PostgreSQL aislado: ' + run([binaries['psql'], '-X', '-qAt', '-h', str(socket),
              '-p', PORT, '-U', 'postgres', '-d', DATABASE, '-c', 'SHOW server_version']).strip(), flush=True)
        print('INT02C: antecedente sintético mínimo post-067; TCP deshabilitado; sin .env.', flush=True)
        result = subprocess.run([sys.executable, str(ROOT / 'test/db/pa-int02c-assertions.py'),
                                 '--socket', str(socket), '--cluster', str(cluster), '--port', PORT,
                                 '--database', DATABASE, '--psql', binaries['psql'],
                                 '--evidence', str(ROOT / 'docs/evidencia/pa-int02c-local.json')], env=env)
        evidence_started = True
        failed = result.returncode != 0
        if not failed:
            state = json.loads(run([binaries['psql'], '-X', '-qAt', '-h', str(socket), '-p', PORT,
                                    '-U', 'postgres', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1',
                                    '-f', str(ROOT / 'scripts/sql/pa-int02c-estado.sql')]))
            state_path = ROOT / 'docs/evidencia/pa-int02c-estado-local.json'
            state_path.write_text(json.dumps({
                'proyecto': 'SINTETICO_AISLADO_INT02C', 'entorno': 'SINTETICO_LOCAL',
                'migraciones': ['072', '073', '087'], 'estado': state,
            }, ensure_ascii=False, indent=2) + '\n')
            verification = subprocess.run([
                sys.executable, str(ROOT / 'scripts/qa/pa-int02c-estado-verificar.py'),
                '--evidence', str(state_path), '--entorno', 'SINTETICO_LOCAL',
            ], env=env, text=True, capture_output=True, timeout=30)
            verification_path = ROOT / 'docs/evidencia/pa-int02c-cotejo-local.json'
            verification_path.write_text(verification.stdout)
            evidence = json.loads(evidence_path.read_text())
            evidence['cotejo_estado'] = {
                'entorno': 'SINTETICO_LOCAL', 'resultado': json.loads(verification.stdout)['resultado'],
                'evidencia': str(state_path.relative_to(ROOT)),
                'salida': str(verification_path.relative_to(ROOT)), 'origen_remoto_acreditado': False,
            }
            evidence['sha256'].update({path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
                                       for path in ['scripts/sql/pa-int02c-estado.sql',
                                                    'scripts/qa/pa-int02c-estado-verificar.py']})
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
            failed = verification.returncode != 0
            if failed:
                print(verification.stdout, file=sys.stderr)
            else:
                print('INT02C: estado SQL real del clúster sintético cotejado; no acredita catálogo remoto.', flush=True)
        if not failed and not args.sql_only:
            node = shutil.which('node')
            if node is None:
                raise RuntimeError('Falta Node.js local para la suite HTTP sobre PostgreSQL.')
            http_env = dict(env, PA_C_DB_SOCKET=str(socket), PA_C_DB_PORT=PORT,
                            PA_C_DB_NAME=DATABASE, PA_C_DB_PSQL=binaries['psql'], NODE_ENV='test')
            http = subprocess.run([node, str(ROOT / 'node_modules/jest/bin/jest.js'),
                                   '--config', str(ROOT / 'test/jest-participacion-db.json'),
                                   '--runInBand', '--cacheDirectory', '/private/tmp/pa-int02c-jest'],
                                  cwd=ROOT, env=http_env, timeout=180)
            failed = http.returncode != 0
            evidence = json.loads(evidence_path.read_text())
            evidence['http'] = {'implementacion_real': True, 'transporte_db': 'psql socket privado',
                                'suite': 'test/db/pa-int02c-http.spec.ts', 'exit_code': http.returncode}
            if failed:
                evidence['estado'] = 'FALLIDO_HTTP'
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    except KeyboardInterrupt:
        failed = True
        print('Ensayo interrumpido; se detiene el clúster propio.', file=sys.stderr)
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        failed = True
        print(str(error), file=sys.stderr)
    finally:
        # Si start alcanzó a crear el proceso antes de fallar, también se detiene.
        # Nunca borrar un data_directory que siga teniendo postmaster.pid.
        if (cluster / 'postmaster.pid').exists():
            try:
                result = subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-w', '-t', '15',
                                         'stop', '-m', 'fast'], env=env, text=True,
                                        capture_output=True, timeout=20)
                if result.returncode and (cluster / 'postmaster.pid').exists():
                    failed = True
                    print('No se pudo detener el clúster propio; archivos conservados en '
                          + str(directory) + '\n' + result.stderr, file=sys.stderr)
            except subprocess.TimeoutExpired:
                failed = True
                print('Timeout al detener el clúster propio; archivos conservados en '
                      + str(directory), file=sys.stderr)
        if not (cluster / 'postmaster.pid').exists():
            shutil.rmtree(directory)
        if evidence_started and evidence_path.exists():
            evidence = json.loads(evidence_path.read_text())
            evidence['entorno']['cluster_detenido'] = not (cluster / 'postmaster.pid').exists()
            evidence['entorno']['directorio_eliminado'] = not directory.exists()
            if failed and evidence.get('estado') == 'CORRECTO':
                evidence['estado'] = 'FALLIDO_RUNNER'
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
