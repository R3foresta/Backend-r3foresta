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
    ├── RecoleccionEliminacionService  soft delete + historial atómico (089)
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

Todas las rutas requieren Bearer JWT y cuenta interna activa mediante
`InternalActorGuard`. El guard adapta los headers legados desde la identidad
verificada; los marcados con `*` consumen además el rol derivado del servidor.
`x-auth-id` es opcional y debe coincidir con `sub`; no autentica por sí solo.

| HTTP | Ruta | DTO | Rol | Notas |
|---|---|---|---|---|
| POST | `/api/recolecciones` | `CreateRecoleccionDto` (multipart) | GENERAL+ | Crea en `BORRADOR`. Acepta `fotos` (2-10 archivos JPG/JPEG/PNG/WEBP/HEIC/HEIF) |
| PATCH | `/api/recolecciones/:id/draft` * | `UpdateDraftDto` (JSON/multipart) | dueño / ADMIN | `BORRADOR` o `RECHAZADO`; al corregir rechazado vuelve a `BORRADOR` |
| DELETE | `/api/recolecciones/:id` | — | dueño / ADMIN | Solo `BORRADOR`; soft delete + `BORRADOR_ELIMINADO` en RPC atómica 089; repetir devuelve 404 |
| PATCH | `/api/recolecciones/:id/submit` * | — | dueño | `BORRADOR` → `PENDIENTE_VALIDACION` |
| PATCH | `/api/recolecciones/:id/approve` * | — | VALIDADOR / ADMIN | `PENDIENTE_VALIDACION` → `VALIDADO`. Ejecuta Pinata + mint |
| PATCH | `/api/recolecciones/:id/reject` * | `RejectValidationDto` | VALIDADOR / ADMIN | `PENDIENTE_VALIDACION` → `RECHAZADO` sin límite por fecha; estado/motivo/historial atómicos (090). `motivo_rechazo` 10–500 chars |
| GET | `/api/recolecciones/pending-validation` * | `FiltersRecoleccionDto` (query) | cuenta interna | VALIDADOR / ADMIN ven pendientes globales; las demás cuentas internas, propios |
| GET | `/api/recolecciones` | `FiltersRecoleccionDto` (query) | cuenta interna | Lista propia de la identidad verificada, incluso para ADMIN |
| GET | `/api/recolecciones/vivero/:viveroId` | `FiltersRecoleccionDto` (query) | cuenta interna | Requiere Bearer |
| GET | `/api/recolecciones/:id` | `RecoleccionElegibilidadViveroQueryDto` | cuenta interna | Devuelve detalle + flag de elegibilidad para vivero si se pasa `cantidad_solicitada_vivero` |

El rechazo usa `fn_recoleccion_rechazar_validacion(bigint,bigint,text)` vía
`getAdminClient()`, con actor resuelto desde la identidad verificada. Revalida
cuenta activa y rol `VALIDADOR`/`ADMIN`, toma locks cuenta → recolección y confirma
estado, motivo e historial juntos. Acepta cualquier fecha de una ficha pendiente;
la aprobación conserva la ventana de 45 días y la prohibición de fechas futuras.
Captura, edición, corrección y reenvío conservan sus restricciones temporales.
Instalar/cotejar 090 antes de publicar este backend; [alcance y evidencia local](../../docs/recoleccion-rechazo-fecha.md).

RN-REC-09A usa `fn_recoleccion_eliminar_borrador(bigint,bigint)` vía cliente
administrativo privado y el actor de `InternalActorGuard`. La RPC toma locks en
orden cuenta → recolección y revalida cuenta activa, rol interno, propiedad y
estado. Conserva la fila, snapshots, fotos, ubicación, códigos y saldo; marca
usuario/fecha y agrega el historial append-only en una sola transacción.
El trigger de 089 impide modificar una ficha ya eliminada, incluso con un
UPDATE legado iniciado antes del DELETE. Las lecturas operativas y el banco
público excluyen `eliminado_en IS NOT NULL`; la comprobación de procesos de una
planta también excluye esos borradores, conservando sus referencias históricas.
`eliminado_en` devuelve DATE (015), calculada en `America/La_Paz` y obtenida del
valor persistido con RETURNING. El trigger del INSERT de evidencias toma FOR SHARE
del padre y rechaza vínculos posteriores al DELETE. La creación fallida usa
`fn_recoleccion_compensar_creacion`: solo compensa con cuenta creadora activa,
ficha BORRADOR viva y sin historial, bajo el mismo orden cuenta → ficha → evidencias.
Ficha y evidencias se eliminan juntas en esa compensación; el backend solo limpia
ubicación y archivos propios tras confirmar `compensado: true`. Ante resultado
incierto o historia confirmada conserva los recursos.

