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
