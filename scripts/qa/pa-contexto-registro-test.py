#!/usr/bin/env python3
"""Contexto de registro: PostgreSQL/PostGIS aislados, sin .env ni TCP."""
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
import uuid

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pg-bin', required=True)
parser.add_argument('--evidence', help='JSON de resultado, sin datos personales ni tokens')
args = parser.parse_args()
bin_dir = Path(args.pg_bin).resolve()
bins = {name: str(bin_dir/name) for name in ('initdb', 'pg_ctl', 'createdb', 'psql', 'pg_config')}
directory = Path(tempfile.mkdtemp(prefix='pa-int03a-', dir='/tmp')).resolve()
cluster, socket = directory/'postgres', directory/'socket'
socket.mkdir(mode=0o700)
env = {k: v for k, v in os.environ.items() if not k.startswith(('PG', 'PA_C_DB_', 'SUPABASE_', 'JWT_'))}
env.update(LC_ALL='C', PGAPPNAME='pa_contexto_avance_aislado')
port, database = '55439', 'pa_int03a_ensayo'


def run(command, input_text=None):
    result = subprocess.run(command, cwd=ROOT, env=env, input=input_text, text=True,
                            capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout)[-5000:])
    return result.stdout.strip()


def sql(query):
    return run([bins['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
                '-p', port, '-U', 'postgres', '-d', database], query)


def install(path):
    run([bins['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
         '-p', port, '-U', 'postgres', '-d', database, '-f', str(ROOT/path)])


def lit(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return "'"+str(value).replace("'", "''")+"'"


def rpc(name, *params):
    return json.loads(sql('SET ROLE service_role; SELECT public.'+name+'('+','.join(lit(p) for p in params)+');'))


def species(scope, actor=9300):
    response = rpc('pa_registro_contexto_leer', actor, 'a-http-'+str(actor), scope)
    return response['data']['especies'][0], response


def command(scope, count):
    actor = 9300
    key = str(uuid.uuid4())
    prepared = rpc('pa_cargas_operar', actor, 'a-http-9300', 'PREPARAR', key,
                   {'subcampania_id': str(scope)})
    assert prepared['http_status'] == 200, prepared
    charge = {'carga_id': str(uuid.uuid4()), 'hash_original': '12'*32,
              'hash_derivada': '34'*32, 'tamano_original': 80,
              'tamano_derivada': 70, 'mime_original': 'image/png',
              'lease_token': str(uuid.uuid4())}
    reserved = rpc('pa_cargas_operar', actor, 'a-http-9300', 'RESERVAR', key, charge)
    assert reserved['http_status'] == 202, reserved
    job = reserved['body']['data']['trabajo']
    charge.update(generacion=job['generacion'], lease_token=job['lease_token'], objetos_verificados=True)
    photo = rpc('pa_cargas_operar', actor, 'a-http-9300', 'FINALIZAR', key, charge)
    assert photo['http_status'] == 201, photo
    payload = {'subcampania_id': str(scope), 'plan_revision_esperada': '0',
               'fecha_plantacion': sql("SELECT (now() AT TIME ZONE 'America/La_Paz')::date"),
               'latitud': -16.5, 'longitud': -68.1,
               'especies': [{'planta_id': '8', 'cantidad': count}],
               'coresponsable_ids': [], 'evidencia_ids': [photo['body']['data']['evidencia_id']],
               'observaciones': None, 'afiliaciones_declaradas': []}
    canonical = dict(payload, latitud='-16.500000', longitud='-68.100000')
    query = ('SET ROLE service_role; SELECT public.pa_registro_inicial_ejecutar(9300,'
             +lit('a-http-9300')+','+lit(key)+'::uuid,'+lit(payload)+'::jsonb,'
             +lit(json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(',', ':')))+');')
    return json.loads(sql(query))


try:
    if any(not Path(p).is_file() for p in bins.values()):
        raise RuntimeError('Faltan binarios PostgreSQL en --pg-bin.')
    if not (Path(run([bins['pg_config'], '--sharedir']))/'extension/postgis.control').is_file():
        raise RuntimeError('Se requiere PostGIS real.')
    locales = run(['locale', '-a']).splitlines()
    locale = next((x for x in ('C.UTF-8', 'C.utf8', 'en_US.UTF-8', 'en_US.utf8') if x in locales), None)
    if not locale:
        raise RuntimeError('Falta locale UTF-8.')
    run([bins['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
         '--auth-host=reject', '--encoding=UTF8', '--locale='+locale])
    options = "-c listen_addresses='' -c unix_socket_directories='"+str(socket)+"' -c port="+port+' -c max_connections=16 -c shared_buffers=16MB'
    run([bins['pg_ctl'], '-D', str(cluster), '-l', str(directory/'postgres.log'),
         '-w', '-t', '20', 'start', '-o', options])
    run([bins['createdb'], '-h', str(socket), '-p', port, '-U', 'postgres', database])
    install('test/db/pa-int02c-fixture.sql')
    install('migrations/067_pa_int02a_postgrest_timeout.sql')
    migrations = sorted(p for p in ROOT.glob('migrations/0*.sql') if 68 <= int(p.name[:3]) <= 86)
    if [int(p.name[:3]) for p in migrations] != list(range(68, 87)):
        raise RuntimeError('Se requieren migraciones 068–086 consecutivas.')
    for migration in migrations[:6]:
        install(migration.relative_to(ROOT))
    install('test/db/pa-int03a-fixture.sql')
    legacy = (ROOT/'migrations/010_vivero_operational_rules.sql').read_text()
    start = legacy.index('CREATE OR REPLACE FUNCTION public.fn_vivero_assert_fecha_operativa(')
    sql(legacy[start:legacy.index('$$;', start)+3])
    for migration in migrations[6:9]:
        install(migration.relative_to(ROOT))
    install('test/db/pa-int02d-fixture.sql')
    sql('ALTER TABLE public.evento_plantacion ADD COLUMN IF NOT EXISTS cantidad_muerta_delta INTEGER, ADD COLUMN IF NOT EXISTS registro_plantacion_id BIGINT REFERENCES public.registro_plantacion(id)')
    sql("ALTER TYPE public.tipo_evento_plantacion ADD VALUE IF NOT EXISTS 'MORTANDAD_REPORTADA'")
    for migration in migrations[9:14]:
        install(migration.relative_to(ROOT))
    install('test/db/pa-int05-fixture.sql')
    for migration in migrations[14:18]:
        install(migration.relative_to(ROOT))
    install('test/db/pa-int07-participantes-fixture.sql')
    install('migrations/086_pa_contexto_registro_avance_especie.sql')
    install('migrations/086_pa_contexto_registro_avance_especie.sql')
    cases = []
    sql("INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles) "
        "VALUES(970,800,'Ámbito avance INT03-A','ACTIVA','AVANCE-970',800,800,1,'Zona sintética',"
        "ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),4);"
        "INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) VALUES(970,8,100,4);"
        "INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) "
        "VALUES(97000,970,81,'PLANTACION_INICIAL',10,800,now()-interval '1 day',(now() AT TIME ZONE 'America/La_Paz')::date-1);")
    row, envelope = species(970)
    assert (row['plantado_inicial'], row['pendiente_meta'], row['saldo_elegible']) == (0, 4, 10), row
    cases.append('sin registros y stock positivo')
    sql("INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles) "
        "VALUES(971,800,'Ámbito multiespecie INT03-A','ACTIVA','AVANCE-971',800,800,1,'Zona sintética',"
        "ST_GeomFromText('POLYGON((-68.2 -16.6,-68.0 -16.6,-68.0 -16.4,-68.2 -16.4,-68.2 -16.6))',4326),2);"
        "INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) VALUES(971,8,50,1),(971,9,50,1);")
    empty = rpc('pa_registro_contexto_leer', 9300, 'a-http-9300', 971)['data']
    assert empty['disponibilidad'] == 'SIN_STOCK'
    assert [(s['planta_id'], s['plantado_inicial'], s['pendiente_meta'], s['saldo_elegible'])
            for s in empty['especies']] == [('8', 0, 1, 0), ('9', 0, 1, 0)], empty
    cases.append('dos especies sin registros ni stock devuelven cero y meta vigente')
    assert command(970, 2)['body']['estado'] == 'CONFIRMADO'
    row, _ = species(970)
    assert (row['plantado_inicial'], row['pendiente_meta'], row['saldo_elegible']) == (2, 2, 8), row
    assert command(970, 2)['body']['estado'] == 'CONFIRMADO'
    row, _ = species(970)
    assert (row['plantado_inicial'], row['pendiente_meta']) == (4, 0), row
    assert command(970, 2)['body']['estado'] == 'CONFIRMADO'
    row, _ = species(970)
    assert (row['plantado_inicial'], row['pendiente_meta']) == (6, 0), row
    cases.append('confirmaciones sucesivas, meta cubierta y excedida')
    assert command(970, 5)['body']['estado'] == 'RECHAZADO'
    assert species(970)[0]['plantado_inicial'] == 6
    prepared_only = rpc('pa_cargas_operar', 9300, 'a-http-9300', 'PREPARAR', str(uuid.uuid4()),
                        {'subcampania_id': '970'})
    assert prepared_only['http_status'] == 200 and species(970)[0]['plantado_inicial'] == 6
    cases.append('rechazo y preparación sin confirmar no incrementan avance')
    sql("INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) VALUES(940,8,100,10);")
    row, _ = species(940)
    assert (row['plantado_inicial'], row['pendiente_meta']) == (5, 5), row
    sql("INSERT INTO public.asignacion_vivero_subcampania(id,subcampania_id,lote_vivero_id,proposito,cantidad_asignada,cantidad_consumida,usuario_asignacion_id,fecha_asignacion,fecha_entrega_operativa) "
        "VALUES(94001,940,81,'REPOSICION',2,2,800,now()-interval '1 day',(now() AT TIME ZONE 'America/La_Paz')::date-1);"
        "INSERT INTO public.registro_plantacion(id,subcampania_id,responsable_id,fecha_plantacion,cantidad_total_plantada,codigo_trazabilidad,created_by,nombre_responsable_snapshot,nombre_subcampania_snapshot,nombre_zona_snapshot,latitud,longitud,gps_dentro_poligono,es_reposicion,registro_plantacion_origen_id) "
        "VALUES(940001,940,801,(now() AT TIME ZONE 'America/La_Paz')::date-1,2,'AVANCE-REPOSICION-940',801,'Autor','Ámbito','Zona',-16.5,-68.1,true,true,940000);"
        "INSERT INTO public.registro_plantacion_detalle(registro_plantacion_id,asignacion_id,lote_vivero_id,planta_id,cantidad) VALUES(940001,94001,81,8,2);")
    assert species(940)[0]['plantado_inicial'] == 5
    cases.append('reposición excluida del acumulado inicial')
    # El registro 940000 contiene una plantación original de cinco. El caso
    # CANTIDAD aún no está habilitado como operación: este fixture privado
    # levanta solo ese CHECK para ensayar su ledger futuro. Las demás FK,
    # constraints y triggers siguen activos; no acredita el ejecutor INT07.
    sql('ALTER TABLE public.participacion_comando DROP CONSTRAINT participacion_comando_operacion_ck')
    correction = sql("INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,resultado,http_terminal,finalizado_en) "
        "VALUES(9300,'CORREGIR_CANTIDAD_PLANTACION',gen_random_uuid(),decode(repeat('01',32),'hex'),'CONFIRMADO','{\"tipo\":\"ACCESO\"}',200,clock_timestamp()) RETURNING id")
    detail = sql('SELECT id FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=940000')
    sql("INSERT INTO public.registro_plantacion_grupo_revision(grupo_registro_id) VALUES(940000);"
        "UPDATE public.registro_plantacion SET revision_registro=1 WHERE id=940000;"
        "UPDATE public.registro_plantacion_grupo_revision SET revision_grupo=1 WHERE grupo_registro_id=940000;"
        "INSERT INTO public.registro_plantacion_correccion(comando_interno_id,actor_id,subcampania_id,grupo_registro_id,registro_plantacion_id,caso,motivo,anterior,nuevo,revision_anterior,revision_nueva,revision_grupo_anterior,revision_grupo_nueva) VALUES("
        +correction+",9300,940,940000,940000,'CANTIDAD','Ajuste sintético','{\"cantidad\":5}','{\"cantidad\":3}',0,1,0,1);")
    correction_id = sql('SELECT id FROM public.registro_plantacion_correccion WHERE comando_interno_id='+correction)
    sql("INSERT INTO public.registro_plantacion_consumo_credito(registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id) VALUES(940000,94000,8,'PLANTACION_INICIAL',5,"+detail+");"
        "INSERT INTO public.registro_plantacion_consumo_compensacion(credito_id,correccion_id,cantidad) VALUES((SELECT id FROM public.registro_plantacion_consumo_credito WHERE detalle_original_id="+detail+"),"+correction_id+",2);"
        "INSERT INTO public.registro_plantacion_efectivo(registro_plantacion_id,subcampania_id,cantidad_efectiva,observaciones_efectivas,ultima_correccion_id) VALUES(940000,940,3,'OBSERVACION_PRIVADA_PART_940',"+correction_id+");"
        "UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=3 WHERE id=94000;")
    row, _ = species(940)
    assert (row['plantado_inicial'], row['pendiente_meta'], row['saldo_elegible']) == (3, 7, 7), row
    cases.append('corrección efectiva con compensación sin duplicar original')
    sql("INSERT INTO public.subcampania_meta_especie(subcampania_id,planta_id,porcentaje_objetivo,cantidad_objetivo) VALUES(941,8,100,5)")
    assert species(941)[0]['plantado_inicial'] == 5
    reverted_command = sql("INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,huella,estado,resultado,http_terminal,finalizado_en) "
        "VALUES(9300,'REVERTIR_REGISTRO_PLANTACION',gen_random_uuid(),decode(repeat('02',32),'hex'),'CONFIRMADO','{\"tipo\":\"ACCESO\"}',200,clock_timestamp()) RETURNING id")
    reverted_detail = sql('SELECT id FROM public.registro_plantacion_detalle WHERE registro_plantacion_id=941000')
    sql("INSERT INTO public.registro_plantacion_grupo_revision(grupo_registro_id) VALUES(941000);"
        "UPDATE public.registro_plantacion SET revision_registro=1 WHERE id=941000;"
        "UPDATE public.registro_plantacion_grupo_revision SET revision_grupo=1 WHERE grupo_registro_id=941000;"
        "INSERT INTO public.registro_plantacion_correccion(comando_interno_id,actor_id,subcampania_id,grupo_registro_id,registro_plantacion_id,caso,motivo,anterior,nuevo,revision_anterior,revision_nueva,revision_grupo_anterior,revision_grupo_nueva) VALUES("
        +reverted_command+",9300,941,941000,941000,'REGISTRO_ERRONEO','Trabajo no ocurrido','{\"cantidad\":5}','{\"cantidad\":0}',0,1,0,1);")
    reverted_correction = sql('SELECT id FROM public.registro_plantacion_correccion WHERE comando_interno_id='+reverted_command)
    sql("INSERT INTO public.registro_plantacion_consumo_credito(registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id) VALUES(941000,94100,8,'PLANTACION_INICIAL',5,"+reverted_detail+");"
        "INSERT INTO public.registro_plantacion_consumo_compensacion(credito_id,correccion_id,cantidad) VALUES((SELECT id FROM public.registro_plantacion_consumo_credito WHERE detalle_original_id="+reverted_detail+"),"+reverted_correction+",5);"
        "INSERT INTO public.registro_plantacion_efectivo(registro_plantacion_id,subcampania_id,estado,cantidad_efectiva,observaciones_efectivas,ultima_correccion_id) VALUES(941000,941,'REVERTIDO',0,'OBSERVACION_PRIVADA_PART_941',"+reverted_correction+");"
        "UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=0 WHERE id=94100;")
    row, _ = species(941)
    assert (row['plantado_inicial'], row['pendiente_meta']) == (0, 5), row
    cases.append('original revertido con compensación total se cuenta como cero')
    sql("UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=10 WHERE id=97000")
    row, _ = species(970)
    assert row['saldo_elegible'] == 0 and row['plantado_inicial'] == 6 and row['pendiente_meta'] == 0, row
    cases.append('stock cero conserva avance')
    connection = [bins['psql'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', str(socket),
                  '-p', port, '-U', 'postgres', '-d', database]
    first = subprocess.Popen(connection, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, bufsize=1, env=env)
    second = None
    try:
        first.stdin.write("BEGIN; UPDATE public.subcampania SET plan_revision=plan_revision+1 WHERE id=970; "
                          "UPDATE public.subcampania_meta_especie SET cantidad_objetivo=7 WHERE subcampania_id=970 AND planta_id=8; "
                          "UPDATE public.asignacion_vivero_subcampania SET cantidad_consumida=9 WHERE id=97000; "
                          "SELECT 'READY';\n")
        first.stdin.flush()
        assert select.select([first.stdout], [], [], 10)[0] and first.stdout.readline().strip() == 'READY'
        race_name = 'pa_contexto_race_'+uuid.uuid4().hex[:10]
        second = subprocess.Popen(connection, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True, env=dict(env, PGAPPNAME=race_name))
        second.stdin.write("SET ROLE service_role; SELECT public.pa_registro_contexto_leer(9300,'a-http-9300',970);\n")
        second.stdin.close()
        blocked = False
        for _ in range(70):
            blocked = sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name="+lit(race_name)+" AND wait_event_type='Lock')") == 't'
            if blocked:
                break
            assert second.poll() is None, 'El contexto no esperó el lock del plan.'
            time.sleep(.03)
        assert blocked, 'No se observó espera Lock real.'
        first.stdin.write('COMMIT;\n\\quit\n')
        first.stdin.flush()
        first.stdin.close()
        assert first.wait(timeout=15) == 0, first.stderr.read()
        assert second.wait(timeout=15) == 0, second.stderr.read()
        updated = json.loads(second.stdout.read().strip())['data']
        updated_species = updated['especies'][0]
        assert (updated['subcampania']['plan_revision'], updated_species['cantidad_objetivo'],
                updated_species['saldo_elegible'], updated_species['plantado_inicial'],
                updated_species['pendiente_meta']) == ('1', 7, 1, 6, 1), updated
        cases.append('lectura bloqueada hasta commit observa plan, saldo y avance coherentes')
    finally:
        for process in (second, first):
            if process and process.poll() is None:
                process.kill()
                process.wait(timeout=5)
    assert 'asignacion_id' not in json.dumps(envelope) and 'lote_vivero_id' not in json.dumps(envelope)
    try:
        rpc('pa_registro_contexto_leer', 9303, 'a-http-9303', 970)
        raise AssertionError('Se filtró contexto ajeno')
    except RuntimeError as error:
        assert 'RECURSO_NO_VISIBLE' in str(error)
    cases.append('privacidad y autorización conservadas')
    result = {'fecha_utc': datetime.now(timezone.utc).isoformat(),
              'base_git': run(['git', 'rev-parse', 'HEAD']),
              'sha256_086': hashlib.sha256((ROOT/'migrations/086_pa_contexto_registro_avance_especie.sql').read_bytes()).hexdigest(),
              'postgresql': sql('SHOW server_version'), 'postgis': sql('SELECT postgis_lib_version()'),
              'casos': cases, 'entorno': 'PostgreSQL/PostGIS aislado sin TCP ni .env',
              'limites': 'Sin despliegue ni prueba del futuro ejecutor INT07 de cantidades'}
    if args.evidence:
        evidence = Path(args.evidence).resolve()
        evidence.parent.mkdir(parents=True, exist_ok=True)
        evidence.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False))
finally:
    if (cluster/'postmaster.pid').exists():
        run([bins['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'])
    shutil.rmtree(directory)
