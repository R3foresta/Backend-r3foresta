#!/usr/bin/env python3
"""Regresión del reinicio en PostgreSQL privado desechable, sin TCP ni .env."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reset_operativo', ROOT / 'scripts/qa/reset-operativo-pruebas.py')
reset_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reset_module)

FIXTURE = """
CREATE TABLE public.usuario(id bigint PRIMARY KEY,nombre text);
CREATE TABLE public.vivero(id bigint PRIMARY KEY,nombre text);
CREATE TABLE public.usuario_vivero(id bigint PRIMARY KEY,usuario_id bigint REFERENCES public.usuario);
CREATE TABLE public.tipos_entidad_evidencia(id integer PRIMARY KEY,codigo text);
CREATE TABLE public.evidencias_trazabilidad(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tipo_entidad_id integer REFERENCES public.tipos_entidad_evidencia,bucket text,ruta_archivo text);
CREATE TABLE public.recoleccion(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cantidad integer);
CREATE TABLE public.recoleccion_movimiento(id bigint PRIMARY KEY,recoleccion_id bigint REFERENCES public.recoleccion);
CREATE TABLE public.lote_vivero(id bigint PRIMARY KEY,recoleccion_id bigint REFERENCES public.recoleccion);
CREATE TABLE public.evento_lote_vivero(id bigint PRIMARY KEY,lote_id bigint REFERENCES public.lote_vivero);
CREATE TABLE public.recoleccion_recepcion_evidencia_contexto(evidencia_id bigint PRIMARY KEY REFERENCES public.evidencias_trazabilidad,
 recoleccion_id bigint REFERENCES public.recoleccion);
CREATE TABLE public.campania(id bigint PRIMARY KEY);
CREATE TABLE public.subcampania(id bigint PRIMARY KEY,campania_id bigint REFERENCES public.campania);
CREATE TABLE public.subcampania_permiso(id bigint PRIMARY KEY,subcampania_id bigint REFERENCES public.subcampania);
CREATE TABLE public.registro_plantacion(id bigint PRIMARY KEY,subcampania_id bigint REFERENCES public.subcampania);
CREATE TABLE public.participacion_comando(id bigint PRIMARY KEY,registro_plantacion_id bigint REFERENCES public.registro_plantacion);
CREATE TABLE public.usuario_autoridad_historial(id bigint PRIMARY KEY,comando_id bigint REFERENCES public.participacion_comando);
CREATE TABLE public.participacion_carga(id bigint PRIMARY KEY,comando_interno_id bigint REFERENCES public.participacion_comando,
 evidencia_id bigint REFERENCES public.evidencias_trazabilidad,bucket text,ruta_original text,ruta_derivada text);
CREATE TABLE public.participacion_carga_generacion(id bigint PRIMARY KEY,carga_interna_id bigint REFERENCES public.participacion_carga,
 bucket text,ruta_original text,ruta_derivada text);
CREATE TABLE public.plantacion_foto(id bigint PRIMARY KEY,url text);
INSERT INTO public.usuario VALUES(1,'Cuenta sintética');
INSERT INTO public.vivero VALUES(1,'Vivero sintético');
INSERT INTO public.usuario_vivero VALUES(1,1);
INSERT INTO public.tipos_entidad_evidencia VALUES(1,'RECOLECCION'),(2,'PLANTA'),(3,'REGISTRO_PLANTACION');
INSERT INTO public.evidencias_trazabilidad(tipo_entidad_id,bucket,ruta_archivo)
 VALUES(1,'recoleccion_fotos','origen.jpg'),(2,'plantas','especie.jpg'),(3,'participacion_evidencias','registro.jpg');
