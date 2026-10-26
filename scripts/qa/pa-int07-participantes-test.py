#!/usr/bin/env python3
"""INT07 participantes/lecturas: PostgreSQL/PostGIS y HTTP aislados sin .env.

Reutiliza antecedentes mínimos B/C/A/D/INT05, instala 082–085, conserva sus
evidencias anteriores y destruye exclusivamente el clúster temporal propio.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
DATABASE, PORT = 'pa_int03a_ensayo', '55438'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', required=True, help='Binarios PostgreSQL con PostGIS real.')
    parser.add_argument('--sql-only', action='store_true')
    parser.add_argument('--evidence', default='docs/evidencia/pa-int07-participantes-local.json')
    args = parser.parse_args()
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(('PG', 'PA_A_', 'PA_C_DB_', 'SUPABASE_', 'JWT_'))}
    env.update(LC_ALL='C', PGAPPNAME='pa_int07_participantes_aislado', NODE_ENV='test')
    bins = {name: str(Path(args.pg_bin).resolve()/name)
            for name in ('initdb', 'pg_ctl', 'createdb', 'psql', 'pg_config')}
    directory = Path(tempfile.mkdtemp(prefix='pa-int03a-', dir='/tmp')).resolve()
    cluster, socket, storage = (directory/name for name in ('postgres', 'socket', 'storage'))
    socket.mkdir(mode=0o700)
    storage.mkdir(mode=0o700)
    path = Path(args.evidence).resolve()
    evidence = {'tarea': 'PA-T-INT07_PARTICIPANTES_LECTURAS', 'estado': 'EN_EJECUCION',
                'fecha_utc': datetime.now(timezone.utc).isoformat(), 'casos': [], 'carreras': [],
                'entorno': {'aislado': True, 'tcp_db': False, 'env_cargado': False},
                'limites': ['Antecedentes mínimos post067; no acredita replay001–067.',
                            'Participantes y lecturas; cantidades/reversiones/mortandad y frontend siguen pendientes.',
                            'Sin datos/Storage/Supabase externos, aplicación remota, push ni despliegue.']}

    def write():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')

    def run(command, timeout=60, extra_env=None):
        result = subprocess.run(command, cwd=ROOT, env=extra_env or env,
                                capture_output=True, text=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError((result.stderr or result.stdout or str(command))[-5000:])
        return result.stdout.strip()

    def psql(*command):
        return run([bins['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
                    '-p', PORT, '-U', 'postgres', '-d', DATABASE, *command])

    def install(file):
        psql('-f', str(ROOT/file))
        sources.append(ROOT/file)

    sources = []
    failed = False
    write()
    try:
        if any(not Path(p).is_file() for p in bins.values()):
            raise RuntimeError('Faltan binarios PostgreSQL en --pg-bin.')
        share = Path(run([bins['pg_config'], '--sharedir']))
        if not (share/'extension/postgis.control').is_file():
            raise RuntimeError('Se requiere PostGIS real.')
        locales = run(['locale', '-a']).splitlines()
        locale = next((x for x in ('C.UTF-8', 'C.utf8', 'en_US.UTF-8', 'en_US.utf8')
                       if x in locales), None)
        if not locale:
            raise RuntimeError('Falta locale UTF-8.')
        run([bins['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--encoding=UTF8', '--locale='+locale])
        opts = "-c listen_addresses='' -c unix_socket_directories='"+str(socket)+"' -c unix_socket_permissions=0700 -c port="+PORT+' -c max_connections=16 -c shared_buffers=16MB'
        run([bins['pg_ctl'], '-D', str(cluster), '-l', str(directory/'postgres.log'),
             '-w', '-t', '20', 'start', '-o', opts], timeout=30)
        run([bins['createdb'], '-h', str(socket), '-p', PORT, '-U', 'postgres', DATABASE])
        install('test/db/pa-int02c-fixture.sql')
        install('migrations/067_pa_int02a_postgrest_timeout.sql')
        migrations = sorted(p for p in ROOT.glob('migrations/0*.sql')
                            if 68 <= int(p.name[:3]) <= 85)
        if [int(p.name[:3]) for p in migrations] != list(range(68, 86)):
            raise RuntimeError('Se requiere una migración por número068–085.')
        for migration in migrations[:6]:
            install(str(migration.relative_to(ROOT)))
        install('test/db/pa-int03a-fixture.sql')
        legacy = (ROOT/'migrations/010_vivero_operational_rules.sql').read_text()
        start = legacy.index('CREATE OR REPLACE FUNCTION public.fn_vivero_assert_fecha_operativa(')
        psql('-c', legacy[start:legacy.index('$$;', start)+3])
        sources.append(ROOT/'migrations/010_vivero_operational_rules.sql')
        for migration in migrations[6:9]:
            install(str(migration.relative_to(ROOT)))
        install('test/db/pa-int02d-fixture.sql')
        psql('-c', 'ALTER TABLE public.evento_plantacion ADD COLUMN IF NOT EXISTS cantidad_muerta_delta INTEGER, ADD COLUMN IF NOT EXISTS registro_plantacion_id BIGINT REFERENCES public.registro_plantacion(id)')
        psql('-c', "ALTER TYPE public.tipo_evento_plantacion ADD VALUE IF NOT EXISTS 'MORTANDAD_REPORTADA'")
        # 080 histórico y 083 compatible se ensayan sobre un catálogo sintético
        # sin exposición heredada. La recuperación productiva083 tiene otro corte.
        for migration in migrations[9:14]:
            install(str(migration.relative_to(ROOT)))
        install('test/db/pa-int05-fixture.sql')
        for migration in migrations[14:]:
            install(str(migration.relative_to(ROOT)))
        install('test/db/pa-int07-participantes-fixture.sql')
        install(str(migrations[-1].relative_to(ROOT)))
        evidence['migraciones'] = [str(p.relative_to(ROOT)) for p in migrations]
        evidence['entorno'].update(postgresql=psql('-c', 'SHOW server_version'),
                                   postgis=psql('-c', 'SELECT postgis_lib_version()'),
                                   node=run(['node', '--version']))
        evidence['revision_git'] = run(['git', 'rev-parse', 'HEAD'])
        sources += [ROOT/'scripts/qa/pa-int07-participantes-test.py',
                    ROOT/'test/db/pa-int07-participantes-assertions.py',
                    ROOT/'test/db/pa-int07-participantes-migracion.py',
                    ROOT/'test/db/pa-int07-participantes-http.spec.ts',
                    ROOT/'test/jest-participacion-participantes-db.json',
                    ROOT/'scripts/qa/pa-int02d-harness.ts',
                    ROOT/'scripts/sql/pa-int07-cotejo-085.sql',
                    ROOT/'scripts/qa/pa-int02c-openapi.cjs',
                    ROOT/'docs/pa-int02c-openapi.json',
                    ROOT/'src/app.routes.ts', ROOT/'package.json', ROOT/'package-lock.json']
        sources += sorted(ROOT.glob('src/participacion/**/*.ts'))
        sources += sorted(ROOT.glob('src/auth/*.ts'))
        sources += sorted(ROOT.glob('src/impact/**/*.ts'))
        evidence['sha256'] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in sorted(set(sources)) if p.is_file()}
        write()
        common = ['--socket', str(socket), '--port', PORT, '--database', DATABASE,
                  '--psql', bins['psql'], '--evidence', str(path)]
        print('INT07 PostgreSQL '+evidence['entorno']['postgresql']+'; PostGIS real', flush=True)
        subprocess.run([sys.executable, str(ROOT/'test/db/pa-int07-participantes-assertions.py'), *common],
                       cwd=ROOT, env=env, timeout=180, check=True)
        evidence = json.loads(path.read_text())
        if not args.sql_only:
            http_env = dict(env, PA_A_DB_SOCKET=str(socket), PA_A_DB_PORT=PORT,
                            PA_A_DB_NAME=DATABASE, PA_A_DB_PSQL=bins['psql'],
                            PA_A_STORAGE_DIR=str(storage), PA_INT07_PARTICIPANTES_EVIDENCE=str(path))
            result = subprocess.run(['node', str(ROOT/'node_modules/jest/bin/jest.js'), '--config',
                str(ROOT/'test/jest-participacion-participantes-db.json'), '--runInBand',
                '--cacheDirectory', '/private/tmp/pa-int07-participantes-jest'], cwd=ROOT, env=http_env, timeout=180)
            evidence = json.loads(path.read_text())
            evidence['http'] = {'exit_code': result.returncode}
            if result.returncode:
                raise RuntimeError('Falló HTTP INT07 participantes/lecturas.')
        subprocess.run([sys.executable, str(ROOT/'test/db/pa-int07-participantes-migracion.py'), *common],
                       cwd=ROOT, env=env, timeout=180, check=True)
        evidence = json.loads(path.read_text())
        catalogue_query = ROOT/'scripts/sql/pa-int07-cotejo-085.sql'
        catalogue = json.loads(psql('-f', str(catalogue_query)))
        if (catalogue['entorno']['solo_lectura'] != 'on'
                or catalogue['entorno']['aislamiento'] != 'repeatable read'
                or any(catalogue['faltantes'].values())
                or any(not f['firma_compatible'] or not f['cuerpo_coincide'] for f in catalogue['funciones'])):
            raise RuntimeError('El catálogo085 local no coincide con el contrato esperado.')
        catalogue_path = path.with_name('pa-int07-085-catalogo-pg17-local.json')
        catalogue_evidence = {
            'tarea': 'PA-T-INT07_085_CATALOGO_LOCAL',
            'naturaleza': 'SINTETICO_AISLADO_SIN_TCP_SIN_ENV',
            'consulta': str(catalogue_query.relative_to(ROOT)),
            'consulta_sha256': hashlib.sha256(catalogue_query.read_bytes()).hexdigest(),
            'resultado_esperado': catalogue,
            'limite': 'Baseline local de catálogo; no acredita aplicación remota o funcionamiento de otro destino.',
        }
        catalogue_path.write_text(json.dumps(catalogue_evidence, ensure_ascii=False, indent=2)+'\n')
        evidence['catalogo085'] = {'archivo': str(catalogue_path.relative_to(ROOT) if catalogue_path.is_relative_to(ROOT) else catalogue_path),
                                   'sha256': hashlib.sha256(catalogue_path.read_bytes()).hexdigest(),
                                   'funciones': len(catalogue['funciones']), 'checks': len(catalogue['checks_comando']),
                                   'tablas': len(catalogue['tablas']), 'secuencias': len(catalogue['secuencias']),
                                   'solo_lectura': True}
        evidence['estado'] = 'SQL_CORRECTO_HTTP_PENDIENTE' if args.sql_only else 'CORRECTO'
    except (RuntimeError, subprocess.TimeoutExpired, subprocess.CalledProcessError) as error:
        failed = True
        if path.exists():
            evidence = json.loads(path.read_text())
        evidence.update(estado='FALLIDO', fallo=str(error))
        print(str(error), file=sys.stderr)
    finally:
        if (cluster/'postmaster.pid').exists():
            try:
                run([bins['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'], timeout=20)
            except (RuntimeError, subprocess.TimeoutExpired) as error:
                failed = True
                evidence['fallo_limpieza'] = str(error)
        stopped = not (cluster/'postmaster.pid').exists()
        if stopped:
            shutil.rmtree(directory)
        evidence['entorno'].update(cluster_detenido=stopped, directorio_eliminado=not directory.exists())
        write()
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
