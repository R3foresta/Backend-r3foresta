"""Regresiones del cotejo sobre la fotografía SQL real del ensayo aislado.

Preparación única: python3 scripts/qa/pa-int02c-db-test.py
Ejecución sin PostgreSQL: python3 -m unittest discover -s test/db -p 'test_pa_int02c_estado_verificar.py'
"""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'scripts/qa/pa-int02c-estado-verificar.py'
SPEC = importlib.util.spec_from_file_location('pa_estado_c', SCRIPT)
VERIFIER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIER)


class EstadoCVerifierTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = ROOT / 'docs/evidencia/pa-int02c-estado-local.json'
        if not path.is_file():
            raise RuntimeError('Falta la fotografía SQL real; ejecutar scripts/qa/pa-int02c-db-test.py una vez.')
        cls.real_evidence = json.loads(path.read_text())

    def setUp(self):
        self.evidence = copy.deepcopy(self.real_evidence)
        self.state = self.evidence['estado']

    def verify(self, **kwargs):
        return VERIFIER.verify(self.evidence, entorno='SINTETICO_LOCAL', **kwargs)

    def assert_deviation(self, code, result=None):
        result = result or self.verify()
        self.assertEqual(result['resultado'], 'DESVIACIONES_DETECTADAS')
        self.assertIn(code, [item['codigo'] for item in result['desviaciones']])

    def test_real_sql_state_matches_local_migrations(self):
        result = self.verify()
        self.assertEqual(result['desviaciones'], [])
        self.assertEqual(result['resultado'], 'ESTADO_COMPACTO_COTEJADO')
        self.assertEqual(result['cotejos']['huellas_funciones'], 18)
        self.assertEqual(result['cotejos']['fk_nuevas_restrict'], 21)
        self.assertFalse(result['origen_remoto_acreditado'])

    def test_changed_function_body_is_rejected(self):
        self.state['funciones'][0]['md5_cuerpo'] = '0' * 32
        self.assert_deviation('HUELLA_FUNCION_NO_COINCIDE')

    def test_overload_cannot_mask_real_signature(self):
        extra = copy.deepcopy(self.state['funciones'][0])
        extra['firma'] = extra['firma'].split('(')[0] + '(text)'
        self.state['funciones'].append(extra)
        self.assert_deviation('FIRMAS_O_SOBRECARGAS_NO_CORRESPONDEN')

    def test_same_name_wrong_argument_type_is_rejected(self):
        function = next(row for row in self.state['funciones'] if row['firma'].startswith('pa_autoridad_leer('))
        function['firma'] = 'pa_autoridad_leer(bigint,text,text)'
        self.assert_deviation('FIRMAS_O_SOBRECARGAS_NO_CORRESPONDEN')

    def test_duplicate_signature_is_rejected(self):
        self.state['funciones'].append(copy.deepcopy(self.state['funciones'][0]))
        self.assert_deviation('FIRMA_DUPLICADA')

    def test_open_public_table_acl_is_rejected(self):
        row = next(row for row in self.state['privilegios'] if row['rol'] == 'anon')
        row['select'] = True
        self.assert_deviation('ACL_TABLA_INCOMPATIBLE')

    def test_missing_private_service_grant_is_rejected(self):
        self.state['funciones'][0]['service_role_ejecuta'] = False
        self.assert_deviation('ACL_FUNCION_INCOMPATIBLE')

    def test_definer_or_search_path_change_is_rejected(self):
        self.state['funciones'][0]['security_definer'] = True
        self.state['funciones'][0]['configuracion'] = ['search_path=public']
        self.assert_deviation('CONFIGURACION_FUNCION_INCOMPATIBLE')

    def test_raw_sql_requires_explicit_project_context(self):
        result = VERIFIER.verify(self.state, entorno='SINTETICO_LOCAL')
        self.assert_deviation('REF_EXPLICITO_REQUERIDO', result)

    def test_explicit_context_cannot_turn_local_sql_into_remote_evidence(self):
        result = VERIFIER.verify(self.state, entorno='DESARROLLO', project_ref=VERIFIER.DEVELOPMENT_REF)
        self.assert_deviation('BASE_LOCAL_NO_ES_DESARROLLO', result)
        self.assertFalse(result['origen_remoto_acreditado'])

    def test_wrapper_project_and_cli_context_must_match(self):
        self.assert_deviation('REF_NO_COINCIDE', self.verify(project_ref=VERIFIER.DEVELOPMENT_REF))

    def test_wrapper_environment_cannot_be_relabelled(self):
        self.evidence['proyecto'] = VERIFIER.DEVELOPMENT_REF
        self.assert_deviation('ENTORNO_NO_COINCIDE', VERIFIER.verify(self.evidence, entorno='DESARROLLO'))

    def test_unknown_remote_origin_is_never_claimed_as_verified(self):
        self.evidence.update(proyecto=VERIFIER.DEVELOPMENT_REF, entorno='DESARROLLO')
        self.state['base'] = 'postgres'
        result = VERIFIER.verify(self.evidence, entorno='DESARROLLO')
        self.assertEqual(result['resultado'], 'ESTADO_COMPACTO_COTEJADO')
        self.assertFalse(result['origen_remoto_acreditado'])

    def test_unicode_normalization_failure_is_rejected(self):
        self.state['locale']['normalizacion_unicode_correcta'] = False
        self.assert_deviation('NORMALIZACION_UTF8_INCOMPATIBLE')

    def test_unvalidated_constraint_is_rejected(self):
        self.state['restricciones'][0]['validada'] = False
        self.assert_deviation('RESTRICCION_NO_VALIDADA')

    def test_new_c_foreign_key_cascade_is_rejected(self):
        row = next(row for row in self.state['restricciones'] if row['tabla'] == 'usuario_autoridad_historial'
                   and row['definicion'].startswith('FOREIGN KEY'))
        row['definicion'] = row['definicion'].replace('ON DELETE RESTRICT', 'ON DELETE CASCADE')
        self.assert_deviation('FK_NUEVA_NO_RESTRICT')

    def test_restrict_foreign_key_to_wrong_table_is_rejected(self):
        row = next(row for row in self.state['restricciones'] if row['tabla'] == 'usuario_autoridad_historial'
                   and row['definicion'].startswith('FOREIGN KEY (usuario_id)'))
        row['definicion'] = row['definicion'].replace('REFERENCES usuario(', 'REFERENCES organizacion(')
        self.assert_deviation('FK_AUDITORIA_NO_CORRESPONDEN')

    def test_invalid_index_is_rejected(self):
        self.state['indices'][0]['valido'] = False
        self.assert_deviation('INDICE_INVALIDO_O_NO_LISTO')

    def test_email_index_must_not_enforce_unique_legacy_addresses(self):
        row = next(row for row in self.state['indices'] if row['nombre'] == 'usuario_correo_normalizado_pa_idx')
        row['unico'] = True
        self.assert_deviation('INDICE_NORMALIZACION_INCOMPATIBLE')

    def test_disabled_immutable_audit_trigger_is_rejected(self):
        row = next(row for row in self.state['triggers'] if row['tabla'] == 'usuario_autoridad_historial')
        row['habilitado'] = 'D'
        self.assert_deviation('TRIGGER_INACTIVO_O_INCOMPATIBLE')

    def test_public_policy_is_rejected(self):
        self.state['politicas'].append({'public_o_api_publica': True})
        self.assert_deviation('POLITICA_PUBLICA')

    def test_public_sequence_acl_is_rejected(self):
        row = next(row for row in self.state['secuencias'] if row['rol'] == 'authenticated')
        row['usage'] = True
        self.assert_deviation('ACL_SECUENCIA_INCOMPATIBLE')

    def test_missing_contextual_admin_is_rejected(self):
        self.state['agregados']['ambitos_inicializados_sin_administrador_efectivo'] = 1
        self.assert_deviation('AMBITO_SIN_ADMINISTRADOR_EFECTIVO')

    def test_incoherent_account_totals_are_rejected(self):
        self.state['agregados']['usuarios'] += 1
        self.assert_deviation('CONTEOS_CUENTAS_INCOHERENTES')

    def test_cli_failure_is_json_and_does_not_echo_evidence(self):
        self.state['funciones'][0]['md5_cuerpo'] = 'private@example.invalid'
        self.state['dato_inesperado'] = 'auth-secret-person-id'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'evidence.json'
            path.write_text(json.dumps(self.evidence))
            result = subprocess.run([sys.executable, str(SCRIPT), '--evidence', str(path),
                                     '--entorno', 'SINTETICO_LOCAL'], text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assert_deviation('HUELLA_FUNCION_NO_COINCIDE', json.loads(result.stdout))
        self.assertNotIn('private@example.invalid', result.stdout + result.stderr)
        self.assertNotIn('auth-secret-person-id', result.stdout + result.stderr)

    def test_cli_malformed_json_is_clear_without_traceback_or_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'malformed.json'
            path.write_text('{"auth_id":"secret-not-to-echo"')
            result = subprocess.run([sys.executable, str(SCRIPT), '--evidence', str(path),
                                     '--entorno', 'SINTETICO_LOCAL'], text=True, capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['resultado'], 'EVIDENCIA_NO_PROCESABLE')
        self.assertEqual(result.stderr, '')
        self.assertNotIn('secret-not-to-echo', result.stdout)


if __name__ == '__main__':
    unittest.main()
