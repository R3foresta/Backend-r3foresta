# API Reference — Reforesta Backend

**Última actualización**: 2026-08-11

## Tabla de Contenidos

1. [Convenciones Globales](#convenciones-globales)
2. [Enums de Referencia](#enums-de-referencia)
3. [Módulos Documentados](#módulos-documentados)

---

## Convenciones Globales

### URLs Base
- **Desarrollo**: `http://localhost:3000/api`
- **Producción**: `https://<dominio>/api`

### Salud del backend

`GET /health` es público y no usa el prefijo `/api`. Sirve para comprobar o
despertar el proceso antes del login; no consulta Supabase ni otros servicios
externos.

```json
{
  "status": "ok",
  "service": "r3foresta-backend",
  "timestamp": "2026-08-11T12:00:00.000Z",
  "uptimeSeconds": 42
}
```

### Autenticación

Todos los endpoints requieren el header:
```
x-auth-id: <supabase_auth_id>
```

**Excepciones**: Endpoints de auth (login, registro) — ver módulo Usuarios.

**Roles válidos**:
- `ADMIN` — Acceso total, creación de campañas/organizaciones
- `VALIDADOR` — Valida recolecciones, acceso a datos operativos
- `GENERAL` — Acceso básico, lectura/escritura en módulos asignados
- `VOLUNTARIO` — Acceso limitado, solo lectura en vistas públicas

### Content-Type
- **JSON**: `application/json` (default)
- **Multipart**: `multipart/form-data` — Indicado en cada endpoint con 📎

### Errores Comunes

| Status | Escenario |
|--------|-----------|
| **400** | Validación fallida: datos inválidos, formato incorrecto, parámetros malformados |
| **401** | Header `x-auth-id` ausente, vacío o token JWT inválido |
| **403** | Rol insuficiente para la acción solicitada |
| **404** | Recurso no encontrado |
| **409** | Conflicto: duplicado (ej. email, username, nombre único ya existe) |
| **422** | Violación de regla de negocio (estado inválido, falta de datos, etc.) |
| **500** | Error interno del servidor |

### Respuestas

**Éxito (GET list)**:
```json
{
  "success": true,
  "data": [
    { "id": 1, "nombre": "...", ... },
    { "id": 2, "nombre": "...", ... }
  ]
}
```

**Éxito (GET detail / POST / PATCH / DELETE)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "...",
    ...
  }
}
```

**Error**:
```json
{
  "statusCode": 400,
  "message": "Descripción del error",
  "error": "Bad Request"
}
```

---

## Enums de Referencia

### TipoCampania
Clasificación de campañas:
```
REFORESTACION | ARBORIZACION | FORESTACION
```

### TipoOrganizacion
Clasificación de organizaciones:
```
ONG | EMPRESA_PRIVADA | EMPRESA_PUBLICA | FUNDACION | ETFs | ALCALDIA | ASOCIACION_CIUDADANA | OTRO
```

### EstadoSubcampania
Estados del ciclo de vida de una subcampaña:
```
BORRADOR       — Creada, no activada
ACTIVA         — En ejecución
COMPLETADA     — Alcanzó meta al 100%
FINALIZADA_PARCIAL — Cerrada con meta parcial
PAUSADA        — Detenida temporalmente
CANCELADA      — Cancelada
```

### FaseMantenimientoSubcampania
Fase post-plantación:
```
NO_APLICA            — Sin mantenimiento previsto
MANTENIMIENTO_ACTIVO — En mantenimiento activo
MONITOREO_HISTORICO  — Monitoreo sin intervención
```

### MotivoCierreParcial
Razones de cierre parcial:
```
FALTA_STOCK
PROBLEMAS_CLIMATICOS
CANCELACION_CONVENIO
CONFLICTO_SOCIAL
ACCESO_RESTRINGIDO
CAMBIO_PRIORIDAD_INSTITUCIONAL
RIESGO_OPERATIVO
META_REDEFINIDA
CIERRE_ADMINISTRATIVO
OTRO
```

### RolEnSubcampania
Roles dentro de una subcampaña:
```
COORDINADOR | OPERARIO
```

### PropositoAsignacion
Propósito al asignar un lote:
```
PLANTACION_INICIAL | REPOSICION
```

---

## Módulos Documentados

### [1. Usuarios](modulos/usuarios.md)
- `GET /users` — Listar usuarios (selector)
- `GET /users/rol/:rol` — Listar usuarios por rol
- `GET /users/profile` — Perfil del usuario autenticado
- `POST /users/register-form` — Completar registro
- `PATCH /users/profile/photo` 📎 — Subir foto de perfil

### [2. Ubicaciones](modulos/ubicaciones.md)
- `GET /ubicaciones/paises` — Listar países
- `GET /ubicaciones/divisiones` — Listar divisiones administrativas
- `POST /ubicaciones/divisiones/flexible` — Crear/recuperar división flexible

### [3. Organizaciones](modulos/organizaciones.md)
- `POST /organizaciones` 📎 — Crear organización
- `GET /organizaciones` — Listar
- `GET /organizaciones/:id` — Detalle
- `PATCH /organizaciones/:id` — Editar
- `DELETE /organizaciones/:id` — Borrar (soft)
- `POST /organizaciones/:id/logo` 📎 — Subir logo
- `DELETE /organizaciones/:id/logo` — Eliminar logo

### [4. Campañas](modulos/campanias.md)
- [Guía de desactivación con cancelación masiva](desactivacion-campania-cancelacion-masiva.md)
- `POST /campanias` — Crear
- `GET /campanias` — Listar
- `GET /campanias/resumen` — Métricas globales para el dashboard
- `GET /campanias/:id` — Detalle
- `GET /campanias/:id/subcampanias` — Listar subcampañas de la campaña
- `GET /campanias/:id/metrics` — Métricas de una campaña
- `GET /campanias/:id/activity` — Actividad reciente de una campaña
- `PATCH /campanias/:id` — Editar
- `DELETE /campanias/:id` — Soft-delete estricto, sin cascada
- `GET /campanias/:id/desactivacion/preview` — Previsualizar elegibilidad y devoluciones
- `POST /campanias/:id/desactivar` — Cancelar subcampañas sin plantaciones y desactivar atómicamente
- `POST /campanias/:id/organizaciones` — Asociar orgs
- `DELETE /campanias/:id/organizaciones/:orgId` — Desasociar

### [5. Subcampañas](modulos/subcampanias.md)
- `POST /subcampanias` — Crear
- `GET /subcampanias` — Listar
- `GET /subcampanias/:id` — Detalle
- `PATCH /subcampanias/:id` — Editar
- `DELETE /subcampanias/:id` — Borrar
- `POST /subcampanias/:id/poligono` — Establecer polígono GeoJSON
- `POST /subcampanias/:id/activar` — Activar
- `POST /subcampanias/:id/cerrar` — Cerrar
- `POST /subcampanias/:id/cancelar` — Cancelar sin plantaciones (admite BORRADOR sin polígono)
- `GET /subcampanias/:id/equipo` — Listar equipo
- `POST /subcampanias/:id/equipo` — Agregar miembro
- `DELETE /subcampanias/:id/equipo/:usuarioId` — Remover miembro

### [6. Lotes de Vivero (M3)](modulos/lotes-vivero-m3.md)
Endpoints relevantes para el flujo de asignación física de M3 (ver [guía de migración](guia-migracion-asignacion-fisica.md)):
- `GET /lotes-vivero` — Listar lotes (saldo físico + asignado a subcampañas)
- `GET /lotes-vivero/stock/especies` — Stock físico asignable agrupado por especie
- `GET /lotes-vivero/:id` — Detalle del lote
- `GET /lotes-vivero/:id/saldos` — Saldos del contrato físico (RN-VIV-57)
- `POST /lotes-vivero/:id/asignaciones` — Entrega física a subcampaña (descuenta saldo, exige evidencia)
- `GET /lotes-vivero/:id/asignaciones` — Ver asignaciones activas
- `POST /lotes-vivero/:id/asignaciones/:asignacionId/devolucion` — Devolución física al vivero
- `GET /lotes-vivero/:id/timeline` — Historial (read-only)

> Removidos (2026-07): `POST /:id/reservas` y `DELETE /:id/asignaciones/:asignacionId`.

### [7. Plantaciones](modulos/plantaciones.md)
- `POST /registros-plantacion/evidencias-pendientes` 📎 — Crear evidencias
- `POST /registros-plantacion` — Registrar plantación

---

## Notas Importantes

### Campos GENERATED (Calculados en BD)
Campos como `saldo_vivo_actual`, `estado_derivado`, `cantidad_asignada` son **generados/calculados por vistas o triggers** en Supabase. **El frontend nunca los envía**, solo los lee.

### GeoJSON Polígono
Formato exacto para subcampañas:
```json
{
  "poligono": {
    "type": "Polygon",
    "coordinates": [
      [ [lng, lat], [lng, lat], [lng, lat], [lng, lat] ]
    ]
  }
}
```
⚠️ Orden es **[longitud, latitud]**, no latitud/longitud.

### Autenticación en Desarrollo
Algunos endpoints aceptan `x-auth-id` directamente (sin JWT) en modo dev. Ver `users.controller.ts`.

### Límites de Archivos
- **Foto de perfil**: máx. 2 MB, PNG/JPEG/WebP
- **Logo de organización**: máx. 2 MB, PNG/JPEG/WebP
- **Fotos de evidencias**: máx. 5 archivos por request

### Pre-condiciones (Lifecycle)
Endpoints como `/activar` y `/cerrar` en subcampañas requieren ciertos estados previos. `POST /subcampanias/:id/activar` exige polígono, coordinador y plan de metas por especie completo; **no** exige stock asignado (la asignación física ocurre después de activar, RF-VIV-11). Ver detalles en módulo Subcampañas.

---

## Cómo Usar Esta Documentación

1. **Referencia rápida**: Este archivo (`api-reference.md`) — convenciones, enums, índice
2. **Detalles de endpoint**: Ir a `modulos/<nombre>.md` correspondiente
3. **Testing**: Usar cURLs de ejemplo en cada endpoint (copiar/pegar directo)
4. **Integración IA**: Cargar un archivo de módulo (`modulos/*.md`) para contexto específico

```
documentacion/frontend/
├── api-reference.md (este archivo)
└── modulos/
    ├── usuarios.md
    ├── ubicaciones.md
    ├── organizaciones.md
    ├── campanias.md
    ├── subcampanias.md
    ├── lotes-vivero-m3.md
    └── plantaciones.md
```

---

**Generado para**: Frontend contracts + testing + AI integration  
**Formato**: Markdown optimizado para lectura por máquina (tablas, bloques de código, estructura consistente)
