#!/usr/bin/env python3
"""Planifica y reinicia exclusivamente datos operativos de prueba de M1/M2/M3.

Usa psql y su configuración PG* habitual, sin cargar .env. Por omisión sólo
consulta. --execute exige la huella del destino, estructura, conteos y objetos.
La huella no identifica el contenido de cada fila operativa.
Storage queda inventariado para borrado por su API, fuera de la transacción SQL.
Incluye campañas y permisos por subcampaña, comandos de participación e historial
de autoridad que dependen de ellos. Conserva cuentas, accesos M1/M2 y catálogos.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys


TABLES = (
    'recoleccion', 'recoleccion_historial', 'recoleccion_movimiento',
    'recoleccion_recepcion', 'recoleccion_recepcion_comando',
    'recoleccion_recepcion_observacion', 'recoleccion_recepcion_evidencia_contexto',
    'recoleccion_recepcion_evidencia', 'recoleccion_conciliacion_comando',
    'recoleccion_conciliacion_evento', 'recoleccion_conciliacion_evidencia_contexto',
    'recoleccion_conciliacion_evidencia', 'lote_vivero', 'evento_lote_vivero',
    'm2_evidencia_contexto', 'asignacion_vivero_subcampania', 'campania',
    'campania_organizacion', 'subcampania', 'subcampania_equipo',
    'subcampania_historial', 'subcampania_meta_especie', 'subcampania_permiso',
    'subcampania_permiso_revision', 'participacion_comando',
    'usuario_autoridad_historial', 'participacion_carga',
    'participacion_carga_generacion', 'registro_plantacion',
    'registro_plantacion_detalle', 'registro_plantacion_coresponsable',
    'evento_plantacion', 'registro_plantacion_grupo_revision',
    'registro_plantacion_correccion', 'registro_plantacion_efectivo',
    'evento_plantacion_efectivo', 'registro_plantacion_participante_efectivo',
    'registro_plantacion_consumo_credito', 'registro_plantacion_consumo_compensacion',
    'plantacion', 'plantacion_usuario', 'plantacion_riego', 'plantacion_abono',
    'plantacion_foto', 'plantacion_monitoreo',
)
REQUIRED = {'recoleccion', 'recoleccion_movimiento', 'lote_vivero',
            'evento_lote_vivero', 'evidencias_trazabilidad', 'tipos_entidad_evidencia'}
EVIDENCE_TYPES = (
    'RECOLECCION', 'RECOLECCION_RECEPCION', 'RECOLECCION_CONCILIACION',
    'LOTE_VIVERO', 'EVENTO_LOTE_VIVERO', 'REGISTRO_PLANTACION',
    'EVENTO_PLANTACION', 'PLANTACION',
)


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def relation(name):
    return 'public.' + identifier(name)


def run_sql(psql, sql):
    result = subprocess.run(
        [psql, '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=sql, text=True, capture_output=True, timeout=120,
    )
    if result.returncode:
        # psql puede incluir parámetros privados en errores de conexión.
        raise RuntimeError('Falló psql. Revisa conexión, permisos y dependencias; no se confirmó el reinicio.')
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def evidence_filter():
    codes = ','.join(map(literal, EVIDENCE_TYPES))
    return f"tipo_entidad_id IN (SELECT id FROM public.tipos_entidad_evidencia WHERE upper(codigo) IN ({codes}))"


def catalogue_query():
    names = ','.join(map(literal, (*TABLES, 'evidencias_trazabilidad', 'tipos_entidad_evidencia')))
    return f"""
SELECT jsonb_build_object(
  'tablas',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',c.relname,
    'tipo',c.relkind,'propietario',pg_get_userbyid(c.relowner)) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ({names})),'[]'::jsonb),
  'columnas',coalesce((SELECT jsonb_object_agg(tabla,campos) FROM (
    SELECT table_name tabla,jsonb_agg(column_name ORDER BY ordinal_position) campos
    FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ({names}) GROUP BY table_name) x),'{{}}'::jsonb));
