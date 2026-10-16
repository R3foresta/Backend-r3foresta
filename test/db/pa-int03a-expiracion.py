#!/usr/bin/env python3
"""Regresión focalizada INT03-A sobre el clúster aislado ya creado por el runner.

Expiración inline, catálogo instalado y rollback después del consumo. Los objetos
de estas pruebas SQL son certificaciones sintéticas de fixture; el runner HTTP
acredita aparte bytes/decodificación/Storage. Nunca carga .env ni destinos libpq.
"""
import argparse
import copy
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
        value = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) if isinstance(value, (dict, list)) else str(value)
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
    assert sql("SELECT count(*) FROM pg_extension WHERE extname='postgis'") == '1'
    assert sql("SELECT count(*) FROM pg_constraint WHERE conrelid='public.participacion_carga'::regclass AND contype='f' AND convalidated AND confupdtype='r' AND confdeltype='r'") == '6'
    assert sql("SELECT count(*) FROM pg_constraint WHERE conrelid='public.participacion_carga_generacion'::regclass AND contype='f' AND convalidated AND confupdtype='r' AND confdeltype='r'") == '1'
    today = sql("SELECT (transaction_timestamp() AT TIME ZONE 'America/La_Paz')::date")
    evidence = json.loads(Path(args.evidence).read_text())

    def record(label, ids):
        evidence['casos'].append({'caso': label, 'trazabilidad': ids, 'resultado': 'CORRECTO'})
        print('OK: ' + label, flush=True)

    def state():
        return sql("SELECT jsonb_build_object('hechos',(SELECT count(*) FROM public.registro_plantacion WHERE subcampania_id=828),'detalles',(SELECT count(*) FROM public.registro_plantacion_detalle d JOIN public.registro_plantacion r ON r.id=d.registro_plantacion_id WHERE r.subcampania_id=828),'consumido',(SELECT sum(cantidad_consumida) FROM public.asignacion_vivero_subcampania WHERE subcampania_id=828),'contador',(SELECT total_plantado_inicial FROM public.subcampania WHERE id=828),'m2',(SELECT sum(saldo_vivo_actual) FROM public.lote_vivero))")

    def payload(image):
        return {'subcampania_id': '828', 'plan_revision_esperada': '0', 'fecha_plantacion': today,
                'latitud': -16.5, 'longitud': -68.1, 'especies': [{'planta_id': '8', 'cantidad': 1}],
                'coresponsable_ids': [], 'evidencia_ids': [image], 'observaciones': None,
                'afiliaciones_declaradas': []}

    def initial(key, value):
        canon = copy.deepcopy(value)
        for coordinate in ('latitud', 'longitud'):
            canon[coordinate] = format(canon[coordinate], '.6f')
        return rpc('pa_registro_inicial_ejecutar', 801, 'a-http-801', key, value,
                   json.dumps(canon, ensure_ascii=False, sort_keys=True, separators=(',', ':')))

    def terminal(response, code):
        assert response['http_status'] == 409 and response['body']['estado'] == 'RECHAZADO', response
        assert response['body']['error']['codigo'] == code and response['body']['resultado'] is None, response

    def prepared_photo(scope='828'):
        key = str(uuid.uuid4())
        assert rpc('pa_cargas_operar', 801, 'a-http-801', 'PREPARAR', key, {'subcampania_id': scope})['http_status'] == 200
        body = {'carga_id': str(uuid.uuid4()), 'lease_token': str(uuid.uuid4()),
                'hash_original': '56' * 32, 'hash_derivada': '78' * 32,
                'tamano_original': 80, 'tamano_derivada': 70, 'mime_original': 'image/png'}
        reservation = rpc('pa_cargas_operar', 801, 'a-http-801', 'RESERVAR', key, body)
        assert reservation['http_status'] == 202, reservation
        job = reservation['body']['data']['trabajo']
        body.update(generacion=job['generacion'], lease_token=job['lease_token'], objetos_verificados=True)
        finalized = rpc('pa_cargas_operar', 801, 'a-http-801', 'FINALIZAR', key, body)
        assert finalized['http_status'] == 201, finalized
        return key, finalized['body']['data']['evidencia_id']

    # Caso 1: límite de 30 días sobre la preparación, sin ayuda del worker.
    key = str(uuid.uuid4())
    sql("INSERT INTO public.participacion_comando(actor_id,operacion,comando_id,estado,subcampania_preparacion_id,creado_en) VALUES(801,'REGISTRAR_PLANTACION_INICIAL'," + literal(key) + ",'PREPARADO',828,clock_timestamp()-interval '30 days')")
    before = state()
    response = initial(key, payload('1'))
    terminal(response, 'PREPARACION_CANCELADA')
    assert state() == before
    assert sql("SELECT huella IS NULL FROM public.participacion_comando WHERE actor_id=801 AND comando_id=" + literal(key)) == 't'
    changed = payload('1')
    changed['especies'][0]['cantidad'] = 2
    assert initial(key, changed) == response
    recovery = rpc('pa_comando_recuperar', 801, 'a-http-801', 'REGISTRAR_PLANTACION_INICIAL', key)
    assert recovery['http_status'] == 200 and recovery['body'] == response['body']
    record('expiración inline al límite de 30 días: cancelación sin huella, replay distinto conserva 409 y GET terminal', ['PA-ID16', 'PA-ID17'])

    # Caso 2: también una foto vencida cierra el comando aunque la preparación
    # sea reciente. Sus generaciones conservan la compensación tras el commit.
    key, image = prepared_photo()
    sql("UPDATE public.participacion_carga SET expira_en=clock_timestamp()-interval '1 second' WHERE evidencia_id=" + image)
    before = state()
    terminal(initial(key, payload(image)), 'PREPARACION_CANCELADA')
    assert state() == before
    assert sql("SELECT estado||':'||(lease_token IS NULL)::text FROM public.participacion_carga WHERE evidencia_id=" + image) == 'DESCARTE_PENDIENTE:true'
    assert sql("SELECT estado||':'||limpieza_estado FROM public.participacion_carga_generacion WHERE carga_interna_id=(SELECT id FROM public.participacion_carga WHERE evidencia_id=" + image + ")") == 'OBSOLETA:PENDIENTE'
    record('foto vencida clausura inicial antes del barrido y conserva ledger de compensación sin consumo', ['PA-ID17', 'PA-ID19'])

    # Caso 3: fallo identificado después de crear hecho/detalles y consumir
    # asignaciones. El subbloque revierte todo y solo publica el rechazo durable.
    key, image = prepared_photo()
    before = state()
    sql("CREATE FUNCTION public.pa_int03a_expiry_partial_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=828 THEN PERFORM public.pa_c_rechazar(409,'FALLO_PARCIAL_EXPIRACION','Fallo de negocio inyectado tras consumo.'); END IF; RETURN NEW; END $$; CREATE TRIGGER pa_int03a_expiry_partial_failure BEFORE UPDATE ON public.subcampania FOR EACH ROW EXECUTE FUNCTION public.pa_int03a_expiry_partial_failure()")
    try:
        response = initial(key, payload(image))
        terminal(response, 'FALLO_PARCIAL_EXPIRACION')
        assert state() == before
        assert sql("SELECT estado FROM public.participacion_carga WHERE evidencia_id=" + image) == 'DISPONIBLE'
        assert sql("SELECT huella IS NOT NULL FROM public.participacion_comando WHERE actor_id=801 AND comando_id=" + literal(key)) == 't'
    finally:
        sql('DROP TRIGGER pa_int03a_expiry_partial_failure ON public.subcampania; DROP FUNCTION public.pa_int03a_expiry_partial_failure()')
    assert initial(key, payload(image)) == response
    record('regresión focalizada: rechazo tras consumo revierte hecho, detalles, contadores y conserva foto/terminal', ['PA-ID17', 'PA-ID21'])

    # Metadatos adversarios controlados por el fixture. El backend no acepta
    # tipo/entidad/ámbito del cliente, y la RPC vuelve a cotejar lo persistido.
    for invalid in ('TIPO', 'VINCULO', 'AMBITO_PREPARACION'):
        key, own_image = prepared_photo()
        image = own_image
        if invalid == 'TIPO':
            sql('UPDATE public.evidencias_trazabilidad SET tipo_entidad_id=2 WHERE id=' + image)
        elif invalid == 'VINCULO':
            linked_record = sql('SELECT min(id) FROM public.registro_plantacion')
            assert linked_record and int(linked_record) > 0
            sql('UPDATE public.evidencias_trazabilidad SET entidad_id=' + linked_record + ' WHERE id=' + image)
        else:
            _, image = prepared_photo('830')
        before = state()
        terminal(initial(key, payload(image)), 'EVIDENCIA_NO_DISPONIBLE')
        assert state() == before
        assert sql('SELECT estado FROM public.participacion_carga WHERE evidencia_id=' + own_image) == 'DISPONIBLE'
        assert sql("SELECT estado FROM public.participacion_comando WHERE actor_id=801 AND comando_id=" + literal(key)) == 'RECHAZADO'
    record('fotos propias con tipo ajeno, vínculo previo o preparación/ámbito distinto rechazan íntegramente sin consumo', ['PA-ID18', 'PA-ID19'])
    record('catálogo instalado 074: seis FKs RESTRICT validadas en carga y una en generaciones', ['PA-ID23'])
    Path(args.evidence).write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
