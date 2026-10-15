#!/usr/bin/env python3
"""Ensayo INT02-B: crea y destruye un clúster propio, sin red ni .env."""
from pathlib import Path
import os
import shutil
import signal
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'pa_int02b_ensayo'
PORT = '55433'  # El socket pertenece a un directorio distinto en cada ejecución.


def main():
    # Libpq no hereda destino, credenciales, opciones ni servicios del usuario.
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update({'LC_ALL': 'C', 'PGAPPNAME': 'pa_int02b_aislado'})
    binaries = {name: shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql', 'createdb')}
    missing = [name for name, binary in binaries.items() if binary is None]
    if missing:
        raise RuntimeError('Faltan binarios PostgreSQL locales: ' + ', '.join(missing))
    directory = Path(tempfile.mkdtemp(prefix='pa-int02b-', dir='/tmp')).resolve()
    cluster = directory / 'postgres'
    socket = directory / 'socket'
    socket.mkdir(mode=0o700)
    failed = False

    def run(command, timeout=60):
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or str(command))
        return result.stdout

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres',
             '--auth-local=trust', '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
        options = ("-c listen_addresses='' -c unix_socket_directories='" + str(socket)
                   + "' -c unix_socket_permissions=0700 -c port=" + PORT
                   + ' -c max_connections=12 -c shared_buffers=16MB')
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', options], timeout=30)
        run([binaries['createdb'], '-h', str(socket), '-p', PORT, '-U', 'postgres', DATABASE])
        run([binaries['psql'], '-X', '-q', '-h', str(socket), '-p', PORT, '-U', 'postgres',
             '-d', DATABASE, '-v', 'ON_ERROR_STOP=1', '-f', str(ROOT / 'test/db/pa-int02b-fixture.sql')])
        print('PostgreSQL aislado: ' + run([binaries['psql'], '-X', '-qAt', '-h', str(socket),
              '-p', PORT, '-U', 'postgres', '-d', DATABASE, '-c', 'SHOW server_version']).strip(), flush=True)
        print('Antecedente sintético mínimo post-067; TCP deshabilitado; sin .env.', flush=True)
        result = subprocess.run([sys.executable, str(ROOT / 'test/db/pa-int02b-assertions.py'),
                                 '--socket', str(socket), '--cluster', str(cluster), '--port', PORT,
                                 '--database', DATABASE, '--psql', binaries['psql']], env=env)
        failed = result.returncode != 0
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
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