"""


def build_plan_query(tables, columns):
    counts = ' UNION ALL '.join(
        f"SELECT {literal(name)} tabla,count(*) filas FROM {relation(name)}"
        for name in tables
    )
    names = ','.join(map(literal, tables))
    objects = [f"SELECT bucket,ruta_archivo ruta FROM public.evidencias_trazabilidad WHERE {evidence_filter()}"]
    for name in ('participacion_carga', 'participacion_carga_generacion'):
        if name in tables:
            needed = {'bucket', 'ruta_original', 'ruta_derivada'}
            if not needed.issubset(columns[name]):
                raise ValueError(f'Catálogo incompatible en {name}.')
            objects.extend(f'SELECT bucket,{field} ruta FROM {relation(name)}'
                           for field in ('ruta_original', 'ruta_derivada'))
    object_sql = ' UNION '.join(objects)
    legacy = "SELECT '[]'::jsonb"
    if 'plantacion_foto' in tables:
        if 'url' not in columns['plantacion_foto']:
            raise ValueError('Catálogo incompatible en plantacion_foto.')
        legacy = "SELECT coalesce(jsonb_agg(split_part(split_part(url,'?',1),'#',1) ORDER BY id),'[]'::jsonb) FROM public.plantacion_foto"
    return f"""
WITH seleccion AS (
 SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ({names})
), conteos AS ({counts}), objetos AS ({object_sql}), plan AS (
 SELECT jsonb_build_object(
  'destino',jsonb_build_object('base',current_database(),'usuario',current_user,
    'direccion',inet_server_addr()::text,'puerto',current_setting('port'),
    'servidor_arrancado',pg_postmaster_start_time(),'version',current_setting('server_version')),
  'alcance_dependiente',jsonb_build_object(
    'borra_historial_de_roles_y_bajas',{'true' if 'usuario_autoridad_historial' in tables else 'false'},
    'borra_comandos_de_participacion',{'true' if 'participacion_comando' in tables else 'false'},
    'borra_campanias_y_permisos_por_subcampania',{'true' if 'campania' in tables else 'false'}),
  'tablas',(SELECT jsonb_agg(jsonb_build_object('tabla',tabla,'filas',filas) ORDER BY tabla) FROM conteos),
  'catalogo',(SELECT jsonb_agg(jsonb_build_object('tabla',s.relname,'columnas',(
    SELECT jsonb_agg(jsonb_build_array(a.attname,a.atttypid,a.attnotnull) ORDER BY a.attnum)
    FROM pg_attribute a WHERE a.attrelid=s.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY s.relname) FROM seleccion s),
  'dependencias_externas',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',f.conrelid::regclass::text,
    'restriccion',f.conname,'referencia',f.confrelid::regclass::text) ORDER BY f.conrelid::regclass::text,f.conname)
    FROM pg_constraint f WHERE f.contype='f'
      AND (f.confrelid IN(SELECT oid FROM seleccion) OR f.confrelid='public.evidencias_trazabilidad'::regclass)
      AND f.conrelid NOT IN(SELECT oid FROM seleccion)),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('tabla',s.relname,'nombre',t.tgname,
    'modo',t.tgenabled,'funcion',t.tgfoid::regprocedure::text) ORDER BY s.relname,t.tgname)
    FROM pg_trigger t JOIN seleccion s ON s.oid=t.tgrelid
    WHERE NOT t.tgisinternal AND (t.tgtype & 32)<>0),'[]'::jsonb),
  'evidencias',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id::text,'bucket',bucket,'ruta',ruta_archivo) ORDER BY id),'[]'::jsonb)
    FROM public.evidencias_trazabilidad WHERE {evidence_filter()}),
  'objetos_storage',coalesce((SELECT jsonb_agg(jsonb_build_object('bucket',bucket,'ruta',ruta) ORDER BY bucket,ruta)
    FROM objetos WHERE bucket IS NOT NULL AND ruta IS NOT NULL),'[]'::jsonb),
  'urls_fotos_legadas',({legacy})
 ) datos
) SELECT jsonb_build_object('huella',md5(datos::text),'plan',datos) FROM plan
"""


def reset(psql, expected=None):
    catalogue = run_sql(psql, 'BEGIN READ ONLY;\n' + catalogue_query() + '\nCOMMIT;')[0]
    found = {row['nombre']: row for row in catalogue['tablas']}
    if not REQUIRED.issubset(found) or any(row['tipo'] != 'r' for row in found.values()):
        raise ValueError('No se reconoce el catálogo operativo esperado.')
    columns = catalogue['columnas']
    if not {'id', 'tipo_entidad_id', 'bucket', 'ruta_archivo'}.issubset(columns['evidencias_trazabilidad']):
        raise ValueError('Catálogo incompatible en evidencias_trazabilidad.')
    if not {'id', 'codigo'}.issubset(columns['tipos_entidad_evidencia']):
        raise ValueError('Catálogo incompatible en tipos_entidad_evidencia.')
    tables = sorted(set(TABLES).intersection(found))
    query = build_plan_query(tables, columns)
    plan = run_sql(psql, 'BEGIN READ ONLY;\n' + query + ';\nCOMMIT;')[0]
    if expected is None:
        return {'estado': 'PLAN', **plan}
    if not re.fullmatch('[0-9a-f]{32}', expected) or expected != plan['huella']:
        raise ValueError('La huella no coincide. Revisa un plan nuevo del destino.')
    if plan['plan']['dependencias_externas']:
        raise ValueError('Hay relaciones externas al inventario autorizado. Revisa sus dependencias antes del reinicio.')
    lock_names = ','.join(relation(name) for name in [*tables, 'evidencias_trazabilidad', 'tipos_entidad_evidencia'])
    commands = ["BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='90s';",
                f'LOCK TABLE {lock_names} IN ACCESS EXCLUSIVE MODE;',
                f"SELECT (x->>'huella'={literal(expected)})::text AS plan_coincide FROM ({query}) p(x) \\gset",
                '\\if :plan_coincide', '\\else', 'ROLLBACK;', '\\quit 3', '\\endif']
    for trigger in plan['plan']['triggers']:
        if trigger['modo'] != 'D':
            commands.append(f"ALTER TABLE {relation(trigger['tabla'])} DISABLE TRIGGER {identifier(trigger['nombre'])};")
    commands.append('TRUNCATE TABLE ' + ','.join(map(relation, tables)) + ' CONTINUE IDENTITY RESTRICT;')
    commands.append('DELETE FROM public.evidencias_trazabilidad WHERE ' + evidence_filter() + ';')
    modes = {'O': 'ENABLE', 'A': 'ENABLE ALWAYS', 'R': 'ENABLE REPLICA'}
    for trigger in plan['plan']['triggers']:
        if trigger['modo'] != 'D':
            commands.append(f"ALTER TABLE {relation(trigger['tabla'])} {modes[trigger['modo']]} TRIGGER {identifier(trigger['nombre'])};")
    commands.extend(['COMMIT;', "SELECT jsonb_build_object('estado','REINICIO_CONFIRMADO');"])
    run_sql(psql, '\n'.join(commands))
    return {'estado': 'REINICIO_CONFIRMADO', **plan,
            'storage': 'PENDIENTE_API: usar objetos_storage del plan para eliminar archivos por API oficial.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--execute', metavar='HUELLA', help='Ejecuta el plan revisado de este mismo destino.')
    args = parser.parse_args()
    psql = str(args.pg_bin / 'psql') if args.pg_bin else shutil.which('psql')
    if not psql:
        parser.error('Falta psql; usa --pg-bin.')
    try:
        print(json.dumps(reset(psql, args.execute), ensure_ascii=False, indent=2))
    except (ValueError, RuntimeError, subprocess.TimeoutExpired, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
