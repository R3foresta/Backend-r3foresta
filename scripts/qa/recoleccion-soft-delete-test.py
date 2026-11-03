#!/usr/bin/env python3
"""RN-REC-09A/089: PostgreSQL aislado, rollback, ACL y carreras; sin .env ni TCP."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'migrations/089_recoleccion_eliminar_borrador.sql'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    binaries = {}
    for name in ('initdb', 'pg_ctl', 'psql'):
        binary = str(args.pg_bin / name) if args.pg_bin else shutil.which(name)
        if not binary:
            parser.error(f'Falta {name}; use --pg-bin o PATH.')
        binaries[name] = binary
    if args.evidence and args.evidence.exists():
        parser.error('La evidencia debe ser un archivo nuevo.')
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update(LC_ALL='C', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull,
               PGAPPNAME='recoleccion_089_aislada')
    directory = Path(tempfile.mkdtemp(prefix='rec089-', dir='/tmp')).resolve()
    cluster, socket = directory / 'postgres', directory / 'socket'
    socket.mkdir(mode=0o700)
    checks = []
    children = []

    def run(command):
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        return result.stdout.strip()

    def command():
        return [binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-h', str(socket), '-p', '55440', '-U', 'postgres', '-d', 'postgres']

    def sql(statement, error=None, service=False):
        query = ("SET ROLE service_role; " if service else '') + statement
        result = subprocess.run(command() + ['-c', query], env=env, text=True,
                                capture_output=True, timeout=30)
        if error:
            if result.returncode == 0 or error not in result.stderr:
                raise AssertionError(f'Esperado {error}: {result.stderr}')
        elif result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        return result.stdout.strip()

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    def remove(record, actor=1, error=None):
        return sql(f'SELECT public.fn_recoleccion_eliminar_borrador({record},{actor});',
                   error=error, service=True)

    def start(statement, name):
        child_env = dict(env, PGAPPNAME=name)
        process = subprocess.Popen(command(), env=child_env, text=True,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        children.append(process)
        process.stdin.write(statement + '\n')
        process.stdin.flush()
        return process

    def await_marker(process):
        # statement_timeout limita el SQL; subprocess se termina en finally si falla.
        while process.stdout.readline().strip() != 'LOCK_HELD':
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read())

    def await_blocked(name):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock'") == '1':
                return
            time.sleep(0.02)
        raise AssertionError('La segunda sesión no esperó el lock observado: ' + name)

    try:
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
        options = f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55440 -c unix_socket_permissions=0700"
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', options])
        version = sql('SHOW server_version')
        sql("""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TYPE public.estado_registro_recoleccion AS ENUM('BORRADOR','PENDIENTE_VALIDACION','VALIDADO','RECHAZADO');
CREATE TABLE public.usuario(id bigint PRIMARY KEY,rol text NOT NULL,activo boolean NOT NULL DEFAULT true);
CREATE TABLE public.recoleccion(id bigint PRIMARY KEY,usuario_id bigint NOT NULL REFERENCES public.usuario(id),
 estado_registro public.estado_registro_recoleccion NOT NULL DEFAULT 'BORRADOR',codigo_trazabilidad text NOT NULL,
 saldo_actual numeric NOT NULL DEFAULT 123,nombre_recolector_snapshot text NOT NULL DEFAULT 'snapshot sintético',
 created_at timestamptz NOT NULL DEFAULT now());
-- Privilegios de cuenta preexistentes usados también por las RPC contextuales.
GRANT SELECT,UPDATE(rol,activo) ON public.usuario TO service_role;
INSERT INTO public.usuario VALUES(1,'GENERAL',true),(2,'GENERAL',true),(3,'ADMIN',true),
 (4,'GENERAL',false),(5,'VOLUNTARIO',true),(6,'VALIDADOR',true);
