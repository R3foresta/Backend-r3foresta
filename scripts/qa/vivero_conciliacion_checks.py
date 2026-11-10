"""Regresiones 097 sobre el clúster y los helpers de recepción-semillas-test.py."""

import json
from decimal import Decimal
import uuid


def instalar_conciliacion(*, sql, check, migracion):
    tablas = 'public.recoleccion, public.recoleccion_movimiento'
    sql(f"""
        GRANT ALL ON {tablas} TO PUBLIC, anon, authenticated, service_role;
        GRANT INSERT(fecha), UPDATE(fecha), REFERENCES(id)
            ON public.recoleccion TO PUBLIC, anon, authenticated;
        GRANT INSERT(delta), UPDATE(delta), REFERENCES(id)
            ON public.recoleccion_movimiento TO PUBLIC, anon, authenticated;
        CREATE ROLE conciliacion_escritor_heredado NOLOGIN;
        GRANT conciliacion_escritor_heredado TO anon;
    """)
    permisos_servicio = sql("""
        SELECT jsonb_agg(jsonb_build_array(t,privilegio,
            has_table_privilege('service_role',t,privilegio)) ORDER BY t,privilegio)
        FROM unnest(ARRAY['public.recoleccion','public.recoleccion_movimiento']) t
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) privilegio
    """)
    catalogo = """
        SELECT jsonb_build_object(
            'tablas', (SELECT jsonb_agg(jsonb_build_array(c.relname,c.relacl) ORDER BY c.relname)
                FROM pg_class c WHERE c.oid IN ('public.recoleccion'::regclass,'public.recoleccion_movimiento'::regclass)),
            'columnas', (SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.attacl)
                ORDER BY a.attrelid,a.attnum) FROM pg_attribute a
                WHERE a.attrelid IN ('public.recoleccion'::regclass,'public.recoleccion_movimiento'::regclass)
                    AND a.attnum>0 AND NOT a.attisdropped),
            'check_fecha', (SELECT pg_get_constraintdef(oid) FROM pg_constraint
                WHERE conrelid='public.recoleccion'::regclass AND conname='chk_fecha_rango'),
            'tabla_nueva', to_regclass('public.recoleccion_conciliacion_evento')::text
        )
    """
    for otorgar, retirar, etiqueta in (
        (
            'GRANT INSERT ON public.recoleccion_movimiento TO conciliacion_escritor_heredado',
            'REVOKE INSERT ON public.recoleccion_movimiento FROM conciliacion_escritor_heredado',
            'INSERT heredado del ledger',
        ),
        (
            'GRANT UPDATE(fecha) ON public.recoleccion TO conciliacion_escritor_heredado',
            'REVOKE UPDATE(fecha) ON public.recoleccion FROM conciliacion_escritor_heredado',
            'UPDATE heredado por columna de captura',
        ),
    ):
        sql(otorgar)
        antes = sql(catalogo)
        sql(migracion, error='CONCILIACION_ESCRITURA_PUBLICA_RESIDUAL')
        check(sql(catalogo) == antes,
              f'097 revierte toda la instalación ante {etiqueta}, incluidas ACL y ventana de fecha')
        sql(retirar)
    sql("""
        REVOKE conciliacion_escritor_heredado FROM anon;
        DROP ROLE conciliacion_escritor_heredado;
    """)
    sql('REVOKE INSERT ON public.recoleccion_movimiento FROM service_role')
    antes = sql(catalogo)
    sql(migracion, error='CONCILIACION_PRIVILEGIO_SERVICIO_ALTERADO')
    check(sql(catalogo) == antes,
          '097 aborta si service_role depende de PUBLIC, restaura las ACL y no amplía permisos')
    sql('GRANT INSERT ON public.recoleccion_movimiento TO service_role')
    sql(migracion)
    check(sql("""
        SELECT array_agg(enumlabel ORDER BY enumsortorder)::text FROM pg_enum
        WHERE enumtypid='public.tipo_movimiento_recoleccion'::regtype
    """) == '{DESECHO,CONSUMO_A_VIVERO,CORRECCION,AJUSTE_MIGRACION}',
          '097 se instala conservando el enum ampliado y sin crear movimientos de esos tipos')
    check(sql("""
        SELECT jsonb_agg(jsonb_build_array(t,privilegio,
            has_table_privilege('service_role',t,privilegio)) ORDER BY t,privilegio)
        FROM unnest(ARRAY['public.recoleccion','public.recoleccion_movimiento']) t
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) privilegio
    """) == permisos_servicio,
          'El cierre de 097 conserva todos los permisos previos de service_role')
    check(sql("""
        SELECT count(*) FROM unnest(ARRAY['anon','authenticated','pa_int02b_public_probe']) rol
        CROSS JOIN unnest(ARRAY['public.recoleccion','public.recoleccion_movimiento']) tabla
        WHERE has_table_privilege(rol,tabla,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
            OR has_any_column_privilege(rol,tabla,'INSERT,UPDATE,REFERENCES')
            OR NOT has_table_privilege(rol,tabla,'SELECT')
    """) == '0',
          'Cierre efectivo a PUBLIC, anon y authenticated incluye ACL de columna y conserva SELECT')
    for rol in ('anon', 'authenticated', 'pa_int02b_public_probe'):
        for tabla in ('recoleccion', 'recoleccion_movimiento'):
            columna = 'fecha' if tabla == 'recoleccion' else 'delta'
            for operacion in (
                f'INSERT INTO public.{tabla} DEFAULT VALUES',
                f'UPDATE public.{tabla} SET {columna}={columna} WHERE false',
                f'DELETE FROM public.{tabla} WHERE false',
                f'TRUNCATE public.{tabla}',
            ):
                sql(f'SET ROLE {rol}; {operacion}', error='permission denied')
            sql(f'SET ROLE {rol}; SELECT count(*) FROM public.{tabla}')
    check(True, 'SQL real deniega las cuatro escrituras públicas en ambas tablas y mantiene su lectura')


