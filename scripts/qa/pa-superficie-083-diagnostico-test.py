#!/usr/bin/env python3
"""Verifica el diagnóstico 083 con catálogo sintético privado, sin TCP ni .env."""

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
SQL = ROOT / 'scripts/sql/pa-superficie-083-diagnostico.sql'
MIGRATION = ROOT / 'migrations/083_pa_superficie_privada_compat.sql'
TABLES = ['asignacion_vivero_subcampania', 'registro_plantacion', 'registro_plantacion_detalle',
          'registro_plantacion_coresponsable', 'evento_plantacion', 'evidencias_trazabilidad',
          'subcampania_equipo', 'subcampania', 'lote_vivero', 'evento_lote_vivero',
          'subcampania_meta_especie', 'campania', 'campania_organizacion', 'planta',
          'tipo_planta', 'division_administrativa']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, help='Directorio PostgreSQL; por defecto PATH.')
    parser.add_argument('--evidence', type=Path, help='JSON nuevo opcional; nunca sobrescribe.')
    args = parser.parse_args()
    binaries = {}
    for name in ('initdb', 'pg_ctl', 'psql'):
        path = args.pg_bin.expanduser().resolve() / name if args.pg_bin else shutil.which(name)
        if not path or not Path(path).is_file() or not os.access(path, os.X_OK):
            parser.error(f'Falta {name}; indique --pg-bin o PATH.')
        binaries[name] = str(Path(path).resolve())
    if not SQL.is_file():
        parser.error('Falta el SQL diagnóstico de 083.')
    evidence = args.evidence.expanduser().resolve() if args.evidence else None
    if evidence and (evidence.exists() or not evidence.parent.is_dir()):
        parser.error('--evidence requiere archivo nuevo y directorio existente.')
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update(LC_ALL='C', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull,
               PGAPPNAME='pa_diagnostico_083_aislado')
    directory = Path(tempfile.mkdtemp(prefix='pa-d083-', dir='/tmp')).resolve()
    cluster, socket = directory / 'postgres', directory / 'socket'
    checks, start_attempted = [], False

    def run(command, expected_sqlstate=None):
        result = subprocess.run(command, env=env, capture_output=True, text=True,
                                timeout=60, check=False)
        if expected_sqlstate is None and result.returncode:
            raise RuntimeError(result.stderr[:2500] + result.stderr[-1500:])
        if expected_sqlstate is not None:
            errors = re.findall(r'^.*ERROR:\s+([0-9A-Z]{5}):', result.stderr, re.MULTILINE)
            if not result.returncode or not errors or errors[0] != expected_sqlstate:
                raise AssertionError('Se esperaba SQLSTATE ' + expected_sqlstate + ': '
                                     + result.stderr[-2000:])
        return result.stdout.strip()

    def psql(*arguments, expected_sqlstate=None):
        return run([binaries['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                    '-v', 'VERBOSITY=verbose', '-h', str(socket), '-p', '55440',
                    '-U', 'postgres', '-d', 'postgres', *arguments], expected_sqlstate)

    def check(condition, description):
        if not condition:
            raise AssertionError(description)
        checks.append(description)

    def has(rows, **fields):
        return any(all(row.get(key) == value for key, value in fields.items()) for row in rows)

    def diagnostic():
        raw = psql('-f', str(SQL))
        return json.loads(raw), raw

    def anon_read():
        # -c separados evitan que clientes anteriores solo devuelvan el último
        # resultado de un bloque multisentencia. La conexión termina al leer.
        return psql('-c', 'SET ROLE anon', '-c', 'SELECT id FROM public.v_ubicacion_enriquecida').splitlines()

    def marker():
        # Solo fixture sintético: no se imprime ni se guarda este estado en evidencia.
        return psql('-c', '''SELECT jsonb_build_object(
 'filas',(SELECT jsonb_agg(to_jsonb(r)) FROM public.registro_plantacion r),
 'relaciones',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'tipo',c.relkind,
   'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'opciones',c.reloptions) ORDER BY c.oid)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','pa_d083_extra')),
 'columnas',(SELECT jsonb_agg(jsonb_build_object('rel',a.attrelid,'num',a.attnum,
   'acl',a.attacl::text) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','pa_d083_extra') AND a.attnum>0),
 'funciones',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'acl',p.proacl::text,
   'hash',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind IN('f','p')),
 'reglas',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'hash',md5(pg_get_ruledef(r.oid))) ORDER BY r.oid)
   FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public'),
 'membresias',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.member,m.roleid) FROM pg_auth_members m),
 'secuencia',(SELECT last_value FROM public.pa_d083_secuencia))''')

    try:
        socket.mkdir(mode=0o700)
        run([binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust',
             '--auth-host=reject', '--locale=C', '--encoding=UTF8'])
        start_attempted = True
        run([binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'postgres.log'),
             '-w', '-t', '20', 'start', '-o', "-c listen_addresses='' -c unix_socket_directories='"
             + str(socket) + "' -c unix_socket_permissions=0700 -c port=55440 -c shared_buffers=16MB"])
        version = psql('-c', 'SHOW server_version')
        major = int(psql('-c', 'SHOW server_version_num')) // 10000
        code = SQL.read_text()
        stripped = re.sub(r'--[^\n]*', '', code)
        check(re.search(r'\bRAISE\b', stripped, re.IGNORECASE) is None, 'Diagnóstico no contiene RAISE')
        check(psql('-c', 'SHOW listen_addresses') == '', 'Clúster privado sin TCP')
        empty, _ = diagnostic()
        check(empty['entorno']['solo_lectura'] == 'on', 'READ ONLY real')
        check(empty['entorno']['aislamiento'] == 'repeatable read', 'REPEATABLE READ real')
        check(any(row['codigo'] == 'PA_SUPERFICIE_COMPAT_ROLES_REQUERIDOS'
                  for row in empty['bloqueos_preflight']), 'Roles ausentes se reportan sin abortar')
        check(sum(row['codigo'] == 'PA_D_RELACION_REQUERIDA' for row in empty['bloqueos_preflight']) == 16,
              'Dieciséis objetos obligatorios ausentes se reportan juntos')
        check(not any(row['objeto'] in ('tipo_planta', 'comunidad', 'v_lote_vivero_saldos')
                      for row in empty['bloqueos_preflight']), 'Tres objetos opcionales ausentes no bloquean')
        check(empty['v_ubicacion_enriquecida']['existe'] is False, 'Vista focal ausente se reporta sin error')

        fixture = '''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE ROLE pa_d083_grupo1; CREATE ROLE pa_d083_grupo2;
GRANT pa_d083_grupo2 TO pa_d083_grupo1; GRANT pa_d083_grupo1 TO anon;
'''
        fixture += '\n'.join('CREATE TABLE public.' + name + '(id bigint);' for name in TABLES)
        fixture += '''
ALTER TABLE public.registro_plantacion ADD COLUMN privado text DEFAULT 'SENTINELA_DEFAULT_D083';
INSERT INTO public.registro_plantacion(id,privado) VALUES(1,'SENTINELA_FILA_D083');
CREATE SEQUENCE public.pa_d083_secuencia;
ALTER TABLE public.division_administrativa ADD COLUMN nombre text, ADD COLUMN tipo_id bigint;
CREATE TABLE public.ubicacion(id bigint,nombre text,pais_id bigint,division_id bigint,lat double precision,lon double precision);
CREATE TABLE public.pais(id bigint,nombre text,codigo text);
CREATE TABLE public.division_tipo(id bigint,nombre text,orden integer);
INSERT INTO public.pais VALUES(10,'SENTINELA_PAIS_D083','ZZ');
INSERT INTO public.division_tipo VALUES(30,'SENTINELA_TIPO_D083',4);
INSERT INTO public.division_administrativa VALUES(20,'SENTINELA_DIVISION_D083',30);
INSERT INTO public.ubicacion VALUES(1,'SENTINELA_UBICACION_D083',10,20,0,0);
CREATE VIEW public.campania_estado AS SELECT id FROM public.campania;
CREATE VIEW public.v_lote_vivero_saldos AS SELECT id FROM public.lote_vivero;
CREATE VIEW public.v_ubicacion_enriquecida WITH(security_barrier=true) AS
 SELECT u.id,u.nombre AS ubicacion,u.lat AS latitud,u.lon AS longitud,
 p.id AS pais_id,p.nombre AS pais,p.codigo AS pais_codigo,
 da.id AS division_id,da.nombre AS division,dt.id AS division_tipo_id,
 dt.nombre AS division_tipo,dt.orden AS division_orden,u.pais_id AS ubicacion_pais_id
 FROM public.ubicacion u LEFT JOIN public.pais p ON p.id=u.pais_id
 LEFT JOIN public.division_administrativa da ON da.id=u.division_id
 LEFT JOIN public.division_tipo dt ON dt.id=da.tipo_id;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON public.registro_plantacion,public.campania,public.campania_organizacion,
 public.planta,public.division_administrativa,public.subcampania_meta_especie TO anon,authenticated;
GRANT SELECT ON public.v_ubicacion_enriquecida TO anon;
GRANT UPDATE(id) ON public.campania_organizacion TO authenticated;
CREATE VIEW public.pa_d083_readonly AS SELECT id FROM public.planta;
GRANT SELECT ON public.pa_d083_readonly TO anon;
'''
        psql('-c', fixture)
        before = marker()
        check(anon_read() == ['1'],
              'Lectura real como anon de la proyección focal antes del diagnóstico')
        baseline, raw = diagnostic()
        check(baseline['bloqueos_preflight'] == [], 'Grants directos del inventario son revocaciones previstas, sin falso bloqueo')
        check(baseline['riesgos_postflight_herencia'] == [], 'Herencia sin grants adicionales no produce riesgo artificial')
        check(has(baseline['revocaciones_previstas'], objeto='registro_plantacion', rol='anon', privilegio='SELECT'),
              'Reporta cierre previsto de SELECT privado')
        check(not has(baseline['revocaciones_previstas'], objeto='planta', rol='anon', privilegio='SELECT'),
              'Conserva SELECT readonly en la clasificación de revocaciones')
        check(has(baseline['revocaciones_previstas'], objeto='campania_organizacion', rol='authenticated', privilegio='UPDATE', nivel='COLUMNA'),
              'Atribuye grant explícito por columna')
        if major >= 17:
            check(has(baseline['revocaciones_previstas'], objeto='planta', rol='anon', privilegio='MAINTAIN'),
                  'PG17 clasifica MAINTAIN readonly como revocación prevista')
        else:
            check(not any(row['privilegio'] == 'MAINTAIN' for row in baseline['revocaciones_previstas']),
                  'PG14 funciona sin privilegio MAINTAIN inexistente')
        view = baseline['v_ubicacion_enriquecida']
        check(view['existe'] and len(view['columnas']) == 13, 'Vista focal publica trece columnas y sus tipos')
        check('public.ubicacion' in view['definicion_sql'] or 'ubicacion u' in view['definicion_sql'],
              'Vista focal incluye definición SQL completa solicitada')
        check(any('division_administrativa' in json.dumps(row) for row in view['dependencias_transitivas']),
              'Vista focal incluye dependencias por esquema y relación')
        check('security_barrier=true' in view['reloptions'], 'Vista focal conserva reloptions')
        check(isinstance(view['updatable_sin_triggers'], int) and isinstance(view['updatable_con_triggers'], int),
              'Capacidad de actualización se reporta como ambos bitmasks reales')
        check(view['information_schema']['is_updatable'] in ('YES', 'NO')
              and view['information_schema']['is_insertable_into'] in ('YES', 'NO'),
              'Flags information_schema de la vista focal son strings YES/NO reales')
        check(not has(baseline['bloqueos_preflight'], objeto='v_ubicacion_enriquecida'),
              'SELECT legítimo de vista derivada solo de readonly no bloquea')
        check(marker() == before and baseline == diagnostic()[0], 'Diagnóstico repetible sin mutación de filas, ACL, funciones o membresías')
        check(anon_read() == ['1'],
              'Lectura real como anon permanece después del diagnóstico')
        check('SENTINELA_' not in raw,
              'No imprime filas ni defaults de negocio sintéticos')

        psql('-c', '''
GRANT UPDATE ON public.campania TO pa_d083_grupo2;
REVOKE INSERT ON public.evento_plantacion FROM service_role;
REVOKE ALL ON public.tipo_planta FROM PUBLIC,postgres,service_role;
CREATE SCHEMA pa_d083_extra;
CREATE VIEW pa_d083_extra.primera AS SELECT id FROM public.registro_plantacion;
CREATE VIEW pa_d083_extra.segunda AS SELECT id FROM pa_d083_extra.primera;
GRANT SELECT ON pa_d083_extra.segunda TO anon;
CREATE VIEW public.pa_d083_mixta AS SELECT id FROM public.division_administrativa UNION ALL SELECT id FROM public.registro_plantacion;
GRANT SELECT ON public.pa_d083_mixta TO authenticated;
GRANT UPDATE(id) ON public.v_ubicacion_enriquecida TO authenticated;
CREATE FUNCTION public.pa_d083_plan() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.subcampania_meta_especie $$;
CREATE FUNCTION public.pa_d083_saldo() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.v_lote_vivero_saldos $$;
CREATE FUNCTION public.pa_d083_body() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN PERFORM 'SENTINELA_BODY_D083'; RETURN (SELECT count(*) FROM public.registro_plantacion); END $$;
CREATE FUNCTION public.fn_generar_codigo_campania(p_anio integer) RETURNS text LANGUAGE sql SECURITY DEFINER AS $$ SELECT 'SENTINELA_CODIGO_D083-'||p_anio::text $$;
CREATE FUNCTION public.fn_generar_codigo_subcampania(p_id integer) RETURNS text LANGUAGE sql AS $$ SELECT 'SENTINELA_CODIGO_INVOCADOR_D083-'||p_id::text $$;
CREATE FUNCTION public.pa_d083_vacio() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.subcampania_meta_especie $$;
REVOKE ALL ON FUNCTION public.pa_d083_vacio() FROM PUBLIC,postgres;
CREATE FUNCTION public.pa_d083_trg() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM 'SENTINELA_TRIGGER_D083'; RETURN NEW; END $$;
CREATE TRIGGER pa_d083_instead INSTEAD OF INSERT ON public.v_ubicacion_enriquecida FOR EACH ROW EXECUTE FUNCTION public.pa_d083_trg();
CREATE RULE pa_d083_noescribir AS ON UPDATE TO public.v_ubicacion_enriquecida DO INSTEAD NOTHING;
''')
        before = marker()
        detailed, raw = diagnostic()
        blockers = detailed['bloqueos_preflight']
        check(has(blockers, codigo='PA_D_VISTA_PUBLICA_NO_AUTORIZADA', objeto='v_ubicacion_enriquecida', rol='authenticated', privilegio='UPDATE'),
              'Detecta UPDATE por columna de vista focal sin confundirlo con SELECT legítimo')
        check(has(blockers, codigo='PA_D_VISTA_PUBLICA_NO_AUTORIZADA', esquema='pa_d083_extra', objeto='segunda', privilegio='SELECT'),
              'Descubre SELECT privado transitivo en otro esquema')
        check(has(blockers, codigo='PA_D_VISTA_PUBLICA_NO_AUTORIZADA', objeto='pa_d083_mixta', privilegio='SELECT'),
              'Ancestro privado prevalece en vista con raíces mixtas')
        check(any(row.get('nombre') == 'pa_d083_mixta' and row.get('ancestro_privado') is True
                  for row in detailed['vistas_dependientes']), 'Expone bool de ancestro privado de vista mixta')
        check(has(blockers, codigo='PA_D_SERVICE_SIN_PRIVILEGIO', objeto='evento_plantacion', privilegio='INSERT'),
              'Reporta privilegio servicio faltante junto con todos los otros bloqueos')
        check(sum(row['objeto'] == 'tipo_planta' for row in blockers) == 3,
              'ACL explícita vacía no falla y muestra tres requisitos servicio faltantes')
        check(has(detailed['riesgos_postflight_herencia'], objeto='campania', rol='anon', privilegio='UPDATE'),
              'Herencia de otro grantee queda separada del preflight')
        for name in ('pa_d083_plan', 'pa_d083_saldo', 'pa_d083_body', 'fn_generar_codigo_campania'):
            check(any(row['codigo'] == 'PA_D_DEFINER_PUBLICO_NO_AUTORIZADO'
                      and row['objeto'].startswith(name + '(') for row in blockers),
                  'Detecta EXECUTE PUBLIC por defecto de ' + name)
        check(not any(row['objeto'].startswith('pa_d083_vacio(') for row in blockers),
              'ACL de función vacía no hereda EXECUTE PUBLIC por defecto')
        check(all(len(row['definicion_md5']) == 32 for row in detailed['funciones_definer_y_codigos']),
              'Definers y códigos solo exponen fingerprints de definiciones')
        check('SENTINELA_' not in raw,
              'No imprime cuerpos de funciones, triggers, defaults ni filas')
        view = detailed['v_ubicacion_enriquecida']
        check(len(view['reglas_no_return']) == 1 and len(view['triggers_no_internos']) == 1,
              'Inventaría reglas no RETURN y triggers no internos de la vista focal')
        check(marker() == before, 'Todos los bloqueos se diagnostican sin mutación')

        psql('-c', 'DROP VIEW public.campania_estado; CREATE TABLE public.campania_estado(id bigint)')
        typed, _ = diagnostic()
        check(has(typed['bloqueos_preflight'], codigo='PA_SUPERFICIE_COMPAT_TIPO_INCOMPATIBLE', objeto='campania_estado'),
              'Tipo incompatible se reporta junto con restantes bloqueos')
        before = marker()
        mutations = [
            'INSERT INTO public.registro_plantacion(id) VALUES(2)',
            'UPDATE public.registro_plantacion SET id=2',
            'DELETE FROM public.registro_plantacion',
            'TRUNCATE public.registro_plantacion',
            'GRANT EXECUTE ON FUNCTION public.pa_d083_plan() TO anon',
            'GRANT USAGE ON SEQUENCE public.pa_d083_secuencia TO anon',
            "SELECT nextval('public.pa_d083_secuencia')",
        ]
        for statement in mutations:
            injected = code.rsplit('ROLLBACK;', 1)
            if len(injected) != 2:
                raise AssertionError('El diagnóstico debe terminar en ROLLBACK explícito.')
            psql('-c', injected[0] + statement + ';\nROLLBACK;' + injected[1], expected_sqlstate='25006')
        check(marker() == before, 'READ ONLY rechaza INSERT/UPDATE/DELETE/TRUNCATE, grants y nextval con SQLSTATE 25006')

        result = {
            'tarea': 'DIAGNOSTICO_SUPERFICIE_083', 'estado': 'APROBADO', 'postgresql': version,
            'entorno': 'CLUSTER_SINTETICO_PRIVADO_SIN_TCP_SIN_ENV', 'postgis_requerido': False,
            'comprobaciones': checks,
            'fuentes_sha256': {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                              for path in (SQL, MIGRATION, Path(__file__).resolve())},
            'limites': ['No acredita catálogo, aplicación SQL, permisos o datos de un destino remoto.',
                        'No ejecuta migraciones ni RPC; solo verifica el diagnóstico con fixtures sintéticos.',
                        'Solo la vista focal solicitada expone su SQL; definers, triggers y reglas usan hashes.'],
        }
        if evidence:
            with evidence.open('x', encoding='utf-8') as handle:
                handle.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'estado': 'APROBADO', 'comprobaciones': len(checks), 'postgresql': version}, ensure_ascii=False))
    finally:
        can_remove = True
        if start_attempted and (cluster / 'postmaster.pid').exists():
            stopped = subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-m', 'immediate',
                                      '-w', '-t', '20', 'stop'], env=env, capture_output=True,
                                     timeout=25, check=False)
            can_remove = stopped.returncode == 0
        if can_remove:
            if directory.is_symlink() or not directory.is_dir() or cluster.parent != directory:
                raise RuntimeError('Se rechazó borrar una ruta ajena al clúster temporal.')
            shutil.rmtree(directory)
        else:
            raise RuntimeError('No se pudo detener clúster temporal; se conserva ' + str(directory))


if __name__ == '__main__':
    main()