[Contrato frontend](../frontend/recolecciones.md#delete-apirecoleccionesid--rn-rec-09a)
y [verificación/orden de publicación](../../docs/recoleccion-soft-delete.md).

La lectura, inserción, conteo y limpieza de `evidencias_trazabilidad` usan
`getAdminClient()`, igual que las subidas y eliminaciones en Storage. La tabla
es privada tras el cierre de superficie 080/083; se requiere configuración privada
sin fallback público. El rol ADMIN de la cuenta no convierte al cliente público
de Supabase en cliente privado. El catálogo `tipos_entidad_evidencia` conserva
su consulta pública. La identidad verificada y los permisos por objeto siguen
siendo obligatorios.
La [regresión HTTP](../../src/recolecciones/tests/recolecciones-lectura.http.spec.ts)
simula SELECT público denegado y comprueba listado con fotos, filtro propio,
401 sin Bearer y 403 fuera de la audiencia interna.
[Versión, entorno y límites de la verificación local del 21 de octubre de 2026](../../docs/evidencia/recolecciones-lectura-privada-local-2026-10-21.json);
no acredita SQL o despliegue remoto.

En creación y edición, una subida parcial intenta limpiar las rutas ya subidas
antes de propagar el error original. En el INSERT de fotos del borrador, solo se
compensan rechazos SQL inequívocos (familias SQLSTATE 22/23/42 y P0002 con HTTP 4xx).
Si se pierde la respuesta o falla el transporte, timeout o parseo, se conservan
los archivos y se registra la incertidumbre sin rutas ni datos personales: las
filas podrían haberse confirmado. Un SELECT vacío inmediato no demuestra rollback;
el error requiere conciliación antes de reintentar, pues no hay recuperación durable.
Las compensaciones entre DB y Storage siguen siendo de mejor esfuerzo, sin
transacción distribuida ni recuperación durable; los errores devueltos al eliminar
evidencias o archivos se registran sin incluir rutas ni datos personales.
Las [regresiones de evidencias](../../src/recolecciones/tests/recoleccion-evidencias.service.spec.ts)
y [flujos con fotos privadas](../../src/recolecciones/tests/recoleccion-fotos-privadas.spec.ts)
distinguen clientes público/privado y simulan permisos públicos denegados. La
regresión con SDK instalado y transporte sintético confirma que una respuesta
perdida después del commit conserva los archivos referenciados.
Verificación local del **3 de noviembre de 2026**, sobre `9eef958` más estos cambios,
Node 24.19.0/npm 12.0.2: build y unitarios aprobados (**76 suites/1047 pruebas**),
con sockets locales autorizados para Supertest y dependencias externas sustituidas.
Pendiente comprobar creación, edición, validación y limpieza con DB/Storage reales
en el destino; esta corrección no aplica SQL ni acredita push o despliegue.

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
| `fotos` | File[] 2–10 | sí (multipart) | JPG/JPEG/PNG/WEBP/HEIC/HEIF |

`CreateUbicacionDto` requiere `latitud` (-90..90) y `longitud` (-180..180). Opcionales: `pais_id`, `division_id`, `nombre`, `referencia`, `precision_m`, `fuente`.

`UpdateDraftDto` admite estos datos de forma opcional, incluida `ubicacion` anidada.
En JSON se envía como objeto; en multipart se acepta texto JSON o notación de
corchetes `ubicacion[campo]`. Cuando se incluye, requiere latitud y longitud y se
validan también los catálogos país/división. Omitir ubicación o enviar la misma
conserva el ID actual. Una ubicación distinta crea otra fila y cambia únicamente
la referencia de esta recolección, conservando la anterior y refrescando snapshots
desde la ubicación efectiva. Ante un resultado incierto del cambio de referencia,
se conserva la nueva ubicación para evitar referencias rotas; puede requerir
conciliación. Las compensaciones de este flujo siguen siendo de mejor esfuerzo.
Omitir `fotos` conserva las evidencias existentes. La secuencia de corrección es
`RECHAZADO` → edición `BORRADOR` → submit `PENDIENTE_VALIDACION`.

Regresiones de [contrato HTTP](../../src/recolecciones/tests/recoleccion-draft-contrato.http.spec.ts)
y [persistencia de ubicación](../../src/recolecciones/tests/recoleccion-draft-ubicacion.service.spec.ts):
build y 78 suites/1086 pruebas aprobados en local el 3 de noviembre de 2026.
[Versión, entorno y límites](../../docs/evidencia/recoleccion-draft-ubicacion-local-2026-11-03.json).
El recorrido con navegador y DB/Storage reales conserva su comprobación separada.

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