def comprobar_conciliacion(
    *, sql, call, lit, check, race, assign, inicio, evento, entrega, today,
    lote_historico, asignacion_historica, postgis,
):
    auth = {
        1: 'fixture-admin',
        20: 'fixture-t2-operario',
        21: 'fixture-t2-m1',
        22: 'fixture-t2-ambos',
        24: 'fixture-t2-coordinador',
    }

    def comando(actor, payload, key=None):
        return (
            f"SELECT public.m2_conciliacion_ejecutar("
            f"{actor},'{auth[actor]}','{key or uuid.uuid4()}',{lit(payload)})"
        )

    def recuperar(actor, key):
        return call(
            f"SELECT public.m2_conciliacion_recuperar({actor},'{auth[actor]}','{key}')"
        )

    def ficha(origen, actor=20):
        return call(f'SELECT public.m2_conciliacion_leer({actor},{origen})')

    def padron(origen, revision='0', accion='INCLUIR'):
        return {
            'recoleccion_id': str(origen),
            'revision_esperada': revision,
            'accion': accion,
            'motivo': 'Padrón excepcional sintético para comprobación de remanente',
        }

    def evidencia(origen, actor):
        fotos = [{
            'ruta_archivo': f'conciliacion/pendientes/{actor}/{origen}/{uuid.uuid4()}.jpg',
            'mime_type': 'image/jpeg',
            'tamano_bytes': 20,
        }]
        return call(
            f'SELECT public.m2_conciliacion_evidencias_preparar({actor},{origen},{lit(fotos)})'
        )

    def recuento(origen, actor=20, cantidad=None, ids=None):
        detalle = ficha(origen, actor)
        return {
            'recoleccion_id': str(origen),
            'accion': 'CONCILIAR',
            'revision_esperada': detalle['revision'],
            'revision_captura_esperada': detalle['revision_captura'],
            'marca_movimientos': detalle['marca_movimientos'],
            'saldo_esperado': detalle['saldo_actual'],
            'cantidad_observada': detalle['saldo_actual'] if cantidad is None else cantidad,
            'unidad_observada': detalle['unidad_canonica'],
            'fecha_comprobacion': today,
            'evidencia_ids': evidencia(origen, actor) if ids is None else ids,
        }

    def resolver(actor, payload, estado='CONFIRMADO', key=None):
        result = call(comando(actor, payload, key))
        etiqueta = f"Conciliación {payload['accion']} {payload['recoleccion_id']}: {estado}"
        if result['body']['estado'] != estado:
            raise AssertionError(f'{etiqueta} ({result})')
        check(True, etiqueta)
        return result

    def origenes(pendientes=False):
        op = ',true' if pendientes else ''
        result = call(f'SELECT public.m2_origenes_leer(20,1,NULL,1,50{op})')
        return {item['recoleccion_id']: item for item in result['data']}

    def origen_sin_saldo(origen):
        return sql(f"""
            SELECT to_jsonb(r)-ARRAY['saldo_actual','estado_operativo']
              FROM public.recoleccion r WHERE r.id={origen}
        """)

    def bloquear(origen):
        sql(inicio(20, origen), error='RECEPCION_CONFORME_REQUERIDA', service=True)
        sql(f"""
            INSERT INTO public.recoleccion_movimiento
              (recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,motivo,created_by)
            VALUES ({origen},'DESECHO',-1,'G','DESECHO_OTRO',20);
        """, error='RECEPCION_CONFORME_REQUERIDA', service=True)

    check(sql('SELECT count(*) FROM public.recoleccion_conciliacion_evento') == '0',
          '097 se instala sin inscribir ni acreditar remanentes')
    check(sql("""
        SELECT count(*) FROM public.recoleccion_movimiento
        WHERE recoleccion_id=201 AND tipo_movimiento::text IN ('CORRECCION','AJUSTE_MIGRACION')
    """) == '0', 'El enum ampliado sin filas extra conserva el flujo ordinario del remanente')
    check('201' not in origenes() and '225' not in origenes(True)
          and origenes(True)['201']['estado_habilitacion'] == 'PENDIENTE_CONCILIACION'
          and origenes(True)['124']['estado_habilitacion'] == 'PENDIENTE_RECEPCION',
          'Orígenes mantiene selector estricto y distingue pendientes por custodia al solicitarlos')
    bloquear(201)
    resolver(20, padron(201), 'RECHAZADO')
    resolver(1, padron(124), 'RECHAZADO')
    resolver(1, padron(209), 'RECHAZADO')
    resolver(1, padron(201))
    lista_admin = call('SELECT public.m2_conciliacion_leer(1,NULL,NULL,2,2)')
    check(lista_admin['siguiente_antes_de_id'] == '226'
          and [item['recoleccion_id'] for item in lista_admin['data']]
          == ['9007199254741001', '226']
          and all(item['vivero_id'] == '2' for item in lista_admin['data']),
          'ADMIN pagina candidatos históricos por custodia con cursor BIGINT exacto')
    detalle = ficha(201)
    check(detalle['recoleccion_id'] == '201' and detalle['vivero_id'] == '1'
          and detalle['trazabilidad_conforme'] is True and detalle['en_padron'] is True
          and Decimal(detalle['cantidad_inicial']) == Decimal('100.0001')
          and Decimal(detalle['saldo_calculado']) == Decimal('95.0001')
          and Decimal(detalle['saldo_actual']) == Decimal('95.0001')
          and len(detalle['movimientos']) == 1
          and any(str(item.get('lote_vivero_id', item.get('id'))) == str(lote_historico)
                  for item in detalle['lotes'])
          and any(str(item.get('asignacion_id', item.get('id'))) == str(asignacion_historica)
                  for item in detalle['asignaciones']),
          'Ficha histórica reconcilia decimal exacto con referencias a consumo, lote y asignación')
    bloquear(201)

    # Retiro del acceso de la cuenta M2 y retiro excepcional del origen son operaciones independientes.
    sql('SELECT public.m2_conciliacion_leer(23,201)', error='CAPACIDAD_INSUFICIENTE', service=True)
    sql('SELECT public.m2_conciliacion_leer(20,225)', error='CAPACIDAD_INSUFICIENTE', service=True)
    sql('SELECT public.m2_conciliacion_leer(20,NULL)', error='CAPACIDAD_INSUFICIENTE', service=True)
    p = recuento(201)
    call(assign(21))
    p_autor = recuento(201, actor=21, ids=p['evidencia_ids'])
    check(resolver(21, p_autor, 'RECHAZADO')['http_status'] == 403,
          'El recolector sigue excluido aunque obtenga acceso M2')
    call(assign(21, op='RETIRAR'))
    check(resolver(22, p, 'RECHAZADO')['http_status'] in (403, 422),
          'Evidencia preparada por otro actor no respalda la comprobación')

    key = str(uuid.uuid4())
    original = origen_sin_saldo(201)
    historial = sql('SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id=201')
    recibido = resolver(20, p, key=key)
    check(call(comando(20, p, key)) == recibido
          and recuperar(20, key)['body'] == recibido['body']
          and recuperar(22, key)['http_status'] == 202
          and call(comando(20, dict(p, cantidad_observada='95'), key))['http_status'] == 409,
          'UUID idéntico recupera un único terminal y conflicto de intención no lo reemplaza')
    check(sql('SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=201') == '1'
          and sql('SELECT count(*) FROM public.recoleccion_recepcion WHERE recoleccion_id=201') == '0'
          and sql('SELECT count(*) FROM public.recoleccion_historial WHERE recoleccion_id=201') == historial
          and origen_sin_saldo(201) == original
          and origenes(True)['201']['estado_habilitacion'] == 'CONCILIACION_CONFORME',
          'La comprobación no acredita recepción total, ni modifica M1, ni crea créditos')

    nuevo = call(inicio(20, 201))
    lote = nuevo['lote_vivero_id']
    check(sql(f"""
        SELECT count(*) FROM public.recoleccion_movimiento m
          JOIN public.lote_vivero l ON l.id=m.lote_vivero_id AND l.recoleccion_id=m.recoleccion_id
          JOIN public.evento_lote_vivero e ON e.lote_id=l.id AND e.tipo_evento='INICIO'
        WHERE l.id={lote} AND m.recoleccion_id=201 AND m.tipo_movimiento='CONSUMO_A_VIVERO'
          AND -m.delta=l.cantidad_inicial_en_proceso AND -m.delta=e.cantidad_afectada
          AND m.unidad_medida_movimiento=l.unidad_medida_inicial
          AND m.unidad_medida_movimiento=e.unidad_medida_evento
    """) == '1'
          and sql('SELECT saldo_actual FROM public.recoleccion WHERE id=201') == '90.0001'
          and origen_sin_saldo(201) == original,
          'INICIO histórico vincula lote, evento y un solo débito exacto sin cambiar la fecha ni ficha')
    check('201' in origenes(), 'El débito legítimo no caduca la conformidad del remanente')
    sql(f"""
        INSERT INTO public.recoleccion_movimiento
          (recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,motivo,lote_vivero_id,created_by)
        VALUES (201,'CONSUMO_A_VIVERO',-5,'G','CONSUMO_PARA_VIVERO',{lote},20)
    """, error='VINCULO_CONSUMO_LOTE_INICIO_INCONSISTENTE', service=True)
    sql(inicio(1, 201, 2), error='custodia del vivero', service=True)
    sql("SELECT public.fn_recoleccion_registrar_desecho(201,1,20)", service=True)
    check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=201') == '89.0001',
          'DESECHO operativo legítimo usa la misma elegibilidad sin renovar la fecha M1')

    resolver(1, padron(202))
    p = recuento(202, cantidad='0')
    resolver(20, p, 'INCIDENCIA')
    bloquear(202)
    check(origenes(True)['202']['estado_habilitacion'] == 'INCIDENCIA_CONCILIACION'
          and sql('SELECT saldo_actual FROM public.recoleccion WHERE id=202') == '100'
          and sql('SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=202') == '0',
          'Diferencia física registra incidencia incluso con recuento cero y conserva saldo bloqueado')
    resolver(20, recuento(202))
    check(sql("SELECT count(*) FROM public.recoleccion_conciliacion_evento WHERE recoleccion_id=202") == '3',
          'La nueva comprobación conforme conserva la incidencia y sus hechos')
    sql('SELECT public.fn_recoleccion_registrar_desecho(202,100,20)', service=True)
    check('202' not in origenes(True)
          and sql("SELECT estado_operativo FROM public.recoleccion WHERE id=202") == 'CERRADO',
          'El remanente agotado desaparece de habilitados y pendientes')

    resolver(1, padron(203))
    desactualizado = recuento(203)
    # Simula un importador legado privilegiado. Cambia la identidad del movimiento
    # con el mismo delta, sin alterar saldo materializado ni revisión de captura.
    sql("""
        BEGIN;
        ALTER TABLE public.recoleccion_movimiento DISABLE TRIGGER recepcion_exigida;
        DELETE FROM public.recoleccion_movimiento WHERE recoleccion_id=203;
        INSERT INTO public.recoleccion_movimiento
          (recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,motivo,created_by)
        VALUES (203,'DESECHO',-10,'G','DESECHO_OTRO',20);
        ALTER TABLE public.recoleccion_movimiento ENABLE TRIGGER recepcion_exigida;
        COMMIT;
    """)
    actual = ficha(203)
    check(actual['revision_captura'] == desactualizado['revision_captura_esperada']
          and actual['saldo_actual'] == desactualizado['saldo_esperado']
          and actual['marca_movimientos'] != desactualizado['marca_movimientos']
          and resolver(20, desactualizado, 'RECHAZADO')['body']['error']['codigo'] == 'RECUENTO_OBSOLETO',
          'Una marca distinta invalida el recuento aunque revisión de captura y saldo coincidan')
    resolver(20, recuento(203))

    resolver(1, padron(208))
    check(ficha(208)['trazabilidad_conforme'] is False,
          'Un consumo sin lote queda visible como inconsistencia de trazabilidad')
    resolver(20, recuento(208), 'INCIDENCIA')
    bloquear(208)
    check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=208') == '90',
          'Una trazabilidad inconsistente bloquea aunque la cantidad física coincida')

    for origen in (204, 205, 206, 207):
        resolver(1, padron(origen))
    p = recuento(204, actor=24)
    out = race(assign(24, op='RETIRAR'), comando(24, p), 'retiro_m2_antes_conciliacion')
    check(json.loads(out)['http_status'] == 403,
          'Retiro M2 que toma el lock primero invalida la comprobación en curso')
    call(assign(24))
    p = recuento(205, actor=24)
    key = str(uuid.uuid4())
    race(comando(24, p, key), assign(24, op='RETIRAR'), 'conciliacion_antes_retiro_m2')
    check(recuperar(24, key)['body']['estado'] == 'CONFIRMADO'
          and '205' in origenes(),
          'Comprobación confirmada antes del retiro conserva hecho y recibo propio')
    call(assign(24))
    a = recuento(206)
    b = recuento(206, actor=22)
    out = race(comando(20, a), comando(22, b), 'dos_conciliadores')
    check(json.loads(out)['http_status'] == 409
          and sql("SELECT count(*) FROM public.recoleccion_conciliacion_evento WHERE recoleccion_id=206 AND accion='CONCILIAR'") == '1',
          'Dos recuentos de la misma revisión confirman como máximo una comprobación')
    p = recuento(207)
    out = race(comando(1, padron(207, p['revision_esperada'], 'RETIRAR')),
               comando(20, p), 'retiro_padron_antes_conciliacion')
    check(json.loads(out)['http_status'] == 409 and '207' not in origenes(),
          'Retiro de padrón en carrera deja obsoleto el recuento preparado')
    race(comando(1, padron(205, ficha(205)['revision'], 'RETIRAR')),
         inicio(20, 205), 'retiro_padron_antes_inicio',
         expected_error='RECEPCION_CONFORME_REQUERIDA')
    check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=205') == '100'
          and sql('SELECT count(*) FROM public.lote_vivero WHERE recoleccion_id=205') == '0',
          'Retiro de padrón que toma el lock primero detiene INICIO sin crear lote ni débito')
    bloquear(205)
    resolver(1, padron(205, ficha(205)['revision']))
    bloquear(205)
    resolver(20, recuento(205))
    check('205' in origenes(), 'Reincluir un origen exige una comprobación física nueva')

    resolver(1, padron(212))
    p = recuento(212)
    key = str(uuid.uuid4())
    sql("""
        CREATE TRIGGER t4_fallar BEFORE INSERT ON public.recoleccion_conciliacion_comando
          FOR EACH ROW EXECUTE FUNCTION public.t4_fallar()
    """)
    sql(comando(20, p, key), error='FALLO_T4', service=True)
    check(recuperar(20, key)['http_status'] == 202 and ficha(212)['revision'] == '1'
          and sql(f"SELECT entidad_id FROM public.evidencias_trazabilidad WHERE id={p['evidencia_ids'][0]}") == '0',
          'Fallo del terminal revierte la revisión, el hecho y el vínculo de evidencia')
    sql('DROP TRIGGER t4_fallar ON public.recoleccion_conciliacion_comando')
    resolver(20, p, key=key)

    resolver(1, padron(213))
    p = recuento(213)
    out = race(comando(20, p), inicio(20, 213), 'conciliacion_antes_inicio')
    check(json.loads(out)['saldo_recoleccion_despues'] == 95
          and sql('SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=213') == '1',
          'INICIO concurrente espera la conformidad y debita una sola vez')

    grande = 9007199254741000
    resolver(1, padron(grande))
    resolver(20, recuento(grande))
    check(str(grande) in origenes() and str(grande+1) not in origenes(True)
          and ficha(grande)['recoleccion_id'] == str(grande),
          'La conciliación conserva BIGINT exactos y separa orígenes adyacentes de otra custodia')

    resolver(1, padron(214))
    resolver(20, recuento(214))
    # Ensayo de un escritor privilegiado: una revisión de la ficha posterior
    # a la conformidad vuelve a exigir cotejo, aunque el saldo no haya variado.
    sql('UPDATE public.recoleccion SET revision_captura=revision_captura+1 WHERE id=214')
    invalidada = ficha(214)
    check(invalidada['estado'] == 'PENDIENTE' and invalidada['puede_conciliar'] is True
          and invalidada['historial'][-1]['estado'] == 'CONFORME'
          and origenes(True)['214']['estado_habilitacion'] == 'PENDIENTE_CONCILIACION',
          'Una revisión nueva vuelve pendiente la conciliación y conserva la conformidad histórica')
    bloquear(214)
    resolver(20, recuento(214))

    movimientos_excepcionales = (
        ('CORRECCION', -10),
        ('CORRECCION', 10),
        ('AJUSTE_MIGRACION', -10),
        ('AJUSTE_MIGRACION', 10),
    )
    for origen, (tipo, delta) in enumerate(movimientos_excepcionales, start=227):
        resolver(1, padron(origen))
        excepcional = ficha(origen)
        check(Decimal(excepcional['saldo_actual']) == Decimal(100+delta)
              and excepcional['saldo_actual'] == excepcional['saldo_calculado']
              and excepcional['movimientos'][0]['tipo'] == tipo
              and Decimal(excepcional['movimientos'][0]['delta']) == Decimal(delta)
              and 'MOVIMIENTO_INCONSISTENTE' in excepcional['inconsistencias']
              and excepcional['trazabilidad_conforme'] is False,
              f'Ficha conserva {tipo} con delta {delta}, suma su cantidad y señala incompatibilidad')
        resolver(20, recuento(origen), 'INCIDENCIA')
        bloquear(origen)
        check(sql(f'SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id={origen}') == '1'
              and sql(f'SELECT saldo_actual FROM public.recoleccion WHERE id={origen}') == str(100+delta),
              f'Conciliar {tipo} con delta {delta} conserva el ledger y el saldo bloqueado')

    for origen, (tipo, delta) in enumerate(movimientos_excepcionales, start=231):
        resolver(1, padron(origen))
        resolver(20, recuento(origen))
        conforme = ficha(origen)
        sql(f"""
            INSERT INTO public.recoleccion_movimiento
              (recoleccion_id,tipo_movimiento,delta,unidad_medida_movimiento,motivo,created_by)
            VALUES ({origen},'{tipo}',{delta},'G','DESECHO_OTRO',20)
        """, service=True)
        posterior = ficha(origen)
        check(posterior['revision_captura'] == conforme['revision_captura']
              and posterior['revision'] == conforme['revision']
              and posterior['marca_movimientos'] != conforme['marca_movimientos']
              and posterior['saldo_actual'] == posterior['saldo_calculado'] == str(100+delta)
              and posterior['estado'] == 'PENDIENTE'
              and posterior['historial'][-1]['estado'] == 'CONFORME'
              and str(origen) not in origenes()
              and origenes(True)[str(origen)]['estado_habilitacion'] == 'PENDIENTE_CONCILIACION',
              f'{tipo} posterior con delta {delta} invalida conformidad sin alterar revisión o historia')
        bloquear(origen)
        obsoleto = dict(recuento(origen), marca_movimientos=conforme['marca_movimientos'])
        check(resolver(20, obsoleto, 'RECHAZADO')['body']['error']['codigo'] == 'RECUENTO_OBSOLETO',
              f'La marca detecta {tipo} posterior con delta {delta} antes de vincular evidencia')
        resolver(20, recuento(origen), 'INCIDENCIA')

    fecha_t4 = sql('SELECT fecha FROM public.recoleccion WHERE id=209')
    check('209' in origenes(), 'Una recepción T4 conforme permanece elegible al envejecer')
    call(inicio(20, 209))
    check(sql("SELECT fecha || ':' || saldo_actual FROM public.recoleccion WHERE id=209") == fecha_t4+':95',
          'El consumo ordinario sobre la recepción T4 envejecida debita sin retocar la fecha')
    call(inicio(1, 209, 2))
    check(sql('SELECT saldo_actual FROM public.recoleccion WHERE id=209') == '90',
          'ADMIN conserva el destino distinto para una recepción ordinaria T4')
    sql("UPDATE public.recoleccion SET observaciones='Edición indebida' WHERE id=209",
        error='Fecha fuera de rango')
    sql("UPDATE public.recoleccion SET saldo_actual=96 WHERE id=209", error='Fecha fuera de rango')
    sql("UPDATE public.recoleccion SET estado_registro='VALIDADO' WHERE id=210", error='Fecha fuera de rango')
    sql("UPDATE public.recoleccion SET observaciones='Edición indebida' WHERE id=210",
        error='Fecha fuera de rango')
    sql("""
        INSERT INTO public.recoleccion(id,usuario_id,fecha,codigo_trazabilidad,
            tipo_material,unidad_canonica,cantidad_inicial_canonica)
        VALUES (299,21,CURRENT_DATE-70,'FICHA-FUERA-VENTANA','SEMILLA','G',100)
    """, error='Fecha fuera de rango')
    sql("SELECT public.fn_recoleccion_rechazar_validacion(211,22,'Rechazo sintético antiguo')",
        service=True)
    check(sql("SELECT estado_registro FROM public.recoleccion WHERE id=211") == 'RECHAZADO',
          'La ventana sigue cerrada para captura, edición y aprobación y conserva el rechazo antiguo')

    sql('DELETE FROM public.recoleccion_conciliacion_evento', error='append-only')
    sql('SELECT * FROM public.recoleccion_conciliacion_evento', error='permission denied', service=True)
    check(sql("""
        SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND (p.proname LIKE 'm2_conciliacion_%' OR p.proname='m2_origenes_leer')
        AND (has_function_privilege('anon',p.oid,'EXECUTE')
          OR has_function_privilege('authenticated',p.oid,'EXECUTE'))
    """) == '0', 'Padrón, ficha, evidencias y recibos quedan privados e inmutables')

    if postgis:
        call(evento(20, lote, 'EMBOLSADO', qty=30))
        asignacion = call(entrega(24, lote, 61, proposito='REPOSICION'))['asignacion_id']
        ev = sql("""
            INSERT INTO public.evidencias_trazabilidad
              (tipo_entidad_id,entidad_id,bucket,ruta_archivo,tipo_archivo,mime_type,creado_por_usuario_id,metadata)
            VALUES (4,0,'participacion_evidencias','plantacion-conciliacion.jpg','FOTO','image/jpeg',
              21,jsonb_build_object('subcampania_id','61','proposito','REPOSICION'))
            RETURNING id
        """)
        vivo = sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}')
        saldo = sql('SELECT saldo_actual FROM public.recoleccion WHERE id=201')
        detalle = lit([{'asignacion_id': asignacion, 'lote_vivero_id': lote, 'planta_id': 1, 'cantidad': 1}])
        resultado = call(f"""
            SELECT to_jsonb(x) FROM public.fn_m3_registrar_plantacion(
                61,true,4000,CURRENT_DATE,21,-16.5,-68.1,NULL,ARRAY[]::bigint[],
                {detalle},ARRAY[{ev}]::bigint[]) x
        """)
        check(resultado['gps_dentro_poligono']
              and sql(f'SELECT cantidad_consumida FROM public.asignacion_vivero_subcampania WHERE id={asignacion}') == '1'
              and sql(f'SELECT saldo_vivo_actual FROM public.lote_vivero WHERE id={lote}') == vivo
              and sql('SELECT saldo_actual FROM public.recoleccion WHERE id=201') == saldo,
              'M3 y PostGIS consumen una sola asignación de un lote conciliado sin segundo débito M1/M2')

    ids_altos = {
        'lote_vivero': '9007199254741002',
        'evento_lote_vivero': '9007199254741003',
        'recoleccion_movimiento': '9007199254741004',
    }
    for tabla, identificador in ids_altos.items():
        sql(f"SELECT setval(pg_get_serial_sequence('public.{tabla}','id'),{identificador},false)")
    alta = call(inicio(20, grande, exacto=True))
    check(alta['lote_vivero_id'] == ids_altos['lote_vivero']
          and alta['evento_inicio_id'] == ids_altos['evento_lote_vivero']
          and alta['recoleccion_movimiento_id'] == ids_altos['recoleccion_movimiento'],
          'La RPC de alta serializa IDs BIGINT exactos de lote, evento y movimiento')


