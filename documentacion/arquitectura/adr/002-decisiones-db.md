# Decisiones de Base de Datos (MVP)

## Ubicaciones + Catálogo Territorial (Municipios/Comunidades)

### Problema
Necesitamos:
- Tener un **catálogo** de `departments → provinces → municipalities → communities` para listar proyectos/plantaciones por territorio y mantener consistencia.
- Seguir registrando eventos (recolección, vivero, plantación, etc.) con una **ubicación puntual** (lat/lng) y asociarlos a **municipio/comunidad**.

### Decisión
1. Se crea el catálogo territorial: `departments` ligado a `provinces` ligado a `municipalities` ligado a `communities` (estecon `active` para inactivar sin borrar)

2. Se mantiene `public.ubicacion` como tabla única de “location” para todos los módulos (recolección/vivero/plantación/otros).

3. Reglas: `latitud/longitud` **no se fuerzan** como `NOT NULL` en BD (para permitir módulos/futuros casos sin coordenadas). La “obligatoriedad” de lat/lng se valida por **módulo** en el backend (DTO/servicio).

### Flujo de datos (cómo se usa)
- Al crear **recolección/vivero/plantación**:
  1. Backend crea `ubicacion` con `latitud/longitud` (y opcionalmente `municipality_id/community_id` o `municipio/comunidad` texto).
  2. La entidad (ej. `recoleccion`) guarda `ubicacion_id`.
  3. La pertenencia territorial se obtiene a través de `ubicacion`.

### Por qué esta decisión
- Permite tener el catálogo territorial necesario para listar por municipio/comunidad. Las comunidades son importates porque en ellas se efectúna las plantaciones y los proyectos en si.

## Creación de vista para acceder a datos de ubicación en endpoints

Vista creada:

```sql
-- 1) Crear/actualizar la vista
CREATE OR REPLACE VIEW public.v_ubicacion_enriquecida AS
SELECT
  u.id,
  u.id AS ubicacion_id,
  u.nombre,
  u.referencia,
  u.latitud,
  u.longitud,
  u.precision_m,
  u.fuente,
  u.pais_id,
  p.codigo_iso2 AS pais_codigo_iso2,
  p.nombre AS pais_nombre,
  u.division_id,
  CASE
    WHEN u.division_id IS NULL THEN NULL
    ELSE (
      WITH RECURSIVE division_chain AS (
        SELECT
          da.id,
          da.parent_id,
          da.nombre,
          dt.nombre AS tipo,
          dt.orden
        FROM public.division_administrativa da
        INNER JOIN public.division_tipo dt ON dt.id = da.tipo_id
        WHERE da.id = u.division_id
        UNION ALL
        SELECT
          parent_da.id,
          parent_da.parent_id,
          parent_da.nombre,
          parent_dt.nombre AS tipo,
          parent_dt.orden
        FROM public.division_administrativa parent_da
        INNER JOIN public.division_tipo parent_dt ON parent_dt.id = parent_da.tipo_id
        INNER JOIN division_chain dc ON dc.parent_id = parent_da.id
      )
      SELECT jsonb_agg(
        jsonb_build_object('tipo', dc.tipo, 'nombre', dc.nombre)
        ORDER BY dc.orden ASC
      )
      FROM division_chain dc
    )
  END AS division_ruta
FROM public.ubicacion u
LEFT JOIN public.pais p ON p.id = u.pais_id;

-- 2) Permisos para API roles
GRANT SELECT ON public.v_ubicacion_enriquecida TO anon;
GRANT SELECT ON public.v_ubicacion_enriquecida TO authenticated;
GRANT SELECT ON public.v_ubicacion_enriquecida TO service_role;

-- 3) Forzar recarga de cache PostgREST (si aplica)
NOTIFY pgrst, 'reload schema';
```

Verificacion SQL:

```sql
SELECT id, nombre, pais_id, division_id
FROM public.v_ubicacion_enriquecida
LIMIT 5;
```
