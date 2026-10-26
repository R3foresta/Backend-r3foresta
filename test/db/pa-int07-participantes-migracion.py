"""Repetición085 con hechos y rechazos de drift sobre el clúster del runner."""
import argparse
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
for field in ('socket', 'port', 'database', 'psql', 'evidence'):
    parser.add_argument('--'+field, required=True)
args = parser.parse_args()
assert args.database == 'pa_int03a_ensayo'
assert Path(args.socket).resolve().parent.name.startswith('pa-int03a-')
root = Path(__file__).resolve().parents[2]
base = [args.psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', args.socket,
        '-p', args.port, '-U', 'postgres', '-d', args.database]
path = Path(args.evidence)
evidence = json.loads(path.read_text())


def sql(statement):
    result = subprocess.run(base, input=statement, capture_output=True, text=True, timeout=35)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def literal(value):
    return "'"+value.replace("'", "''")+"'"


def migration(failure=None):
    result = subprocess.run(base+['--file', str(next(root.glob('migrations/085_*.sql')))],
                            capture_output=True, text=True, timeout=40)
    if failure:
        assert result.returncode and failure in result.stderr, result.stderr
    else:
        assert result.returncode == 0, result.stderr


def snapshot():
    # Huellas, nunca motivos/textos de historia o perfiles en la evidencia.
    return json.loads(sql("""
SELECT jsonb_build_object(
 'funciones',(SELECT md5(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),
   p.proacl::text) ORDER BY p.oid::regprocedure::text)::text)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
   AND p.proname LIKE 'pa_%'),
 'checks',(SELECT md5(jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname)::text)
   FROM pg_constraint WHERE conrelid='public.participacion_comando'::regclass),
 'acl',(SELECT md5(jsonb_agg(x ORDER BY x::text)::text) FROM (
   SELECT jsonb_build_array(c.relname,c.relacl::text) x FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN('participacion_comando','registro_plantacion',
      'registro_plantacion_correccion','registro_plantacion_efectivo','registro_plantacion_participante_efectivo','registro_plantacion_correccion_id_seq')
   UNION ALL SELECT jsonb_build_array(c.relname,a.attname,a.attacl::text)
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN('registro_plantacion','registro_plantacion_correccion',
      'registro_plantacion_efectivo','registro_plantacion_participante_efectivo') AND a.attnum>0 AND NOT a.attisdropped) q),
 'comandos',(SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.participacion_comando x),
 'historia',(SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.registro_plantacion_correccion x),
 'efectivo',(SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY registro_plantacion_id)::text) FROM public.registro_plantacion_efectivo x),
 'participantes',(SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY registro_plantacion_id,usuario_id)::text) FROM public.registro_plantacion_participante_efectivo x),
 'originales',(SELECT md5(jsonb_agg(to_jsonb(x) ORDER BY id)::text) FROM public.registro_plantacion x))
"""))


def ok(label):
    evidence['casos'].append({'caso': label, 'resultado': 'CORRECTO'})
    path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
    print('OK: '+label, flush=True)


before = snapshot()
assert int(sql('SELECT count(*) FROM public.registro_plantacion_correccion')) > 0
migration()
assert snapshot() == before, 'Repetir085 alteró catálogo/terminales/historia/datos.'
ok('085 se repite después de SQL/HTTP con terminales e historia sin alterar catálogo ni datos')

signature = 'public.pa_correccion_contexto_leer(bigint,text,bigint)'
definition = sql('SELECT pg_get_functiondef('+literal(signature)+'::regprocedure)')
check = sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.participacion_comando'::regclass AND conname='participacion_comando_operacion_ck'")
cases = [
    ('cuerpo de función',
     "CREATE OR REPLACE FUNCTION public.pa_correccion_contexto_leer(p_actor_id BIGINT,p_auth_id TEXT,p_registro_plantacion_id BIGINT) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public SET lock_timeout='5s' SET statement_timeout='30s' AS $$BEGIN RETURN '{}'::jsonb; END$$;",
     definition, 'PA_INT07_PART_FUNCION_INCOMPATIBLE'),
    ('ACL de función', 'GRANT EXECUTE ON FUNCTION '+signature+' TO anon;',
     'REVOKE EXECUTE ON FUNCTION '+signature+' FROM anon;', 'PA_INT07_PART_FUNCION_PRIVILEGIO_PREEXISTENTE'),
    ('CHECK de operaciones',
     'ALTER TABLE public.participacion_comando DROP CONSTRAINT participacion_comando_operacion_ck; ALTER TABLE public.participacion_comando ADD CONSTRAINT participacion_comando_operacion_ck CHECK(operacion IS NOT NULL);',
     'ALTER TABLE public.participacion_comando DROP CONSTRAINT participacion_comando_operacion_ck; ALTER TABLE public.participacion_comando ADD CONSTRAINT participacion_comando_operacion_ck '+check+';',
     'PA_INT07_PART_CHECK_INCOMPATIBLE'),
    ('overload detectado en postflight',
     "CREATE FUNCTION public.pa_correccion_contexto_leer(TEXT) RETURNS JSONB LANGUAGE sql AS $$SELECT '{}'::jsonb$$;",
     'DROP FUNCTION public.pa_correccion_contexto_leer(TEXT);', 'PA_INT07_PART_OVERLOAD_INCOMPATIBLE'),
]
for label, mutation, restoration, expected in cases:
    sql(mutation)
    drift = snapshot()
    try:
        migration(expected)
        assert snapshot() == drift, '085 modificó parcialmente el estado tras rechazar '+label
    finally:
        sql(restoration)
    assert snapshot() == before, 'No se restauró el drift sintético de '+label
    ok('085 rechaza '+label+' y revierte íntegramente su transacción')
evidence['migracion085_repetida_con_datos'] = True
evidence['drift085_rechazados'] = len(cases)
path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
