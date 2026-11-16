#!/usr/bin/env python3
"""RF-PLA-02/112: alta, rollback, ACL y carreras en PostgreSQL/PostGIS privado."""
import argparse
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
MIGRATION = ROOT / 'migrations/112_subcampania_creacion_atomica.sql'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    binaries = {name: str(args.pg_bin / name) if args.pg_bin else shutil.which(name)
                for name in ('initdb', 'pg_ctl', 'psql')}
    if not all(binaries.values()):
        parser.error('Faltan initdb/pg_ctl/psql; use --pg-bin o PATH.')
    if args.evidence and args.evidence.exists():
        parser.error('La evidencia debe ser un archivo nuevo.')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull,
               PGAPPNAME='subcampania_112_aislada', PGOPTIONS='-c statement_timeout=15000')
    directory = Path(tempfile.mkdtemp(prefix='sub112-', dir='/tmp')).resolve()
    cluster, socket = directory / 'postgres', directory / 'socket'
    socket.mkdir(mode=0o700)
    checks, children, sources = [], [], [MIGRATION, Path(__file__).resolve()]

    def command():
        return [binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-h', str(socket), '-p', '55448', '-U', 'postgres', '-d', 'postgres']

    def run(argv):
        result = subprocess.run(argv, env=env, text=True, capture_output=True, timeout=40)
        if result.returncode:
            raise RuntimeError(result.stderr[-3500:])
        return result.stdout.strip()

    def sql(statement, error=None, role=None):
        query = (f'SET ROLE {role}; ' if role else '') + statement
        result = subprocess.run(command() + ['-c', query], env=env, text=True,
                                capture_output=True, timeout=25)
        if error:
            if result.returncode == 0 or error not in result.stderr:
                raise AssertionError(f'Esperado {error}: {result.stderr}')
        elif result.returncode:
            raise RuntimeError(result.stderr[-3500:])
        return result.stdout.strip()

    def install(path):
        sources.append(path)
        run(command() + ['-f', str(path)])

    def function(path, name):
        # Extrae el cuerpo REAL de la migración; no sustituye la función por mock.
        # Los únicos antecedentes focales son usuario/zona y stock vacío.
        sources.append(path)
        content = path.read_text()
        start = content.index('CREATE OR REPLACE FUNCTION public.' + name + '(')
        end = content.index('$$;', start) + 3
        sql(content[start:end])

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    def create_query(campaign=1, auth='admin', **overrides):
        payload = dict(campania_id=campaign, nombre='Subcampaña sintética112', zona_id=10,
                       meta_total_arboles=600, **overrides)
        escaped = json.dumps(payload, ensure_ascii=False).replace("'", "''")
        return f"SELECT public.pa_d_subcampania_crear('{auth}','{escaped}'::jsonb);"

    def create(campaign=1, auth='admin', error=None, **overrides):
        return sql(create_query(campaign, auth, **overrides), error=error, role='service_role')

    def start(query, name):
        process = subprocess.Popen(command(), env=dict(env, PGAPPNAME=name), text=True,
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        children.append(process)
        process.stdin.write(query + '\n')
        process.stdin.flush()
        return process

    def held(process):
        deadline = time.monotonic() + 8
        received = b''
        while time.monotonic() < deadline:
            ready, _, _ = select.select([process.stdout], [], [], 0.1)
            if ready:
                received += os.read(process.stdout.fileno(), 65536)
                if b'LOCK_HELD\n' in received:
                    return
            if process.poll() is not None:
                raise RuntimeError(process.stderr.read())
        raise AssertionError('No se observó LOCK_HELD.')

    def blocked(name):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if sql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{name}' AND wait_event_type='Lock'") == '1':
                return
            time.sleep(0.02)
        raise AssertionError('No se observó espera de lock: ' + name)

    def release(process):
        _, stderr = process.communicate('COMMIT;\n', timeout=10)
        if process.returncode:
            raise RuntimeError(stderr)

    def snapshot():
        return sql("SELECT jsonb_build_object('campanias',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.campania c),"
                   "'subcampanias',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.subcampania s),"
                   "'historial',(SELECT jsonb_agg(to_jsonb(h) ORDER BY id) FROM public.subcampania_historial h))")

    try:
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--no-locale', '--encoding=UTF8'])
        options = f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55448 -c unix_socket_permissions=0700"
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', options])
        version = sql('SHOW server_version')
        sql("""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.usuario(id bigint PRIMARY KEY,auth_id text NOT NULL UNIQUE,
 nombre text NOT NULL,rol text NOT NULL,activo boolean NOT NULL DEFAULT true);
CREATE TABLE public.division_administrativa(id bigint PRIMARY KEY,nombre text NOT NULL);
INSERT INTO public.usuario VALUES(1,'admin','Admin sintético','ADMIN',true),
 (2,'general','General sintético','GENERAL',true),(3,'inactivo','Admin inactivo','ADMIN',false),
 (4,'retirable','Admin retirable','ADMIN',true),(5,'baja','Admin baja','ADMIN',true),
 (9007199254740992,'vecino','Actor vecino','ADMIN',true),
 (9007199254740993,'grande','Actor BIGINT exacto','ADMIN',true);
INSERT INTO public.division_administrativa VALUES(10,'Zona sintética112');
""")
        for filename in ('027_m3_postgis_y_enums.sql', '028_m3_campania.sql',
                         '029_m3_subcampania.sql', '037_m3_campania_tipo.sql'):
            install(ROOT / 'migrations' / filename)
        # Historial047 real con FK/append-only, sin instalar operaciones de stock047.
        history = ROOT / 'migrations/047_m3_cancelacion_subcampania_y_plan.sql'
        sources.append(history)
        content = history.read_text()
        start_offset = content.index('DO $$', content.index('-- 1. Enum tipo_historial_subcampania'))
        sql(content[start_offset:content.index('-- 3. Tabla subcampania_meta_especie')])
        install(ROOT / 'migrations/048_fix_generar_codigo_subcampania_soft_delete.sql')
        install(ROOT / 'migrations/050_m3_campania_edicion_eliminacion_estricta_mvp.sql')
        correction = ROOT / 'migrations/057_m3_campania_desactivacion_masiva.sql'
        sources.append(correction)
        content = correction.read_text()
        sql(content[content.index('ALTER TABLE public.subcampania'):
                    content.index('CREATE OR REPLACE FUNCTION public.fn_subcampania_cancelar_interna')])
        # RPC077 de desactivación/cancelación reales, con cero stock. No se prueba
        # devolución física ni se atribuye reconstrucción de001–110 al fixture.
        sql("""
CREATE TABLE public.lote_vivero(id bigint PRIMARY KEY);
CREATE TABLE public.asignacion_vivero_subcampania(id bigint PRIMARY KEY,subcampania_id bigint,
 lote_vivero_id bigint,estado text,saldo_asignado_disponible integer);
GRANT SELECT,UPDATE ON public.usuario,public.campania,public.subcampania,
 public.lote_vivero,public.asignacion_vivero_subcampania TO service_role;
GRANT INSERT ON public.subcampania,public.subcampania_historial TO service_role;
GRANT SELECT ON public.subcampania_historial,public.division_administrativa TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
INSERT INTO public.campania(id,nombre,codigo_trazabilidad,tipo,created_by,updated_by)
SELECT i,'Campaña sintética112-'||i,'CMP-2026-'||lpad(i::text,3,'0'),'ARBORIZACION',1,1 FROM generate_series(1,20)i;
INSERT INTO public.subcampania(campania_id,nombre,tipo,zona_id,meta_total_arboles,codigo_trazabilidad,created_by,updated_by,deleted_at)
VALUES(1,'Subcampaña eliminada999','ARBORIZACION',10,25,'SUB-999-CMP-2026-001',1,1,now());
INSERT INTO public.subcampania_historial(subcampania_id,tipo_historial,estado_destino,metadata,actor_user_id)
SELECT id,'BORRADOR_CREADO','BORRADOR',jsonb_build_object('codigo_trazabilidad',codigo_trazabilidad,'legado',true),1
FROM public.subcampania WHERE codigo_trazabilidad='SUB-999-CMP-2026-001';
""")
        shared = ROOT / 'migrations/077_pa_int02d_operaciones_compartidas.sql'
        for name in ('pa_d_cuenta', 'fn_subcampania_cancelar_interna', 'fn_campania_desactivar_sin_plantaciones'):
            function(shared, name)
        before = snapshot()
        original_generator = sql("SELECT prosrc FROM pg_proc WHERE oid='public.fn_generar_codigo_subcampania(integer)'::regprocedure")
        sql('REVOKE UPDATE ON public.campania FROM service_role')
        sql(MIGRATION.read_text(), error='cotejar SELECT/lock privado de campania')
        check(sql("SELECT to_regprocedure('public.pa_d_subcampania_crear(text,jsonb)') IS NULL") == 't'
              and original_generator == sql("SELECT prosrc FROM pg_proc WHERE oid='public.fn_generar_codigo_subcampania(integer)'::regprocedure"),
              'Preflight sin privilegio de lock aborta sin RPC ni redefinición parcial')
        sql('GRANT UPDATE ON public.campania TO service_role')
        sql("CREATE FUNCTION public.fn_generar_codigo_subcampania(p_campania_id bigint) RETURNS text LANGUAGE sql AS $$SELECT 'sobrecarga vieja'::text$$; GRANT EXECUTE ON FUNCTION public.fn_generar_codigo_subcampania(bigint) TO anon,authenticated,service_role")
        generator_catalog = ("SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p "
                             "WHERE p.pronamespace='public'::regnamespace AND p.proname IN('fn_generar_codigo_subcampania','pa_d_subcampania_crear')")
        original_functions = sql(generator_catalog)
        sql(MIGRATION.read_text(), error='sobrecarga desconocida')
        check(original_functions == sql(generator_catalog) and before == snapshot(),
              'Sobrecarga desconocida aborta el preflight y conserva funciones, ACL y filas')
        sql('DROP FUNCTION public.fn_generar_codigo_subcampania(bigint)')
        original_table_acls = sql("SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl::text) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace")
        for _ in range(2):
            install(MIGRATION)
        check(before == snapshot(), 'Instalación/repetición conserva campañas, subcampañas e historial previos')
        check(original_table_acls == sql("SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl::text) ORDER BY c.oid) FROM pg_class c WHERE c.relnamespace='public'::regnamespace"),
              'Instalación/repetición conserva ACL de todas las tablas/secuencias existentes')
        sql("CREATE ROLE sub112_heredado; GRANT sub112_heredado TO anon; GRANT EXECUTE ON FUNCTION public.pa_d_subcampania_crear(text,jsonb) TO sub112_heredado")
        inherited_functions = sql(generator_catalog)
        sql(MIGRATION.read_text(), error='ACL heredada incompatible')
        check(inherited_functions == sql(generator_catalog) and before == snapshot(),
              'ACL heredada pública aborta la instalación completa y conserva funciones, ACL y filas')
        sql("REVOKE EXECUTE ON FUNCTION public.pa_d_subcampania_crear(text,jsonb) FROM sub112_heredado; REVOKE sub112_heredado FROM anon; DROP ROLE sub112_heredado")
        for signature in ('pa_d_subcampania_crear(text,jsonb)', 'fn_generar_codigo_subcampania(integer)'):
            check(sql(f"SELECT has_function_privilege('service_role','public.{signature}','EXECUTE') AND NOT has_function_privilege('anon','public.{signature}','EXECUTE') AND NOT has_function_privilege('authenticated','public.{signature}','EXECUTE')") == 't',
                  'ACL privada de ' + signature)
        sql(create_query(), error='permission denied for function', role='anon')
        sql(create_query(), error='permission denied for function', role='authenticated')
        check(True, 'Denegación SQL real para anon/authenticated')
        response = json.loads(create(auth='grande', descripcion='Descripción conservada',
                                     fecha_estimada_inicio='2020-01-01', fecha_estimada_fin='2020-01-02'))
        check(response['codigo_trazabilidad'] == 'SUB-1000-CMP-2026-001'
              and response['tipo'] == 'ARBORIZACION' and response['estado'] == 'BORRADOR'
              and response['tolerancia_gps_metros'] == 50 and response['meta_total_arboles'] == 600
              and response['fecha_estimada_inicio'] == '2020-01-01',
              'MAX histórico incluye soft-delete999; alta1000 sin truncar, tipo heredado y admisión temporal vigente')
        check(sql(f"SELECT created_by=9007199254740993 AND updated_by=9007199254740993 AND nombre_zona_snapshot IS NULL AND nombre_coordinador_snapshot IS NULL FROM public.subcampania WHERE id={response['id']}") == 't'
              and sql(f"SELECT actor_user_id=9007199254740993 AND estado_origen IS NULL AND estado_destino='BORRADOR' AND tipo_historial='BORRADOR_CREADO' AND metadata->>'codigo_trazabilidad'='SUB-1000-CMP-2026-001' FROM public.subcampania_historial WHERE subcampania_id={response['id']}") == 't',
              'Actor BIGINT exacto en alta/historial; no copia snapshots congelados al activar')
        check(json.loads(create())['codigo_trazabilidad'] == 'SUB-1001-CMP-2026-001',
              'El siguiente correlativo continúa1001, sin reusar el código histórico')
        for auth, message in (('general', 'Solo el rol ADMIN'), ('inactivo', 'CUENTA_INACTIVA'),
                              ('inexistente', 'El usuario de la sesión no existe')):
            create(999, auth, error=message, fecha_estimada_inicio='2027-12-01', fecha_estimada_fin='2027-01-01')
        create(999, error='fecha_estimada_fin no puede ser anterior', fecha_estimada_inicio='2027-12-01', fecha_estimada_fin='2027-01-01')
        create(999, error='Campaña con id 999 no encontrada')
        sql('UPDATE public.campania SET deleted_at=now(),deleted_by=1 WHERE id=2')
        create(2, error='Campaña con id 2 no encontrada')
        check(True, 'Precedencia cuenta/ADMIN -> fechas -> campaña; campaña ausente/eliminada rechazada')
        before = snapshot()
        sql("CREATE FUNCTION public.sub112_fallo_historial() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'FALLO_HISTORIAL_SINTETICO'; END$$; CREATE TRIGGER sub112_fallo_historial BEFORE INSERT ON public.subcampania_historial FOR EACH ROW EXECUTE FUNCTION public.sub112_fallo_historial()")
        create(3, error='FALLO_HISTORIAL_SINTETICO')
        check(before == snapshot(), 'Fallo obligatorio de historial revierte el borrador y todo el dominio')
        sql('DROP TRIGGER sub112_fallo_historial ON public.subcampania_historial')
        check(json.loads(create(3))['codigo_trazabilidad'] == 'SUB-001-CMP-2026-003',
              'Rollback no reserva ni consume el código de trazabilidad')

        first = start('BEGIN; SET ROLE service_role; ' + create_query(4) + " SELECT 'LOCK_HELD';", 'sub112_first')
        held(first)
        second = start('SET ROLE service_role; ' + create_query(4), 'sub112_second')
        blocked('sub112_second')
        check(sql('SELECT count(*) FROM public.subcampania WHERE campania_id=4') == '0',
              'Primera alta permanece sin commit mientras la segunda espera el lock real')
        release(first)
        output, stderr = second.communicate(timeout=10)
        check(second.returncode == 0 and json.loads(output)['codigo_trazabilidad'] == 'SUB-002-CMP-2026-004'
              and sql("SELECT array_agg(codigo_trazabilidad ORDER BY codigo_trazabilidad)::text FROM public.subcampania WHERE campania_id=4") == '{SUB-001-CMP-2026-004,SUB-002-CMP-2026-004}'
              and sql('SELECT count(*) FROM public.subcampania_historial h JOIN public.subcampania s ON s.id=h.subcampania_id WHERE s.campania_id=4') == '2',
              'Dos altas solapadas: ambas confirman, dos códigos distintos y un historial por alta')

        for actor, mutation, message, campaign in (('retirable', "rol='GENERAL'", 'Solo el rol ADMIN', 5),
                                                  ('baja', 'activo=false', 'CUENTA_INACTIVA', 6)):
            first = start(f"BEGIN; UPDATE public.usuario SET {mutation} WHERE auth_id='{actor}'; SELECT 'LOCK_HELD';", 'sub112_account_first')
            held(first)
            second = start('SET ROLE service_role; ' + create_query(campaign, actor), 'sub112_account_waiter')
            blocked('sub112_account_waiter')
            release(first)
            _, stderr = second.communicate(timeout=10)
            check(second.returncode != 0 and message in stderr
                  and sql(f'SELECT count(*) FROM public.subcampania WHERE campania_id={campaign}') == '0',
                  'Revalidación después de esperar cuenta: ' + mutation + ' impide el alta')

        first = start('BEGIN; SET ROLE service_role; ' + create_query(7) + " SELECT 'LOCK_HELD';", 'sub112_create_account')
        held(first)
        second = start("UPDATE public.usuario SET rol='GENERAL' WHERE auth_id='admin';", 'sub112_retire_late')
        blocked('sub112_retire_late')
        release(first)
        second.communicate(timeout=10)
        check(second.returncode == 0 and sql('SELECT count(*) FROM public.subcampania WHERE campania_id=7') == '1',
              'Si el alta gana, conserva SHARE de cuenta hasta commit y el retiro espera')
        sql("UPDATE public.usuario SET rol='ADMIN' WHERE auth_id='admin'")

        first = start("BEGIN; UPDATE public.campania SET tipo='FORESTACION' WHERE id=8; SELECT 'LOCK_HELD';", 'sub112_type_first')
        held(first)
        second = start('SET ROLE service_role; ' + create_query(8), 'sub112_type_waiter')
        blocked('sub112_type_waiter')
        release(first)
        output, _ = second.communicate(timeout=10)
        check(second.returncode == 0 and json.loads(output)['tipo'] == 'FORESTACION',
              'Tras esperar la campaña hereda el tipo confirmado, con triggers037/050 reales')
        sql("UPDATE public.campania SET tipo='REFORESTACION' WHERE id=8", error='no puede cambiar tipo')

        first = start("BEGIN; SET ROLE service_role; SELECT * FROM public.fn_campania_desactivar_sin_plantaciones(9,1,'Cierre sintético'); SELECT 'LOCK_HELD';", 'sub112_deactivate_first')
        held(first)
        second = start('SET ROLE service_role; ' + create_query(9), 'sub112_deactivate_waiter')
        blocked('sub112_deactivate_waiter')
        release(first)
        _, stderr = second.communicate(timeout=10)
        check(second.returncode != 0 and 'Campaña con id 9 no encontrada' in stderr
              and sql('SELECT count(*) FROM public.subcampania WHERE campania_id=9') == '0',
              'Desactivación077 gana: alta espera campaña y rechaza sin crear hija')

        first = start('BEGIN; SET ROLE service_role; ' + create_query(10) + " SELECT 'LOCK_HELD';", 'sub112_create_before_deactivation')
        held(first)
        second = start("SET ROLE service_role; SELECT * FROM public.fn_campania_desactivar_sin_plantaciones(10,1,'Cierre sintético');", 'sub112_deactivate_late')
        blocked('sub112_deactivate_late')
        release(first)
        _, stderr = second.communicate(timeout=10)
        check(second.returncode == 0 and sql("SELECT estado='CANCELADA' AND deleted_at IS NOT NULL FROM public.subcampania WHERE campania_id=10") == 't'
              and sql("SELECT count(*) FROM public.subcampania_historial h JOIN public.subcampania s ON s.id=h.subcampania_id WHERE s.campania_id=10 AND h.tipo_historial IN('BORRADOR_CREADO','SUBCAMPANIA_CANCELADA')") == '2',
              'Alta gana: desactivación077 espera, descubre/cancela la nueva hija y conserva ambos historiales')
        create(10, error='Campaña con id 10 no encontrada')

        evidence = dict(fecha='2026-11-16', entorno='PostgreSQL/PostGIS privado desechable sin TCP/.env',
                        postgresql=version, postgis=sql('SELECT postgis_lib_version()'),
                        sha256={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(sources))},
                        limites=['Antecedente focal usuario/zona/stock vacío; DDL027/028/029/037/048/050 reales, historial047, CHECK057 y RPC077 extraídos sin modificar.',
                                 'Sin reconstrucción001–110, HTTP/PostgREST/Storage/Supabase remoto ni devolución física; identidad HTTP/JWT cubierta en unitarios.',
                                 'Actor BIGINT exacto en SQL; mantiene IDs numéricos y campania_id INTEGER del contrato HTTP legado.'],
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
