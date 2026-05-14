# Módulo: Recolecciones

Gestión del registro de recolecciones de material vegetal (semillas/esquejes) desde el campo. Es el **primer paso** del flujo de trazabilidad; las recolecciones validadas alimentan el módulo [Lotes de Vivero](./lotes-vivero.md) y disparan el minting NFT vía [Pinata + Blockchain](./pinata-integracion.md).

Código fuente: [src/recolecciones/](../../src/recolecciones/).

## Arquitectura

```
recolecciones.module.ts
├── RecoleccionesController            (api/recolecciones.controller.ts)
└── RecoleccionesService               (orquestador en application/)
    ├── RecoleccionAuthService         resuelve x-auth-id + permisos
    ├── RecoleccionCreationService     creación de borrador
    ├── RecoleccionDraftService        edición de borrador
    ├── RecoleccionValidacionService   submit / approve / reject
    ├── RecoleccionConsultasService    findAll / findOne / findByVivero / pending
    ├── RecoleccionEvidenciasService   subida de fotos a Supabase Storage
    ├── RecoleccionUbicacionService    persistencia de ubicaciones
    ├── RecoleccionCodigosService      genera codigo_trazabilidad
    ├── RecoleccionCompletitudService  reglas de completitud
    ├── RecoleccionElegibilidadService elegibilidad para iniciar lote de vivero
    ├── RecoleccionHistorialService    historial de cambios
    ├── RecoleccionSnapshotsService    snapshots para lotes
    └── RecoleccionBlockchainService   Pinata + mint NFT
```

`api/parsers/recoleccion-formdata.parser.ts` parsea multipart/form-data para `POST` y `PATCH :id/draft`.

## Ciclo de vida

```
[POST /recolecciones]
        │
        ▼
   BORRADOR ──(PATCH /:id/draft)──► BORRADOR  (editable)
        │
        │ PATCH /:id/submit
        ▼
   PENDIENTE_VALIDACION
        │
        ├── PATCH /:id/approve (VALIDADOR/ADMIN) ──► VALIDADO
        │       └─► Pinata upload + Blockchain mint
        │
        └── PATCH /:id/reject  (VALIDADOR/ADMIN) ──► RECHAZADO
```

Enum `EstadoRegistro`: `BORRADOR | PENDIENTE_VALIDACION | VALIDADO | RECHAZADO` ([src/recolecciones/domain/enums/estado-registro.enum.ts](../../src/recolecciones/domain/enums/estado-registro.enum.ts)).

Saldo operativo: ver [ADR 001](../arquitectura/adr/001-saldo-operativo-recoleccion.md). Columnas `saldo_actual` y `estado_operativo` se mantienen mediante trigger (migración 011).

## Enums del dominio

| Enum | Valores |
|---|---|
| `EstadoRegistro` | `BORRADOR`, `PENDIENTE_VALIDACION`, `VALIDADO`, `RECHAZADO` |
| `TipoMaterial` | `SEMILLA`, `ESQUEJE` |
| `FuentePlanta` | `NATIVA`, `INTRODUCIDA`, `ENDEMICA` |
| Unidad canónica de entrada | `KG`, `G`, `UNIDAD` (KG se normaliza a G antes de persistir) |
| Fuente ubicación | `GPS_MOVIL`, `MAPA`, `MANUAL`, `LEGACY` |

## Endpoints

Todos exigen header `x-auth-id`. Aquellos marcados con `*` también exigen `x-user-role`.

