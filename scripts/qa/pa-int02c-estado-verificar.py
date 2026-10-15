#!/usr/bin/env python3
"""Coteja archivos del estado SQL C sin conectarse a PostgreSQL ni leer .env.

El ref y el entorno son contexto aportado: current_database() no identifica un
proyecto Supabase. Ni siquiera un cotejo correcto acredita por sí solo su origen.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = [
    'migrations/072_pa_int02c_comandos_acceso.sql',
    'migrations/073_pa_int02c_lecturas.sql',
]
DEVELOPMENT_REF = 'vyrjlehkhabydkhjxagx'
LOCAL_REF = 'SINTETICO_AISLADO_INT02C'
TABLES = {'participacion_comando', 'subcampania_permiso_revision',
          'subcampania_permiso', 'subcampania_historial', 'usuario_autoridad_historial'}
ROLES = {'anon', 'authenticated', 'service_role'}
PRIVILEGES = {'select', 'insert', 'update', 'references', 'delete', 'truncate', 'trigger'}
APPEND_ONLY = {'subcampania_historial', 'usuario_autoridad_historial'}
LIMITS = [
    'Solo cotejo de un archivo local; ref/entorno aportados no prueban su origen remoto.',
    'Fotografía posterior: no acredita conservación de datos reales antes/después.',
    'No ejecuta RPC ni comandos, ni acredita despliegue backend/frontend o integración INT03-A/INT02-D.',
    'La consulta no incluye MAINTAIN, otros definers ni todas las relaciones externas al alcance C.',
]


def normalize_type(value):
    value = re.sub(r'\bpublic\.', '', value.strip().lower())
    return {'timestamptz': 'timestamp with time zone', 'int': 'integer',
            'int8': 'bigint', 'bool': 'boolean'}.get(value, value)


def normalize_signature(value):
    match = re.fullmatch(r'(?:public\.)?([a-z_]+)\((.*)\)', value.strip())
    if not match:
        raise ValueError('firma no reconocida')
    return match[1] + '(' + ','.join(normalize_type(t) for t in match[2].split(',') if t.strip()) + ')'


def expected_functions(root=ROOT):
    functions = {}
    pattern = re.compile(
        r'CREATE OR REPLACE FUNCTION\s+public\.([a-z_]+)\s*\((.*?)\)\s*'
        r'(.*?)\bAS\s+(\$\$)(.*?)\4;', re.S | re.I)
    for migration in MIGRATIONS:
        for name, arguments, header, _delimiter, body in pattern.findall((root / migration).read_text()):
            types = []
            for argument in arguments.split(','):
                declaration = re.split(r'\s+DEFAULT\s+', argument.strip(), flags=re.I)[0]
                types.append(normalize_type(declaration.split(None, 1)[1]))
            signature = name + '(' + ','.join(types) + ')'
            if signature in functions:
                raise ValueError('firma local duplicada')
            functions[signature] = {
                'md5_cuerpo': hashlib.md5(body.encode('utf-8')).hexdigest(),
                'volatilidad': 'i' if re.search(r'\bIMMUTABLE\b', header, re.I) else
                               's' if re.search(r'\bSTABLE\b', header, re.I) else 'v',
            }
    if len(functions) != 18:
        raise ValueError('inventario local C incompleto')
    return functions


def verify(evidence, *, entorno, project_ref=None, root=ROOT):
    deviations = []
    counts = {}

    def check(condition, code, location):
        if not condition:
            # Nunca copiar valores de la evidencia: podrían contener personas o secretos.
            deviations.append({'codigo': code, 'ubicacion': location})

    def records(container, field):
        value = container.get(field)
        if not isinstance(value, list) or not all(isinstance(row, dict) for row in value):
            check(False, 'SECCION_INVALIDA', field)
            return []
        return value

    def indexed(rows, fields, location):
        result = {}
        for row in rows:
            key = tuple(row.get(field) for field in fields)
            if not all(isinstance(part, str) for part in key) or key in result:
                check(False, 'CLAVE_INVALIDA_O_DUPLICADA', location)
                continue
            result[key] = row
        return result

    wrapper = isinstance(evidence, dict) and 'estado' in evidence
    if not isinstance(evidence, dict):
        evidence = {}
        check(False, 'EVIDENCIA_INVALIDA', 'evidencia')
    if wrapper:
        state = evidence.get('estado')
        supplied_ref = evidence.get('proyecto')
        check(evidence.get('migraciones') == ['072', '073'], 'MIGRACIONES_NO_CORRESPONDEN', 'migraciones')
        check(project_ref is None or project_ref == supplied_ref, 'REF_NO_COINCIDE', 'proyecto')
        stated_environment = evidence.get('entorno')
        if stated_environment is not None:
            check(stated_environment == entorno, 'ENTORNO_NO_COINCIDE', 'entorno')
    else:
        state = evidence
        supplied_ref = project_ref
        check(bool(project_ref), 'REF_EXPLICITO_REQUERIDO', 'proyecto')
    expected_ref = LOCAL_REF if entorno == 'SINTETICO_LOCAL' else DEVELOPMENT_REF
    check(supplied_ref == expected_ref, 'PROYECTO_NO_CORRESPONDE', 'proyecto')
    if not isinstance(state, dict):
        state = {}
        check(False, 'ESTADO_INVALIDO', 'estado')
    base = state.get('base')
    if entorno == 'DESARROLLO':
        check(isinstance(base, str) and base not in ('pa_int02c_ensayo', 'pa_int02b_ensayo')
              and 'sintet' not in base.lower() and 'fixture' not in base.lower(),
              'BASE_LOCAL_NO_ES_DESARROLLO', 'base')
    else:
        check(base == 'pa_int02c_ensayo', 'BASE_LOCAL_NO_CORRESPONDE', 'base')
    check(state.get('solo_lectura') == 'on', 'TRANSACCION_NO_ES_SOLO_LECTURA', 'solo_lectura')
    locale = state.get('locale') if isinstance(state.get('locale'), dict) else {}
    check(locale.get('server_encoding') == 'UTF8' and locale.get('normalizacion_unicode_correcta') is True,
          'NORMALIZACION_UTF8_INCOMPATIBLE', 'locale')

    roles = indexed(records(state, 'roles_api'), ['rol'], 'roles_api')
    check(set(roles) == {(role,) for role in ROLES}, 'ROLES_INCOMPLETOS', 'roles_api')
    for role in ('anon', 'authenticated'):
        check(roles.get((role,), {}).get('bypass_rls') is False, 'ROL_PUBLICO_OMITE_RLS', 'roles_api')
    check(roles.get(('service_role',), {}).get('bypass_rls') is True, 'SERVICIO_SIN_BYPASS_RLS', 'roles_api')

    relations = indexed(records(state, 'relaciones'), ['nombre'], 'relaciones')
    check(set(relations) == {(table,) for table in TABLES}, 'RELACIONES_NO_CORRESPONDEN', 'relaciones')
    for table in TABLES - {'subcampania_historial'}:
        check(relations.get((table,), {}).get('rls') is True, 'RLS_REQUERIDA', table)
    counts['relaciones'] = len(relations)

    privileges = indexed(records(state, 'privilegios'), ['rol', 'tabla'], 'privilegios')
    check(set(privileges) == {(role, table) for role in ROLES for table in TABLES},
          'PRIVILEGIOS_INCOMPLETOS', 'privilegios')
    for (role, table), row in privileges.items():
        expected = {'select', 'insert'} | ({'update'} if table not in APPEND_ONLY else set()) if role == 'service_role' else set()
        check(all(row.get(privilege) is (privilege in expected) for privilege in PRIVILEGES),
              'ACL_TABLA_INCOMPATIBLE', 'privilegios')
    counts['combinaciones_acl'] = len(privileges)

    expected = expected_functions(root)
    functions = {}
    for row in records(state, 'funciones'):
        try:
            signature = normalize_signature(row.get('firma', ''))
        except (ValueError, AttributeError):
            check(False, 'FIRMA_INVALIDA', 'funciones')
            continue
        check(signature not in functions, 'FIRMA_DUPLICADA', 'funciones')
        functions[signature] = row
    check(set(functions) == set(expected), 'FIRMAS_O_SOBRECARGAS_NO_CORRESPONDEN', 'funciones')
    for signature in set(expected) & set(functions):
        row = functions[signature]
        check(row.get('md5_cuerpo') == expected[signature]['md5_cuerpo'], 'HUELLA_FUNCION_NO_COINCIDE', signature)
        check(row.get('security_definer') is False and row.get('configuracion') == ['search_path=pg_catalog, public']
              and row.get('volatilidad') == expected[signature]['volatilidad'],
              'CONFIGURACION_FUNCION_INCOMPATIBLE', signature)
        check(row.get('anon_ejecuta') is False and row.get('authenticated_ejecuta') is False
              and row.get('service_role_ejecuta') is True, 'ACL_FUNCION_INCOMPATIBLE', signature)
    counts['huellas_funciones'] = len(expected)

    constraints = indexed(records(state, 'restricciones'), ['tabla', 'nombre'], 'restricciones')
    check(bool(constraints) and all(row.get('validada') is True for row in constraints.values()),
          'RESTRICCION_NO_VALIDADA', 'restricciones')
    required_constraints = {
        ('participacion_comando', name) for name in ['participacion_comando_pkey', 'participacion_comando_identidad_uq',
            'participacion_comando_id_actor_uq', 'participacion_comando_ciclo_ck', 'participacion_comando_huella_ck',
            'participacion_comando_operacion_ck', 'participacion_comando_estado_ck']
    } | {('subcampania_permiso', name) for name in ['subcampania_permiso_pkey', 'subcampania_permiso_revision_fk',
        'subcampania_permiso_retiro_chk', 'subcampania_permiso_rol_contextual_check']}
    required_constraints |= {('subcampania_permiso_revision', 'subcampania_permiso_revision_pkey'),
        ('subcampania_permiso_revision', 'subcampania_permiso_revision_revision_check'),
        ('subcampania_historial', 'subcampania_historial_acceso_chk')}
    check(required_constraints <= set(constraints), 'RESTRICCIONES_REQUERIDAS_AUSENTES', 'restricciones')
    foreign_keys = []
    audit_checks = []
    for (table, name), row in constraints.items():
        definition = row.get('definicion', '')
        if not isinstance(definition, str):
            check(False, 'DEFINICION_RESTRICCION_INVALIDA', 'restricciones')
            continue
        if definition.startswith('FOREIGN KEY') and (table != 'subcampania_historial' or 'comando' in name):
            foreign_keys.append((table, definition))
            check('ON UPDATE RESTRICT ON DELETE RESTRICT' in definition, 'FK_NUEVA_NO_RESTRICT', table)
        if table == 'usuario_autoridad_historial':
            audit_checks.append(definition)
    expected_fk_counts = {'participacion_comando': 3, 'subcampania_permiso_revision': 3,
                          'subcampania_permiso': 9, 'subcampania_historial': 2, 'usuario_autoridad_historial': 4}
    check(all(sum(table == fk_table for fk_table, _ in foreign_keys) == count
              for table, count in expected_fk_counts.items()), 'FK_NUEVAS_INCOMPLETAS', 'restricciones')
    audit_fk_expected = {
        'foreignkey(comando_id)referencesparticipacion_comando(id)onupdaterestrictondeleterestrict',
        'foreignkey(usuario_id)referencesusuario(id)onupdaterestrictondeleterestrict',
        'foreignkey(actor_id)referencesusuario(id)onupdaterestrictondeleterestrict',
        'foreignkey(comando_id,actor_id)referencesparticipacion_comando(id,actor_id)onupdaterestrictondeleterestrict',
    }
    audit_fk_observed = {re.sub(r'\s+', '', definition.lower().replace('public.', ''))
                         for table, definition in foreign_keys if table == 'usuario_autoridad_historial'}
    check(audit_fk_observed == audit_fk_expected, 'FK_AUDITORIA_NO_CORRESPONDEN', 'usuario_autoridad_historial')
    check(any(value == 'PRIMARY KEY (id)' for value in audit_checks)
          and any(value == 'UNIQUE (comando_id, usuario_id)' for value in audit_checks)
          and sum(value.startswith('CHECK') for value in audit_checks) == 5,
          'RESTRICCIONES_AUDITORIA_INCOMPLETAS', 'usuario_autoridad_historial')
    counts.update(restricciones=len(constraints), fk_nuevas_restrict=len(foreign_keys))

    columns = indexed(records(state, 'columnas'), ['tabla', 'columna'], 'columnas')
    audit_types = {'id': 'bigint', 'comando_id': 'bigint', 'usuario_id': 'bigint', 'actor_id': 'bigint',
                   'evento': 'text', 'rol_anterior': 'rol_usuario', 'rol_nuevo': 'rol_usuario',
                   'activo_anterior': 'boolean', 'activo_nuevo': 'boolean', 'revision_anterior': 'bigint',
                   'revision_nueva': 'bigint', 'motivo': 'text', 'creado_en': 'timestamp with time zone'}
    for column, kind in audit_types.items():
        row = columns.get(('usuario_autoridad_historial', column), {})
        check(normalize_type(str(row.get('tipo', ''))) == kind and row.get('not_null') is True
              and row.get('generated') == '' and row.get('identity') == ('d' if column == 'id' else ''),
              'COLUMNA_AUDITORIA_INCOMPATIBLE', 'usuario_autoridad_historial.' + column)

    policies = records(state, 'politicas')
    check(all(row.get('public_o_api_publica') is False for row in policies), 'POLITICA_PUBLICA', 'politicas')
    check(records(state, 'vistas_publicas_dependientes') == [], 'VISTA_PRIVADA_PUBLICA', 'vistas_publicas_dependientes')
    sequences = indexed(records(state, 'secuencias'), ['nombre', 'rol'], 'secuencias')
    sequence_names = {'participacion_comando_id_seq', 'subcampania_permiso_id_seq',
                      'subcampania_historial_id_seq', 'usuario_autoridad_historial_id_seq'}
    check(set(sequences) == {(name, role) for name in sequence_names for role in ROLES},
          'SECUENCIAS_INCOMPLETAS', 'secuencias')
    for (name, role), row in sequences.items():
        check(row.get('usage') is (role == 'service_role') and row.get('update') is False
              and row.get('select') is (role == 'service_role' and name in
                  {'subcampania_permiso_id_seq', 'subcampania_historial_id_seq'}),
              'ACL_SECUENCIA_INCOMPATIBLE', 'secuencias')

    indexes = indexed(records(state, 'indices'), ['tabla', 'nombre'], 'indices')
    check(bool(indexes) and all(row.get('valido') is True and row.get('listo') is True for row in indexes.values()),
          'INDICE_INVALIDO_O_NO_LISTO', 'indices')
    required_indexes = {
        'participacion_comando': ['participacion_comando_actor_fecha_idx', 'participacion_comando_preparado_fecha_idx',
                                 'participacion_comando_inicial_registro_uq'],
        'subcampania_permiso_revision': ['subcampania_permiso_revision_usuario_idx'],
        'subcampania_permiso': ['subcampania_permiso_un_vigente_idx', 'subcampania_permiso_administradores_idx',
                              'subcampania_permiso_usuario_vigente_idx'],
        'subcampania_historial': ['subcampania_historial_comando_acceso_idx'],
        'usuario_autoridad_historial': ['usuario_autoridad_historial_usuario_fecha_idx'],
        'usuario': ['usuario_correo_normalizado_pa_idx', 'usuario_nombre_normalizado_pa_idx'],
    }
    check(all((table, name) in indexes for table, names in required_indexes.items() for name in names),
          'INDICE_REQUERIDO_AUSENTE', 'indices')
    for name, terms in {
        'usuario_correo_normalizado_pa_idx': ['lower(btrim(correo))', 'WHERE activo'],
        'usuario_nombre_normalizado_pa_idx': ['lower(', 'normalize(', 'btrim(nombre)', 'btrim(username)', 'NFC', 'WHERE activo'],
    }.items():
        row = indexes.get(('usuario', name), {})
        check(row.get('unico') is False and isinstance(row.get('definicion'), str)
              and all(term.lower() in row.get('definicion', '').lower() for term in terms),
              'INDICE_NORMALIZACION_INCOMPATIBLE', name)
    audit_index = indexes.get(('usuario_autoridad_historial', 'usuario_autoridad_historial_usuario_fecha_idx'), {})
    check(audit_index.get('unico') is False and isinstance(audit_index.get('definicion'), str)
          and '(usuario_id, creado_en, id)' in audit_index.get('definicion', ''),
          'INDICE_AUDITORIA_INCOMPATIBLE', 'usuario_autoridad_historial')
    counts['indices'] = len(indexes)

    triggers = indexed(records(state, 'triggers'), ['tabla', 'nombre'], 'triggers')
    required_triggers = {
        ('participacion_comando', 'participacion_comando_proteger_fila_trg'): 'pa_participacion_comando_proteger()',
        ('participacion_comando', 'participacion_comando_proteger_truncate_trg'): 'pa_participacion_comando_proteger()',
        ('subcampania_permiso_revision', 'pa_permiso_revision_proteger'): 'pa_permiso_revision_proteger()',
        ('subcampania_permiso_revision', 'pa_permiso_revision_no_truncate'): 'pa_permiso_revision_proteger()',
        ('subcampania_permiso', 'pa_permiso_vigencia_proteger'): 'pa_permiso_vigencia_proteger()',
        ('subcampania_permiso', 'pa_permiso_vigencia_no_truncate'): 'pa_permiso_vigencia_proteger()',
        ('subcampania_historial', 'subcampania_historial_prevent_mutation_trg'): 'fn_subcampania_historial_prevent_mutation()',
        ('usuario_autoridad_historial', 'usuario_autoridad_historial_inmutable'): 'fn_subcampania_historial_prevent_mutation()',
    }
    check(set(required_triggers) <= set(triggers), 'TRIGGER_REQUERIDO_AUSENTE', 'triggers')
    for key, function in required_triggers.items():
        row = triggers.get(key, {})
        check(row.get('habilitado') in ('O', 'A') and row.get('funcion', '').removeprefix('public.') == function,
              'TRIGGER_INACTIVO_O_INCOMPATIBLE', key[0])
    counts['triggers'] = len(triggers)

    aggregates = state.get('agregados') if isinstance(state.get('agregados'), dict) else {}
    aggregate_names = {'usuarios', 'administradores_globales_activos', 'permisos', 'permisos_vigentes',
                       'administradores_contextuales_efectivos', 'ambitos_inicializados',
                       'ambitos_inicializados_sin_administrador_efectivo', 'revisiones_permiso',
                       'historial_subcampania', 'historial_autoridad', 'grupos_correo_normalizado_duplicado'}
    numeric = all(type(aggregates.get(name)) is int and aggregates[name] >= 0 for name in aggregate_names)
    check(numeric, 'AGREGADOS_INVALIDOS', 'agregados')
    check(aggregates.get('ambitos_inicializados_sin_administrador_efectivo') == 0,
          'AMBITO_SIN_ADMINISTRADOR_EFECTIVO', 'agregados')
    account_roles = records(aggregates, 'roles_cuentas')
    role_keys = set()
    role_counts_valid = bool(account_roles)
    for row in account_roles:
        key = (row.get('rol'), row.get('activo'))
        valid = (isinstance(key[0], str) and key[0] in {'ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'}
                 and type(key[1]) is bool and type(row.get('cuentas')) is int and row['cuentas'] > 0)
        if not valid or key in role_keys:
            role_counts_valid = False
        role_keys.add(key)
    check(role_counts_valid, 'CONTEOS_ROLES_INVALIDOS', 'agregados.roles_cuentas')
    if numeric and role_counts_valid:
        check(sum(row['cuentas'] for row in account_roles) == aggregates['usuarios']
              and sum(row['cuentas'] for row in account_roles if row['rol'] == 'ADMIN' and row['activo'])
                  == aggregates['administradores_globales_activos'], 'CONTEOS_CUENTAS_INCOHERENTES', 'agregados')
        check(0 < aggregates['administradores_globales_activos'] <= aggregates['usuarios']
              and aggregates['permisos_vigentes'] <= aggregates['permisos']
              and aggregates['administradores_contextuales_efectivos'] <= aggregates['permisos_vigentes']
              and aggregates['administradores_contextuales_efectivos'] >= aggregates['ambitos_inicializados'],
              'CONTEOS_CONTINUIDAD_INCOHERENTES', 'agregados')
    commands = aggregates.get('comandos_por_estado')
    check(isinstance(commands, dict) and set(commands) <= {'PREPARADO', 'CONFIRMADO', 'RECHAZADO'}
          and all(type(count) is int and count >= 0 for count in commands.values()),
          'CONTEOS_COMANDOS_INVALIDOS', 'agregados.comandos_por_estado')

    return {
        'resultado': 'ESTADO_COMPACTO_COTEJADO' if not deviations else 'DESVIACIONES_DETECTADAS',
        'entorno_declarado': entorno, 'proyecto_contexto': supplied_ref if supplied_ref == expected_ref else None,
        'origen_remoto_acreditado': False, 'migraciones_cotejadas': ['072', '073'],
        'cotejos': counts, 'desviaciones': deviations, 'limites': LIMITS,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, required=True)
    parser.add_argument('--project-ref', help='Contexto explícito obligatorio para JSON SQL sin wrapper.')
    parser.add_argument('--entorno', choices=['SINTETICO_LOCAL', 'DESARROLLO'], required=True)
    args = parser.parse_args(argv)
    try:
        evidence = json.loads(args.evidence.read_text(encoding='utf-8'))
        result = verify(evidence, entorno=args.entorno, project_ref=args.project_ref)
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        result = {'resultado': 'EVIDENCIA_NO_PROCESABLE', 'origen_remoto_acreditado': False,
                  'desviaciones': [{'codigo': 'JSON_O_ESTRUCTURA_INVALIDA', 'ubicacion': 'evidencia'}], 'limites': LIMITS}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result['resultado'] == 'ESTADO_COMPACTO_COTEJADO' else 1


if __name__ == '__main__':
    sys.exit(main())
