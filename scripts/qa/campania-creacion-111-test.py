#!/usr/bin/env python3
"""111: alta atómica y correlativo global en PostgreSQL privado, sin .env/TCP/Supabase."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT/'migrations/111_campania_creacion_atomica.sql'
SIGNATURE = 'public.fn_crear_campania(text,text,public.tipo_subcampania,text,date,date,bigint[])'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    if args.evidence and args.evidence.exists():
        parser.error('La evidencia debe ser nueva; no sobrescribir cortes previos.')
    binaries = {name: str(args.pg_bin/name) for name in ('initdb', 'pg_ctl', 'psql')}
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update(PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull, LC_ALL='C')
    directory = Path(tempfile.mkdtemp(prefix='campania-111-', dir='/tmp')).resolve()
    passfile = directory/'empty.pgpass'
    passfile.touch(mode=0o600)
    env['PGPASSFILE'] = str(passfile)
    cluster, socket = directory/'postgres', directory/'socket'
    socket.mkdir(mode=0o700)
    started = False
    checks = []
    races = []
    migration = MIGRATION.read_text()

    def command():
        return [binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-v', 'VERBOSITY=verbose', '-h', str(socket), '-p', '55447', '-U', 'postgres', '-d', 'postgres']

    def run(cmd):
        result = subprocess.run(cmd, env=env, text=True, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        return result.stdout.strip()

    def sql(statement, error=None, application='campania_111_test'):
        result = subprocess.run(command()+['-c', statement], env={**env, 'PGAPPNAME': application},
                                text=True, capture_output=True, timeout=40)
        if error:
            if not result.returncode or error not in result.stderr:
                raise AssertionError(f'Esperado {error}: {result.stderr[-3000:]}')
        elif result.returncode:
            raise RuntimeError(result.stderr[-3000:])
        return result.stdout.strip()

    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        checks.append(label)

    def literal(value):
        return 'NULL' if value is None else "'"+str(value).replace("'", "''")+"'"

    def creation(name, orgs=None, actor='actor-admin', start=None, end=None, tipo='REFORESTACION'):
        array = 'NULL' if orgs is None else 'ARRAY['+','.join('NULL' if i is None else str(i) for i in orgs)+']::bigint[]'
        return ("SELECT public.fn_crear_campania("+','.join([
            literal(actor), literal(name), literal(tipo), 'NULL', literal(start), literal(end), array])+');')

    def create(name, orgs=None, actor='actor-admin', error=None, **fields):
        response = sql('SET ROLE service_role; '+creation(name, orgs, actor, **fields), error)
        return json.loads(response) if response and not error else None

    def snapshot():
        return sql("""SELECT jsonb_build_object(
          'campanias',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM public.campania c),
          'vinculos',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM public.campania_organizacion o),
          'usuarios',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.usuario u),
          'organizaciones',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.organizacion o),
          'subcampanias',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') FROM public.subcampania s));""")

    def catalog():
        return sql("""SELECT jsonb_build_object(
          'funciones',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl) ORDER BY p.proname)
            FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN('fn_crear_campania','fn_generar_codigo_campania')),
          'secuencia',(SELECT jsonb_build_array(last_value,is_called) FROM public.seq_codigo_campania_contador),
          'secuencia_acl',(SELECT relacl FROM pg_class WHERE oid='public.seq_codigo_campania_contador'::regclass));""")

    def assert_waiting(application, wait_type, wait_event=None):
        deadline = time.monotonic()+5
        while time.monotonic()<deadline:
            query = f"SELECT count(*) FROM pg_stat_activity WHERE application_name={literal(application)} AND wait_event_type={literal(wait_type)}"
            if wait_event:
                query += ' AND wait_event='+literal(wait_event)
            if sql(query) == '1':
                return
            time.sleep(.02)
        raise AssertionError('No se observó la espera real: '+application+'/'+wait_type)

    try:
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--locale=en_US.UTF-8', '--encoding=UTF8'])
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory/'postgres.log'), '-w', '-t', '20',
             'start', '-o', f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55447 -c unix_socket_permissions=0700"])
        started = True
        version = sql('SHOW server_version')
        run(command()+['-f', str(ROOT/'test/db/campania-creacion-111.schema.sql')])
        for filename in ('028_m3_campania.sql', '037_m3_campania_tipo.sql',
                         '039_m3_generar_codigo_campania_rpc.sql', '050_m3_campania_edicion_eliminacion_estricta_mvp.sql'):
            run(command()+['-f', str(ROOT/'migrations'/filename)])
        sql("""GRANT SELECT ON public.usuario TO service_role;
          GRANT UPDATE(activo) ON public.usuario TO service_role;
          GRANT SELECT,INSERT,UPDATE ON public.campania TO service_role;
          GRANT SELECT,INSERT,DELETE ON public.campania_organizacion TO service_role;
          GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
          GRANT SELECT ON public.campania,public.campania_organizacion TO anon,authenticated;
          INSERT INTO public.organizacion(id,nombre,activo) VALUES(20,'Organización sintética A',true),(21,'Organización sintética B',false);
          INSERT INTO public.campania(id,nombre,tipo,codigo_trazabilidad,created_by,updated_by,deleted_at) VALUES
            (100,'Histórica cien','REFORESTACION','CMP-2026-100',1,1,'2026-01-01'),
            (101,'Histórica998','FORESTACION','CMP-2025-998',1,1,'2026-01-02');
          SELECT setval('public.seq_codigo_campania_contador',998,true);""")
        historical = sql('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.campania c WHERE id>=100')
        before = snapshot()
        run(command()+['-f', str(MIGRATION)])
        installed = catalog()
        run(command()+['-f', str(MIGRATION)])
        check(before==snapshot() and installed==catalog(), 'Instalación/repetición111 conserva filas, auditoría, secuencia global y catálogo')
        check(sql("SELECT NOT has_table_privilege('service_role','public.usuario','UPDATE') AND has_any_column_privilege('service_role','public.usuario','UPDATE')")=='t',
              'La cuenta SHARE funciona con SELECT y UPDATE sólo de una columna, sin ampliar permisos de tabla')

        no_orgs = create('Alta sin organizaciones')
        with_orgs = create('Alta con organizaciones', [21,20], start='2026-11-16', end='2026-11-16', tipo='ARBORIZACION')
        current_year = sql("SELECT extract(year FROM (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz'))::int")
        check(no_orgs['codigo_trazabilidad']==f'CMP-{current_year}-999'
              and with_orgs['codigo_trazabilidad']==f'CMP-{current_year}-1000',
              'Alta con/sin asociaciones preserva contador global histórico y cruza999→1000 sin truncamiento')
        check(set(no_orgs)=={'id','nombre','tipo','codigo_trazabilidad','descripcion','fecha_estimada_inicio','fecha_estimada_fin','created_at'}
              and no_orgs['descripcion'] is None and no_orgs['fecha_estimada_inicio'] is None,
              'Respuesta SQL conserva la proyección HTTP vigente sin persistir estado ni meta')
        check(sql(f"SELECT count(*)=2 AND bool_and(created_by=1) FROM public.campania_organizacion WHERE campania_id={with_orgs['id']}")=='t'
              and sql(f"SELECT created_by=1 AND updated_by=1 FROM public.campania WHERE id={with_orgs['id']}")=='t'
              and sql(f"SELECT count(*) FROM public.campania_organizacion WHERE campania_id={no_orgs['id']}")=='0',
              'Campaña y vínculos comparten auditoría; organización inactiva existente conserva la admisión vigente')
        next_year = sql("SET ROLE service_role; SELECT public.fn_generar_codigo_campania(2099)")
        check(next_year=='CMP-2099-1001', 'El correlativo global no reinicia al cambiar el año')

        def rejection(name, orgs=None, actor='actor-admin', error='PT400', **fields):
            before_reject = snapshot()
            create(name, orgs, actor, error, **fields)
            check(before_reject==snapshot(), 'Rechazo sin campaña, vínculo ni auditoría parcial: '+name)

        rejection('Organización inexistente', [20,999], error='PT400')
        rejection('Organización repetida', [20,20], error='PT400')
        rejection('Organización nula', [20,None], error='PT400')
        rejection('Alta con organizaciones', [20], error='PT422')
        rejection('Fechas incoherentes', start='2026-12-01', end='2026-11-01')
        rejection('Sin tipo', tipo=None)
        for actor in ('actor-general','actor-validador','actor-plantador','actor-voluntario','actor-inactivo'):
            rejection('Sin ADMIN '+actor, [20], actor, 'PT403')
        rejection('Cuenta desconocida', [20], 'no-existe', 'PT404')

        sql("""CREATE FUNCTION public.campania_111_fallo_puente() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.organizacion_id=21 AND EXISTS(SELECT 1 FROM public.campania_organizacion
            WHERE campania_id=NEW.campania_id AND organizacion_id=20) THEN
            RAISE EXCEPTION 'PUENTE_FALLO_TRAS_PRIMERA_ASOCIACION';
          END IF;
          RETURN NEW;
        END $$;
        CREATE TRIGGER campania_111_fallo_puente AFTER INSERT ON public.campania_organizacion
          FOR EACH ROW EXECUTE FUNCTION public.campania_111_fallo_puente();""")
        before_trigger = snapshot()
        sequence_before = int(sql('SELECT last_value FROM public.seq_codigo_campania_contador'))
        create('Fallo real del puente', [20,21], error='PUENTE_FALLO_TRAS_PRIMERA_ASOCIACION')
        check(before_trigger==snapshot(), 'Fallo real posterior al primer vínculo revierte campaña, todas las asociaciones y auditoría')
        consumed = int(sql('SELECT last_value FROM public.seq_codigo_campania_contador'))
        sql('DROP TRIGGER campania_111_fallo_puente ON public.campania_organizacion; DROP FUNCTION public.campania_111_fallo_puente();')
        retried = create('Fallo real del puente', [20,21])
        check(consumed==sequence_before+1 and int(retried['codigo_trazabilidad'].split('-')[-1])==consumed+1,
              'El rollback admite un alta posterior con el mismo nombre sin reutilizar el correlativo abortado')

        before_acl = snapshot()
        for role in ('anon','authenticated'):
            for statement in (creation('No público '+role,[20]), 'SELECT public.fn_generar_codigo_campania(2026)',
                              "SELECT nextval('public.seq_codigo_campania_contador')",
                              "INSERT INTO public.campania_organizacion(campania_id,organizacion_id,created_by) VALUES(1,20,1)"):
                sql('SET ROLE '+role+'; '+statement, error='42501')
        check(before_acl==snapshot(), 'anon/authenticated no ejecutan RPC/generador ni consumen secuencia o escriben el puente')
        check(sql("SELECT has_table_privilege('anon','public.campania','SELECT') AND has_table_privilege('authenticated','public.campania_organizacion','SELECT')")=='t',
              'El cierre privado de funciones/secuencia conserva lecturas previas de campaña y organizaciones')

        # READ COMMITTED más el SHARE de cuenta debe revalidar el rol/baja que
        # se confirmó mientras el alta estaba esperando el mismo objeto.
        with ThreadPoolExecutor(max_workers=3) as pool:
            for column, value, restore in (('rol',"'GENERAL'","'ADMIN'"),('activo','false','true')):
                prior = snapshot()
                name = 'campania111_retiro_'+column
                blocker = pool.submit(sql, f'BEGIN; UPDATE public.usuario SET {column}={value} WHERE id=1; SELECT pg_sleep(.8); COMMIT;', None, name)
                assert_waiting(name, 'Timeout', 'PgSleep')
                follower = pool.submit(create, 'Revalidar '+column, [20], 'actor-admin', 'PT403')
                assert_waiting('campania_111_test', 'Lock')
                blocker.result()
                follower.result()
                sql(f'UPDATE public.usuario SET {column}={restore} WHERE id=1')
                check(prior==snapshot(), 'Revalida '+column+' tras esperar retiro/baja concurrente; no crea dominio')
                races.append('Retiro/baja antes del alta: '+column)

            # El alta que obtuvo SHARE antes de la baja conserva su autorización
            # hasta commit; el UPDATE de autoridad espera realmente al alta.
            holder_name = 'campania111_alta_share'
            holder = pool.submit(sql, 'BEGIN; SET ROLE service_role; '+creation('Alta antes de baja',[20])+' SELECT pg_sleep(.8); COMMIT;', None, holder_name)
            assert_waiting(holder_name, 'Timeout', 'PgSleep')
            update_name = 'campania111_baja_espera'
            waiter = pool.submit(sql, 'UPDATE public.usuario SET activo=false WHERE id=1', None, update_name)
            assert_waiting(update_name, 'Lock')
            holder.result()
            waiter.result()
            sql('UPDATE public.usuario SET activo=true WHERE id=1')
            check(sql("SELECT count(*) FROM public.campania WHERE nombre='Alta antes de baja'")=='1',
                  'Alta autorizada mantiene SHARE hasta commit; la baja posterior espera la confirmación completa')
            races.append('Alta antes de baja')

            concurrent = list(pool.map(lambda i: create('Alta paralela '+str(i),[20,21]), range(6)))
            check(len({item['codigo_trazabilidad'] for item in concurrent})==6
                  and all(sql(f"SELECT count(*) FROM public.campania_organizacion WHERE campania_id={item['id']}")=='2' for item in concurrent),
                  'Seis altas concurrentes confirman códigos distintos y todas sus asociaciones')
            races.append('Seis altas con organizaciones concurrentes')

        # La deriva de catálogo se ensaya dentro de BEGIN: al abortar111 la
        # sesión revierte también la modificación sintética del antecedente.
        before_drift, catalog_before = snapshot(), catalog()
        variants = [
            ('ALTER SEQUENCE public.seq_codigo_campania_contador CYCLE;', 'CAMPANIA_111_SECUENCIA_INCOMPATIBLE'),
            ('ALTER FUNCTION public.fn_generar_codigo_campania(integer) SECURITY DEFINER;', 'CAMPANIA_111_GENERADOR_INCOMPATIBLE'),
            ("CREATE OR REPLACE FUNCTION public.fn_generar_codigo_campania(p_anio integer) RETURNS text LANGUAGE sql AS $$ SELECT 'DERIVA'::text $$;", 'CAMPANIA_111_GENERADOR_INCOMPATIBLE'),
            ("CREATE FUNCTION public.fn_crear_campania(integer) RETURNS text LANGUAGE sql AS $$ SELECT 'DERIVA'::text $$;", 'CAMPANIA_111_RPC_INCOMPATIBLE'),
            ("CREATE ROLE campania_111_heredado NOLOGIN; GRANT campania_111_heredado TO anon; GRANT EXECUTE ON FUNCTION "+SIGNATURE+" TO campania_111_heredado;", 'CAMPANIA_111_ACL_HEREDADA_INCOMPATIBLE'),
            ('REVOKE UPDATE(activo) ON public.usuario FROM service_role;', 'CAMPANIA_111_ACL_INCOMPATIBLE'),
        ]
        for change, error in variants:
            sql('BEGIN; '+change+' '+migration.replace('BEGIN;', '', 1), error)
            check(before_drift==snapshot() and catalog_before==catalog(), 'Deriva aborta111 y revierte catálogo/filas: '+error)

        check(historical==sql('SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.campania c WHERE id>=100'),
              'Las campañas históricas y sus códigos, incluidos soft-deleted, no se borran ni reescriben')
        run(command()+['-f', str(MIGRATION)])
        check(before_drift==snapshot() and catalog_before==catalog(), 'Reaplicar111 tras altas, errores y concurrencia conserva hechos y secuencia')

        evidence = {
            'fecha_utc': datetime.now(timezone.utc).isoformat(), 'postgresql': version, 'resultado': 'APROBADO',
            'grupos': len(checks), 'comprobaciones': checks, 'carreras': races,
            'firma_rpc': SIGNATURE+' RETURNS jsonb', 'sha256_migracion': hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
            'limites': ['Clúster PostgreSQL privado desechable por socket, sin TCP/.env/Supabase ni personas reales.',
                        'Fixture focal sintético de cuenta/catálogos/subcampaña; carga028/037/039/050/111 reales, no replay001–110.',
                        'Prueba RPC bajo service_role y ACL SQL; JWT/HTTP se verifican por separado con unitarios locales.',
                        'nextval no revierte: los abortos dejan saltos; no hay recibo persistido ni reintento idempotente.',
                        'SQL privilegiado que reinicie la secuencia o salte los locks no está cubierto por la garantía.'],
        }
        if args.evidence:
            args.evidence.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
        print(f"111: {len(checks)} grupos y {len(races)} escenarios concurrentes aprobados en PostgreSQL {version}.")
    finally:
        if started:
            subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-m', 'immediate', '-w', 'stop'],
                           env=env, capture_output=True, text=True, timeout=30)
        shutil.rmtree(directory)


if __name__ == '__main__':
    main()
