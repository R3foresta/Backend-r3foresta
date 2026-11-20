# Buckets y rutas de imágenes

El backend elige el `bucket` y construye la `ruta_archivo` al recibir los archivos por multipart. La base de datos conserva ese par y el contexto de la evidencia. Las carpetas de Storage son prefijos de las rutas y aparecen con la primera carga. Vincular una foto a su evento o registro conserva su ubicación.

## Distribución

| Bucket | Rutas relativas y uso | Acceso |
|---|---|---|
| `recoleccion_fotos` | `captura/altas/<uuid>.<ext>` para altas y borradores nuevos, `captura/fichas/<recoleccion_id>/<uuid>.<ext>` para fotos añadidas a una ficha, `recepcion/pendientes/<usuario_id>/<recoleccion_id>/<uuid>.<ext>` para recepción de semillas. | URL pública legada. El Banco de semillas usa su propio endpoint de imagen sanitizada. |
| `vivero_evidencias` | `eventos/<tipo_evento>/<vivero_id>/<usuario_id>/<uuid>.<ext>`. Incluye `inicio`, `embolsado`, `adaptabilidad`, `merma`, `despacho` y `descarte_pre_embolsado`. La entrega por asignación usa `despacho`. | Privado. La API autoriza el objeto y firma la URL por 300 segundos. |
| `vivero_incorporaciones` | `vivero/incorporaciones/<usuario_id>/<solicitud_id>/<uuid>_<nombre>`, para la foto T5 de recepción o saldo inicial de plantas vivas. | Privado. Carga ADMIN global, recuperación pendiente propia e historial autorizado con firma temporal. |
| `participacion_evidencias` | `inicial/<usuario_id>/<comando_id>/<carga_id>/<generacion>/` para el registro inicial y `reposiciones/<usuario_id>/<subcampania_id>/<uuid>/` para la reposición. Cada foto tiene `original` y `derivada.jpg`. | Privado. Impacto sirve la versión sanitizada elegible a través de la API pública. |
| `fotos_plantas` | Imágenes del catálogo de especies. | Público. |
| `imagenes-perfil` | Imágenes de perfil. | Público. |
| `organizaciones` | Logos de organizaciones. | Público. |

Ejemplo de una foto nueva de `EMBOLSADO` del vivero `2`, subida por el usuario `11`.

```text
vivero_evidencias/
└── eventos/
    └── embolsado/
        └── 2/
            └── 11/
                └── 0a000000-0000-4000-8000-000000000001.jpg
```

La ruta M2 contiene el vivero y el usuario que cargó la foto. El lote y estado de vinculación se comprueban en `m2_evidencia_contexto` y `evidencias_trazabilidad`. El timeline distingue `signed_url` para fotos privadas y `public_url` para las públicas legadas. Las vistas de evento y de trazabilidad que ya devuelven `public_url` entregan en ese campo la URL firmada de las fotos privadas nuevas. Si falla la firma conservan los metadatos y devuelven `null`. El timeline informa `ERROR_FIRMA`. Para renovar una URL se vuelve a pedir la lectura autorizada.

Las fotos M2 ya registradas bajo `recoleccion_fotos/vivero/eventos/pendientes/` se leen por su ubicación guardada. Impacto también lee las fotos históricas elegibles de Plantación desde `recoleccion_fotos` y sanitiza sus bytes antes de servirlas. Las reservas y generaciones M3 anteriores a `inicial/` conservan sus rutas, incluso si se recuperan o finalizan después del cambio.

## Código que decide el destino

| Operación | Entrada de código |
|---|---|
| Captura M1 | [Altas y borradores](../../src/recolecciones/application/recoleccion-evidencias.service.ts) y [adjuntos a una ficha](../../src/evidencias-trazabilidad/evidencias-trazabilidad.service.ts) |
| Recepción de semillas | [RecoleccionRecepcionService](../../src/recolecciones/application/recoleccion-recepcion.service.ts) |
| Eventos M2 e incorporación T5 | [ViveroEvidenciasService](../../src/lotes-vivero/application/vivero-evidencias.service.ts), [proyección de URLs](../../src/lotes-vivero/application/vivero-evidencia-url.ts) y [migración 120](../../migrations/120_vivero_evidencias_storage.sql) |
| Plantación inicial | [Migración 121](../../migrations/121_plantacion_evidencias_prefijo_inicial.sql) sobre `pa_cargas_operar` de [074](../../migrations/074_pa_int03a_cargas.sql), que reserva las dos rutas. [ParticipacionCargasService](../../src/participacion/cargas/participacion-cargas.service.ts) escribe los archivos. |
| Reposición interna | [PlantacionEvidenciasService](../../src/plantaciones/application/plantacion-evidencias.service.ts) prepara el original y el JPEG sanitizado. |

## Aplicación durante el reinicio de dev

1. Verificar el proyecto Supabase de destino y pausar las escrituras operativas. Si corresponde vaciar datos de prueba, seguir el [reinicio con plan SQL y plan Storage](../../test/README.md#reinicio-operativo-de-datos-de-prueba). El inventario de Storage incluye los buckets operativos y conserva las imágenes de catálogo, perfiles y organizaciones. `r3foresta-conciliacion` y `RECOLECCION_FOTOS` se consideran legados en el inventario de limpieza si existen.
2. Aplicar las migraciones aditivas [120](../../migrations/120_vivero_evidencias_storage.sql) y [121](../../migrations/121_plantacion_evidencias_prefijo_inicial.sql). La 120 instala las políticas restrictivas de Storage y coordina la preparación y vinculación de fotos M2. La 121 valida la definición instalada de `pa_cargas_operar` antes de cambiar el prefijo de generaciones nuevas. Conservar pausadas las cargas M2 hasta actualizar el backend, que envía a la 120 el bucket y la ruta nuevos.
3. Crear `vivero_evidencias` como bucket estándar privado desde **Storage → New bucket** o con `createBucket` de la API. Usar un máximo por archivo de **15 MiB (15 728 640 bytes)** y los MIME `image/jpeg`, `image/png`, `image/webp`, `image/heic` e `image/heif`. La API de Storage gestiona el bucket y sus objetos. [Creación de buckets en Supabase](https://supabase.com/docs/guides/storage/buckets/creating-buckets) · [Esquema de Storage](https://supabase.com/docs/guides/storage/schema/design)
4. Desplegar el backend del corte. Comprobar una carga y lectura en cada recorrido habilitado. Recolección debe usar `captura/` o `recepcion/`, Vivero el prefijo del evento y Plantación inicial `inicial/`. Probar la lectura M2 con un actor autorizado y otro fuera de ámbito, además de la imagen de Impacto sin sesión sobre un registro elegible.

## Estado del corte del 20 de noviembre de 2026

Implementación local sobre `ca1f994`. Build y 1 540 unitarios aprobados con Node 24.19.0. El runner de Vivero aprobó 44 grupos SQL, 22 carreras y 13 recorridos HTTP con PostgreSQL 14.17 aislado, RLS real y Storage sintético. La prueba M3 cubre reserva, finalización y preview. [Pruebas aisladas](../../test/README.md#postgresql-aislado-y-contratos)

La consulta de solo lectura a Storage dev confirmó `participacion_evidencias` y `vivero_incorporaciones` privados. `vivero_evidencias` falta en ese inventario. La aplicación de 120/121, la creación del bucket, el despliegue y las pruebas de carga en Supabase se registran al ejecutar el corte.
