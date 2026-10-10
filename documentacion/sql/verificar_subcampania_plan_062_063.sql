-- Ejecutar en Supabase SQL Editor. Diagnóstico de SOLO LECTURA.
-- Ejecutar completo o cada SELECT por separado y conservar sus resultados.
-- Requiere el esquema hasta 062; 063 se comprueba a través de los privilegios.
-- No aplica migraciones, no registra plantaciones ni revisiones de plan.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- 1. Columna y constraint de versión: BIGINT, NOT NULL, DEFAULT 0,
--    y subcampania_plan_revision_no_negativa_chk validado.
SELECT a.attname AS columna,
       format_type(a.atttypid, a.atttypmod) AS tipo,
       a.attnotnull AS no_nulo,
       pg_get_expr(d.adbin, d.adrelid) AS valor_por_defecto,
       c.conname AS constraint_version,
       c.convalidated AS constraint_validado,
       pg_get_constraintdef(c.oid) AS regla
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
LEFT JOIN pg_constraint c
  ON c.conrelid = a.attrelid
 AND c.conname = 'subcampania_plan_revision_no_negativa_chk'
WHERE a.attrelid = 'public.subcampania'::regclass
  AND a.attname = 'plan_revision' AND NOT a.attisdropped;

-- 2. Debe devolver true para el enum de auditoría introducido en 062.
SELECT EXISTS (
  SELECT 1 FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'tipo_historial_subcampania'
    AND e.enumlabel = 'PLAN_REVISADO'
) AS existe_plan_revisado;

-- 3. Las cuatro firmas deben existir. La presencia por sí sola no acredita
--    que 060/061 reemplazaron los cuerpos anteriores; ver guía de verificación.
WITH esperadas(firma) AS (VALUES
  ('public.fn_subcampania_obtener_plan(bigint)'),
  ('public.fn_subcampania_revisar_plan(bigint,integer,jsonb,bigint,bigint)'),
  ('public.fn_vivero_asignar_stock_subcampania(bigint,bigint,integer,public.proposito_asignacion,bigint,date,bigint[],text)'),
  ('public.fn_m3_registrar_plantacion(bigint,boolean,bigint,date,bigint,numeric,numeric,text,bigint[],jsonb,bigint[])')
)
SELECT e.firma, p.oid IS NOT NULL AS existe,
       pg_get_function_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer,
       p.provolatile AS volatilidad,
       p.proconfig AS configuracion
FROM esperadas e
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.firma);

-- 4. Después de 063, ambas RPC de plan: anon=false,
--    authenticated=false, service_role=true. Con solo 062 la lectura puede
--    conservar EXECUTE público: esa diferencia es precisamente lo que cambia 063.
WITH funciones(firma) AS (VALUES
  ('public.fn_subcampania_obtener_plan(bigint)'),
  ('public.fn_subcampania_revisar_plan(bigint,integer,jsonb,bigint,bigint)')
), roles(rol) AS (VALUES ('anon'), ('authenticated'), ('service_role'))
SELECT f.firma, r.rol,
       has_function_privilege(r.rol::name, to_regprocedure(f.firma), 'EXECUTE') AS puede_ejecutar,
       r.rol = 'service_role' AS esperado_despues_063
FROM funciones f CROSS JOIN roles r
ORDER BY f.firma, r.rol;

-- 5. Ninguna de las dos RPC de plan debe conceder EXECUTE a PUBLIC después de 063.
SELECT p.proname,
       EXISTS (
         SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       ) AS execute_publico
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('fn_subcampania_obtener_plan', 'fn_subcampania_revisar_plan');

-- 6. Inspección de RLS para interpretar la superficie de acceso directo.
--    No habilita/deshabilita RLS ni modifica políticas.
SELECT c.relname AS tabla, c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('service_role', c.oid, 'SELECT') AS backend_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('subcampania', 'subcampania_meta_especie', 'subcampania_historial');

-- 7. Planes incoherentes. Resultado esperado: cero filas.
--    BORRADOR sin especies es válido antes de cargar el plan.
--    Una fila histórica aquí requiere análisis; no corregir automáticamente.
WITH planes AS (
  SELECT s.id, s.estado, s.meta_total_arboles, s.plan_revision,
         COUNT(m.planta_id) AS especies,
         COALESCE(SUM(m.cantidad_objetivo), 0) AS suma_cantidades,
         COALESCE(SUM(m.porcentaje_objetivo), 0) AS suma_porcentajes,
         COUNT(*) FILTER (WHERE m.planta_id IS NOT NULL AND (
           m.cantidad_objetivo <= 0 OR m.porcentaje_objetivo <= 0
           OR m.porcentaje_objetivo > 100 OR p.id IS NULL
         )) AS especies_invalidas
  FROM public.subcampania s
  LEFT JOIN public.subcampania_meta_especie m ON m.subcampania_id = s.id
  LEFT JOIN public.planta p ON p.id = m.planta_id
  WHERE s.deleted_at IS NULL AND s.estado IN ('BORRADOR', 'ACTIVA')
  GROUP BY s.id, s.estado, s.meta_total_arboles, s.plan_revision
)
SELECT * FROM planes
WHERE plan_revision < 0 OR especies_invalidas > 0
   OR (especies > 0 AND (suma_cantidades <> meta_total_arboles OR suma_porcentajes <> 100))
   OR (estado = 'ACTIVA' AND especies = 0)
ORDER BY id;

-- 8. Stock inicial fuera del plan. Debe quedar vacío para entregas nuevas
--    posteriores a 060; pueden existir entregas históricas anteriores.
SELECT a.id AS asignacion_id, a.subcampania_id, a.lote_vivero_id,
       l.planta_id, a.saldo_asignado_disponible, a.fecha_asignacion
FROM public.asignacion_vivero_subcampania a
JOIN public.lote_vivero l ON l.id = a.lote_vivero_id
WHERE a.proposito = 'PLANTACION_INICIAL' AND a.saldo_asignado_disponible > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.subcampania_meta_especie m
    WHERE m.subcampania_id = a.subcampania_id AND m.planta_id = l.planta_id
  )
ORDER BY a.subcampania_id, a.id;

-- 9. Versiones sin auditoría completa. Esperado: cero filas.
--    No exige PLAN_REVISADO para planes previos a 062 con plan_revision=0.
SELECT s.id, s.plan_revision, COUNT(h.id) AS revisiones_auditadas,
       COUNT(h.id) FILTER (WHERE h.actor_user_id IS NULL OR h.created_at IS NULL
         OR NOT (h.metadata ? 'anterior' AND h.metadata ? 'nuevo')) AS auditorias_incompletas
FROM public.subcampania s
LEFT JOIN public.subcampania_historial h
  ON h.subcampania_id = s.id AND h.tipo_historial = 'PLAN_REVISADO'
GROUP BY s.id, s.plan_revision
HAVING COUNT(h.id) <> s.plan_revision
    OR COUNT(h.id) FILTER (WHERE h.actor_user_id IS NULL OR h.created_at IS NULL
      OR NOT (h.metadata ? 'anterior' AND h.metadata ? 'nuevo')) > 0
ORDER BY s.id;

-- 10. Muestra pequeña para comparar con GET /api/subcampanias/:id/plan.
SELECT s.id, public.fn_subcampania_obtener_plan(s.id) AS snapshot
FROM public.subcampania s
WHERE s.deleted_at IS NULL
ORDER BY s.id LIMIT 5;

ROLLBACK;
