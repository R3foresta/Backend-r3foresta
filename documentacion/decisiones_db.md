# Decisiones de Base de Datos (MVP)

## Ubicaciones + Catálogo Territorial (Municipios/Comunidades)

### Problema
Necesitamos:
- Tener un **catálogo** de `departments → provinces → municipalities → communities` para listar proyectos/plantaciones por territorio y mantener consistencia.
- Seguir registrando eventos (recolección, vivero, plantación, etc.) con una **ubicación puntual** (lat/lng) y, cuando aplique, asociarlos a **municipio/comunidad**.

### Decisión
1. Se crea el catálogo territorial:
   - `departments`
   - `provinces` (FK → `departments`)
   - `municipalities` (FK → `provinces`)
   - `communities` (FK → `municipalities`, con `active` para inactivar sin borrar)

2. Se mantiene `public.ubicacion` como tabla única de “location” para todos los módulos (recolección/vivero/plantación/otros).
   - `ubicacion` representa el **punto** donde ocurrió o está el recurso.
   - `ubicacion` puede vincularse al catálogo (si se conoce) mediante:
     - `municipality_id` (nullable)
     - `community_id` (nullable)
   - Se conserva el texto legacy (`departamento`, `provincia`, `comunidad`, etc.) y se agrega `municipio` (texto fallback) para los casos donde todavía no hay ID/catálogo.

3. Reglas:
   - `latitud/longitud` **no se fuerzan** como `NOT NULL` en BD (para permitir módulos/futuros casos sin coordenadas).
   - La “obligatoriedad” de lat/lng se valida por **módulo** en el backend (DTO/servicio).
   - Municipio/comunidad **no son obligatorios** en MVP; se guardan si el usuario los selecciona.
   - Consistencia: **no se permite** `community_id` sin `municipality_id`.

### Constraints acordadas
- Integridad referencial:
  - `ubicacion.municipality_id → municipalities(id)` con `ON DELETE SET NULL`
  - `ubicacion.community_id → communities(id)` con `ON DELETE SET NULL`
- Consistencia mínima:
  - `CHECK (community_id IS NULL OR municipality_id IS NOT NULL)`
- Validación de rangos lat/lng:
  - Los `CHECK` aceptan `NULL` y validan rango cuando hay valor.

### Flujo de datos (cómo se usa)
- Al crear **recolección/vivero/plantación**:
  1. Backend crea `ubicacion` con `latitud/longitud` (y opcionalmente `municipality_id/community_id` o `municipio/comunidad` texto).
  2. La entidad (ej. `recoleccion`) guarda `ubicacion_id`.
  3. La pertenencia territorial se obtiene a través de `ubicacion`.

### Por qué esta decisión
- Evita duplicar campos de ubicación en muchas tablas.
- Permite evolucionar hacia mayor precisión (catálogo completo, polígonos) sin romper el modelo.
- Soporta el MVP: municipios listos desde el inicio y comunidades incrementales.

### Evolución futura
- Agregar geoespacial (centroid/polígonos) en `communities` para asignación automática por geofencing.
- Endpoints de “búsqueda por cercanía” usando PostGIS si se habilita.