INSERT INTO public.recoleccion(id,usuario_id,codigo_trazabilidad)
SELECT i,CASE WHEN i=6 THEN 6 ELSE 1 END,'REC-SINTETICA-'||i FROM generate_series(1,60)i;
CREATE TABLE public.tipos_entidad_evidencia(id bigint PRIMARY KEY,codigo text NOT NULL);
INSERT INTO public.tipos_entidad_evidencia VALUES(1,'RECOLECCION'),(2,'LOTE_VIVERO');
CREATE TABLE public.evidencias_trazabilidad(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tipo_entidad_id bigint NOT NULL REFERENCES public.tipos_entidad_evidencia(id),entidad_id bigint NOT NULL,
 bucket text NOT NULL DEFAULT 'recoleccion_fotos',ruta_archivo text NOT NULL);
GRANT SELECT ON public.tipos_entidad_evidencia TO service_role;
GRANT SELECT,INSERT,DELETE ON public.evidencias_trazabilidad TO service_role;
GRANT USAGE ON SEQUENCE public.evidencias_trazabilidad_id_seq TO service_role;
UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION' WHERE id=3;
UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=4;
UPDATE public.recoleccion SET estado_registro='RECHAZADO' WHERE id=5;
""")
        run(command() + ['-f', str(ROOT / 'migrations/014_recoleccion_historial.sql')])
        sql(MIGRATION.read_text(), error='Cotejar 015')
        check(sql("SELECT to_regprocedure('public.fn_recoleccion_eliminar_borrador(bigint,bigint)') IS NULL") == 't',
              'Preflight rechaza antecedente sin 015 sin instalar una RPC parcial')
        # La fecha canónica de M1 es DATE desde 015; no ensayar únicamente 014.
        run(command() + ['-f', str(ROOT / 'migrations/015_temporal_granularity_day_only.sql')])
        before = sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.recoleccion r")
        for _ in range(2):
            run(command() + ['-f', str(MIGRATION)])
        check(before == sql("SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.recoleccion r"),
              'Instalación y repetición sin modificar filas existentes')
        check(sql("SELECT has_function_privilege('service_role','public.fn_recoleccion_eliminar_borrador(bigint,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.fn_recoleccion_eliminar_borrador(bigint,bigint)','EXECUTE') AND NOT has_function_privilege('authenticated','public.fn_recoleccion_eliminar_borrador(bigint,bigint)','EXECUTE')") == 't',
              'RPC privada: solo servicio, sin ejecución pública')
        original = sql("SELECT to_jsonb(r)-ARRAY['eliminado_en','eliminado_por_usuario_id'] FROM public.recoleccion r WHERE id=1")
        response = json.loads(remove(1))
        check(response['recoleccion_id'] == 1 and response['eliminado_por_usuario_id'] == 1,
              'Creador elimina un BORRADOR con actor y fecha automáticos')
        check(response['eliminado_en'] == sql('SELECT eliminado_en::text FROM public.recoleccion WHERE id=1')
              and len(response['eliminado_en']) == 10,
              'Respuesta DATE coincide con el valor persistido tras aplicar 015')
        check(original == sql("SELECT to_jsonb(r)-ARRAY['eliminado_en','eliminado_por_usuario_id'] FROM public.recoleccion r WHERE id=1"),
              'Conserva fila, código, estado, saldo, creación y snapshot')
        check(sql("SELECT count(*)=1 AND bool_and(h.created_at=r.eliminado_en AND h.actor_user_id=r.eliminado_por_usuario_id AND h.tipo_historial='BORRADOR_ELIMINADO' AND h.metadata->>'codigo_trazabilidad'=r.codigo_trazabilidad) FROM public.recoleccion_historial h JOIN public.recoleccion r ON r.id=h.recoleccion_id WHERE r.id=1") == 't',
              'Historial y marca comparten usuario/fecha en la misma transacción')
        remove(1, error='Recolección no encontrada')
        check(sql('SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id=1') == '1',
              'Repetir devuelve no encontrado y no duplica el historial')
        # Las zonas extremas fuerzan fechas de sesión diferentes entre sí;
        # ambas deben guardar y devolver el mismo día de negocio en La Paz.
        business_date = sql("SELECT (clock_timestamp() AT TIME ZONE 'America/La_Paz')::date::text")
        session_dates = set()
        for record, timezone in ((9, 'Pacific/Kiritimati'), (13, 'Etc/GMT+12')):
            session_dates.add(sql(f"SET TIME ZONE '{timezone}'; SELECT current_date::text"))
            zone_response = json.loads(sql(f"SET TIME ZONE '{timezone}'; SELECT public.fn_recoleccion_eliminar_borrador({record},1)", service=True))
            check(zone_response['eliminado_en'] == business_date
                  and zone_response['eliminado_en'] == sql(f'SELECT eliminado_en::text FROM public.recoleccion WHERE id={record}')
                  and zone_response['eliminado_en'] == sql(f'SELECT created_at::text FROM public.recoleccion_historial WHERE recoleccion_id={record}'),
                  f'Fecha de negocio/persistencia/respuesta coherentes con sesión {timezone}')
        check(len(session_dates) == 2,
              'La prueba cruza el borde de día entre zonas de sesión extremas')
        remove(2, actor=3)
        check(sql('SELECT eliminado_por_usuario_id FROM public.recoleccion WHERE id=2') == '3',
              'ADMIN puede eliminar borrador de otro creador')
        remove(6, actor=6)
        check(sql('SELECT eliminado_por_usuario_id FROM public.recoleccion WHERE id=6') == '6',
              'VALIDADOR creador conserva el permiso de edición por objeto')
        for record in (3, 4, 5):
            remove(record, error='Solo se puede eliminar')
        check(sql('SELECT count(*) FROM public.recoleccion WHERE id IN(3,4,5) AND eliminado_en IS NOT NULL') == '0',
              'Rechaza PENDIENTE_VALIDACION, VALIDADO y RECHAZADO')
        for actor, expected in ((2, 'Solo el creador'), (4, 'Cuenta interna'),
                                (5, 'Cuenta interna'), (999, 'Cuenta interna')):
            remove(7, actor, error=expected)
        check(sql('SELECT eliminado_en IS NULL FROM public.recoleccion WHERE id=7') == 't',
              'Rechaza ajeno, inactivo, VOLUNTARIO y actor inexistente')
        remove(9999, error='Recolección no encontrada')
        sql("UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION' WHERE id=1", error='Recolección no encontrada')
        sql('UPDATE public.recoleccion SET eliminado_en=NULL WHERE id=1', error='Recolección no encontrada')
        sql('DELETE FROM public.recoleccion_historial WHERE recoleccion_id=1', error='append-only')
        check(True, 'No permite editar/reactivar el eliminado ni borrar su historial')
        sql("""CREATE FUNCTION public.fail_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_HISTORIAL_SINTETICO'; END $$;
