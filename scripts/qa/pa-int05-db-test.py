#!/usr/bin/env python3
"""INT05: SQL/PostGIS + HTTP reales en clúster y Storage privados desechables.

No lee .env ni usa servicios reales. --serve conserva el fixture en localhost:3305
mientras vive este proceso; Ctrl+C apaga API/DB y elimina sus archivos.
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
# El transporte D valida estos nombres y solo permite sockets privados /tmp.
DATABASE = 'pa_int03a_ensayo'
PORT = '55435'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', help='Binarios PostgreSQL con PostGIS real.')
    parser.add_argument('--sql-only', action='store_true', help='Solo probes SQL; HTTP queda pendiente.')
    parser.add_argument('--serve', action='store_true', help='Mantener preview sintético en127.0.0.1:3305.')
    parser.add_argument('--check', action='store_true', help='Comprobar preview y detenerlo.')
    args = parser.parse_args()
    if args.check and not args.serve:
        parser.error('--check requiere --serve')
    env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'PA_A_', 'PA_C_DB_'))}
    env.update(LC_ALL='C', PGAPPNAME='pa_int05_aislado')
    binaries = {name: str(Path(args.pg_bin) / name) if args.pg_bin else shutil.which(name)
                for name in ('initdb', 'pg_ctl', 'psql', 'createdb', 'pg_config')}
    directory = Path(tempfile.mkdtemp(prefix='pa-int03a-', dir='/tmp')).resolve()
    cluster, socket, storage = (directory / name for name in ('postgres', 'socket', 'storage'))
    socket.mkdir(mode=0o700)
    storage.mkdir(mode=0o700)
    # Una sesión viva del frontend no sobrescribe el resultado reproducible del
    # check ni su limpieza al detenerse; su estado mutable queda fuera del repo.
    evidence_path = (Path('/private/tmp') / ('pa-int05-preview-' + str(os.getpid()) + '.json')
                     if args.serve and not args.check else
                     ROOT / ('docs/evidencia/pa-int05-preview-local.json' if args.serve else 'docs/evidencia/pa-int05-local.json'))
    evidence = {'tarea': 'PA-T-INT05', 'estado': 'EN_EJECUCION',
                'fecha_utc': datetime.now(timezone.utc).isoformat(),
                'comando': 'python3 scripts/qa/pa-int05-db-test.py' + (' --pg-bin ' + args.pg_bin if args.pg_bin else '') + (' --serve' if args.serve else '') + (' --check' if args.check else '') + (' --sql-only' if args.sql_only else ''),
                'entorno': {'aislado': True, 'tcp_db': False, 'env_cargado': False, 'naturaleza': 'SINTETICO_AISLADO_INT05_POST_081'},
                'limites': ['Antecedentes mínimos B/C/A/D; no acredita replay001–073',
                            'Sin SQL remoto, usuarios reales, push ni despliegue',
                            'Storage privado de disco; no acredita bucket/CDN/URLs históricos remotos']}
    failed = False

    def run(command, timeout=60, extra_env=None):
        result = subprocess.run(command, cwd=ROOT, env=extra_env or env, text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError((result.stderr.strip() or result.stdout.strip() or str(command))[-3500:])
        return result.stdout.strip()

    def psql(*arguments):
        return run([binaries['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
                    '-p', PORT, '-U', 'postgres', '-d', DATABASE, *arguments])

    def write_evidence():
        evidence_path.parent.mkdir(exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')

    def interrupted(_signal, _frame):
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        missing = [name for name, path in binaries.items() if not path or not Path(path).is_file()]
        if missing:
            raise RuntimeError('Faltan binarios: ' + ', '.join(missing))
        sharedir = run([binaries['pg_config'], '--sharedir'])
        if not (Path(sharedir) / 'extension/postgis.control').exists():
            raise RuntimeError('Falta PostGIS real; usar --pg-bin.')
        locales = run(['locale', '-a']).splitlines()
        locale = next((v for v in ('C.UTF-8', 'C.utf8', 'en_US.UTF-8', 'en_US.utf8') if v in locales), None)
        if not locale:
            raise RuntimeError('Falta localeUTF-8.')
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--locale=' + locale, '--encoding=UTF8'])
        options = "-c listen_addresses='' -c unix_socket_directories='" + str(socket) + "' -c unix_socket_permissions=0700 -c port=" + PORT + ' -c max_connections=16 -c shared_buffers=16MB'
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'), '-w', '-t', '20', 'start', '-o', options], timeout=30)
        run([binaries['createdb'], '-h', str(socket), '-p', PORT, '-U', 'postgres', DATABASE])
        psql('-f', str(ROOT / 'test/db/pa-int02c-fixture.sql'))
        psql('-f', str(ROOT / 'migrations/067_pa_int02a_postgrest_timeout.sql'))
        migrations = sorted(path for path in ROOT.glob('migrations/0*.sql') if 68 <= int(path.name[:3]) <= 81)
        if [int(path.name[:3]) for path in migrations] != list(range(68, 82)):
            raise RuntimeError('Se requiere exactamente una migración por número068–081.')
        for migration in migrations[:6]:
            psql('-f', str(migration))
        psql('-f', str(ROOT / 'test/db/pa-int03a-fixture.sql'))
        legacy = (ROOT / 'migrations/010_vivero_operational_rules.sql').read_text()
        start = legacy.index('CREATE OR REPLACE FUNCTION public.fn_vivero_assert_fecha_operativa(')
        psql('-c', legacy[start:legacy.index('$$;', start) + 3])
        for migration in migrations[6:9]:
            psql('-f', str(migration))
        psql('-f', str(ROOT / 'test/db/pa-int02d-fixture.sql'))
        # Antecedentes031 de seguimiento omitidos por los fixtures históricos.
        psql('-c', 'ALTER TABLE public.evento_plantacion ADD COLUMN IF NOT EXISTS cantidad_muerta_delta INTEGER, ADD COLUMN IF NOT EXISTS registro_plantacion_id BIGINT REFERENCES public.registro_plantacion(id)')
        psql('-c', "ALTER TYPE public.tipo_evento_plantacion ADD VALUE IF NOT EXISTS 'MORTANDAD_REPORTADA'")
        for migration in migrations[9:]:
            psql('-f', str(migration))
        # La nueva proyección debe admitir aplicación repetida sin alterar datos.
        psql('-f', str(migrations[-1]))
        psql('-f', str(ROOT / 'test/db/pa-int05-fixture.sql'))
        evidence['migraciones'] = [str(path.relative_to(ROOT)) for path in migrations]
        evidence['entorno'].update(postgresql=psql('-c', 'SHOW server_version'), postgis=psql('-c', 'SELECT postgis_full_version()'), node=run(['node', '--version']))
        evidence['revision_git'] = run(['git', 'rev-parse', 'HEAD'])
        sources = migrations + [ROOT / path for path in ('scripts/qa/pa-int05-db-test.py', 'scripts/qa/pa-int05-preview-server.ts', 'scripts/qa/pa-int02d-harness.ts', 'test/db/pa-int05-fixture.sql', 'test/db/pa-int05-http.spec.ts', 'test/jest-impacto-db.json')] + sorted(ROOT.glob('src/impact/**/*.ts'))
        sources += [ROOT / path for path in (
            'test/db/pa-int02b-fixture.sql', 'test/db/pa-int02c-fixture.sql',
            'test/db/pa-int03a-fixture.sql', 'test/db/pa-int02d-fixture.sql',
            'test/db/pa-int03a-preview-fixture.sql',
            'migrations/010_vivero_operational_rules.sql',
            'migrations/024_vivero_asignacion_subcampania.sql',
            'migrations/030_m3_registro_plantacion.sql', 'migrations/032_m3_gps_funcion.sql',
            'migrations/064_pa_int02a_identidad_perfil.sql',
            'migrations/067_pa_int02a_postgrest_timeout.sql',
            'src/app.routes.ts', 'scripts/qa/pa-int02c-openapi.cjs',
            'docs/pa-int05-contrato.md', 'docs/pa-int05-ejemplos.json', 'docs/pa-int02c-openapi.json',
            'package.json', 'package-lock.json')]
        sources += sorted(ROOT.glob('src/participacion/**/*.ts')) + sorted(ROOT.glob('src/auth/*.ts'))
        sources += sorted(ROOT.glob('docs/openapi/*'))
        evidence['sha256'] = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                              for path in sorted(set(sources)) if path.is_file()}
        # Probes reales bajo service_role. El agregado50 incluye dos campañas,
        # tres personas y dos organizaciones sin multiplicar los hechos.
        projection = json.loads(psql('-c', 'SET ROLE service_role; SELECT public.pa_impacto_leer()'))['data']
        if projection['indicadores'] != {'plantacion_inicial': 50, 'reposiciones': 4, 'bajas_reportadas': 11, 'registros': 4}:
            raise RuntimeError('Indicadores SQL inconsistentes: ' + json.dumps(projection['indicadores']))
        public_scopes = {row['id']: row for row in projection['subcampanias']}
        if public_scopes['826']['avance_porcentaje'] != 125 or public_scopes['826']['faltantes'] != 0:
            raise RuntimeError('Avance/faltantes SQL no conserva125%.')
        if set(public_scopes) & {'828', '829', '830', '831', '832'}:
            raise RuntimeError('Se filtró ámbito oculto enSQL.')
        evidence['sql_probes'] = ['50 iniciales =30+20, reposiciones4, bajas11, registros4', '125% y faltantes0 porámbito', 'BORRADOR/CANCELADA/PAUSADA/deleted excluidos', '081 aplicada dos veces']
        write_evidence()
        print('INT05 PostgreSQL ' + evidence['entorno']['postgresql'] + '; ' + evidence['entorno']['postgis'], flush=True)
        http_env = dict(env, PA_A_DB_SOCKET=str(socket), PA_A_DB_PORT=PORT, PA_A_DB_NAME=DATABASE, PA_A_DB_PSQL=binaries['psql'], PA_A_STORAGE_DIR=str(storage), NODE_ENV='test')
        if args.serve:
            command = ['node', '-r', 'ts-node/register', str(ROOT / 'scripts/qa/pa-int05-preview-server.ts')]
            if args.check:
                result = run(command + ['--check'], timeout=120, extra_env=http_env)
                marker = 'PA_INT05_PREVIEW_CHECKS='
                line = next((line for line in result.splitlines() if line.startswith(marker)), None)
                if line is None:
                    raise RuntimeError('Preview sin evidencia de comprobaciones.')
                evidence['preview'] = {'sintetico': True, 'check': True, 'verificaciones': json.loads(line[len(marker):])}
                print(line, flush=True)
            else:
                server = subprocess.Popen(command, cwd=ROOT, env=http_env)
                try:
                    if server.wait():
                        raise RuntimeError('PreviewINT05 falló.')
                finally:
                    if server.poll() is None:
                        server.terminate()
                        server.wait(timeout=15)
            evidence['estado'] = 'PREVIEW_VERIFICADO' if args.check else 'PREVIEW_DETENIDO'
        elif not args.sql_only:
            result = subprocess.run(['node', str(ROOT / 'node_modules/jest/bin/jest.js'), '--config', str(ROOT / 'test/jest-impacto-db.json'), '--runInBand', '--cacheDirectory', '/private/tmp/pa-int05-jest'], cwd=ROOT, env=http_env, timeout=180)
            # Jest añade la lista de casos a la misma evidencia.
            evidence = json.loads(evidence_path.read_text())
            evidence['http_storage'] = {'suite': 'test/jest-impacto-db.json', 'exit_code': result.returncode}
            if result.returncode:
                raise RuntimeError('Falló suiteHTTP/SQL/Storage INT05.')
            evidence['estado'] = 'CORRECTO'
        else:
            evidence['estado'] = 'SQL_CORRECTO_HTTP_PENDIENTE'
            evidence['limites'].append('HTTP/Storage omitidos por--sql-only')
    except KeyboardInterrupt:
        failed = not args.serve
        evidence['estado'] = 'PREVIEW_DETENIDO' if args.serve else 'INTERRUMPIDO'
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        failed = True
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
        write_evidence()
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
