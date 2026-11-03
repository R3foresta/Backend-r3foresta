#!/usr/bin/env python3
"""090: rechazo antiguo, restricciones, rollback y carrera en PostgreSQL aislado."""
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
MIGRATION = ROOT / 'migrations/090_recoleccion_rechazo_sin_limite_fecha.sql'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    binaries = {}
    for name in ('initdb', 'pg_ctl', 'psql'):
        binaries[name] = str(args.pg_bin / name) if args.pg_bin else shutil.which(name)
        if not binaries[name]:
            parser.error(f'Falta {name}; use --pg-bin o PATH.')
    if args.evidence and args.evidence.exists():
        parser.error('La evidencia debe ser un archivo nuevo.')
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update(LC_ALL='C', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull,
               PGAPPNAME='recoleccion_090_aislada')
    directory = Path(tempfile.mkdtemp(prefix='rec090-', dir='/tmp')).resolve()
    cluster, socket = directory / 'postgres', directory / 'socket'
    socket.mkdir(mode=0o700)
    checks, children = [], []
    started = False

    def run(command):
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        return result.stdout.strip()

    def command():
        return [binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-h', str(socket), '-p', '55441', '-U', 'postgres', '-d', 'postgres']

    def sql(statement, error=None, service=False):
        query = ('SET ROLE service_role; ' if service else '') + statement
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

    def reject(record, actor=1, motive="'Datos de campo inconsistentes'", error=None):
        return sql(f'SELECT public.fn_recoleccion_rechazar_validacion({record},{actor},{motive})',
                   service=True, error=error)

    def start(statement, name):
        process = subprocess.Popen(command(), env=dict(env, PGAPPNAME=name), text=True,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        children.append(process)
        process.stdin.write(statement + '\n')
        process.stdin.flush()
        return process

    try:
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o',
             f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55441 -c unix_socket_permissions=0700"])
        started = True
        version = sql('SHOW server_version')
        sql("""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TYPE public.estado_registro_recoleccion AS ENUM('BORRADOR','PENDIENTE_VALIDACION','VALIDADO','RECHAZADO');
CREATE TABLE public.usuario(id bigint PRIMARY KEY,rol text NOT NULL,activo boolean NOT NULL DEFAULT true);
GRANT SELECT,UPDATE(rol,activo) ON public.usuario TO service_role;
INSERT INTO public.usuario VALUES(1,'VALIDADOR',true),(2,'ADMIN',true),(3,'GENERAL',true),
 (4,'VALIDADOR',false),(5,'VOLUNTARIO',true);
CREATE TABLE public.recoleccion(id bigint PRIMARY KEY,usuario_id bigint NOT NULL REFERENCES public.usuario,
 fecha date NOT NULL, estado_registro public.estado_registro_recoleccion DEFAULT 'BORRADOR',
 codigo_trazabilidad text NOT NULL, usuario_validacion_id bigint,fecha_validacion timestamptz,
 saldo_actual numeric NOT NULL DEFAULT 123,nombre_recolector_snapshot text NOT NULL DEFAULT 'snapshot sintético');
INSERT INTO public.recoleccion(id,usuario_id,fecha,estado_registro,codigo_trazabilidad)
SELECT i,3,CURRENT_DATE-46,'PENDIENTE_VALIDACION','REC-SINTETICA-'||i FROM generate_series(1,30)i;
UPDATE public.recoleccion SET fecha=CURRENT_DATE WHERE id=2;
UPDATE public.recoleccion SET fecha=CURRENT_DATE+1 WHERE id=3;
UPDATE public.recoleccion SET estado_registro='BORRADOR' WHERE id=4;
UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=5;
UPDATE public.recoleccion SET estado_registro='RECHAZADO' WHERE id=6;
UPDATE public.recoleccion SET fecha=CURRENT_DATE-45 WHERE id=7;
ALTER TABLE public.recoleccion ADD CONSTRAINT chk_fecha_rango
 CHECK(fecha >= CURRENT_DATE-45 AND fecha <= CURRENT_DATE) NOT VALID;
""")
        for migration in ('014_recoleccion_historial.sql', '015_temporal_granularity_day_only.sql',
                          '058_recoleccion_motivo_rechazo.sql'):
            run(command() + ['-f', str(ROOT / 'migrations' / migration)])
        before = sql('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.recoleccion r')
        for _ in range(2):
            run(command() + ['-f', str(MIGRATION)])
        check(before == sql('SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.recoleccion r'),
              'Instalación y repetición preservan todas las filas históricas')
        check(sql("SELECT NOT convalidated FROM pg_constraint WHERE conrelid='public.recoleccion'::regclass AND conname='chk_fecha_rango'") == 't',
              'NOT VALID omite el barrido inicial del legado')
        check(sql("SELECT has_function_privilege('service_role','public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)','EXECUTE') AND NOT has_function_privilege('anon','public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)','EXECUTE') AND NOT has_function_privilege('authenticated','public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)','EXECUTE')") == 't',
              'RPC de rechazo exclusiva del servicio, SECURITY INVOKER')
        sql("SET ROLE anon; SELECT public.fn_recoleccion_rechazar_validacion(1,1,'Datos inconsistentes')", error='permission denied')
        for record, actor in ((1, 1), (2, 2), (3, 1), (7, 1)):
            original = sql(f"SELECT to_jsonb(r)-ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo'] FROM public.recoleccion r WHERE id={record}")
            reject(record, actor, "'  Datos de campo inconsistentes  '")
            check(original == sql(f"SELECT to_jsonb(r)-ARRAY['estado_registro','usuario_validacion_id','fecha_validacion','motivo_rechazo'] FROM public.recoleccion r WHERE id={record}")
                  and sql(f"SELECT estado_registro='RECHAZADO' AND motivo_rechazo='  Datos de campo inconsistentes  ' AND usuario_validacion_id IS NULL AND fecha_validacion IS NULL FROM public.recoleccion WHERE id={record}") == 't',
                  f'Rechazo conserva fecha/ficha/saldo/snapshots y motivo exacto: caso {record}')
        check(sql("SELECT count(*)=4 AND bool_and(h.actor_user_id IN(1,2) AND h.tipo_historial='VALIDACION_RECHAZADA' AND h.estado_origen='PENDIENTE_VALIDACION' AND h.estado_destino='RECHAZADO' AND h.observaciones=btrim(r.motivo_rechazo) AND h.metadata->>'motivo_rechazo'=r.motivo_rechazo AND h.metadata->>'codigo_trazabilidad'=r.codigo_trazabilidad AND h.created_at=(clock_timestamp() AT TIME ZONE 'America/La_Paz')::date) FROM public.recoleccion_historial h JOIN public.recoleccion r ON r.id=h.recoleccion_id") == 't',
              'Historial append-only conserva actor, transición, día de negocio, código y motivo')
        sql('DELETE FROM public.recoleccion_historial WHERE recoleccion_id=1', error='append-only')
        for record in (1, 4, 5, 6):
            reject(record, error='Solo se puede rechazar')
        for actor in (3, 4, 5, 999):
            reject(8, actor, error='Se requiere cuenta activa')
        reject(999, error='Recolección no encontrada')
        sql("ALTER TABLE public.recoleccion DISABLE TRIGGER USER; UPDATE public.recoleccion SET eliminado_en=CURRENT_DATE,fecha=CURRENT_DATE WHERE id=9; ALTER TABLE public.recoleccion ENABLE TRIGGER USER")
        reject(9, error='Recolección no encontrada')
        for motive in ('NULL', "repeat('x',9)", "repeat('x',501)"):
            reject(8, motive=motive, error='entre 10 y 500')
        check(sql('SELECT count(*) FROM public.recoleccion_historial') == '4',
              'Denegaciones por rol, cuenta inactiva, estado, eliminado, inexistente o motivo no escriben historial')
        sql("UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=8", error='chk_fecha_rango')
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,codigo_trazabilidad,estado_registro,motivo_rechazo) VALUES(40,3,CURRENT_DATE-46,'REC-NUEVA','RECHAZADO','Datos inconsistentes')", error='Fecha fuera de rango')
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,codigo_trazabilidad,estado_registro) VALUES(40,3,CURRENT_DATE-46,'REC-NUEVA',NULL)", error='chk_fecha_rango')
        sql("INSERT INTO public.recoleccion(id,usuario_id,fecha,codigo_trazabilidad) VALUES(40,3,CURRENT_DATE+1,'REC-NUEVA')", error='chk_fecha_rango')
        sql('UPDATE public.recoleccion SET saldo_actual=saldo_actual WHERE id=4', error='chk_fecha_rango')
        sql("UPDATE public.recoleccion SET estado_registro='RECHAZADO',motivo_rechazo='Datos inconsistentes',saldo_actual=1 WHERE id=8", error='Fecha fuera de rango')
        sql("UPDATE public.recoleccion SET estado_registro='RECHAZADO',motivo_rechazo='Datos inconsistentes',fecha=CURRENT_DATE-47 WHERE id=8", error='Fecha fuera de rango')
        sql("UPDATE public.recoleccion SET estado_registro='RECHAZADO',motivo_rechazo='Datos inconsistentes',nombre_recolector_snapshot='snapshot alterado' WHERE id=8", error='Fecha fuera de rango')
        sql("UPDATE public.recoleccion SET motivo_rechazo='Otro motivo válido' WHERE id=1", error='Fecha fuera de rango')
        sql("UPDATE public.recoleccion SET estado_registro='BORRADOR' WHERE id=1", error='chk_fecha_rango')
        sql("UPDATE public.recoleccion SET estado_registro='PENDIENTE_VALIDACION' WHERE id=1", error='chk_fecha_rango')
        sql("UPDATE public.recoleccion SET estado_registro='BORRADOR',fecha=CURRENT_DATE WHERE id=1")
        sql("UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=7")
        check(True, 'NOT VALID sigue bloqueando escrituras: aprobación antigua, altas, NULL de estado, edición/reenvío y cambios de ficha; corregir fecha y límite 45 días siguen permitidos')
        sql("""CREATE FUNCTION public.fail_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_HISTORIAL_SINTETICO'; END $$;
CREATE TRIGGER fail_history BEFORE INSERT ON public.recoleccion_historial FOR EACH ROW WHEN(NEW.recoleccion_id=10) EXECUTE FUNCTION public.fail_history();""")
        reject(10, error='FALLO_HISTORIAL_SINTETICO')
        check(sql("SELECT estado_registro='PENDIENTE_VALIDACION' AND motivo_rechazo IS NULL FROM public.recoleccion WHERE id=10") == 't'
              and sql('SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id=10') == '0',
              'Fallo real de INSERT historial revierte estado y motivo antiguos en la misma transacción')
        winner = start("BEGIN; SET ROLE service_role; SELECT public.fn_recoleccion_rechazar_validacion(20,1,'Primer motivo válido'); SELECT 'LOCK_HELD';", 'rec090_winner')
        while winner.stdout.readline().strip() != 'LOCK_HELD':
            if winner.poll() is not None:
                raise RuntimeError(winner.stderr.read())
        loser = start("SET ROLE service_role; SELECT public.fn_recoleccion_rechazar_validacion(20,2,'Segundo motivo válido');", 'rec090_loser')
        deadline = time.monotonic() + 5
        while sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='rec090_loser' AND wait_event_type='Lock'") != '1':
            if time.monotonic() > deadline:
                raise AssertionError('El segundo rechazo no esperó el lock observado')
            time.sleep(0.02)
        winner.communicate('COMMIT;\n', timeout=10)
        _, loser_error = loser.communicate(timeout=10)
        check(winner.returncode == 0 and loser.returncode != 0 and 'Solo se puede rechazar' in loser_error
              and sql("SELECT count(*)=1 AND bool_and(actor_user_id=1) FROM public.recoleccion_historial WHERE recoleccion_id=20") == 't'
              and sql("SELECT motivo_rechazo='Primer motivo válido' FROM public.recoleccion WHERE id=20") == 't',
              'Dos rechazos concurrentes: lock observado, un ganador y un solo evento/motivo')
        sql('ALTER TABLE public.recoleccion DROP CONSTRAINT chk_fecha_rango; ALTER TABLE public.recoleccion ADD CONSTRAINT chk_fecha_rango CHECK(fecha>=CURRENT_DATE-44 AND fecha<=CURRENT_DATE) NOT VALID')
        sql(MIGRATION.read_text(), error='Drift en chk_fecha_rango')
        check('44' in sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.recoleccion'::regclass AND conname='chk_fecha_rango'"),
              'Preflight falla cerrado ante otra ventana sin sustituir el CHECK')
        for expression, label in (
            ("(fecha >= CURRENT_DATE-45) AND ((fecha <= CURRENT_DATE) OR coalesce(estado_registro::text='RECHAZADO',false))",
             'agrupación distinta: a AND (b OR c)'),
            ("((fecha >= CURRENT_DATE-45) AND (fecha <= CURRENT_DATE)) OR coalesce(estado_registro::text='rechazado',false)",
             'literal distinto: rechazado en minúsculas'),
        ):
            sql('ALTER TABLE public.recoleccion DROP CONSTRAINT chk_fecha_rango; '
                f'ALTER TABLE public.recoleccion ADD CONSTRAINT chk_fecha_rango CHECK({expression}) NOT VALID')
            catalog_query = """SELECT jsonb_build_object(
              'check', (SELECT jsonb_build_object('oid', c.oid, 'expr', pg_get_expr(c.conbin,c.conrelid),
                'validated', c.convalidated, 'comment', obj_description(c.oid,'pg_constraint'))
                FROM pg_constraint c WHERE c.conrelid='public.recoleccion'::regclass AND c.conname='chk_fecha_rango'),
              'triggers', (SELECT jsonb_agg(jsonb_build_object('oid',t.oid,'def',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.tgname)
                FROM pg_trigger t WHERE t.tgrelid='public.recoleccion'::regclass AND NOT t.tgisinternal),
              'rpc', pg_get_functiondef('public.fn_recoleccion_rechazar_validacion(bigint,bigint,text)'::regprocedure),
              'guard', pg_get_functiondef('public.fn_recoleccion_acotar_excepcion_fecha_rechazo()'::regprocedure))"""
            catalog_before = sql(catalog_query)
            sql(MIGRATION.read_text(), error='Drift en chk_fecha_rango')
            check(catalog_before == sql(catalog_query)
                  and sql("SELECT to_regclass('pg_temp._r3_090_checks_referencia') IS NULL") == 't',
                  f'Preflight rechaza {label} y conserva CHECK/triggers/RPC sin objetos TEMP residuales')
        evidence = dict(entorno='PostgreSQL privado desechable, socket local sin TCP/.env',
                        version=version, revision_base=run(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']),
                        migracion_sha256=hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
                        checks=checks, sql_remoto_aplicado=False,
                        limites='Antecedente mínimo M1 + 014/015/058; no replay completo, HTTP remoto, Storage, despliegue ni carreras de aprobación legada.')
        if args.evidence:
            args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(dict(version=version, comprobaciones=len(checks), resultado='OK'), ensure_ascii=False))
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
                child.communicate(timeout=5)
        if started:
            run([binaries['pg_ctl'], '-D', str(cluster), '-m', 'immediate', '-w', '-t', '10', 'stop'])
        shutil.rmtree(directory)


if __name__ == '__main__':
    main()
