#!/usr/bin/env python3
"""Backend INT02C persistente, sólo con PostgreSQL/personas sintéticas locales.

python3 scripts/qa/pa-int02c-preview.py
python3 scripts/qa/pa-int02c-preview.py --check --evidence /tmp/pa-preview.json
Ctrl+C elimina el entorno; reiniciar crea una semilla limpia y nuevos tokens.
No carga .env, no usa Supabase y no abre un puerto TCP de PostgreSQL.
"""
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
import time
import urllib.error
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parents[2]
DATABASE = 'pa_int02c_preview'
PG_PORT = '55435'  # Sólo socket, único por directorio de ejecución.
MIGRATIONS = [
    '068_pa_participacion_comando.sql', '069_pa_int02b_eventos_acceso.sql',
    '070_pa_int02b_permisos_contextuales.sql', '071_pa_int02b_bootstrap_controlado.sql',
    '072_pa_int02c_comandos_acceso.sql', '073_pa_int02c_lecturas.sql',
]


def verify_http(base, run_id, origin):
    """Peticiones de navegador por HTTP real, guard/servicios/RPC sin mocks."""
    checks = []

    def request(path, profile=None, body=None, method=None, headers=None):
        sent_headers = {'Origin': origin, **(headers or {})}
        if profile:
            sent_headers['Authorization'] = 'Bearer ' + profiles[profile]['token']
        data = None
        if body is not None:
            sent_headers['Content-Type'] = 'application/json'
            data = json.dumps(body, ensure_ascii=False).encode('utf8')
        req = urllib.request.Request(base + path, data=data, headers=sent_headers, method=method)
        try:
            response = urllib.request.urlopen(req, timeout=40)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            content = response.read()
            return response.status, json.loads(content) if content else None, dict(response.headers)

    def expect(label, condition):
        if not condition:
            raise RuntimeError('Fallo de preview HTTP: ' + label)
        checks.append(label)

    status, fixture, headers = request('/__fixture')
    expect('fixture sólo sintética y tokens locales', status == 200 and fixture['entorno'] == 'SINTETICO_LOCAL_INT02C'
           and len(fixture['perfiles']) == 8 and headers.get('Cache-Control') == 'private, no-store')
    profiles = {row['perfil']: row for row in fixture['perfiles']}
    status, health, _ = request('/__fixture/health')
    expect('servidor de esta ejecución', status == 200 and health['run_id'] == run_id)
    status, openapi, _ = request('/__fixture/openapi.json')
    expect('OpenAPI contiene las 14 rutas reales', status == 200 and len(openapi['paths']) == 14)
    path = '/api/v1/participacion'
    status, body, _ = request(path + '/capacidades')
    expect('visitante rechazado con envelope', status == 401 and body['error']['codigo'] == 'SESION_INVALIDA'
           and body['resultado_concluyente'] is False)
    status, body, _ = request(path + '/capacidades', 'inactivo')
    expect('cuenta inactiva revalidada', status == 403 and body['error']['codigo'] == 'CUENTA_INACTIVA')
    status, body, _ = request(path + '/capacidades', 'plantador', headers={'x-auth-id': 'preview-admin'})
    expect('identidad discordante rechazada', status == 401 and body['error']['codigo'] == 'IDENTIDAD_DISCORDANTE')
    status, body, _ = request(path + '/capacidades', 'voluntario')
    expect('sin permiso es vacío válido', status == 200 and body['data']['subcampanias'] == [])
    status, body, _ = request(path + '/capacidades', 'plantador')
    expect('plantador sólo obtiene su ámbito y acciones', status == 200
           and [scope['subcampania_id'] for scope in body['data']['subcampanias']] == ['600']
           and body['data']['subcampanias'][0]['acciones']['registrar_inicial']
           and not body['data']['subcampanias'][0]['acciones']['incorporar_plantador'])
    status, body, _ = request(path + '/capacidades', 'gestora')
    scopes = body['data']['subcampanias']
    expect('gestora propia/ajena y PAUSADA', status == 200 and not any(s['subcampania_id'] == '601' for s in scopes)
           and not any(next(s for s in scopes if s['subcampania_id'] == '605')['acciones'].values()))
    status, body, _ = request(path + '/capacidades', 'admin')
    expect('ADMIN global derivado en seis ámbitos', status == 200 and len(body['data']['subcampanias']) == 6
           and all(s['fuente_autoridad'] == 'GLOBAL' for s in body['data']['subcampanias']))
    status, body, _ = request('/api/v1/subcampanias/600/miembros-participacion', 'gestora')
    members = body['data']
    expect('miembros mínimos y globales deduplicados', status == 200
           and {m['usuario_id'] for m in members if m['acceso_global']} == {'600', '601'}
           and len({m['usuario_id'] for m in members}) == len(members)
           and all('correo' not in m and 'auth_id' not in m and 'contacto' not in m for m in members)
           and next(m for m in members if m['usuario_id'] == '607')['responsabilidad_logistica'] == 'COORDINADOR')
    status, body, _ = request('/api/v1/subcampanias/601/miembros-participacion', 'gestora')
    expect('miembros ajenos denegados', status == 403 and body['error']['ambitos'] == [])
    status, body, _ = request(path + '/personas/buscar', 'gestora', {
        'modo': 'NOMBRE', 'consulta': 'JOSE\u0301', 'accion': 'OTORGAR_PLANTADOR', 'subcampania_ids': ['600']})
    expect('búsqueda Unicode privada sin contactos', status == 200 and [p['usuario_id'] for p in body['data']] == ['603']
           and all(set(p) == {'usuario_id', 'nombre', 'organizacion'} for p in body['data']))
    status, body, _ = request(path + '/personas/buscar', 'gestora', {
        'modo': 'CORREO_EXACTO', 'consulta': ' VOLUNTARIO@EXAMPLE.INVALID ', 'accion': 'OTORGAR_PLANTADOR', 'subcampania_ids': ['600']})
    expect('correo exacto local encuentra cuenta activa', status == 200 and [p['usuario_id'] for p in body['data']] == ['604'])

    def review(actor, scopes):
        return request(path + '/accesos/revisar', actor, {'usuario_destino_id': '604', 'subcampania_ids': scopes})

    key = str(uuid.uuid4())
    grant = {'comando_id': key, 'usuario_destino_id': '604', 'ambitos': [{'subcampania_id': '600', 'revision_esperada': '0'}]}
    status, receipt, _ = request(path + '/accesos/otorgar-plantador', 'gestora', grant)
    expect('comando aplica permiso mediante PostgreSQL', status == 200 and receipt['estado'] == 'CONFIRMADO'
           and receipt['resultado']['cambios'][0]['usuarios'][0]['revision_nueva'] == '1')
    status, body, _ = request(path + '/accesos/otorgar-plantador', 'gestora', grant)
    expect('replay conserva el recibo exacto', status == 200 and body == receipt)
    status, body, _ = request(path + '/comandos/' + key + '?operacion=OTORGAR_PLANTADOR', 'gestora')
    expect('GET propio recupera el terminal', status == 200 and body == receipt)
    status, body, _ = request(path + '/comandos/' + key + '?operacion=OTORGAR_PLANTADOR', 'admin')
    expect('ADMIN no recupera un comando ajeno', status == 404 and body['error']['codigo'] == 'COMANDO_NO_CONFIRMADO')
    status, body, _ = request(path + '/accesos/otorgar-plantador', 'gestora', {**grant, 'usuario_destino_id': '603'})
    expect('otra intención no sobrescribe la clave', status == 409 and body['error']['codigo'] == 'COMANDO_REUTILIZADO')
    status, body, _ = request(path + '/accesos/otorgar-plantador', 'gestora', {
        **grant, 'comando_id': str(uuid.uuid4()), 'ambitos': [{'subcampania_id': '600', 'revision_esperada': '1'}]})
    expect('SIN_CAMBIOS conserva revisión', status == 200 and body['resultado']['cambios'][0]['usuarios'][0]['cambio'] == 'SIN_CAMBIOS'
           and body['resultado']['cambios'][0]['usuarios'][0]['revision_nueva'] == '1')
    status, body, _ = request(path + '/accesos/otorgar-plantador', 'gestora', {**grant, 'comando_id': str(uuid.uuid4())})
    expect('revisión obsoleta es rechazo durable', status == 409 and body['estado'] == 'RECHAZADO'
           and body['error']['codigo'] == 'REVISION_OBSOLETA')
    status, before, _ = review('admin', ['600', '601'])
    if status != 200:
        raise RuntimeError('No se pudo revisar estado previo de fixture.')
    status, body, _ = request(path + '/accesos/otorgar-plantador', 'gestora', {
        **grant, 'comando_id': str(uuid.uuid4()), 'ambitos': [
            {'subcampania_id': '600', 'revision_esperada': '1'}, {'subcampania_id': '601', 'revision_esperada': '0'}]})
    status_after, after, _ = review('admin', ['600', '601'])
    expect('selección ajena rechaza sin cambios parciales', status == 403 and body['error']['ambitos'] == []
           and status_after == 200 and after['data'] == before['data'])
    status, body, _ = request(path + '/accesos/retirar-administrador', 'admin', {
        'comando_id': str(uuid.uuid4()), 'usuario_destino_id': '602', 'ambitos': [{'subcampania_id': '600', 'revision_esperada': '1'}]})
    expect('último administrador contextual protegido', status == 409 and body['error']['codigo'] == 'ULTIMO_ADMINISTRADOR_CONTEXTUAL')
    status, body, _ = request(path + '/accesos/retirar-plantador', 'gestora', {
        **grant, 'comando_id': str(uuid.uuid4()), 'ambitos': [{'subcampania_id': '600', 'revision_esperada': '1'}]})
    expect('retiro incrementa revisión y conserva historia', status == 200
           and body['resultado']['cambios'][0]['usuarios'][0]['revision_nueva'] == '2')
    status, body, _ = request(path + '/comandos/' + key + '?operacion=OTORGAR_PLANTADOR', 'gestora')
    expect('retiro no destruye el recibo anterior', status == 200 and body == receipt)
    status, body, _ = request('/api/v1/usuarios/603/roles', 'admin', {
        'comando_id': str(uuid.uuid4()), 'rol_global': 'GENERAL', 'revision_esperada': '0', 'motivo': 'Cambio sintético local'})
    expect('autoridad usa su comando separado', status == 200 and body['resultado']['tipo'] == 'ROL_GLOBAL'
           and body['resultado']['revision_nueva'] == '1')
    status, body, headers = request(path + '/comandos/11111111-1111-4111-8111-111111111111?operacion=REGISTRAR_PLANTACION_INICIAL', 'admin')
    exposed = [header.strip().lower() for header in headers.get('Access-Control-Expose-Headers', '').split(',')]
    expect('202 inconcluso expone Retry-After con CORS', status == 202 and body['estado'] == 'SIN_RESULTADO'
           and headers.get('Retry-After') == '2' and 'retry-after' in exposed
           and headers.get('Access-Control-Allow-Origin') == origin)
    status, body, _ = request(path + '/accesos/otorgar-plantador', 'admin', {**grant, 'actor_id': '600'})
    expect('DTO rechaza actor enviado por cliente', status == 422 and body['error']['codigo'] == 'CAMPO_NO_PERMITIDO')
    status, _, _ = request('/__fixture', headers={'Origin': 'https://ajeno.example.invalid'})
    expect('origen externo no obtiene sesiones sintéticas', status == 403)
    status, _, _ = request('/__fixture', headers={'Host': 'ajeno.example.invalid'})
    expect('Host externo rechazado', status == 403)
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', type=int, default=3302, help='HTTP en 127.0.0.1 (default 3302).')
    parser.add_argument('--origin', action='append', help='Origen PWA local permitido; puede repetirse.')
    parser.add_argument('--check', action='store_true', help='Verifica HTTP positivo y limpia al terminar.')
    parser.add_argument('--evidence', type=Path, help='Guardar evidencia sin tokens, junto con --check.')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or (args.evidence and not args.check):
        parser.error('--port debe estar entre 1024 y 65535; --evidence requiere --check.')
    origins = args.origin or ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000']
    verify_origin = args.origin[0] if args.origin else 'http://localhost:5173'
    import re
    if any(not re.fullmatch(r'http://(localhost|127\.0\.0\.1):[0-9]+', origin) for origin in origins):
        parser.error('--origin sólo admite http://localhost:puerto o http://127.0.0.1:puerto.')
    origins = sorted(set(origins + [f'http://127.0.0.1:{args.port}', f'http://localhost:{args.port}']))
    binaries = {name: shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql', 'createdb', 'node')}
    missing = [name for name, path in binaries.items() if path is None]
    if missing:
        raise RuntimeError('Faltan binarios locales: ' + ', '.join(missing))
    if not (ROOT / 'node_modules/ts-node/register').exists():
        raise RuntimeError('Falta ts-node local; instalar dependencias con npm ci.')
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(('PG', 'SUPABASE_', 'PA_C_PREVIEW_', 'TS_NODE_', 'DOTENV_'))
           and key not in ('JWT_SECRET', 'DATABASE_URL', 'NODE_OPTIONS', 'NODE_PATH')}
    env.update({'LC_ALL': 'C', 'NODE_ENV': 'test', 'PGAPPNAME': 'pa_int02c_preview'})
    directory = Path(tempfile.mkdtemp(prefix='pa-int02c-preview-', dir='/tmp')).resolve()
    cluster = directory / 'postgres'
    socket = directory / 'socket'
    socket.mkdir(mode=0o700)
    run_id = str(uuid.uuid4())
    base = f'http://127.0.0.1:{args.port}'
    server = None
    failed = False
    evidence = None

    def run(command, timeout=60):
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or str(command))
        return result.stdout

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    previous = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        available = run(['locale', '-a']).splitlines()
        utf8_locale = next((value for value in ('C.UTF-8', 'C.utf8', 'en_US.UTF-8', 'en_US.utf8') if value in available), None)
        if not utf8_locale:
            raise RuntimeError('Falta locale UTF-8 con case folding Unicode para el nombre.')
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject',
             '--locale=' + utf8_locale, '--encoding=UTF8'])
        options = ("-c listen_addresses='' -c unix_socket_directories='" + str(socket)
                   + "' -c unix_socket_permissions=0700 -c port=" + PG_PORT + ' -c max_connections=12 -c shared_buffers=16MB')
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'), '-w', '-t', '20', 'start', '-o', options], timeout=30)
        run([binaries['createdb'], '-h', str(socket), '-p', PG_PORT, '-U', 'postgres', DATABASE])
        psql_args = [binaries['psql'], '-X', '-qAt', '-h', str(socket), '-p', PG_PORT, '-U', 'postgres', '-d', DATABASE, '-v', 'ON_ERROR_STOP=1']
        run(psql_args + ['-f', str(ROOT / 'test/db/pa-int02c-preview-fixture.sql')])
        for filename in MIGRATIONS:
            run(psql_args + ['-f', str(ROOT / 'migrations' / filename)])
        revision = run(['git', 'rev-parse', 'HEAD']).strip()
        dirty = bool(run(['git', 'status', '--porcelain']).strip())
        migration_hashes = {filename: hashlib.sha256((ROOT / 'migrations' / filename).read_bytes()).hexdigest() for filename in MIGRATIONS}
        child_env = dict(env, PA_C_PREVIEW_RUN=run_id, PA_C_PREVIEW_SOCKET=str(socket), PA_C_PREVIEW_CLUSTER=str(cluster),
                         PA_C_PREVIEW_PSQL=binaries['psql'], PA_C_PREVIEW_PORT=str(args.port),
                         PA_C_PREVIEW_ORIGINS=json.dumps(origins), PA_C_PREVIEW_REVISION=revision,
                         PA_C_PREVIEW_DIRTY=str(dirty).lower(),
                         PA_C_PREVIEW_MIGRACIONES=json.dumps(migration_hashes),
                         TS_NODE_PROJECT=str(ROOT / 'tsconfig.json'))
        server = subprocess.Popen([binaries['node'], '-r', 'ts-node/register', str(ROOT / 'scripts/qa/pa-int02c-preview-server.ts')],
                                  cwd=ROOT, env=child_env)
        deadline = time.monotonic() + 45
        while True:
            if server.poll() is not None:
                raise RuntimeError('El servidor Nest sintético terminó antes de estar listo.')
            try:
                with urllib.request.urlopen(base + '/__fixture/health', timeout=1) as response:
                    if json.load(response).get('run_id') == run_id:
                        break
            except (OSError, ValueError):
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('El servidor Nest sintético no respondió dentro de 45 s.')
            time.sleep(0.1)
        print('\nENTORNO SINTÉTICO LOCAL INT02C — PostgreSQL sin TCP, sin .env ni Supabase.', flush=True)
        print('API: ' + base + '/api/v1 | Perfiles/tokens locales: ' + base + '/__fixture', flush=True)
        print('OpenAPI: ' + base + '/__fixture/openapi.json', flush=True)
        print('Tokens renovables consultando /__fixture; duran 2 h y sólo valen en esta ejecución.', flush=True)
        print('Reiniciar resetea cambios. Ctrl+C detiene Nest/PostgreSQL y elimina el clúster.', flush=True)
        if args.check:
            checks = verify_http(base, run_id, verify_origin)
            evidence = {
                'estado': 'CORRECTO', 'entorno': 'SINTETICO_LOCAL_INT02C',
                'backend_head': revision, 'cambios_de_trabajo': dirty, 'migraciones_sha256': migration_hashes,
                'postgresql': run(psql_args + ['-c', 'SHOW server_version']).strip(),
                'lc_ctype': run(psql_args + ['-c', 'SHOW lc_ctype']).strip(),
                'url_verificada': base, 'origen_verificado': verify_origin, 'sin_datos_reales': True,
                'transporte': 'psql socket privado; SQLSTATE/details preservados',
                'checks_aprobados': len(checks), 'checks': checks,
                'limitaciones': ['Antecedente mínimo sintético post-067; no reconstruye 001–067.', 'No acredita backend desplegado ni catálogo remoto.', 'No incluye login WebAuthn, registro, fotos, stock o Impacto.'],
            }
            print('HTTP real sintético: ' + str(len(checks)) + '/' + str(len(checks)) + ' comprobaciones aprobadas.', flush=True)
        else:
            print('Clúster propio: ' + str(directory), flush=True)
            server.wait()
            if server.returncode:
                raise RuntimeError('El servidor Nest terminó con código ' + str(server.returncode))
    except KeyboardInterrupt:
        print('\nDeteniendo el entorno sintético local.', flush=True)
    except (RuntimeError, subprocess.TimeoutExpired, OSError) as error:
        failed = True
        print(str(error), file=sys.stderr)
    finally:
        if server is not None and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)
        if (cluster / 'postmaster.pid').exists():
            try:
                result = subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'],
                                        env=env, text=True, capture_output=True, timeout=20)
                if result.returncode and (cluster / 'postmaster.pid').exists():
                    failed = True
                    print('Clúster activo; archivos conservados en ' + str(directory), file=sys.stderr)
            except subprocess.TimeoutExpired:
                failed = True
                print('Timeout al detener PostgreSQL; archivos conservados en ' + str(directory), file=sys.stderr)
        stopped = not (cluster / 'postmaster.pid').exists()
        if stopped:
            shutil.rmtree(directory)
        if evidence is not None:
            evidence.update({'cluster_detenido': stopped, 'directorio_eliminado': not directory.exists()})
            if failed:
                evidence['estado'] = 'FALLIDO_CLEANUP'
            if args.evidence:
                args.evidence.parent.mkdir(parents=True, exist_ok=True)
                args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
                print('Evidencia sin tokens: ' + str(args.evidence.resolve()), flush=True)
        for sig, handler in previous.items():
            signal.signal(sig, handler)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