INSERT INTO public.recoleccion(cantidad) VALUES(100);
INSERT INTO public.recoleccion_movimiento VALUES(1,1);
INSERT INTO public.lote_vivero VALUES(1,1);
INSERT INTO public.evento_lote_vivero VALUES(1,1);
INSERT INTO public.recoleccion_recepcion_evidencia_contexto VALUES(1,1);
INSERT INTO public.campania VALUES(1);
INSERT INTO public.subcampania VALUES(1,1);
INSERT INTO public.subcampania_permiso VALUES(1,1);
INSERT INTO public.registro_plantacion VALUES(1,1);
INSERT INTO public.participacion_comando VALUES(1,1);
INSERT INTO public.usuario_autoridad_historial VALUES(1,1);
INSERT INTO public.participacion_carga VALUES(1,1,3,'participacion_evidencias','original.jpg','publica.jpg');
INSERT INTO public.participacion_carga_generacion VALUES(1,1,'participacion_evidencias','vieja.jpg','vieja-publica.jpg');
INSERT INTO public.plantacion_foto VALUES(1,'https://ejemplo.invalid/foto.jpg?token=secreto-sintetico');
CREATE FUNCTION public.inmutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INMUTABLE'; END $$;
CREATE TRIGGER conservar BEFORE TRUNCATE ON public.recoleccion FOR EACH STATEMENT EXECUTE FUNCTION public.inmutable();
ALTER TABLE public.recoleccion ENABLE ALWAYS TRIGGER conservar;
CREATE TRIGGER conservar BEFORE TRUNCATE ON public.participacion_comando FOR EACH STATEMENT EXECUTE FUNCTION public.inmutable();
ALTER TABLE public.participacion_comando ENABLE REPLICA TRIGGER conservar;
"""


class ResetTests(unittest.TestCase):
    def sql(self, statement):
        result = subprocess.run([self.psql, '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                                input=statement, text=True, capture_output=True, timeout=30)
        if result.returncode:
            self.fail(result.stderr)
        return result.stdout.strip()

    def setUp(self):
        self.sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n' + FIXTURE)

    def plan(self):
        return reset_module.reset(self.psql)

    def test_plan_is_read_only_and_inventories_shared_dependencies(self):
        plan = self.plan()
        counts = {row['tabla']: row['filas'] for row in plan['plan']['tablas']}
        self.assertEqual(counts['usuario_autoridad_historial'], 1)
        self.assertEqual(counts['subcampania_permiso'], 1)
        self.assertNotIn('usuario', counts)
        self.assertNotIn('usuario_vivero', counts)
        objects = plan['plan']['objetos_storage']
        self.assertIn({'bucket': 'participacion_evidencias', 'ruta': 'vieja-publica.jpg'}, objects)
        self.assertNotIn({'bucket': 'plantas', 'ruta': 'especie.jpg'}, objects)
        self.assertEqual(plan['plan']['urls_fotos_legadas'], ['https://ejemplo.invalid/foto.jpg'])
        self.assertTrue(plan['plan']['alcance_dependiente']['borra_historial_de_roles_y_bajas'])
        self.assertNotIn('secreto-sintetico', json.dumps(plan))
        self.assertEqual(self.sql('SELECT count(*) FROM public.recoleccion'), '1')
        self.assertEqual(self.plan()['huella'], plan['huella'])

    def test_execute_preserves_accounts_catalogues_permissions_and_identity(self):
        result = reset_module.reset(self.psql, self.plan()['huella'])
        self.assertEqual(result['estado'], 'REINICIO_CONFIRMADO')
        self.assertEqual(self.sql('SELECT count(*) FROM public.recoleccion'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM public.registro_plantacion'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM public.participacion_comando'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM public.usuario_autoridad_historial'), '0')
        self.assertEqual(self.sql('SELECT count(*) FROM public.usuario_vivero'), '1')
        self.assertEqual(self.sql('SELECT count(*) FROM public.usuario'), '1')
        self.assertEqual(self.sql('SELECT count(*) FROM public.tipos_entidad_evidencia'), '3')
        self.assertEqual(self.sql('SELECT ruta_archivo FROM public.evidencias_trazabilidad'), 'especie.jpg')
        self.assertEqual(self.sql("SELECT tgenabled FROM pg_trigger WHERE tgname='conservar' AND tgrelid='public.recoleccion'::regclass"), 'A')
        self.assertEqual(self.sql("SELECT tgenabled FROM pg_trigger WHERE tgname='conservar' AND tgrelid='public.participacion_comando'::regclass"), 'R')
        self.assertEqual(self.sql('INSERT INTO public.recoleccion(cantidad) VALUES(90) RETURNING id'), '2')

    def test_stale_or_invalid_plan_does_not_delete_data(self):
        plan = self.plan()
        self.sql('INSERT INTO public.recoleccion(cantidad) VALUES(90)')
        with self.assertRaises(ValueError):
            reset_module.reset(self.psql, plan['huella'])
        with self.assertRaises(ValueError):
            reset_module.reset(self.psql, 'invalido')
        self.assertEqual(self.sql('SELECT count(*) FROM public.recoleccion'), '2')

    def test_fingerprint_covers_inventory_and_not_values_inside_rows(self):
        plan = self.plan()
        self.sql('UPDATE public.recoleccion SET cantidad=90')
        self.assertEqual(self.plan()['huella'], plan['huella'])
        reset_module.reset(self.psql, plan['huella'])
        self.assertEqual(self.sql('SELECT count(*) FROM public.recoleccion'), '0')

    def test_unknown_fk_is_reported_and_blocks_execution(self):
        self.sql('CREATE TABLE public.fuera_de_alcance(id bigint PRIMARY KEY,recoleccion_id bigint REFERENCES public.recoleccion)')
        plan = self.plan()
        self.assertTrue(plan['plan']['dependencias_externas'])
        with self.assertRaises(ValueError):
            reset_module.reset(self.psql, plan['huella'])
        self.assertEqual(self.sql('SELECT count(*) FROM public.recoleccion'), '1')

    def test_unknown_reference_to_shared_evidence_blocks_cascading_delete(self):
        self.sql('CREATE TABLE public.fuera_de_alcance(id bigint PRIMARY KEY,evidencia_id bigint REFERENCES public.evidencias_trazabilidad ON DELETE CASCADE); INSERT INTO public.fuera_de_alcance VALUES(1,1)')
        plan = self.plan()
        with self.assertRaises(ValueError):
            reset_module.reset(self.psql, plan['huella'])
        self.assertEqual(self.sql('SELECT count(*) FROM public.fuera_de_alcance'), '1')

    def test_failure_after_truncate_rolls_back_data_and_trigger_modes(self):
        self.sql('CREATE TRIGGER conservar_evidencia BEFORE DELETE ON public.evidencias_trazabilidad FOR EACH STATEMENT EXECUTE FUNCTION public.inmutable()')
        with self.assertRaises(RuntimeError):
            reset_module.reset(self.psql, self.plan()['huella'])
        self.assertEqual(self.sql('SELECT count(*) FROM public.recoleccion'), '1')
        self.assertEqual(self.sql('SELECT count(*) FROM public.evidencias_trazabilidad'), '3')
        self.assertEqual(self.sql("SELECT tgenabled FROM pg_trigger WHERE tgname='conservar' AND tgrelid='public.recoleccion'::regclass"), 'A')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    args, remaining = parser.parse_known_args()
    binaries = {name: str(args.pg_bin / name) for name in ('initdb', 'pg_ctl', 'psql')}
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    directory = Path(tempfile.mkdtemp(prefix='r3-reset-test-', dir='/private/tmp'))
    cluster, socket = directory / 'pg', directory / 'socket'
    socket.mkdir(mode=0o700)
    env.update(LC_ALL='C', PGHOST=str(socket), PGPORT='55449', PGUSER='postgres',
               PGDATABASE='postgres', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull)
    started = False
    try:
        for command in (
            [binaries['initdb'], '-D', str(cluster), '-U', 'postgres', '--auth-local=trust', '--auth-host=reject', '--locale=en_US.UTF-8'],
            [binaries['pg_ctl'], '-D', str(cluster), '-l', str(directory / 'pg.log'), '-w', 'start',
             '-o', f"-c listen_addresses='' -c unix_socket_directories='{socket}' -c port=55449 -c unix_socket_permissions=0700"],
        ):
            subprocess.run(command, env=env, capture_output=True, text=True, check=True, timeout=30)
        started = True
        for name in list(os.environ):
            if name.startswith('PG'):
                del os.environ[name]
        os.environ.update(env)
        ResetTests.psql = binaries['psql']
        result = unittest.main(argv=[__file__, *remaining], exit=False)
        return 0 if result.result.wasSuccessful() else 1
    finally:
        if started or (cluster / 'postmaster.pid').exists():
            subprocess.run([binaries['pg_ctl'], '-D', str(cluster), '-w', 'stop', '-m', 'fast'],
                           env=env, capture_output=True, check=True, timeout=30)
        if not (cluster / 'postmaster.pid').exists():
            shutil.rmtree(directory)


if __name__ == '__main__':
    sys.exit(main())
