#!/usr/bin/env python3
"""PA INT03-A: clúster propio con PostGIS real, Storage de archivos y HTTP real.

No lee .env, no abre TCP, no toca PostgreSQL/Storage compartidos. --pg-bin permite
usar un runtime PostgreSQL que ya incluya PostGIS (p. ej. Postgres.app extraído).
"""
from datetime import datetime, timezone
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
DATABASE = 'pa_int03a_ensayo'
PORT = '55435'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', help='Directorio bin de un runtime PostgreSQL con PostGIS real.')
    parser.add_argument('--sql-only', action='store_true', help='No ejecutar HTTP/Storage; queda pendiente explícito.')
    parser.add_argument('--serve', action='store_true', help='Mantener API/DB/Storage sintéticos para INT04, en localhost:3303.')
    parser.add_argument('--check', action='store_true', help='Comprobar y detener launcher --serve sin dejar procesos.')
    args = parser.parse_args()
    if args.check and not args.serve:
        parser.error('--check requiere --serve')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG') and not k.startswith('PA_C_DB_')}
    env.update(LC_ALL='C', PGAPPNAME='pa_int03a_aislado')
    binaries = {name: str(Path(args.pg_bin) / name) if args.pg_bin else shutil.which(name)
                for name in ('initdb', 'pg_ctl', 'psql', 'createdb', 'pg_config')}
    missing = [name for name, path in binaries.items() if not path or not Path(path).is_file()]
    evidence_path = ROOT / ('docs/evidencia/pa-int03a-preview-local.json' if args.serve else 'docs/evidencia/pa-int03a-local.json')
    evidence = {'tarea': 'PA-T-INT03-A', 'estado': 'EN_EJECUCION',
                'fecha_utc': datetime.now(timezone.utc).isoformat(),
                'comando': 'python3 scripts/qa/pa-int03a-db-test.py' + (' --pg-bin ' + args.pg_bin if args.pg_bin else ''),
                'entorno': {'aislado': True, 'tcp': False, 'env_cargado': False,
                            'naturaleza': 'SINTETICO_AISLADO_POST_073',
                            'antecedentes': ['test/db/pa-int02c-fixture.sql', 'test/db/pa-int03a-fixture.sql']},
                'casos': [], 'carreras': [],
                'limites': ['Sin aplicación remota, transición de personas reales, push ni despliegue',
                            'Fixture parcial; no acredita replay 001–073',
                            'Storage de prueba privado de archivos; no acredita políticas del bucket Supabase real',
                            'INT02-D y rutas legadas/equivalentes conservan su corte independiente']}
    directory = Path(tempfile.mkdtemp(prefix='pa-int03a-', dir='/tmp')).resolve()
    cluster, socket, storage = (directory / name for name in ('postgres', 'socket', 'storage'))
    socket.mkdir(mode=0o700)
    storage.mkdir(mode=0o700)
    failed = False
    evidence_started = False

    def run(command, timeout=60, extra_env=None):
        result = subprocess.run(command, cwd=ROOT, env=extra_env or env,
                                text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or str(command))
        return result.stdout.strip()

    def psql(*arguments):
        return run([binaries['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
                    '-p', PORT, '-U', 'postgres', '-d', DATABASE, *arguments])

    def interrupted(_signal, _frame):
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        if missing:
            raise RuntimeError('Faltan binarios: ' + ', '.join(missing))
        sharedir = run([binaries['pg_config'], '--sharedir'])
        if not (Path(sharedir) / 'extension/postgis.control').exists():
            raise RuntimeError('Falta PostGIS REAL en ' + sharedir + '; usar --pg-bin. No se sustituye el evaluador geográfico.')
        locales = run(['locale', '-a']).splitlines()
        locale = next((candidate for candidate in ('C.UTF-8', 'C.utf8', 'en_US.UTF-8', 'en_US.utf8') if candidate in locales), None)
        if not locale:
            raise RuntimeError('Falta locale UTF-8 con case folding Unicode.')
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--locale=' + locale, '--encoding=UTF8'])
        options = "-c listen_addresses='' -c unix_socket_directories='" + str(socket) + "' -c unix_socket_permissions=0700 -c port=" + PORT + ' -c max_connections=16 -c shared_buffers=16MB'
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', options], timeout=30)
        run([binaries['createdb'], '-h', str(socket), '-p', PORT, '-U', 'postgres', DATABASE])
        psql('-f', str(ROOT / 'test/db/pa-int02c-fixture.sql'))
        migrations = sorted(ROOT.glob('migrations/0[67][0-9]_*.sql'))
        migrations = [path for path in migrations if 68 <= int(path.name[:3]) <= 73]
        for migration in migrations:
            psql('-f', str(migration))
        psql('-f', str(ROOT / 'test/db/pa-int03a-fixture.sql'))
        # Usa el helper operativo REAL de 010, sin ejecutar su DDL ajeno al fixture.
        legacy = (ROOT / 'migrations/010_vivero_operational_rules.sql').read_text()
        start = legacy.index('CREATE OR REPLACE FUNCTION public.fn_vivero_assert_fecha_operativa(')
        end = legacy.index('$$;', start) + 3
        psql('-c', legacy[start:end])
        new_migrations = sorted(ROOT.glob('migrations/07[456]_*.sql'))
        if len(new_migrations) != 3:
            raise RuntimeError('Se requieren migraciones 074, 075 y 076 exactas.')
        for migration in new_migrations:
            psql('-f', str(migration))
        for migration in new_migrations:
            psql('-f', str(migration))
        evidence['migraciones'] = [str(path.relative_to(ROOT)) for path in migrations + new_migrations]
        evidence['entorno'].update(postgresql=psql('-c', 'SHOW server_version'),
                                   postgis=psql('-c', 'SELECT postgis_full_version()'),
                                   node=run(['node', '--version']))
        evidence['entorno']['runtime_reproducible'] = {'preparador': 'scripts/qa/pa-int03a-postgis-preparar.sh', 'fuente': 'https://github.com/PostgresApp/PostgresApp/releases/download/v2.9.6/Postgres-2.9.6-14.dmg', 'sha256_artefacto_usado': 'a73a5d7c78c1fdce15ff1cc31b55d670c0b68070e0c436add53d3b053ef6567a'}
        evidence['revision_git'] = run(['git', 'rev-parse', 'HEAD'])
        sources = migrations + new_migrations + sorted(ROOT.glob('src/participacion/**/*.ts')) + [ROOT / path for path in ('migrations/010_vivero_operational_rules.sql', 'test/db/pa-int03a-fixture.sql', 'test/db/pa-int03a-assertions.py', 'test/db/pa-int03a-expiracion.py', 'test/db/pa-int03a-acceso-regresion.py', 'test/db/pa-int03a-http.spec.ts', 'test/jest-participacion-registro-db.json', 'scripts/qa/pa-int03a-db-test.py', 'scripts/qa/pa-int03a-harness.ts', 'scripts/qa/pa-int03a-preview-server.ts', 'scripts/qa/pa-int03a-postgis-preparar.sh', 'test/db/pa-int03a-preview-fixture.sql', 'test/db/fixtures/pa-int03a/sintetica.heic')]
        evidence['sha256'] = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest() for path in sources}
        evidence_path.parent.mkdir(exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
        evidence_started = True
        print('PA INT03-A PostgreSQL ' + evidence['entorno']['postgresql'] + '; ' + evidence['entorno']['postgis'], flush=True)
        if args.serve:
            psql('-f', str(ROOT / 'test/db/pa-int03a-preview-fixture.sql'))
            serve_env = dict(env, PA_A_DB_SOCKET=str(socket), PA_A_DB_PORT=PORT, PA_A_DB_NAME=DATABASE,
                             PA_A_DB_PSQL=binaries['psql'], PA_A_STORAGE_DIR=str(storage), NODE_ENV='test')
            command = ['node', '-r', 'ts-node/register', str(ROOT / 'scripts/qa/pa-int03a-preview-server.ts')]
            if args.check:
                command.append('--check')
            server = subprocess.Popen(command, cwd=ROOT, env=serve_env)
            try:
                code = server.wait()
                if code:
                    raise RuntimeError('Launcher INT03-A falló con código ' + str(code))
            finally:
                if server.poll() is None:
                    server.terminate()
                    server.wait(timeout=15)
            evidence['estado'] = 'PREVIEW_VERIFICADO' if args.check else 'PREVIEW_DETENIDO'
            evidence['preview'] = {'sintetico': True, 'check': args.check, 'bootstrap': 'test/db/pa-int03a-preview-fixture.sql'}
        else:
            sql_result = subprocess.run([sys.executable, str(ROOT / 'test/db/pa-int03a-assertions.py'), '--socket', str(socket),
                 '--cluster', str(cluster), '--port', PORT, '--database', DATABASE,
                 '--psql', binaries['psql'], '--evidence', str(evidence_path)], cwd=ROOT, env=env, timeout=180)
            if sql_result.returncode:
                raise RuntimeError('Fallaron assertions SQL/PostGIS INT03-A.')
            expiry = subprocess.run([sys.executable, str(ROOT / 'test/db/pa-int03a-expiracion.py'),
                                     '--socket', str(socket), '--port', PORT, '--database', DATABASE,
                                     '--psql', binaries['psql'], '--evidence', str(evidence_path)], cwd=ROOT, env=env, timeout=90)
            if expiry.returncode:
                raise RuntimeError('Falló prueba de expiración inline/rollback INT03-A.')
            evidence = json.loads(evidence_path.read_text())
            if not args.sql_only:
                http_env = dict(env, PA_A_DB_SOCKET=str(socket), PA_A_DB_PORT=PORT, PA_A_DB_NAME=DATABASE,
                                PA_A_DB_PSQL=binaries['psql'], PA_A_STORAGE_DIR=str(storage), NODE_ENV='test')
                result = subprocess.run(['node', str(ROOT / 'node_modules/jest/bin/jest.js'), '--config',
                                         str(ROOT / 'test/jest-participacion-registro-db.json'), '--runInBand',
                                         '--cacheDirectory', '/private/tmp/pa-int03a-jest'], cwd=ROOT, env=http_env, timeout=180)
                evidence = json.loads(evidence_path.read_text())
                evidence['http_storage'] = {'suite': 'test/db/pa-int03a-http.spec.ts', 'exit_code': result.returncode}
                evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
                if result.returncode:
                    raise RuntimeError('Falló suite HTTP/Storage INT03-A.')
            else:
                evidence['limites'].append('HTTP/Storage omitidos por --sql-only; pendientes')
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
            regression = subprocess.run([sys.executable, str(ROOT / 'test/db/pa-int03a-acceso-regresion.py'),
                                        '--socket', str(socket), '--port', PORT, '--database', DATABASE,
                                        '--psql', binaries['psql'], '--evidence', str(evidence_path)], cwd=ROOT, env=env, timeout=90)
            if regression.returncode:
                raise RuntimeError('Falló regresión C tras 074–076.')
            evidence = json.loads(evidence_path.read_text())
            evidence['estado'] = 'CORRECTO' if not args.sql_only else 'SQL_CORRECTO_HTTP_PENDIENTE'
    except KeyboardInterrupt:
        failed = not args.serve
        evidence['estado'] = 'PREVIEW_DETENIDO' if args.serve else 'INTERRUMPIDO'
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        failed = True
        if evidence_started and evidence_path.exists():
            evidence = json.loads(evidence_path.read_text())
        evidence['estado'] = 'FALLIDO'
        evidence['fallo'] = str(error)
        print(str(error), file=sys.stderr)
    finally:
        if (cluster / 'postmaster.pid').exists():
            try:
                run([binaries['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'], timeout=20)
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                failed = True
                evidence['fallo_limpieza'] = str(error)
        stopped = not (cluster / 'postmaster.pid').exists()
        if stopped:
            shutil.rmtree(directory)
        evidence['entorno'].update(cluster_detenido=stopped, directorio_eliminado=not directory.exists())
        evidence_path.parent.mkdir(exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