def comprobar_requisitos_inicio(*, sql, call, check, inicio):
    def leer(origen='NULL', *, args=',true,true', actor=20, vivero=1):
        return call(f'SELECT public.m2_origenes_leer({actor},{vivero},{origen},1,20{args})')

    anterior = leer(args=',true')
    nuevo = leer()
    check(nuevo['pagination'] == anterior['pagination'] and [
        {k: v for k, v in fila.items() if k not in ('saldo_actual_exacto', 'motivo_no_inicio')}
        for fila in nuevo['data']
    ] == anterior['data'], '099 conserva página, orden, total y proyección previa')
    check(leer(args=',true,false') == anterior and leer(args=',false,false') == leer(args=''),
          'El overload de 099 conserva los contratos 5/6 si no se piden requisitos')
    sql('SELECT public.m2_origenes_leer(20,1,NULL,1,20,false,true)',
        error='requiere incluir_pendientes', service=True)
    sql('SELECT public.m2_origenes_leer(20,2,NULL,1,20,true,true)',
        error='CAPACIDAD_INSUFICIENTE', service=True)
    for rol in ('anon', 'authenticated'):
        sql(f'SET ROLE {rol}; SELECT public.m2_origenes_leer(20,1,NULL,1,20,true,true)',
            error='permission denied')
    sql("SELECT public.m2_origen_motivo_no_inicio(NULL,'RECEPCION_CONFORME',1)",
        error='permission denied', service=True)
    check(True, '099 exige opt-in físico y autorización de custodia con RPC privada')

    t4 = leer(100)['data'][0]
    check(t4['estado_habilitacion'] == 'RECEPCION_CONFORME' and t4['motivo_no_inicio'] is None,
          'T4 ordinaria completa conserva disponibilidad para INICIO')
    for origen, estado in ((124, 'PENDIENTE_RECEPCION'), (208, 'INCIDENCIA_CONCILIACION')):
        fila = leer(origen)['data'][0]
        check(fila['estado_habilitacion'] == estado and isinstance(fila['motivo_no_inicio'], str),
              f'{estado} se muestra con motivo y sin habilitar INICIO')

    snapshot = sql('SELECT nombre_cientifico_snapshot FROM public.recoleccion WHERE id=100')
    sql('UPDATE public.recoleccion SET nombre_cientifico_snapshot=NULL WHERE id=100')
    bloqueada = leer(100)['data'][0]
    check(bloqueada['estado_habilitacion'] == 'RECEPCION_CONFORME'
          and 'Faltan datos históricos' in bloqueada['motivo_no_inicio'],
          'Una recepción conforme con ficha incompleta sigue visible, pero no se ofrece en INICIO')
    antes = sql('SELECT jsonb_build_array(saldo_actual, (SELECT count(*) FROM public.lote_vivero WHERE recoleccion_id=100),'
                ' (SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=100)) FROM public.recoleccion WHERE id=100')
    sql(inicio(20, 100), error='no tiene nombre_cientifico_snapshot', service=True)
    despues = sql('SELECT jsonb_build_array(saldo_actual, (SELECT count(*) FROM public.lote_vivero WHERE recoleccion_id=100),'
                  ' (SELECT count(*) FROM public.recoleccion_movimiento WHERE recoleccion_id=100)) FROM public.recoleccion WHERE id=100')
    check(antes == despues, 'INICIO comprueba de nuevo la ficha sin persistir lote ni débito al rechazar')
    sql('SELECT public.fn_recoleccion_registrar_desecho(100,1,20)', service=True)
    check(Decimal(leer(100)['data'][0]['saldo_actual_exacto']) == Decimal(t4['saldo_actual_exacto']) - 1,
          'El requisito específico de INICIO no bloquea DESECHO sobre material recibido')
    snapshot_sql = snapshot.replace("'", "''")
    sql(f"UPDATE public.recoleccion SET nombre_cientifico_snapshot='{snapshot_sql}' WHERE id=100")

    saldo = sql('SELECT saldo_actual FROM public.recoleccion WHERE id=101')
    sql('UPDATE public.recoleccion SET saldo_actual=9007199254740993.123456 WHERE id=101')
    check(leer(101)['data'][0]['saldo_actual_exacto'] == '9007199254740993.123456',
          '099 serializa el saldo exacto como texto antes de convertir el JSON para la PWA')
    sql('UPDATE public.recoleccion SET saldo_actual=0.0000001 WHERE id=101')
    fila = leer(101)['data'][0]
    check(fila['saldo_actual_exacto'] == '0.0000001' and 'cantidad mínima' in fila['motivo_no_inicio'],
          'Un saldo residual menor al paso de seis decimales permanece visible pero no habilita INICIO')
    sql(f'UPDATE public.recoleccion SET saldo_actual={saldo} WHERE id=101')
