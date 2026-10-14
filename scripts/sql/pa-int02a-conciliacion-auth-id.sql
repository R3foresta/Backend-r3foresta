-- SOLO LECTURA. Manifest técnico de cuentas que impiden aplicar 064.
-- No devuelve nombres, correo, auth_id, IDs/public keys de credenciales ni contactos.
-- usuario_id y rol sirven para revisar la conciliación preservando PK/autoridad.
BEGIN TRANSACTION READ ONLY;
WITH conteos AS (
  SELECT auth_id,count(*) AS cantidad
  FROM public.usuario GROUP BY auth_id
), afectadas AS (
  SELECT u.id,u.rol::text AS rol_global,
    CASE WHEN u.auth_id IS NULL THEN 'NULO'
         WHEN btrim(u.auth_id)='' THEN 'VACIO'
         ELSE 'DUPLICADO_NO_VACIO' END AS estado_auth_id,
    (SELECT count(*) FROM public.usuario_credencial c WHERE c.usuario_id=u.id) AS credenciales,
    c.cantidad AS cuentas_con_mismo_auth_id
  FROM public.usuario u JOIN conteos c ON u.auth_id IS NOT DISTINCT FROM c.auth_id
  WHERE u.auth_id IS NULL OR btrim(u.auth_id)='' OR c.cantidad>1
)
SELECT jsonb_build_object(
  'observado_en',current_timestamp,
  'cuentas_afectadas',(SELECT count(*) FROM afectadas),
  'duplicados_no_vacios',(SELECT count(*) FROM conteos WHERE auth_id IS NOT NULL AND btrim(auth_id)<>'' AND cantidad>1),
  'cuentas_con_credenciales',(SELECT count(*) FROM afectadas WHERE credenciales>0),
  'manifest',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'usuario_id',id::text,'rol_global',rol_global,'estado_auth_id',estado_auth_id,
    'credenciales',credenciales,'cuentas_con_mismo_auth_id',cuentas_con_mismo_auth_id,
    'requiere_revision_identidad',estado_auth_id='DUPLICADO_NO_VACIO' OR credenciales>0
    ) ORDER BY id) FROM afectadas),'[]'::jsonb),
  'fk_que_referencian_auth_id',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'tabla',con.conrelid::regclass::text,'constraint',con.conname,'definicion',pg_get_constraintdef(con.oid)))
    FROM pg_constraint con WHERE con.contype='f' AND con.confrelid='public.usuario'::regclass
    AND (SELECT attnum FROM pg_attribute WHERE attrelid='public.usuario'::regclass AND attname='auth_id')=ANY(con.confkey)
    ),'[]'::jsonb)
) AS conciliacion;
ROLLBACK;
