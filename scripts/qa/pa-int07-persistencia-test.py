#!/usr/bin/env python3
"""Verifica la persistencia parcial INT07 en PostgreSQL aislado, sin TCP/.env.

Usa antecedentes estructurales focales, no replay001–081 ni RPC de corrección.
No requiere PostGIS. Solo crea evidencia si se indica un archivo nuevo.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'migrations/082_pa_int07_persistencia.sql'
FIXTURE = ROOT / 'test/db/pa-int07-persistencia-fixture.sql'
PORT = '55438'
TABLES = [
    'registro_plantacion_grupo_revision', 'registro_plantacion_correccion',
    'registro_plantacion_efectivo', 'evento_plantacion_efectivo',
    'registro_plantacion_participante_efectivo',
    'registro_plantacion_consumo_credito', 'registro_plantacion_consumo_compensacion',
]
LEGACY = [
    'usuario', 'organizacion', 'subcampania', 'planta', 'lote_vivero',
    'evento_lote_vivero', 'asignacion_vivero_subcampania', 'registro_plantacion',
    'registro_plantacion_detalle', 'registro_plantacion_coresponsable',
    'evento_plantacion', 'participacion_comando',
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    binaries = {}
    for name in ('initdb', 'pg_ctl', 'psql'):
        path = (args.pg_bin.expanduser().resolve() / name) if args.pg_bin else shutil.which(name)
        if not path or not Path(path).is_file() or not os.access(path, os.X_OK):
            parser.error(f'Falta {name}; configure PATH o --pg-bin.')
        binaries[name] = str(Path(path).resolve())
    if not MIGRATION.is_file() or not FIXTURE.is_file():
        parser.error('Falta migración082 o fixture focal.')
    output = args.evidence.expanduser().resolve() if args.evidence else None
    if output and (output.exists() or not output.parent.is_dir()):
        parser.error('--evidence exige un archivo nuevo en un directorio existente.')
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C', PGAPPNAME='pa_int07_persistencia_aislada',
               PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull)
    directory = Path(tempfile.mkdtemp(prefix='pa-int07-persistencia-', dir='/tmp')).resolve()
    cluster, socket = directory / 'postgres', directory / 'socket'
    checks = []
    start_attempted = False

    def run(command):
        result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                                capture_output=True, timeout=45, check=False)
        if result.returncode:
            raise RuntimeError(result.stderr[-3500:] or 'Falló comando PostgreSQL aislado.')
        return result.stdout.strip()

    def psql(*arguments, database='postgres', expected_error=None, expected_marker=None):
        command = [binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                   '-v', 'VERBOSITY=verbose', '-h', str(socket), '-p', PORT,
                   '-U', 'postgres', '-d', database, *arguments]
        result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                                capture_output=True, timeout=45, check=False)
        if expected_error:
            state = re.search(r'\bERROR:\s+([A-Z0-9]{5}):', result.stderr)
            if (result.returncode == 0 or not state or state.group(1) not in expected_error
                    or (expected_marker and expected_marker not in result.stderr[state.end():])):
                raise RuntimeError('No se recibió el rechazo SQL esperado: ' + result.stderr[-2000:])
        elif result.returncode:
            raise RuntimeError(result.stderr[:1800] + '\n...\n' + result.stderr[-700:])
        return result.stdout.strip()

    def check(condition, description):
        if not condition:
            raise AssertionError(description)
        checks.append(description)

    def fail(sql, codes, description):
        psql('-c', sql, expected_error=codes)
        checks.append(description)

    def snapshot():
        # Solo hashes de datos sintéticos; no serializar valores al informe.
        rows = {}
        for table in LEGACY:
            rows[table] = psql('-c', f"SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) FROM public.{table} t")
        return rows

    def legacy_catalog():
        return json.loads(psql('-c', '''SELECT jsonb_build_object(
 'funciones',(SELECT jsonb_object_agg(p.oid::text,md5(pg_get_functiondef(p.oid)))
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f'),
 'restricciones',(SELECT jsonb_object_agg(c.oid::text,md5(pg_get_constraintdef(c.oid,true)))
   FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
 'triggers',(SELECT jsonb_object_agg(t.oid::text,md5(pg_get_triggerdef(t.oid,true)))
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace),
 'vistas',(SELECT jsonb_object_agg(c.oid::text,md5(pg_get_viewdef(c.oid,true)))
   FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='v'),
 'acl_relaciones',(SELECT jsonb_object_agg(c.oid::text,jsonb_build_array(c.relacl::text,c.relrowsecurity,c.relforcerowsecurity))
   FROM pg_class c WHERE c.relnamespace='public'::regnamespace),
 'acl_columnas',(SELECT jsonb_object_agg(a.attrelid::text||':'||a.attnum::text,to_jsonb(a.attacl::text))
   FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped))'''))

    try:
        socket.mkdir(mode=0o700)
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres',
             '--auth-local=trust', '--auth-host=reject', '--locale=C', '--encoding=UTF8'])
        start_attempted = True
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', "-c listen_addresses='' -c unix_socket_directories='"
             + str(socket) + "' -c unix_socket_permissions=0700 -c port=" + PORT + ' -c shared_buffers=16MB'])
        check(psql('-c', 'SHOW listen_addresses') == '', 'Clúster privado sin TCP')
        psql('-c', 'CREATE DATABASE pa_int07_sin_antecedentes')
        psql('-f', str(MIGRATION), database='pa_int07_sin_antecedentes', expected_error=['P0001'], expected_marker='PA_INT07_')
        check(psql('-c', "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace", database='pa_int07_sin_antecedentes') == '0',
              'Sin antecedentes falla y revierte DDL completo')
        psql('-f', str(FIXTURE))
        before, catalog_before = snapshot(), legacy_catalog()
        psql('-f', str(MIGRATION))
        check(snapshot() == before, 'Instalación preserva originales, snapshots, contadores, revisiones y recibos')
        check(all(psql('-c', f'SELECT count(*) FROM public.{table}') == '0' for table in TABLES),
              'Siete tablas nuevas vacías: sin backfill ni efectos de negocio')
        after = legacy_catalog()
        check(all(all(after[k].get(oid) == value for oid, value in (entries or {}).items())
                  for k, entries in catalog_before.items()),
              'Funciones, restricciones, triggers, vista, ACL y RLS del antecedente focal intactos')
        check(psql('-c', "SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'pa_int07_catalogo_%'") == '0',
              'Esquema privado de cotejo eliminado tras instalación')
        psql('-f', str(MIGRATION))
        check(snapshot() == before, 'Reaplicación compatible preserva todo el antecedente')
        check(all(psql('-c', f"SELECT relrowsecurity FROM pg_class WHERE oid='public.{table}'::regclass") == 't' for table in TABLES),
              'RLS habilitado en las siete tablas nuevas')
        for role in ('anon', 'authenticated', 'service_role'):
            for table in TABLES:
                if role != 'service_role':
                    fail(f'SET ROLE {role}; SELECT * FROM public.{table}', ['42501'],
                         f'{role} no lee {table}')
                else:
                    check(psql('-c', f'SET ROLE service_role; SELECT count(*) FROM public.{table}') == '0',
                          f'service_role solo lectura de {table}')
                fail(f'SET ROLE {role}; INSERT INTO public.{table} DEFAULT VALUES', ['42501'],
                     f'{role} no inserta {table}')
                fail(f'SET ROLE {role}; DELETE FROM public.{table}', ['42501'],
                     f'{role} no borra {table}')
                column = psql('-c', f"SELECT quote_ident(attname) FROM pg_attribute WHERE attrelid='public.{table}'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum LIMIT 1")
                fail(f'SET ROLE {role}; UPDATE public.{table} SET {column}={column}', ['42501'],
                     f'{role} no actualiza {table}')
                fail(f'SET ROLE {role}; TRUNCATE public.{table}', ['42501'],
                     f'{role} no trunca {table}')
        check(snapshot() == before, 'Denegaciones SQL sin cambios de negocio')
        new_functions = sorted(set(after['funciones']) - set(catalog_before['funciones']))
        check(bool(new_functions), 'Helpers de integridad nuevos identificados para verificar ACL')
        function_oids = ','.join(new_functions)
        for role in ('anon', 'authenticated', 'service_role'):
            check(psql('-c', f"SELECT bool_or(has_function_privilege('{role}',oid,'EXECUTE')) FROM pg_proc WHERE oid IN({function_oids})") == 'f',
                  f'{role} sin EXECUTE de helpers nuevos')
            check(psql('-c', "SELECT coalesce(bool_or(has_sequence_privilege('" + role + "',c.oid,'SELECT,UPDATE,USAGE')),false) FROM pg_class c WHERE c.relkind='S' AND c.relnamespace='public'::regnamespace AND c.relname LIKE 'registro_plantacion_c%'") == 'f',
                  f'{role} sin privilegios de secuencias de corrección/créditos')
        check(psql('-c', f"SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(p.proacl)=0 THEN NULL ELSE coalesce(p.proacl,acldefault('f',p.proowner)) END) a WHERE p.oid IN({function_oids}) AND a.grantee=0 AND a.privilege_type='EXECUTE')") == 'f',
              'PUBLIC sin EXECUTE por defecto de helpers nuevos')

        # Materialización estructural por propietario. No es ejecución de una
        # corrección ni altera el dominio: todos los valores copian el original.
        psql('-c', '''
INSERT INTO public.registro_plantacion_grupo_revision(grupo_registro_id) VALUES(1000);
INSERT INTO public.registro_plantacion_efectivo(registro_plantacion_id,subcampania_id,cantidad_efectiva,observaciones_efectivas)
 SELECT id,subcampania_id,cantidad_total_plantada,observaciones FROM public.registro_plantacion WHERE id IN(1000,2000);
INSERT INTO public.evento_plantacion_efectivo(evento_plantacion_id,grupo_registro_id,subcampania_id,cantidad_muerta_efectiva)
 VALUES(9000,1000,100,3);
INSERT INTO public.registro_plantacion_participante_efectivo(
 registro_plantacion_id,usuario_id,coresponsable_original_id,procedencia,nombre_snapshot)
 SELECT registro_plantacion_id,usuario_id,id,'ORIGINAL',nombre_snapshot
 FROM public.registro_plantacion_coresponsable WHERE id=8100;
INSERT INTO public.registro_plantacion_consumo_credito(
 id,registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id)
 VALUES(10000,1000,500,8,'PLANTACION_INICIAL',6,8000),
 (10001,1001,501,8,'REPOSICION',2,8001);
''')
        check(snapshot() == before, 'Materialización baseline conserva todo el dominio y recibos originales')
        check(psql('-c', "SELECT estado FROM public.registro_plantacion_participante_efectivo WHERE usuario_id=3") == 'PRESENTE',
              'Participante original hoy inactivo se conserva sin exigir habilitación actual')
        check(psql('-c', 'SELECT e.observaciones_efectivas=r.observaciones AND char_length(e.observaciones_efectivas)>2000 FROM public.registro_plantacion_efectivo e JOIN public.registro_plantacion r ON r.id=e.registro_plantacion_id WHERE r.id=2000') == 't',
              'Texto legado largo/NFD/con espacios copiado exactamente sin normalización retroactiva')
        fail('INSERT INTO public.registro_plantacion_grupo_revision(grupo_registro_id) VALUES(1001)', ['23514'],
             'Reposición no puede materializarse como grupo inicial')
        fail('INSERT INTO public.registro_plantacion_grupo_revision(grupo_registro_id,revision_grupo) VALUES(2000,3)', ['23514'],
             'Revisión inicial de grupo debe ser cero')
        fail('INSERT INTO public.registro_plantacion_efectivo(registro_plantacion_id,subcampania_id,cantidad_efectiva) VALUES(1001,200,2)', ['23514'],
             'Overlay no cruza subcampaña del objeto')
        fail('UPDATE public.registro_plantacion_efectivo SET cantidad_efectiva=5 WHERE registro_plantacion_id=1000', ['23514'],
             'Cantidad efectiva no cambia sin corrección vinculada')
        fail('UPDATE public.registro_plantacion_efectivo SET cantidad_efectiva=0,estado=\'REVERTIDO\' WHERE registro_plantacion_id=1000', ['23514'],
             'Reversión sin corrección no admite cero efectivo')
        fail('UPDATE public.evento_plantacion_efectivo SET cantidad_muerta_efectiva=2 WHERE evento_plantacion_id=9000', ['23514'],
             'Baja efectiva no cambia sin corrección vinculada')
        fail('UPDATE public.registro_plantacion_participante_efectivo SET estado=\'RETIRADO\' WHERE usuario_id=3', ['23514'],
             'Retiro de participación exige corrección vinculada')
        fail('INSERT INTO public.registro_plantacion_participante_efectivo(registro_plantacion_id,usuario_id,coresponsable_original_id,procedencia,nombre_snapshot) VALUES(1001,3,8100,\'ORIGINAL\',\'Nombre histórico original INT07\')', ['23514','23505'],
             'Snapshot original no se reutiliza en otro registro')
        fail('INSERT INTO public.registro_plantacion_consumo_credito(registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id) VALUES(1000,600,9,\'PLANTACION_INICIAL\',1,8002)', ['23514'],
             'Crédito no cruza asignaciones de otro ámbito')
        fail('INSERT INTO public.registro_plantacion_consumo_credito(registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id) VALUES(1000,500,8,\'PLANTACION_INICIAL\',7,8000)', ['23514'],
             'Crédito original no inventa consumo distinto del detalle')
        fail('INSERT INTO public.registro_plantacion_consumo_credito(registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id) VALUES(1000,500,8,\'PLANTACION_INICIAL\',6,8000)', ['23505'],
             'Detalle original no se acredita dos veces')
        fail('INSERT INTO public.registro_plantacion_consumo_credito(registro_plantacion_id,asignacion_id,planta_id,proposito,cantidad,detalle_original_id) VALUES(1001,501,8,\'PLANTACION_INICIAL\',2,8001)', ['23514'],
             'Reposición conserva propósito REPOSICION')
        fail('''INSERT INTO public.registro_plantacion_correccion(
 comando_interno_id,actor_id,subcampania_id,grupo_registro_id,registro_plantacion_id,caso,motivo,
 anterior,nuevo,revision_anterior,revision_nueva,revision_grupo_anterior,revision_grupo_nueva)
 VALUES(7001,1,100,1000,1000,'PARTICIPANTES','Caso sintético',
 '{"participantes":[]}','{"participantes":["3"]}',0,1,0,0)''', ['23514'],
             'Comando de autoridad anterior no sustenta historia de corrección')
        check(psql('-c', 'SELECT count(*) FROM public.registro_plantacion_correccion') == '0',
              'Rechazo del vínculo de comando no deja historial huérfano')
        for table in ('registro_plantacion_correccion','registro_plantacion_consumo_credito','registro_plantacion_consumo_compensacion'):
            fail(f'UPDATE public.{table} SET id=id', ['23514'], f'{table} es append-only incluso en UPDATE sin cambio')
            fail(f'DELETE FROM public.{table} WHERE false', ['23514'], f'{table} protege DELETE por sentencia')
            fail(f'TRUNCATE public.{table} CASCADE', ['23514'], f'{table} protege TRUNCATE con cascada')
        psql('-c', 'UPDATE public.registro_plantacion_grupo_revision SET revision_grupo=1 WHERE grupo_registro_id=1000')
        check(psql('-c', 'SELECT revision_grupo FROM public.registro_plantacion_grupo_revision WHERE grupo_registro_id=1000') == '1',
              'Versión de grupo estable avanza una unidad para futuros escritores cooperativos')
        fail('UPDATE public.registro_plantacion_grupo_revision SET revision_grupo=3 WHERE grupo_registro_id=1000', ['23514'],
             'Versión de grupo no salta ni se reinicia')
        fail('DELETE FROM public.registro_plantacion_grupo_revision', ['23514'],
             'Revisión de grupo no se borra para reutilizar versión')
        psql('-f', str(MIGRATION))
        check(psql('-c', 'SELECT revision_grupo FROM public.registro_plantacion_grupo_revision WHERE grupo_registro_id=1000') == '1',
              'Reaplicar con materialización preserva revisiones existentes')
        psql('-c', 'ALTER TABLE public.registro_plantacion_grupo_revision ALTER COLUMN revision_grupo DROP NOT NULL')
        psql('-f', str(MIGRATION), expected_error=['P0001'], expected_marker='PA_INT07_ESTRUCTURA_INCOMPATIBLE')
        checks.append('Drift de nulabilidad se rechaza sin reparación silenciosa')
        psql('-c', 'ALTER TABLE public.registro_plantacion_grupo_revision ALTER COLUMN revision_grupo SET NOT NULL')
        psql('-c', 'ALTER FUNCTION public.pa_int07_compensacion_validar() RENAME TO pa_int07_compensacion_alterada')
        psql('-f', str(MIGRATION), expected_error=['P0001'], expected_marker='PA_INT07_HELPER_')
        checks.append('Helper ausente en reinstalación no se recrea silenciosamente')
        psql('-c', 'ALTER FUNCTION public.pa_int07_compensacion_alterada() RENAME TO pa_int07_compensacion_validar')
        psql('-c', 'ALTER INDEX public.pa_int07_credito_asignacion_idx RENAME TO pa_int07_credito_asignacion_alterado')
        psql('-f', str(MIGRATION), expected_error=['P0001'], expected_marker='PA_INT07_INDICE_')
        checks.append('Índice ausente en reinstalación se detecta como drift')
        psql('-c', 'ALTER INDEX public.pa_int07_credito_asignacion_alterado RENAME TO pa_int07_credito_asignacion_idx')
        psql('-c', 'CREATE POLICY pa_int07_exposicion_adversaria ON public.registro_plantacion_efectivo FOR SELECT TO PUBLIC USING(true)')
        psql('-f', str(MIGRATION), expected_error=['P0001'], expected_marker='PA_INT07_POLITICA_')
        checks.append('Política pública preexistente no se acepta ni se borra silenciosamente')
        psql('-c', 'DROP POLICY pa_int07_exposicion_adversaria ON public.registro_plantacion_efectivo')
        psql('-c', 'CREATE ROLE pa_int07_escritor_adversario; GRANT UPDATE ON public.registro_plantacion_efectivo TO pa_int07_escritor_adversario; GRANT pa_int07_escritor_adversario TO anon')
        psql('-f', str(MIGRATION), expected_error=['P0001'], expected_marker='PA_INT07_PRIVILEGIO_')
        checks.append('DML heredado por anon se detecta sin modificar membresía ajena')
        psql('-c', 'REVOKE pa_int07_escritor_adversario FROM anon; REVOKE UPDATE ON public.registro_plantacion_efectivo FROM pa_int07_escritor_adversario; DROP ROLE pa_int07_escritor_adversario')
        psql('-f', str(MIGRATION))
        check(psql('-c', "SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'pa_int07_catalogo_%'") == '0',
              'Reruns y rechazos no dejan esquemas de cotejo huérfanos')
        check(snapshot() == before, 'Todas las pruebas estructurales conservan originales/saldos/recibos')

        result = {
            'tarea': 'PA-T-INT07-BE02_PERSISTENCIA_PARCIAL',
            'estado': 'APROBADO', 'postgresql': psql('-c', 'SHOW server_version'),
            'entorno': 'SINTETICO_AISLADO_SIN_TCP_SIN_ENV_SIN_POSTGIS',
            'comprobaciones': checks,
            'limites': [
                'Antecedentes estructurales focales024/030/031/068 y columnas074; no replay001–081.',
                'No verifica RPC075–081 ni contratos/lecturas runtime INT05; compatibilidad de esos lectores solo cotejada estáticamente.',
                'Sin comandos, recibos ni efectos de corrección ejecutables; motor/HTTP y grant DML de servicio pendientes.',
                'Sin alta operativa de mortandad, PostGIS, Storage, carreras de saldo o SQL remoto.',
            ],
            'sha256': {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in [MIGRATION, FIXTURE, Path(__file__).resolve()]},
        }
        if output:
            with output.open('x', encoding='utf-8') as handle:
                handle.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'estado': 'APROBADO', 'comprobaciones': len(checks),
                          'postgresql': result['postgresql']}, ensure_ascii=False))
    finally:
        can_remove = True
        if start_attempted and (cluster / 'postmaster.pid').exists():
            stopped = subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-m',
                                      'immediate', '-w', '-t', '20', 'stop'], env=env,
                                     capture_output=True, timeout=25, check=False)
            can_remove = stopped.returncode == 0
        if can_remove:
            if directory.is_symlink() or not directory.is_dir() or cluster.parent != directory:
                raise RuntimeError('Se rechazó limpiar una ruta ajena al clúster creado.')
            shutil.rmtree(directory)
        else:
            raise RuntimeError(f'Clúster no detenido; se conserva {directory}.')


if __name__ == '__main__':
    main()
