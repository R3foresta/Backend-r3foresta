#!/usr/bin/env python3
"""113: alta atómica en PostgreSQL propio desechable, sin TCP, .env ni Supabase."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'migrations/113_usuario_alta_atomica.sql'
SIGNATURE = 'public.pa_usuario_registrar(text,text,text,text,text,text,integer,text[])'


def literal(value):
    return 'NULL' if value is None else "'" + value.replace("'", "''") + "'"


def registration(username, credential, auth_id=None, correo=None):
    args = [auth_id or 'auth-' + username, username, correo, credential,
            'clave-publica-sintetica', 'ES256']
    return ('SELECT public.pa_usuario_registrar(' + ','.join(map(literal, args))
            + ",0,ARRAY['internal']::text[]);")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    if args.evidence and (args.evidence.exists() or not args.evidence.parent.is_dir()):
        parser.error('--evidence requiere un archivo nuevo y un directorio existente.')
    binaries = {name: str(args.pg_bin / name) for name in ('initdb', 'pg_ctl', 'psql')}
    for binary in binaries.values():
        if not os.access(binary, os.X_OK):
            parser.error('Falta ejecutable PostgreSQL: ' + binary)
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update(LC_ALL='C', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull)
    directory = Path(tempfile.mkdtemp(prefix='alta113-', dir='/tmp')).resolve()
    cluster, socket = directory / 'pg', directory / 'socket'
    socket.mkdir(mode=0o700)
    commands = [binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-h', str(socket), '-p', '55449', '-U', 'postgres', '-d', 'postgres']
    checks = []
    children = []

    def run(command):
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=40)
        if result.returncode:
            raise RuntimeError(result.stderr[-2500:])
        return result.stdout.strip()

    def sql(statement, error=None):
        result = subprocess.run(commands + ['-c', statement], env=env, text=True,
                                capture_output=True, timeout=30)
        if error:
            if result.returncode == 0 or error not in result.stderr:
                raise AssertionError('Falta rechazo ' + error + ': ' + result.stderr[-1800:])
        elif result.returncode:
            raise RuntimeError(result.stderr[-2500:])
        return result.stdout.strip()

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    def state():
        return sql("""SELECT jsonb_build_object(
          'usuarios',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.usuario u),
          'credenciales',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.usuario_credencial c))""")

    def hold(statement):
        process = subprocess.Popen(commands, env=env, text=True, stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=1)
        children.append(process)
        process.stdin.write('\\o /dev/null\nBEGIN; SET LOCAL ROLE service_role;\n'
                            + statement + '\n\\o\n\\echo BARRERA\n')
        process.stdin.flush()
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if select.select([process.stdout], [], [], 0.1)[0]:
                line = process.stdout.readline()
                if line.strip() == 'BARRERA':
                    return process
                if not line:
                    raise AssertionError('Falló la primera transacción: ' + process.stderr.read())
        raise AssertionError('La primera transacción no alcanzó la barrera.')

    def race(first, second, label, error, commit=True):
        holder = hold(first)
        contender = subprocess.Popen(commands + ['-c', 'SET ROLE service_role; ' + second],
                                     env={**env, 'PGAPPNAME': label}, text=True,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        children.append(contender)
        deadline = time.monotonic() + 4
        blocked = False
        while time.monotonic() < deadline:
            blocked = sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name="
                          + literal(label) + " AND wait_event_type='Lock')") == 't'
            if blocked or contender.poll() is not None:
                break
            time.sleep(0.02)
        check(blocked, label + ': espera por unicidad observada en pg_stat_activity')
        holder.stdin.write(('COMMIT;' if commit else 'ROLLBACK;') + '\n\\q\n')
        holder.stdin.flush()
        holder.wait(timeout=8)
        check(holder.returncode == 0, label + ': primera transacción finaliza')
        output, stderr = contender.communicate(timeout=8)
        check((contender.returncode != 0 and error in stderr) if error else contender.returncode == 0,
              label + ': segunda transacción obtiene el resultado esperado')
        return output

    try:
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--locale=C', '--encoding=UTF8'])
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', "-c listen_addresses='' -c unix_socket_directories='"
             + str(socket) + "' -c unix_socket_permissions=0700 -c port=55449 -c shared_buffers=16MB"])
        version = sql('SHOW server_version')
        check(sql('SHOW listen_addresses') == '', 'Clúster privado sin TCP')
        run(commands + ['-f', str(ROOT / 'test/db/usuario-alta-fixture.sql')])
        original = state()
        run(commands + ['-f', str(MIGRATION)])
        run(commands + ['-f', str(MIGRATION)])
        check(state() == original, 'Instalación repetida conserva cuentas, roles y passkey legados')
        check(sql('SELECT NOT prosecdef FROM pg_proc WHERE oid=' + literal(SIGNATURE) + '::regprocedure') == 't',
              'RPC SECURITY INVOKER con firma privada')

        # El fallo ocurre después del INSERT de usuario, dentro de la segunda escritura.
        sql("""CREATE FUNCTION public.fallar_credencial_sintetica() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.credential_id='fallo-sintetico' THEN
            RAISE EXCEPTION 'FALLO_CREDENCIAL_SINTETICO'; END IF; RETURN NEW; END $$;
          CREATE TRIGGER fallo_sintetico BEFORE INSERT ON public.usuario_credencial
            FOR EACH ROW EXECUTE FUNCTION public.fallar_credencial_sintetica();""")
        sql('SET ROLE service_role; ' + registration('Reintento', 'fallo-sintetico'), 'FALLO_CREDENCIAL_SINTETICO')
        check(state() == original, 'Fallo al insertar credencial revierte íntegramente la cuenta nueva')
        registered = json.loads(sql('SET ROLE service_role; ' + registration('Reintento', 'valida-reintento')))
        check(registered['username'] == 'Reintento' and registered['correo'] is None,
              'Reintento válido conserva el mismo nombre y correo opcional NULL')
        check(isinstance(registered['usuario_id'], str) and int(registered['usuario_id']) > 2**53,
              'RPC proyecta BIGINT como cadena exacta fuera del rango seguro JavaScript')
        check(sql("SELECT count(*)=1 FROM public.usuario u JOIN public.usuario_credencial c ON c.usuario_id=u.id "
                  "WHERE u.id=" + registered['usuario_id'] + " AND u.rol='VOLUNTARIO' AND u.activo "
                  "AND u.nombre=u.username AND c.credential_id='valida-reintento'") == 't',
              'Éxito confirma usuario VOLUNTARIO activo y FK exacta de la credencial')
        sql('SET ROLE service_role; ' + registration('SegundoSinCorreo', 'sin-correo-2'))
        check(sql('SELECT count(*) FROM public.usuario WHERE correo IS NULL') == '3',
              'Varias altas sin correo conviven con cuentas legadas')

        for statement, error, label in [
            (registration('Reintento', 'nombre-duplicado'), 'USUARIO_YA_EXISTE', 'username duplicado'),
            (registration('CredencialDuplicada', 'valida-reintento'), 'DATOS_ALTA_EN_USO', 'credencial duplicada'),
            (registration('CorreoDuplicado', 'correo-duplicado', correo='legado@example.invalid'), 'DATOS_ALTA_EN_USO', 'correo duplicado'),
            (registration('AuthDuplicado', 'auth-duplicado', auth_id='auth-admin-legado'), 'DATOS_ALTA_EN_USO', 'auth_id duplicado'),
            (registration('', 'nombre-vacio'), 'DATOS_ALTA_INVALIDOS', 'username vacío'),
        ]:
            previous = state()
            sql('SET ROLE service_role; ' + statement, error)
            check(state() == previous, label + ': rechaza y conserva ambas tablas')

        for role in ('anon', 'authenticated'):
            previous = state()
            sql('SET ROLE ' + role + '; ' + registration('Publico', 'publico'), 'permission denied for function')
            sql('SET ROLE ' + role + '; SELECT * FROM public.usuario', 'permission denied')
            sql('SET ROLE ' + role + '; SELECT * FROM public.usuario_credencial', 'permission denied')
            check(state() == previous, role + ': RPC y datos privados inaccesibles')
        check(sql("SELECT NOT EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a "
                  "WHERE p.oid=" + literal(SIGNATURE) + "::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')") == 't',
              'PUBLIC carece de EXECUTE sobre la RPC')

        race(registration('CarreraNombre', 'nombre-1'), registration('CarreraNombre', 'nombre-2', 'auth-nombre-2'),
             'alta113_nombre', 'USUARIO_YA_EXISTE')
        race(registration('CarreraCredencial1', 'cred-compartida'), registration('CarreraCredencial2', 'cred-compartida'),
             'alta113_credencial', 'DATOS_ALTA_EN_USO')
        race(registration('CarreraCorreo1', 'correo-1', correo='carrera@example.invalid'),
             registration('CarreraCorreo2', 'correo-2', correo='carrera@example.invalid'),
             'alta113_correo', 'DATOS_ALTA_EN_USO')
        race(registration('NombreLiberado', 'descartada'), registration('NombreLiberado', 'confirmada', 'auth-reintentada'),
             'alta113_rollback', None, commit=False)
        check(sql("SELECT NOT EXISTS(SELECT 1 FROM public.usuario u LEFT JOIN public.usuario_credencial c "
                  "ON c.usuario_id=u.id WHERE u.id>3 AND c.id IS NULL)") == 't',
              'Carreras confirmadas y revertidas conservan una credencial por cada alta exitosa')
        check(sql("SELECT count(*) FROM public.usuario_credencial WHERE credential_id='descartada'") == '0',
              'Rollback concurrente libera el nombre sin conservar credencial parcial')

        migration = MIGRATION.read_text().replace('BEGIN;', '', 1)
        for drift, error in [
            ('ALTER TABLE public.usuario DROP CONSTRAINT usuario_username_key;', 'ALTA_113_UNICIDAD_INCOMPATIBLE'),
            ('ALTER TABLE public.usuario DROP CONSTRAINT usuario_correo_key;', 'ALTA_113_UNICIDAD_INCOMPATIBLE'),
            ('ALTER TABLE public.usuario_credencial DROP CONSTRAINT usuario_credencial_credential_id_key;', 'ALTA_113_UNICIDAD_INCOMPATIBLE'),
            ('GRANT SELECT ON public.usuario TO anon;', 'ALTA_113_PRIVACIDAD_INCOMPATIBLE'),
        ]:
            previous = state()
            sql('BEGIN; ' + drift + migration, error)
            check(state() == previous, 'Preflight aborta con rollback ante ' + drift)
        run(commands + ['-f', str(MIGRATION)])
        legacy = sql("""SELECT jsonb_build_object(
          'usuarios',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.usuario u WHERE id<=3),
          'credenciales',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.usuario_credencial c WHERE usuario_id<=3))""")
        check(legacy == original, 'Cuentas y passkey legadas conservadas íntegramente al terminar')

        report = {
            'fecha_utc': datetime.now(timezone.utc).isoformat(), 'resultado': 'APROBADO',
            'postgresql': version, 'entorno': 'POSTGRESQL_PRIVADO_DESECHABLE_SIN_TCP_SIN_ENV',
            'comprobaciones': checks, 'total': len(checks),
            'sha256_migracion': hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
            'limites': ['Fixture focal de usuario/credencial con 064–067 reales, sin replay completo de migraciones.',
                        'Sin PostgREST/Supabase remoto ni navegador o autenticador WebAuthn.',
                        'Las secuencias pueden avanzar cuando PostgreSQL revierte un INSERT.'],
        }
        if args.evidence:
            args.evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(f"113: {len(checks)} comprobaciones aprobadas en PostgreSQL {version}.")
    finally:
        for process in children:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=5)
        if (cluster / 'postmaster.pid').exists():
            subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'],
                           env=env, text=True, capture_output=True, timeout=20)
        if (cluster / 'postmaster.pid').exists():
            raise RuntimeError('Clúster propio aún activo; archivos conservados en ' + str(directory))
        shutil.rmtree(directory)


if __name__ == '__main__':
    main()
