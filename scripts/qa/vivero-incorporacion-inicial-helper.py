"""Preparaciones SQL reales074/075 para el runner T5 aislado.

No se conecta por sí solo: el runner inyecta su ejecutor privado. Cargas SQL
representan metadatos sintéticos; no prueban bytes ni HTTP Storage. LIFO, consumo,
autorización contextual, recibo y PostGIS son las RPC reales, sin sustituciones.
"""
import copy
import json
import uuid


def literal(value):
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return "'" + str(value).replace("'", "''") + "'"


class InicialT5:
    def __init__(self, call, today):
        self.call = call
        self.today = today

    def rpc(self, name, *params):
        return self.call('SELECT public.' + name + '(' + ','.join(literal(p) for p in params) + ')')

    def preparar(self, actor, auth, subcampania):
        key = str(uuid.uuid4())
        result = self.rpc('pa_cargas_operar', actor, auth, 'PREPARAR', key,
                          {'subcampania_id': str(subcampania)})
        assert result['http_status'] == 200, result
        return key

    def foto(self, actor, auth, key):
        # Sólo metadatos de bytes ficticios y verificación sintética del runner;
        # se ejercitan reserva/finalización reales con lease y generación reales.
        payload = {'carga_id': str(uuid.uuid4()), 'hash_original': '12' * 32,
                   'hash_derivada': '34' * 32, 'tamano_original': 80,
                   'tamano_derivada': 70, 'mime_original': 'image/png',
                   'lease_token': str(uuid.uuid4())}
        result = self.rpc('pa_cargas_operar', actor, auth, 'RESERVAR', key, payload)
        assert result['http_status'] == 202, result
        job = result['body']['data']['trabajo']
        payload.update(generacion=job['generacion'], lease_token=job['lease_token'],
                       objetos_verificados=True)
        result = self.rpc('pa_cargas_operar', actor, auth, 'FINALIZAR', key, payload)
        assert result['http_status'] == 201, result
        return result['body']['data']['evidencia_id']

    def payload(self, actor, auth, subcampania, cantidad, planta=1, fecha=None):
        key = self.preparar(actor, auth, subcampania)
        return key, {
            'subcampania_id': str(subcampania), 'plan_revision_esperada': '0',
            'fecha_plantacion': fecha or self.today,
            'latitud': -16.5, 'longitud': -68.1,
            'especies': [{'planta_id': str(planta), 'cantidad': cantidad}],
            'coresponsable_ids': [], 'evidencia_ids': [self.foto(actor, auth, key)],
            'observaciones': None, 'afiliaciones_declaradas': [],
        }

    @staticmethod
    def comando(actor, auth, key, payload):
        canon = copy.deepcopy(payload)
        for field in ('latitud', 'longitud'):
            canon[field] = format(canon[field], '.6f')
        for field in ('especies', 'afiliaciones_declaradas'):
            canon[field].sort(key=lambda item: int(item.get('planta_id', item.get('usuario_id', '0'))))
        for field in ('coresponsable_ids', 'evidencia_ids'):
            canon[field].sort(key=int)
        canonical = json.dumps(canon, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
        return ('SELECT public.pa_registro_inicial_ejecutar(' + str(actor) + ',' + literal(auth)
                + ',' + literal(key) + ',' + literal(payload) + '::jsonb,' + literal(canonical) + ')')

    def ejecutar(self, actor, auth, key, payload):
        result = self.call(self.comando(actor, auth, key, payload))
        assert result['http_status'] == 200 and result['body']['estado'] == 'CONFIRMADO', result
        return result['body']['resultado']
