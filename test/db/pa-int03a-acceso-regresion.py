#!/usr/bin/env python3
"""Regresión C04–C09/rol/baja con la extensión de replay 075 ya instalada.

Se ejecuta después del HTTP de INT03-A: inactiva exclusivamente la persona
sintética 804. Scope 850/851, sin personas/servicios externos ni lectura de .env.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ('socket', 'port', 'database', 'psql', 'evidence'):
        parser.add_argument('--' + option, required=True)
    args = parser.parse_args()
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    base = [args.psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', args.socket,
            '-p', args.port, '-U', 'postgres', '-d', args.database]

    def literal(value):
        value = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')) if isinstance(value, (dict, list)) else str(value)
        return "'" + value.replace("'", "''") + "'"

    def sql(statement):
        result = subprocess.run(base, input="SET statement_timeout='25s'; " + statement,
                                env=env, text=True, capture_output=True, timeout=30)
        assert result.returncode == 0, result.stderr
        return result.stdout.strip()

    def rpc(name, *params):
        return json.loads(sql('SET ROLE service_role; SELECT public.' + name + '(' +
                              ','.join(literal(value) for value in params) + ');'))

    assert sql("SELECT fixture FROM public.pa_int03a_fixture_marker") == 'SINTETICO_AISLADO_INT03A_POSTGIS_REAL'
    assert sql("SELECT count(*) FROM pg_proc WHERE oid='public.pa_registro_inicial_ejecutar(bigint,text,uuid,jsonb,text)'::regprocedure") == '1'
    assert sql("SELECT count(*) FROM public.usuario WHERE id IN(801,802,804) AND rol::text='VOLUNTARIO' AND activo") == '3'
    sql("INSERT INTO public.subcampania(id,campania_id,nombre,estado,codigo_trazabilidad,created_by,updated_by,zona_id,nombre_zona_snapshot,poligono_geom,meta_total_arboles) SELECT n,800,'Regresión C con 075 '||n,'ACTIVA','INT03A-REGRESION-'||n,800,800,zona_id,nombre_zona_snapshot,poligono_geom,2 FROM public.subcampania s CROSS JOIN generate_series(850,851) n WHERE s.id=828")
    recorded = []

    def run(operation, payload, rejection=None):
        command = str(uuid.uuid4())
        canon = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        name = 'pa_autoridad_ejecutar' if operation in ('CAMBIAR_ROL_GLOBAL', 'INACTIVAR_CUENTA') else 'pa_acceso_ejecutar'
        response = rpc(name, 800, 'a-http-800', operation, command, payload, canon)
        if rejection:
            assert response['http_status'] == 409 and response['body']['estado'] == 'RECHAZADO', response
            assert response['body']['error']['codigo'] == rejection and response['body']['resultado'] is None, response
        else:
            assert response['http_status'] == 200 and response['body']['estado'] == 'CONFIRMADO', response
        recorded.append((name, operation, command, payload, canon, response))
        return response

    def access(operation, user, revision, scope=850, rejection=None):
        return run(operation, {'usuario_destino_id': str(user),
                   'ambitos': [{'subcampania_id': str(scope), 'revision_esperada': str(revision)}]}, rejection)

    # C04–C05 usan otro ámbito para mantener explícitas las revisiones de C06–09.
    access('OTORGAR_PLANTADOR', 804, 0, 851)
    access('RETIRAR_PLANTADOR', 804, 1, 851)
    access('DESIGNAR_ADMINISTRADOR', 801, 0)
    access('DESIGNAR_ADMINISTRADOR', 802, 0)
    access('CAMBIAR_ADMINISTRADOR_A_PLANTADOR', 801, 1)
    access('RETIRAR_ADMINISTRADOR', 802, 1, rejection='ULTIMO_ADMINISTRADOR_CONTEXTUAL')
    access('DESIGNAR_ADMINISTRADOR', 804, 0)
    access('RETIRAR_ADMINISTRADOR', 802, 1)
    run('REEMPLAZAR_ADMINISTRADOR', {'usuario_saliente_id': '804', 'usuario_reemplazo_id': '802',
        'tratamiento_saliente': 'PLANTADOR', 'ambitos': [{'subcampania_id': '850',
        'revision_saliente_esperada': '1', 'revision_reemplazo_esperada': '2'}]})
    assert sql("SELECT rol_contextual FROM public.subcampania_permiso WHERE subcampania_id=850 AND usuario_id=802 AND revocado_en IS NULL") == 'ADMINISTRADOR_SUBCAMPANIA'
    assert sql("SELECT revision FROM public.subcampania_permiso_revision WHERE subcampania_id=850 AND usuario_id=802") == '3'
    assert sql("SELECT rol_contextual FROM public.subcampania_permiso WHERE subcampania_id=850 AND usuario_id=804 AND revocado_en IS NULL") == 'PLANTADOR'

    run('CAMBIAR_ROL_GLOBAL', {'usuario_destino_id': '804', 'revision_esperada': '0',
                             'motivo': 'Regresión aislada de C con motor 075', 'rol_global': 'GENERAL'})
    run('INACTIVAR_CUENTA', {'usuario_destino_id': '804', 'revision_esperada': '1',
                           'motivo': 'Baja sintética tras reemplazo administrativo'})
    assert sql("SELECT activo::text||':'||revision_autoridad::text FROM public.usuario WHERE id=804") == 'false:2'
    assert sql("SELECT count(*) FROM public.subcampania_permiso p JOIN public.usuario u ON u.id=p.usuario_id WHERE p.subcampania_id=850 AND p.revocado_en IS NULL AND p.rol_contextual='ADMINISTRADOR_SUBCAMPANIA' AND u.activo") == '1'

    def state():
        return sql("SELECT jsonb_build_object('comandos',(SELECT count(*) FROM public.participacion_comando),'historia',(SELECT count(*) FROM public.subcampania_historial WHERE subcampania_id IN(850,851)),'autoridad',(SELECT count(*) FROM public.usuario_autoridad_historial WHERE usuario_id=804),'vigencias',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.subcampania_permiso p WHERE subcampania_id IN(850,851)),'revisiones',(SELECT jsonb_agg(to_jsonb(r) ORDER BY subcampania_id,usuario_id) FROM public.subcampania_permiso_revision r WHERE subcampania_id IN(850,851)))")

    before = state()
    # Incluye el rechazo de último administrador, aunque ahora existe reemplazo.
    for name, operation, command, payload, canon, expected in recorded:
        assert rpc(name, 800, 'a-http-800', operation, command, payload, canon) == expected
        recovered = rpc('pa_comando_recuperar', 800, 'a-http-800', operation, command)
        assert recovered['http_status'] == 200 and recovered['body'] == expected['body']
    assert state() == before
    assert sql("SELECT count(*) FROM public.subcampania_historial WHERE subcampania_id IN(850,851)") == '8'
    assert sql("SELECT count(*) FROM public.usuario_autoridad_historial WHERE usuario_id=804") == '2'
    evidence = json.loads(Path(args.evidence).read_text())
    evidence['casos'].append({'caso': 'regresión C04–C09, continuidad, rol/baja e historial con helpers 075 instalados; once claves repiten recibo/GET sin efectos',
                              'trazabilidad': ['PA-ID13', 'PA-ID16', 'PA-ID23'], 'resultado': 'CORRECTO',
                              'operaciones': sorted(set(row[1] for row in recorded)), 'comandos': len(recorded),
                              'ambitos': ['850', '851'], 'eventos_contextuales': 8, 'eventos_autoridad': 2})
    Path(args.evidence).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    print('OK: regresión C04–C09/rol/baja tras 075, once replay/GET idénticos y ningún efecto repetido', flush=True)


if __name__ == '__main__':
    main()
