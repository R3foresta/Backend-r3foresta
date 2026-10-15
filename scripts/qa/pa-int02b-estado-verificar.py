"""Coteja una salida compacta aportada de desarrollo; solo lee archivos locales."""
import argparse
import hashlib
import json
from pathlib import Path
import re

parser = argparse.ArgumentParser()
parser.add_argument('--evidence', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
evidence = json.loads(args.evidence.read_text())
state = evidence['estado']
assert evidence['proyecto'] == 'vyrjlehkhabydkhjxagx'
assert evidence['migraciones'] == ['068', '069', '070', '071']
assert state['solo_lectura'] == 'on'
tables = ['participacion_comando', 'subcampania_permiso', 'subcampania_permiso_revision', 'subcampania_historial']
relations = {r['nombre']: r for r in state['relaciones']}
assert set(relations) == set(tables)
assert all(relations[t]['rls'] for t in tables[:3])
assert all(r['validada'] for r in state['restricciones'])
constraints = {(r['tabla'], r['nombre']): r for r in state['restricciones']}
for table, name in [
    ('participacion_comando', 'participacion_comando_pkey'),
    ('participacion_comando', 'participacion_comando_identidad_uq'),
    ('participacion_comando', 'participacion_comando_id_actor_uq'),
    ('participacion_comando', 'participacion_comando_ciclo_ck'),
    ('participacion_comando', 'participacion_comando_huella_ck'),
    ('participacion_comando', 'participacion_comando_operacion_ck'),
    ('subcampania_permiso', 'subcampania_permiso_pkey'),
    ('subcampania_permiso', 'subcampania_permiso_revision_fk'),
    ('subcampania_permiso', 'subcampania_permiso_retiro_chk'),
    ('subcampania_permiso', 'subcampania_permiso_rol_contextual_check'),
    ('subcampania_permiso_revision', 'subcampania_permiso_revision_pkey'),
    ('subcampania_permiso_revision', 'subcampania_permiso_revision_revision_check'),
    ('subcampania_historial', 'subcampania_historial_acceso_chk'),
    ('subcampania_historial', 'subcampania_historial_comando_actor_fk'),
    ('subcampania_historial', 'subcampania_historial_participacion_comando_fk'),
]:
    assert (table, name) in constraints, name
new_foreign_keys = [r for r in state['restricciones'] if r['definicion'].startswith('FOREIGN KEY')
                    and (r['tabla'] != 'subcampania_historial' or 'comando' in r['nombre'])]
assert len(new_foreign_keys) == 17
assert all('ON UPDATE RESTRICT ON DELETE RESTRICT' in r['definicion'] for r in new_foreign_keys)
privileges = {(p['rol'], p['tabla']): p for p in state['privilegios']}
assert len(privileges) == 12
for table in tables:
    for role in ['anon', 'authenticated']:
        assert all(privileges[(role, table)][p] is False for p in ['select', 'insert', 'update', 'delete', 'truncate'])
    private = privileges[('service_role', table)]
    assert private['select'] and private['insert']
    assert private['update'] == (table != 'subcampania_historial')
    assert not private['delete'] and not private['truncate']
remote_functions = {f['firma'].split('(')[0]: f for f in state['funciones']}
local_functions = {}
for path in ['migrations/068_pa_participacion_comando.sql', 'migrations/070_pa_int02b_permisos_contextuales.sql',
             'migrations/071_pa_int02b_bootstrap_controlado.sql']:
    for name, _, body in re.findall(r'CREATE OR REPLACE FUNCTION\s+public\.([a-z_]+)\s*\(.*?\bAS\s+(\$\$)(.*?)\2;',
                                   (root / path).read_text(), re.S | re.I):
        local_functions[name] = hashlib.md5(body.encode()).hexdigest()
assert set(local_functions) == set(remote_functions)
for name, local_hash in local_functions.items():
    remote = remote_functions[name]
    assert remote['huella'] == local_hash, name
    assert not remote['anon_ejecuta'] and not remote['authenticated_ejecuta'] and not remote['security_definer']
    assert remote['service_role_ejecuta'] == (name == 'pa_inicializar_participacion_legada')
    assert remote['configuracion'] == ['search_path=pg_catalog, public']
assert {c['columna']: c['tipo'] for c in state['marca_inicializacion']} == {
    'participacion_inicializada_en': 'timestamp with time zone', 'participacion_inicializada_por': 'bigint'}
assert sum(r['cuentas'] for r in state['roles_cuentas']) == state['legado']['usuarios']
print(json.dumps({
    'resultado': 'ESTADO_COMPACTO_COTEJADO', 'proyecto': evidence['proyecto'],
    'postgres_version': state['postgres_version'], 'observado_en': state['observado_en'],
    'restricciones_validadas': len(constraints), 'fk_nuevas_restrict': len(new_foreign_keys),
    'combinaciones_privilegios_cotejadas': len(privileges), 'huellas_funciones_coincidentes': len(local_functions),
    'legado_fotografia_posterior': state['legado'], 'roles_fotografia_posterior': state['roles_cuentas'],
    'limites': ['Sin fotografia anterior B: no acredita conservacion real antes/despues',
               'Estado compacto no trae indices/triggers/politicas/secuencias/MAINTAIN ni todas las columnas',
               'Sin manifest real revisado ni transicion de personas', 'Sin despliegue de consumidores acreditado'],
}, ensure_ascii=False, indent=2))
