-- PA-T-INT02-B / BE05: exportar correspondencias candidatas para revisión privada.
-- SOLO LECTURA. No otorga permisos, no genera comandos y no confirma decisiones.
-- Ejecutar únicamente tras cotejar las columnas base con catalog-preflight.
-- El resultado contiene IDs mínimos, sin nombres/contactos/auth_id ni secretos.
-- Guardar el JSON fuera de Git si contiene IDs reales; registrar huella + entorno.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH fuentes AS (
  SELECT e.usuario_id, e.subcampania_id,
         jsonb_build_object('relacion','subcampania_equipo','id',e.id::text,
                            'vinculo',e.rol::text) AS fuente
  FROM public.subcampania_equipo e
  UNION ALL
  SELECT r.responsable_id, r.subcampania_id,
         jsonb_build_object('relacion','registro_plantacion','id',r.id::text,
                            'vinculo','RESPONSABLE_HISTORICO')
  FROM public.registro_plantacion r
  UNION ALL
  SELECT c.usuario_id, r.subcampania_id,
         jsonb_build_object('relacion','registro_plantacion_coresponsable','id',c.id::text,
                            'vinculo','CORESPONSABLE_HISTORICO')
  FROM public.registro_plantacion_coresponsable c
  JOIN public.registro_plantacion r ON r.id = c.registro_plantacion_id
  UNION ALL
  SELECT e.responsable_id, e.subcampania_id,
         jsonb_build_object('relacion','evento_plantacion','id',e.id::text,
                            'vinculo','RESPONSABLE_EVENTO_HISTORICO')
  FROM public.evento_plantacion e
  UNION ALL
  SELECT a.usuario_asignacion_id, a.subcampania_id,
         jsonb_build_object('relacion','asignacion_vivero_subcampania','id',a.id::text,
                            'vinculo','ASIGNACION_LOGISTICA_HISTORICA')
  FROM public.asignacion_vivero_subcampania a
), parejas AS (
  SELECT usuario_id, subcampania_id,
         jsonb_agg(DISTINCT fuente ORDER BY fuente) AS fuente_legada
  FROM fuentes GROUP BY usuario_id, subcampania_id
), clasificadas AS (
  SELECT p.usuario_id, p.subcampania_id, p.fuente_legada,
         u.rol::text AS rol_global, s.estado::text AS estado_ambito,
         CASE WHEN u.id IS NULL THEN 'USUARIO_AUSENTE'
              WHEN s.id IS NULL THEN 'AMBITO_AUSENTE'
              WHEN s.deleted_at IS NOT NULL THEN 'AMBITO_ELIMINADO'
              WHEN u.rol::text = 'ADMIN' THEN 'ACCESO_GLOBAL_DERIVADO_SIN_FILA_CONTEXTUAL'
              WHEN u.activo IS NOT TRUE THEN 'DESTINO_INACTIVO'
              WHEN NULLIF(btrim(u.auth_id),'') IS NULL THEN 'IDENTIDAD_AUSENTE'
              WHEN EXISTS (SELECT 1 FROM public.usuario otro
                           WHERE otro.id <> u.id AND otro.auth_id = u.auth_id)
                THEN 'IDENTIDAD_DUPLICADA'
              WHEN s.estado::text IN ('COMPLETADA','FINALIZADA_PARCIAL','CANCELADA')
                THEN 'LEGADO_CERRADO_REQUIERE_BOOTSTRAP_REVISADO'
              WHEN s.estado::text NOT IN ('BORRADOR','ACTIVA')
                THEN 'ESTADO_NO_ADMITE_DESIGNACION_ORDINARIA'
              ELSE NULL END AS excepcion
  FROM parejas p LEFT JOIN public.usuario u ON u.id = p.usuario_id
  LEFT JOIN public.subcampania s ON s.id = p.subcampania_id
), filas AS (
  SELECT usuario_id, subcampania_id, excepcion,
         jsonb_build_object(
           'usuario_id',usuario_id::text,'subcampania_id',subcampania_id::text,
           'permiso_propuesto',NULL,
           'justificacion','Pendiente: revisar facultad legítima por persona y ámbito; fuentes no otorgan autoridad.',
           'fuente_legada',fuente_legada,'decision_revisor','PENDIENTE',
           'rol_global_observado',rol_global,'estado_ambito_observado',estado_ambito,
           'excepcion',excepcion
         ) AS fila
  FROM clasificadas
)
SELECT jsonb_pretty(jsonb_build_object(
  'version_manifest',1,'entrega','PA-T-INT02-B',
  'estado','PROPUESTA_SIN_REVISAR_NO_APLICABLE',
  'observado_en',to_char(current_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'base',current_database(),'postgres_version',current_setting('server_version'),
  'entorno_identificado_externamente',NULL,'backend_head',NULL,
  'revisor_previsto','Pablo','revisado_en',NULL,
  'reglas',jsonb_build_array(
    'Ninguna decisión está autorizada por este export.',
    'GENERAL, VALIDADOR, COORDINADOR, organización e historia no confieren permiso contextual.',
    'ADMIN global conserva acceso derivado y no recibe vigencias contextuales.',
    'No se propone ADMINISTRADOR_SUBCAMPANIA automáticamente.',
    'Las excepciones requieren resolución explícita; no sustituir personas.',
    'La lista incluye candidatos por vínculo conocido; no equivale a todos los usuarios ni a todas sus facultades.'
  ),
  'correspondencias_pendientes',coalesce(
    (SELECT jsonb_agg(fila ORDER BY subcampania_id,usuario_id) FROM filas WHERE excepcion IS NULL),'[]'::jsonb),
  'excepciones',coalesce(
    (SELECT jsonb_agg(fila ORDER BY subcampania_id,usuario_id) FROM filas WHERE excepcion IS NOT NULL),'[]'::jsonb),
  'cuentas_sin_vinculo_ambito',
    (SELECT count(*) FROM public.usuario u WHERE NOT EXISTS (SELECT 1 FROM parejas p WHERE p.usuario_id = u.id)),
  'ambitos_sin_correspondencias',
    (SELECT count(*) FROM public.subcampania s WHERE NOT EXISTS (SELECT 1 FROM parejas p WHERE p.subcampania_id = s.id))
)) AS manifest_propuesta;

ROLLBACK;
