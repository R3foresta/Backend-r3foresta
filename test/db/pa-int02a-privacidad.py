"""Solo base sintética local nueva; no carga .env ni conecta a Supabase."""
import argparse,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--database',required=True);p.add_argument('--port',default='6544');args=p.parse_args()
base=['psql','-h','/tmp','-p',args.port,'-U','postgres','-d',args.database,'-X','-q','-v','ON_ERROR_STOP=1']
def sql(s,deny=False):
 r=subprocess.run(base+['-At','-c',s],capture_output=True,text=True)
 if deny:
  assert r.returncode!=0 and ('permission denied' in r.stderr or 'REQUIERE_REVISION' in r.stderr or 'RESIDUAL' in r.stderr),r.stderr
 else: assert r.returncode==0,r.stderr
 return r.stdout.strip()
def file(path,deny=False):
 r=subprocess.run(base+['-f',str(path)],capture_output=True,text=True)
 assert (r.returncode!=0) if deny else (r.returncode==0),r.stderr
 return r
assert sql("SELECT fixture FROM pa_int02a_fixture_marker")=='SINTETICO_AISLADO'
sql("GRANT SELECT ON usuario TO anon,authenticated; GRANT ALL ON organizacion TO anon,authenticated; GRANT SELECT(auth_id) ON usuario TO PUBLIC; GRANT UPDATE(nombre) ON organizacion TO PUBLIC;")
sql("CREATE TABLE IF NOT EXISTS usuario_credencial(id bigint PRIMARY KEY, usuario_id bigint REFERENCES usuario, credential_id text); INSERT INTO usuario_credencial VALUES(1,3,'credencial-sintetica') ON CONFLICT DO NOTHING; GRANT ALL ON usuario_credencial TO anon,authenticated,service_role;")
before=sql("SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM usuario u")
# Drift público en vista -> migración aborta sin revocación parcial.
sql("CREATE VIEW fixture_usuario_v AS SELECT * FROM usuario; GRANT SELECT ON fixture_usuario_v TO anon")
file(Path('migrations/066_pa_int02a_privacidad_usuario_organizacion.sql'),deny=True)
assert sql("SELECT has_table_privilege('anon','usuario','SELECT')")=='t'
sql('DROP VIEW fixture_usuario_v')
file(Path('migrations/066_pa_int02a_privacidad_usuario_organizacion.sql'))
file(Path('migrations/066_pa_int02a_privacidad_usuario_organizacion.sql'))
assert sql("SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM usuario u")==before
cases=["SELECT * FROM usuario", "SELECT auth_id FROM usuario", "INSERT INTO organizacion(id,nombre) VALUES(30,'No')", "UPDATE organizacion SET nombre='No' WHERE id=11", "DELETE FROM organizacion WHERE id=11", "TRUNCATE organizacion", "CREATE TRIGGER no_trg BEFORE INSERT ON organizacion FOR EACH ROW EXECUTE FUNCTION no_func()", "SELECT public.pa_perfil_leer(3,'vol')"]
for role in ['anon','authenticated']:
 for command in cases[:6]+cases[7:]+["SELECT * FROM usuario_credencial", "UPDATE usuario_credencial SET credential_id='ajena' WHERE id=1"]: sql(f'SET ROLE {role}; {command}',deny=True)
 assert sql(f"SET ROLE {role}; SELECT count(*) FROM organizacion")=='6'
assert json.loads(sql("SET ROLE service_role; SELECT pa_perfil_leer(3,'vol')"))['rol_global']=='VOLUNTARIO'
assert '9007199254740993' in sql("SET ROLE service_role; SELECT * FROM pa_organizaciones_seleccionables(3,'vol',NULL,NULL,20)")
file(Path('migrations/067_pa_int02a_postgrest_timeout.sql'))
file(Path('migrations/067_pa_int02a_postgrest_timeout.sql'))
for role in ['anon','authenticated']:sql(f"SET ROLE {role}; SELECT pa_privado_timeout_diagnostico(0)",deny=True)
assert json.loads(sql("SET ROLE service_role; SELECT pa_privado_timeout_diagnostico(0)"))['rol']=='service_role'
assert sql("SELECT 'statement_timeout=30s'=ANY(rolconfig) AND 'lock_timeout=5s'=ANY(rolconfig) FROM pg_roles WHERE rolname='service_role'")=='t'
print('Privacidad: 18 denegaciones SQL reales; perfil/selector VOLUNTARIO e IDs exactos; conservación de filas; rollback ante vista pública; 066/067 repetibles. Timeout de rol configurado; esta prueba no mide PostgREST.')