CREATE TRIGGER fail_history BEFORE INSERT ON public.recoleccion_historial FOR EACH ROW WHEN(NEW.recoleccion_id=8) EXECUTE FUNCTION public.fail_history();""")
        remove(8, error='FALLO_HISTORIAL_SINTETICO')
        check(sql('SELECT eliminado_en IS NULL AND eliminado_por_usuario_id IS NULL FROM public.recoleccion WHERE id=8') == 't',
              'Si falla el historial revierte también la eliminación')

        # Eliminación gana: el UPDATE legado espera y luego no puede enviar a revisión.
        winner = start("BEGIN; SELECT public.fn_recoleccion_eliminar_borrador(10,1); SELECT 'LOCK_HELD';", 'rec089_delete_wins')
        await_marker(winner)
        loser = start("UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION' WHERE id=10;", 'rec089_stale_submit')
        await_blocked('rec089_stale_submit')
        winner.communicate('COMMIT;\n', timeout=10)
        loser_out, loser_error = loser.communicate(timeout=10)
        check(loser.returncode != 0 and 'Recolección no encontrada' in loser_error
              and sql("SELECT estado_registro='BORRADOR' AND eliminado_en IS NOT NULL FROM public.recoleccion WHERE id=10") == 't',
              'Carrera DELETE -> submit: lock observado, borrador eliminado inmutable')

        # Solicitud gana: DELETE vuelve a evaluar el estado confirmado bajo lock.
        winner = start("BEGIN; UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION' WHERE id=11; SELECT 'LOCK_HELD';", 'rec089_submit_wins')
        await_marker(winner)
        loser = start("SET ROLE service_role; SELECT public.fn_recoleccion_eliminar_borrador(11,1);", 'rec089_late_delete')
        await_blocked('rec089_late_delete')
        winner.communicate('COMMIT;\n', timeout=10)
        _, loser_error = loser.communicate(timeout=10)
        check(loser.returncode != 0 and 'Solo se puede eliminar' in loser_error
              and sql('SELECT eliminado_en IS NULL FROM public.recoleccion WHERE id=11') == 't',
              'Carrera submit -> DELETE: lock observado, estado pendiente no eliminable')

        # Dos DELETE simultáneos: solo uno crea el terminal histórico.
        winner = start("BEGIN; SELECT public.fn_recoleccion_eliminar_borrador(12,1); SELECT 'LOCK_HELD';", 'rec089_delete_first')
        await_marker(winner)
        loser = start("SET ROLE service_role; SELECT public.fn_recoleccion_eliminar_borrador(12,1);", 'rec089_delete_second')
        await_blocked('rec089_delete_second')
        winner.communicate('COMMIT;\n', timeout=10)
        _, loser_error = loser.communicate(timeout=10)
        check(loser.returncode != 0 and 'Recolección no encontrada' in loser_error
              and sql('SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id=12') == '1',
              'Carrera DELETE -> DELETE: una sola marca y un solo historial')
        # Altas de evidencia: el guard se ejecuta en el INSERT de todos los clientes.
        def attach(record, path, error=None):
            return sql(f"INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,ruta_archivo) VALUES(1,{record},'{path}')", error=error, service=True)

        def compensate(record, actor=1, error=None):
            return json.loads(sql(f'SELECT public.fn_recoleccion_compensar_creacion({record},{actor})', service=True, error=error)) if not error else sql(f'SELECT public.fn_recoleccion_compensar_creacion({record},{actor})', service=True, error=error)

        check(sql("SELECT has_function_privilege('service_role','public.fn_recoleccion_compensar_creacion(bigint,bigint)','EXECUTE') AND NOT has_function_privilege('anon','public.fn_recoleccion_compensar_creacion(bigint,bigint)','EXECUTE') AND NOT has_function_privilege('authenticated','public.fn_recoleccion_compensar_creacion(bigint,bigint)','EXECUTE')") == 't',
              'Compensación privada sin ejecución pública')
        attach(20, 'conservar-20.jpg')
        remove(20)
        attach(20, 'rechazar-20.jpg', error='Recolección no encontrada')
        attach(99999, 'rechazar-inexistente.jpg', error='Recolección no encontrada')
        check(sql("SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=20") == '1',
              'INSERT posterior al soft delete rechaza fotos y conserva las anteriores')
        sql("INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,ruta_archivo) VALUES(2,99999,'otro-modulo.jpg')", service=True)
        check(True, 'Guard de M1 conserva altas de evidencia de otros módulos')
        attach(21, 'compensar-21.jpg')
        check(compensate(21)['compensado'] is True
              and sql('SELECT count(*) FROM public.recoleccion WHERE id=21') == '0'
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=21') == '0',
              'Compensación normal elimina ficha incompleta y evidencias en una transacción')
        check(compensate(20)['compensado'] is False
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=20') == '1'
              and sql('SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id=20') == '1',
              'Compensación después del DELETE no borra ficha, evidencia ni historial')
        attach(22, 'historia-22.jpg')
        sql("INSERT INTO public.recoleccion_historial(recoleccion_id,tipo_historial) VALUES(22,'BORRADOR_CREADO')")
        check(compensate(22)['compensado'] is False
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=22') == '1',
              'Compensación no borra una creación con historial confirmado')
        for actor in (2, 3, 4, 5, 6, 999):
            check(compensate(23, actor)['compensado'] is False,
                  f'Compensación rechaza actor ajeno/no creador/inactivo {actor}')
        attach(24, 'rollback-24.jpg')
        sql('CREATE TABLE public.referencia_sintetica(recoleccion_id bigint REFERENCES public.recoleccion(id)); INSERT INTO public.referencia_sintetica VALUES(24)')
        compensate(24, error='violates foreign key constraint')
        check(sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=24') == '1'
              and sql('SELECT count(*) FROM public.recoleccion WHERE id=24') == '1',
              'Si falla el DELETE de ficha la transacción repone también sus evidencias')

        winner = start("BEGIN; SELECT public.fn_recoleccion_eliminar_borrador(28,1); SELECT 'LOCK_HELD';", 'rec089_delete_before_photo')
        await_marker(winner)
        loser = start("SET ROLE service_role; INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,ruta_archivo) VALUES(1,28,'tardia-28.jpg');", 'rec089_late_photo')
        await_blocked('rec089_late_photo')
        winner.communicate('COMMIT;\n', timeout=10)
        _, loser_error = loser.communicate(timeout=10)
        check(loser.returncode != 0 and 'Recolección no encontrada' in loser_error
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=28') == '0',
              'Carrera DELETE -> foto: INSERT espera el lock y rechaza sin vincular archivos')

        winner = start("BEGIN; SET ROLE service_role; INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,entidad_id,ruta_archivo) VALUES(1,29,'previa-29.jpg'); SELECT 'LOCK_HELD';", 'rec089_photo_before_delete')
        await_marker(winner)
        loser = start("SET ROLE service_role; SELECT public.fn_recoleccion_eliminar_borrador(29,1);", 'rec089_delete_after_photo')
        await_blocked('rec089_delete_after_photo')
        winner.communicate('COMMIT;\n', timeout=10)
        _, loser_error = loser.communicate(timeout=10)
        check(loser.returncode == 0
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=29') == '1',
              'Carrera foto -> DELETE: eliminación espera el INSERT y conserva la evidencia')

        attach(30, 'conservar-30.jpg')
        winner = start("BEGIN; SELECT public.fn_recoleccion_eliminar_borrador(30,1); SELECT 'LOCK_HELD';", 'rec089_delete_before_cleanup')
        await_marker(winner)
        loser = start("SET ROLE service_role; SELECT public.fn_recoleccion_compensar_creacion(30,1);", 'rec089_late_cleanup')
        await_blocked('rec089_late_cleanup')
        winner.communicate('COMMIT;\n', timeout=10)
        loser_out, loser_error = loser.communicate(timeout=10)
        check(loser.returncode == 0 and json.loads(loser_out)['compensado'] is False
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=30') == '1',
              'Carrera DELETE -> compensación: cleanup espera y conserva todo lo eliminado lógicamente')

        attach(31, 'compensar-31.jpg')
        winner = start("BEGIN; SELECT public.fn_recoleccion_compensar_creacion(31,1); SELECT 'LOCK_HELD';", 'rec089_cleanup_before_delete')
        await_marker(winner)
        loser = start("SET ROLE service_role; SELECT public.fn_recoleccion_eliminar_borrador(31,1);", 'rec089_delete_after_cleanup')
        await_blocked('rec089_delete_after_cleanup')
        winner.communicate('COMMIT;\n', timeout=10)
        _, loser_error = loser.communicate(timeout=10)
        check(loser.returncode != 0 and 'Recolección no encontrada' in loser_error
              and sql('SELECT count(*) FROM public.evidencias_trazabilidad WHERE entidad_id=31') == '0',
              'Carrera compensación -> DELETE: solo compensa la creación incompleta, sin falso recibo de eliminación')

        evidence = dict(fecha='2026-11-03', entorno='PostgreSQL privado desechable, sin TCP/.env',
                        version_postgresql=version, migracion=MIGRATION.name,
                        sha256=hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
                        limites='Antecedente mínimo de M1 + 014/015/089; sin Supabase/Storage remoto ni replay completo.',
                        comprobaciones=checks)
        if args.evidence:
            with args.evidence.open('x') as output:
                json.dump(evidence, output, ensure_ascii=False, indent=2)
                output.write('\n')
        print(json.dumps(evidence, ensure_ascii=False, indent=2))
    finally:
        for child in children:
            if child.poll() is None:
                child.terminate()
                child.communicate(timeout=5)
        if (cluster / 'postmaster.pid').exists():
            run([binaries['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'])
        if not (cluster / 'postmaster.pid').exists():
            shutil.rmtree(directory)


if __name__ == '__main__':
    main()
