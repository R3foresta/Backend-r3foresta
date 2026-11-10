#!/usr/bin/env python3
"""098: PostgreSQL/RLS aislado, sin TCP, .env, HTTP Storage ni servicios reales."""

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'test/db/vivero-conciliacion-storage-fixture.sql'
ORIGEN = ROOT / 'migrations/097_vivero_conciliacion_historica.sql'
BUCKET = 'r3foresta-conciliacion'
POLICY = 'r3foresta_conciliacion_solo_servicio'


def extraer_funcion(nombre):
    texto = ORIGEN.read_text()
    coincidencia = re.search(r'CREATE (?:OR REPLACE )?FUNCTION public\.' + nombre + r'\(', texto)
    if not coincidencia:
        raise AssertionError('Falta antecedente 097: ' + nombre)
    inicio = coincidencia.start()
    final = texto.index('$$;', texto.index('AS $$', inicio)) + 3
    return texto[inicio:final]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path)
    parser.add_argument('--evidence', type=Path)
    args = parser.parse_args()
    bins = {}
    for nombre in ('initdb', 'pg_ctl', 'psql'):
        binario = args.pg_bin / nombre if args.pg_bin else shutil.which(nombre)
        if not binario or not Path(binario).is_file():
            parser.error('Falta PostgreSQL. Use --pg-bin.')
        bins[nombre] = str(binario)
    evidencia = args.evidence
    if evidencia and (evidencia.exists() or not evidencia.parent.is_dir()):
        parser.error('--evidence debe ser nuevo y su directorio debe existir.')
    migracion = next((ROOT / 'migrations').glob('098_*'))
    estado_sql = ROOT / 'scripts/qa/vivero-conciliacion-storage-estado.sql'
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(LC_ALL='C', PGPASSFILE=os.devnull, PGSERVICEFILE=os.devnull,
               PGAPPNAME='vivero_storage_098_aislado')
    directorio = Path(tempfile.mkdtemp(prefix='vivero-storage-098-', dir='/tmp')).resolve()
    cluster, socket = directorio / 'pg', directorio / 'socket'
    socket.mkdir(mode=0o700)
    checks = []
    iniciado = False
    correcto = False
    version = None

    def ejecutar(comando, error=None):
        r = subprocess.run(comando, env=env, text=True, capture_output=True, timeout=60)
        if error:
            if not r.returncode or error not in r.stderr:
                raise AssertionError(f'Esperado {error}: {r.stderr[-2200:]}')
        elif r.returncode:
            raise RuntimeError(r.stderr[-3500:])
        return r.stdout.strip()

    def psql(*argumentos):
        return [bins['psql'], '-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1',
                '-h', str(socket), '-p', '55445', '-U', 'postgres',
                '-d', 'postgres', *argumentos]

    def sql(texto, error=None, rol=None):
        argumentos = ['-c', 'SET ROLE ' + rol] if rol else []
        return ejecutar(psql(*argumentos, '-c', texto), error)

    def check(condicion, descripcion):
        if not condicion:
            raise AssertionError(descripcion)
        checks.append(descripcion)

    def instalar(error=None):
        return ejecutar(psql('-f', str(migracion)), error)

    def estado():
        return json.loads(ejecutar(psql('-f', str(estado_sql))))

    def huella():
        return sql("""
            SELECT jsonb_build_object(
              'buckets',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM storage.buckets b),
              'objects',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM storage.objects o),
              'policies',(SELECT jsonb_agg(jsonb_build_array(p.oid,p.polrelid::regclass::text,p.polname,
                  p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),
                  pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polrelid,p.polname)
                FROM pg_policy p WHERE p.polrelid IN ('storage.buckets'::regclass,'storage.objects'::regclass)),
              'tablas',(SELECT jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relacl,c.relrowsecurity)
                  ORDER BY c.relname) FROM pg_class c
                WHERE c.oid IN ('storage.buckets'::regclass,'storage.objects'::regclass)),
              'funciones',(SELECT jsonb_agg(jsonb_build_array(p.proname,p.prosrc) ORDER BY p.proname)
                FROM pg_proc p WHERE p.pronamespace='public'::regnamespace)
            )
        """)

    def rechazar(preparar, restaurar, error, etiqueta):
        sql(preparar)
        antes = huella()
        instalar(error)
        check(huella() == antes, etiqueta)
        sql(restaurar)

    def filas(rol, tabla, filtro):
        return sql(f'SELECT count(*) FROM storage.{tabla} WHERE {filtro}', rol=rol)

    try:
        ejecutar([bins['initdb'], '-D', str(cluster), '-U', 'postgres',
                  '--auth-local=trust', '--auth-host=reject', '--locale=C', '--encoding=UTF8'])
        ejecutar([bins['pg_ctl'], '-D', str(cluster), '-l', str(directorio / 'postgres.log'),
                  '-w', '-t', '20', 'start', '-o',
                  f"-c listen_addresses='' -c unix_socket_directories='{socket}' "
                  "-c unix_socket_permissions=0700 -c port=55445 -c shared_buffers=16MB"])
        iniciado = True
        version = sql('SHOW server_version')
        print('098 PostgreSQL aislado ' + version, flush=True)
        sql("""
            CREATE ROLE anon NOLOGIN;
            CREATE ROLE authenticated NOLOGIN;
            CREATE ROLE service_role NOLOGIN BYPASSRLS;
        """)
        ejecutar(psql('-f', str(FIXTURE)))
        for nombre in ('fn_recoleccion_acotar_excepcion_fecha_rechazo',
                       'm1_recepcion_proteger_movimiento', 'm2_conciliacion_acreditada'):
            sql(extraer_funcion(nombre))
        sql('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role')
        check(sql('SHOW listen_addresses') == '', 'Clúster de 098 sin TCP y sin configuración externa')
        antes = huella()
        inicial = estado()
        check(inicial['entorno']['transaccion_solo_lectura'] == 'on'
              and inicial['bucket_presente'] is False
              and inicial['comprobaciones']['politicas_dedicadas_exactas'] is False
              and huella() == antes,
              'El informe detecta políticas pendientes y bucket ausente sin modificar el catálogo')

        datos_antes = sql("""
            SELECT jsonb_build_array(
              (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b),
              (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o))
        """)
        instalar()
        check(sql(f"SELECT count(*) FROM storage.buckets WHERE id='{BUCKET}'") == '0',
              '098 admite el bucket ausente y no crea ni altera inventario Storage')
        despues = huella()
        instalar()
        check(huella() == despues, '098 es repetible y conserva datos, ACL y políticas instaladas')
        check(sql("""
            SELECT jsonb_build_array(
              (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b),
              (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o))
        """) == datos_antes, 'Instalar y repetir 098 conserva todos los buckets y objetos existentes')
        sin_bucket = estado()
        check(sin_bucket['bucket_presente'] is False
              and all(v is True for v in sin_bucket['comprobaciones'].values()),
              'El informe es conforme después de 098 con el bucket todavía ausente')
        for rol in ('anon', 'authenticated'):
            sql(f"""
                INSERT INTO storage.buckets(id,name,public) VALUES ('{BUCKET}','{BUCKET}',true)
            """, error='row-level security', rol=rol)
        check(True, 'Las restricciones impiden a anon y authenticated crear el bucket protegido')

        # La creación posterior representa la API privada del servicio, con sus
        # metadatos exactos. El runner no conecta con Supabase Storage.
        sql(f"""
            INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
            VALUES ('{BUCKET}','{BUCKET}',false,15728640,
              ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
        """, rol='service_role')
        sql(f"""
            INSERT INTO storage.objects(id,bucket_id,name)
            VALUES ('00000000-0000-4000-8000-000000000003','{BUCKET}','comprobacion.jpg')
        """, rol='service_role')
        instalar()
        check(sql(f"SELECT count(*) FROM storage.objects WHERE bucket_id='{BUCKET}'",
                  rol='service_role') == '1',
              'service_role BYPASSRLS crea y lee el bucket privado y su objeto tras instalar 098')
        con_bucket = estado()
        check(con_bucket['bucket_presente'] is True
              and all(v is True for v in con_bucket['comprobaciones'].values()),
              'El informe conserva todas sus comprobaciones conformes después del alta privada')

        for rol in ('anon', 'authenticated'):
            check(filas(rol, 'buckets', f"id='{BUCKET}'") == '0'
                  and filas(rol, 'objects', f"bucket_id='{BUCKET}'") == '0',
                  f'{rol} no consulta el bucket ni sus objetos con políticas permisivas globales')
            sql(f"""
                INSERT INTO storage.objects(id,bucket_id,name)
                VALUES ('00000000-0000-4000-8000-000000000010','{BUCKET}','prohibido.jpg')
            """, error='row-level security', rol=rol)
            sql(f"""
                INSERT INTO storage.buckets(id,name,public) VALUES ('{BUCKET}','{BUCKET}',true)
            """, error='row-level security', rol=rol)
            sql(f"UPDATE storage.objects SET name='prohibido.jpg' WHERE bucket_id='{BUCKET}'", rol=rol)
            sql(f"DELETE FROM storage.objects WHERE bucket_id='{BUCKET}'", rol=rol)
            sql(f"UPDATE storage.buckets SET public=true WHERE id='{BUCKET}'", rol=rol)
            sql(f"DELETE FROM storage.buckets WHERE id='{BUCKET}'", rol=rol)
            check(sql(f"""
                SELECT count(*) FROM storage.objects WHERE bucket_id='{BUCKET}' AND name='comprobacion.jpg'
            """) == '1' and sql(f"SELECT public FROM storage.buckets WHERE id='{BUCKET}'") == 'f',
                  f'{rol} no modifica, elimina ni convierte a público el bucket o sus objetos')
            sql(f"""
                UPDATE storage.objects SET bucket_id='{BUCKET}'
                WHERE id='00000000-0000-4000-8000-000000000001'
            """, error='row-level security', rol=rol)
            sql(f"""
                UPDATE storage.objects SET bucket_id='publico_fixture'
                WHERE bucket_id='{BUCKET}'
            """, rol=rol)
            sql(f"""
                UPDATE storage.buckets SET id='{BUCKET}' WHERE id='privado_fixture'
            """, error='row-level security', rol=rol)
            sql(f"UPDATE storage.buckets SET id='expuesto_fixture' WHERE id='{BUCKET}'", rol=rol)
            check(sql(f"SELECT bucket_id FROM storage.objects WHERE name='comprobacion.jpg'") == BUCKET,
                  f'{rol} no mueve objetos o buckets desde ni hacia la conciliación')
            check(filas(rol, 'objects', "bucket_id='publico_fixture'") == '1'
                  and filas(rol, 'buckets', "id='privado_fixture'") == '1',
                  f'{rol} conserva la lectura previa de otros buckets')
            sql("""
                INSERT INTO storage.buckets(id,name,public)
                  VALUES ('otro_nuevo','otro_nuevo',true);
                INSERT INTO storage.objects(id,bucket_id,name)
                  VALUES ('00000000-0000-4000-8000-000000000020','otro_nuevo','otro.jpg');
                UPDATE storage.objects SET name='otro-editado.jpg' WHERE bucket_id='otro_nuevo';
                UPDATE storage.buckets SET public=false WHERE id='otro_nuevo';
                DELETE FROM storage.objects WHERE bucket_id='otro_nuevo';
                DELETE FROM storage.buckets WHERE id='otro_nuevo';
            """, rol=rol)
            check(True, f'{rol} conserva altas, cambios y borrados permitidos en otros buckets')

        sql(f"""
            UPDATE storage.objects SET bucket_id='publico_fixture' WHERE bucket_id='{BUCKET}';
            UPDATE storage.objects SET bucket_id='{BUCKET}' WHERE name='comprobacion.jpg';
            UPDATE storage.objects SET name='servicio-editado.jpg' WHERE bucket_id='{BUCKET}';
            UPDATE storage.buckets SET name=name WHERE id='{BUCKET}';
            DELETE FROM storage.objects WHERE bucket_id='{BUCKET}';
            DELETE FROM storage.buckets WHERE id='{BUCKET}';
            INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
              VALUES ('{BUCKET}','{BUCKET}',false,15728640,
                ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']);
            INSERT INTO storage.objects(id,bucket_id,name)
              VALUES ('00000000-0000-4000-8000-000000000003','{BUCKET}','comprobacion.jpg');
        """, rol='service_role')
        check(True, 'service_role conserva CRUD del bucket y de sus objetos, incluidos movimientos')

        for tabla in ('buckets', 'objects'):
            rechazar(
                f'ALTER TABLE storage.{tabla} DISABLE ROW LEVEL SECURITY',
                f'ALTER TABLE storage.{tabla} ENABLE ROW LEVEL SECURITY',
                'CONCILIACION_STORAGE_CATALOGO_INCOMPATIBLE',
                f'098 aborta sin mutaciones si RLS está desactivado en storage.{tabla}')
        rechazar('ALTER ROLE anon BYPASSRLS', 'ALTER ROLE anon NOBYPASSRLS',
                 'CONCILIACION_STORAGE_ROL_INCOMPATIBLE', '098 rechaza anon con BYPASSRLS')
        rechazar('ALTER ROLE authenticated SUPERUSER', 'ALTER ROLE authenticated NOSUPERUSER',
                 'CONCILIACION_STORAGE_ROL_INCOMPATIBLE', '098 rechaza authenticated con SUPERUSER')
        rechazar('GRANT service_role TO authenticated', 'REVOKE service_role FROM authenticated',
                 'CONCILIACION_STORAGE_ROL_INCOMPATIBLE', '098 rechaza membresía elevada de authenticated')
        rechazar('ALTER TABLE storage.objects OWNER TO anon',
                 'ALTER TABLE storage.objects OWNER TO postgres',
                 'CONCILIACION_STORAGE_ROL_INCOMPATIBLE', '098 rechaza propiedad de Storage por anon')
        rechazar('REVOKE INSERT ON storage.objects FROM service_role',
                 'GRANT INSERT ON storage.objects TO service_role',
                 'CONCILIACION_STORAGE_SERVICIO_SIN_PRIVILEGIO',
                 '098 aborta si falta escritura al servicio y no le concede permisos')
        rechazar(f"ALTER POLICY {POLICY} ON storage.objects USING (true)",
                 f"ALTER POLICY {POLICY} ON storage.objects USING (bucket_id<>'{BUCKET}')",
                 'CONCILIACION_STORAGE_POLITICA_DRIFT', '098 aborta ante expresión divergente de la política')
        rechazar(f"ALTER POLICY {POLICY} ON storage.buckets TO anon",
                 f'ALTER POLICY {POLICY} ON storage.buckets TO PUBLIC',
                 'CONCILIACION_STORAGE_POLITICA_DRIFT', '098 aborta ante audiencia divergente de la política')
        for modo, comando, comprobacion, etiqueta in (
            ('PERMISSIVE', 'ALL', f"WITH CHECK(bucket_id<>'{BUCKET}')", 'política permisiva'),
            ('RESTRICTIVE', 'SELECT', '', 'comando distinto de ALL'),
        ):
            rechazar(
                f"""DROP POLICY {POLICY} ON storage.objects;
                    CREATE POLICY {POLICY} ON storage.objects AS {modo}
                    FOR {comando} TO PUBLIC USING(bucket_id<>'{BUCKET}') {comprobacion}""",
                f"""DROP POLICY {POLICY} ON storage.objects;
                    CREATE POLICY {POLICY} ON storage.objects AS RESTRICTIVE
                    FOR ALL TO PUBLIC USING(bucket_id<>'{BUCKET}')
                    WITH CHECK(bucket_id<>'{BUCKET}')""",
                'CONCILIACION_STORAGE_POLITICA_DRIFT',
                f'098 aborta sin reemplazar una {etiqueta}')
        for columna, invalido, valido in (
            ('public', 'true', 'false'),
            ('name', "'nombre-divergente'", f"'{BUCKET}'"),
            ('file_size_limit', '1', '15728640'),
            ('allowed_mime_types', "ARRAY['image/jpeg']",
             "ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']"),
            ('type', "'ANALYTICS'", "'STANDARD'"),
        ):
            rechazar(f"UPDATE storage.buckets SET {columna}={invalido} WHERE id='{BUCKET}'",
                     f"UPDATE storage.buckets SET {columna}={valido} WHERE id='{BUCKET}'",
                     'CONCILIACION_STORAGE_BUCKET_INCOMPATIBLE',
                     f'098 rechaza el metadato incompatible {columna} sin repararlo')
        original_fecha = extraer_funcion('fn_recoleccion_acotar_excepcion_fecha_rechazo')
        rechazar("""
            CREATE OR REPLACE FUNCTION public.fn_recoleccion_acotar_excepcion_fecha_rechazo()
            RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
        """, original_fecha, 'CONCILIACION_STORAGE_CATALOGO_INCOMPATIBLE',
                 '098 rechaza un cuerpo crítico de 097 diferente y conserva el estado')
        instalar()
        sql('ALTER TABLE storage.buckets DROP COLUMN type')
        antes = huella()
        instalar()
        check(huella() == antes, '098 admite la ausencia de la columna opcional type sin mutar metadatos')
        sql("ALTER TABLE storage.buckets ADD COLUMN type text NOT NULL DEFAULT 'STANDARD'")
        final = estado()
        check(final['entorno']['transaccion_solo_lectura'] == 'on'
              and all(v is True for v in final['comprobaciones'].values()),
              'El informe final devuelve JSON con todos los controles conformes en solo lectura')
        correcto = True
    finally:
        if iniciado or (cluster / 'postmaster.pid').exists():
            ejecutar([bins['pg_ctl'], '-D', str(cluster), '-w', '-t', '15', 'stop', '-m', 'fast'])
        detenido = not (cluster / 'postmaster.pid').exists()
        if detenido:
            shutil.rmtree(directorio)
        if evidencia:
            archivos = [Path(__file__).resolve(), FIXTURE, ORIGEN, migracion, estado_sql]
            evidencia.write_text(json.dumps({
                'tarea': 'VIVERO_CONCILIACION_STORAGE_098',
                'estado': 'CORRECTO' if correcto else 'FALLIDO',
                'fecha': datetime.now(ZoneInfo('America/La_Paz')).date().isoformat(),
                'entorno': {
                    'tipo': 'SINTETICO_LOCAL', 'postgres': version, 'tcp': False,
                    'sin_env': True, 'servicios_externos': False, 'storage_http': False,
                    'cluster_detenido': detenido, 'directorio_eliminado': not directorio.exists(),
                },
                'base': ejecutar(['git', '-C', str(ROOT), 'rev-parse', 'HEAD']),
                'comprobaciones': checks,
                'sha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in archivos if p.exists()},
            }, ensure_ascii=False, indent=2) + '\n')
    print(f'098: {len(checks)} grupos SQL/RLS aprobados.', flush=True)


if __name__ == '__main__':
    main()
