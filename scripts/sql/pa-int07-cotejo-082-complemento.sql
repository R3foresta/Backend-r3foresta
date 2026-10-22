-- Complemento de catálogo082 para PostgreSQL17 (desarrollo confirmado).
-- READ ONLY: no filas de negocio, RPC, DDL ni cambios de permisos.
-- Completa MAINTAIN, omitido por el vector histórico de siete privilegios,
-- y exporta límites de secuencias como texto para conservar precisión int8.
-- Esperado: faltantes=[], maintain_inesperado=[] y tres secuencias bigint
-- con maximo="9223372036854775807". No acredita ejecutores o API de INT07.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH objetos(nombre) AS (VALUES
 ('registro_plantacion_grupo_revision'),('registro_plantacion_correccion'),
 ('registro_plantacion_efectivo'),('evento_plantacion_efectivo'),
 ('registro_plantacion_participante_efectivo'),
 ('registro_plantacion_consumo_credito'),('registro_plantacion_consumo_compensacion')),
relaciones AS (
 SELECT c.* FROM objetos o JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=o.nombre AND c.relkind='r'),
maintain AS (
 SELECT r.relname tabla,p.rol,p.concedido FROM relaciones r
 CROSS JOIN LATERAL (VALUES
 ('PUBLIC',EXISTS(SELECT 1 FROM aclexplode(CASE WHEN cardinality(r.relacl)=0 THEN NULL
   ELSE coalesce(r.relacl,acldefault('r',r.relowner)) END) a
   WHERE a.grantee=0 AND a.privilege_type='MAINTAIN')),
 ('anon',has_table_privilege('anon',r.oid,'MAINTAIN')),
 ('authenticated',has_table_privilege('authenticated',r.oid,'MAINTAIN')),
 ('service_role',has_table_privilege('service_role',r.oid,'MAINTAIN'))
 ) p(rol,concedido)),
secuencias_ids AS (
 SELECT DISTINCT d.objid oid FROM pg_depend d JOIN relaciones r ON r.oid=d.refobjid
 JOIN pg_class s ON s.oid=d.objid AND s.relkind='S'
 WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass
   AND d.deptype IN('a','i'))
SELECT jsonb_build_object(
 'contrato','PA-INT07-082-COMPLEMENTO/1',
 'entorno',jsonb_build_object('postgresql',current_setting('server_version'),
   'solo_lectura',current_setting('transaction_read_only'),
   'aislamiento',current_setting('transaction_isolation')),
 'tablas_encontradas',(SELECT count(*) FROM relaciones),
 'faltantes',(SELECT coalesce(jsonb_agg(o.nombre ORDER BY o.nombre),'[]'::jsonb)
   FROM objetos o WHERE NOT EXISTS(SELECT 1 FROM relaciones r WHERE r.relname=o.nombre)),
 'maintain_comprobaciones',(SELECT count(*) FROM maintain),
 'maintain_inesperado',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY tabla,rol),'[]'::jsonb)
   FROM maintain m WHERE concedido),
 'secuencias',(SELECT coalesce(jsonb_agg(jsonb_build_object('esquema',n.nspname,
   'nombre',c.relname,'tipo',format_type(s.seqtypid,NULL),'incremento',s.seqincrement::text,
   'minimo',s.seqmin::text,'maximo',s.seqmax::text,'cache',s.seqcache::text,
   'ciclica',s.seqcycle) ORDER BY n.nspname,c.relname),'[]'::jsonb)
   FROM secuencias_ids i JOIN pg_class c ON c.oid=i.oid
   JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_sequence s ON s.seqrelid=c.oid)
) AS complemento;

ROLLBACK;