| HTTP | Ruta | DTO | Rol | Notas |
|---|---|---|---|---|
| POST | `/api/recolecciones` | `CreateRecoleccionDto` (multipart) | GENERAL+ | Crea en `BORRADOR`. Acepta `fotos` (1-5 archivos JPG/PNG) |
| PATCH | `/api/recolecciones/:id/draft` * | `UpdateDraftDto` (multipart) | dueño / ADMIN | Solo si `estado_registro = BORRADOR` |
| PATCH | `/api/recolecciones/:id/submit` * | — | dueño | `BORRADOR` → `PENDIENTE_VALIDACION` |
| PATCH | `/api/recolecciones/:id/approve` * | — | VALIDADOR / ADMIN | `PENDIENTE_VALIDACION` → `VALIDADO`. Ejecuta Pinata + mint |
| PATCH | `/api/recolecciones/:id/reject` * | `RejectValidationDto` | VALIDADOR / ADMIN | `PENDIENTE_VALIDACION` → `RECHAZADO`. `motivo_rechazo` 10–500 chars |
| GET | `/api/recolecciones/pending-validation` * | `FiltersRecoleccionDto` (query) | VALIDADOR / ADMIN | Lista para bandeja de validación |
| GET | `/api/recolecciones` | `FiltersRecoleccionDto` (query) | GENERAL+ | Filtra por usuario del header |
| GET | `/api/recolecciones/vivero/:viveroId` | `FiltersRecoleccionDto` (query) | abierto | No exige `x-auth-id` |
| GET | `/api/recolecciones/:id` | `RecoleccionElegibilidadViveroQueryDto` | abierto | Devuelve detalle + flag de elegibilidad para vivero si se pasa `cantidad_solicitada_vivero` |

## DTO de creación (resumen)

`CreateRecoleccionDto` ([src/recolecciones/api/dto/create-recoleccion.dto.ts](../../src/recolecciones/api/dto/create-recoleccion.dto.ts)) — campos relevantes:

| Campo | Tipo | Requerido | Reglas |
|---|---|---|---|
| `fecha` | ISO date | sí | No futura; no más de 45 días atrás |
| `cantidad_inicial_canonica` | number ≥ 0.01 | sí | |
| `unidad_canonica` | `KG \| G \| UNIDAD` | sí | KG se normaliza a G |
| `tipo_material` | `SEMILLA \| ESQUEJE` | sí | |
| `planta_id` | int | sí | Debe existir en catálogo `planta` |
| `metodo_id` | int | sí | Debe existir en `metodo_recoleccion` |
| `vivero_id` | int | no | Opcional |
| `observaciones` | string ≤ 1000 | no | |
| `ubicacion` | `CreateUbicacionDto` | sí | Anidado |
| `fotos` | File[] 1–5 | sí (multipart) | JPG/PNG |

`CreateUbicacionDto` requiere `latitud` (-90..90) y `longitud` (-180..180). Opcionales: `pais_id`, `division_id`, `nombre`, `referencia`, `precision_m`, `fuente`.

## Filtros (`FiltersRecoleccionDto`)

`fecha_inicio`, `fecha_fin`, `vivero_id`, `tipo_material`, `page` (default 1), `limit` (default 10, max 50), `q` o `search` (búsqueda libre sobre `codigo_trazabilidad`, `observaciones`, snapshots de planta/comunidad/recolector, y por `planta_id` vía catálogo).

## Respuesta de detalle (campos persistidos)

`id, fecha, created_at, tipo_material, cantidad_inicial_canonica, unidad_canonica, saldo_actual, estado_operativo, estado_registro, codigo_trazabilidad, observaciones, vivero_id, metodo_id, planta_id, usuario_id, ubicacion_id, blockchain_url, token_id, transaction_hash, usuario_validacion_id, fecha_validacion, especie_nueva, *_snapshot` + relaciones (`usuario`, `vivero`, `metodo`, `planta`).

## Integraciones laterales

- **Pinata + Blockchain**: ver [pinata-integracion.md](./pinata-integracion.md). Se dispara en `PATCH /:id/approve`.
- **Storage de fotos**: bucket `recoleccion_fotos` (migración 003). El frontend recibe URLs públicas.
- **Saldo y consumo hacia vivero**: la API de lotes de vivero llama RPC `fn_vivero_crear_lote_desde_recoleccion`, que descuenta `saldo_actual` atómicamente.

## Tests relevantes

- [src/recolecciones/tests/recolecciones.service.spec.ts](../../src/recolecciones/tests/recolecciones.service.spec.ts)
- [src/recolecciones/tests/recoleccion-elegibilidad.service.spec.ts](../../src/recolecciones/tests/recoleccion-elegibilidad.service.spec.ts)
- [src/recolecciones/tests/cantidad-unidad.policy.spec.ts](../../src/recolecciones/tests/cantidad-unidad.policy.spec.ts)
