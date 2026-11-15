# T5 · incorporación de plantas vivas con procedencia

Implementación backend local del 13 de noviembre, corregida tras revisión el
14 de noviembre de 2026. La integración del15 añade el cierre ADMIN109 después
de108; [contratos y verificación local](t5-integracion-backend-2026-11-15.md).
Requiere100 y las migraciones aditivas101–109, en orden.
[Correcciones anteriores](t5-revision-2026-11-14.md). No acredita
SQL aplicado, bucket creado, commit, push, despliegue ni integración PWA.

El núcleo registra una recepción de compra/donación o un conteo inicial de
plantas vivas en un vivero real. Cada ingreso crea un lote homogéneo nuevo;
no suma a un lote anterior ni consume Recolección. Adaptabilidad, merma,
despacho, asignación, consumo y devolución conservan el inventario existente.

## Modelo y fuentes

| Información | Fuente única del hecho |
|---|---|
| Especie, vivero obligatorio, código y snapshots | `lote_vivero` |
| Cantidad inicial viva y saldo físico actual | `lote_vivero.plantas_vivas_iniciales` / `saldo_vivo_actual` |
| Cantidad recibida/contada y día físico | Evento `INCORPORACION`: `cantidad_afectada` / `fecha_evento` |
| Actor, antecedentes y límites | Evento: `responsable_id` / `observaciones` |
| Modalidad, procedencia, tercero y referencia | `vivero_incorporacion`, extensión 1:1 por `evento_id` |
| Clave y comparación de intención | Extensión: `solicitud_id` único / `huella_solicitud` JSONB versión 1 |
| Hora real de nuevas confirmaciones | Extensión: `registrado_en` TIMESTAMPTZ |
| Fotos | `evidencias_trazabilidad`; contexto previo existente `m2_evidencia_contexto` ampliado con solicitud |
| Plantas efectivamente consumidas | `registro_plantacion_detalle`, con asignación y lote originales |

`created_at` de lote/evento sigue siendo DATE desde 015: no representa hora
histórica. `recoleccion_id`, material, cantidad y unidad en proceso son `null`
para incorporaciones; no hay `REC-0`, semilla ficticia ni EMBOLSADO artificial.
Los códigos antiguos se conservan; el nuevo código independiente comienza
por `VIV-INC-`, pero el origen se consulta por sus relaciones, no por el código.

`RECEPCION` admite `COMPRA` y `DONACION`. `SALDO_INICIAL` admite además
`PRODUCCION_PROPIA` y `DESCONOCIDA`; esta última exige observaciones. No abre
producción nueva fuera de M1. Tercero y referencia son textos opcionales de
hasta 200 caracteres; observaciones hasta 1000. La referencia no es única:
una factura puede respaldar varias entregas reales.

Ejemplo: compra antigua de 300, conteo actual de 210 →
`SALDO_INICIAL/COMPRA`, cantidad 210. Las 300 y los límites se describen en
observaciones; no se registran compra nueva de 300 ni merma ficticia de 90.
El conteo no acredita historia anterior, edad biológica o supervivencia.

La idempotencia evita repetir la misma solicitud. Antes del inventario inicial
deben excluirse las plantas ya representadas en otro lote: cambiar de UUID no
identifica por sí solo un ingreso físico distinto. Esta conciliación del conteo
es operativa; el alta no incorpora un motor adicional de deduplicación física.

## API y autorización

Todas las rutas usan Bearer JWT verificado, cuenta activa y respuestas
`private, no-store`. La autoridad se revalida en la RPC bajo lock de cuenta.
Las nuevas incorporaciones y fotos pendientes requieren ADMIN global actual.
GENERAL/VALIDADOR con M2 no pueden crearlas; sus demás operaciones M2/T4
conservan la autorización vigente. No requieren M1 ni una segunda aprobación.
No se aceptan actor ni rol del body.

| Método y ruta bajo `/api/lotes-vivero/incorporaciones` | Contrato |
|---|---|
| `POST /:solicitud_id/evidencias-pendientes` | Multipart `vivero_id`, `fotos` (1–5), opcionales `titulo`, `descripcion`, `metadata`, `tomado_en`, `es_principal` |
| `GET /:solicitud_id/evidencias-pendientes?vivero_id=...` | Recupera fotos aún pendientes propias del mismo contexto; exige ADMIN global actual |
| `POST /` | Confirma el alta atómica con el JSON siguiente |
| `GET /:solicitud_id` | Recupera éxito propio con cuenta activa, incluso sin rol interno o vigencia actuales |

El `POST /` también conserva el replay propio de una solicitud ya CONFIRMADA
con UUID e intención idénticos después de perder ADMIN. Una nueva clave exige
ADMIN; otra intención produce409 y una solicitud ajena403. El guard conserva
cuentas activas de cualquier rol para permitir esa recuperación; no autoriza
por ello nuevas escrituras.109 verifica el rol bajo SHARE de la cuenta, antes
de confirmar o preparar fotos, coordinado con los cambios de autoridad072.
El servicio rechaza fotos no autorizadas antes de preparar/subir archivos.
Los rechazos no crean un resultado durable.

Crear un UUID por intención y conservarlo **antes** de subir fotos. El UUID
es insensible a mayúsculas; los paths se normalizan a minúsculas. No enviar
base64 ni `Content-Type` manual en multipart. Las imágenes admiten
JPEG/PNG/WEBP/HEIC/HEIF, hasta 15 MiB por archivo. Son fotos de recepción o
conteo, no un canal para facturas o documentos sensibles.

```http
POST /api/lotes-vivero/incorporaciones
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "solicitud_id": "1b2bb918-50db-4eec-8bad-4e7300c41ce3",
  "vivero_id": "2",
  "planta_id": "10",
  "modalidad": "RECEPCION",
  "procedencia": "COMPRA",
  "fecha_evento": "2026-11-13",
  "cantidad": 100,
  "tercero_origen": "Proveedor declarado",
  "referencia_documental": "Entrega 1 de la referencia ABC",
  "observaciones": "Plantas recibidas físicamente; origen biológico no verificado.",
  "evidencia_ids": ["501"]
}
```

`cantidad` es un entero de 1 a 2147483647. Los IDs nuevos son cadenas BIGINT
exactas; entradas legadas numéricas sólo se aceptan si son seguras. Fecha
`YYYY-MM-DD`, sin futuro, ventana inclusiva de diez días en `America/La_Paz`,
también para conteo inicial. La fecha de adquisición antigua va como antecedente;
saldo inicial no habilita retroactividad global. Los movimientos posteriores
deben respetar el nacimiento vivo y las fechas de sus operaciones actuales.

```json
{
  "success": true,
  "estado": "CONFIRMADO",
  "data": {
    "solicitud_id": "1b2bb918-50db-4eec-8bad-4e7300c41ce3",
    "lote_vivero_id": "101",
    "evento_incorporacion_id": "202",
    "codigo_trazabilidad": "VIV-INC-1b2bb91850db4eec8bad4e7300c41ce3",
    "modalidad": "RECEPCION",
    "procedencia": "COMPRA",
    "fecha_evento": "2026-11-13",
    "cantidad": 100,
    "saldo_vivo_antes": 0,
    "saldo_vivo_despues": 100,
    "evidencia_ids_vinculadas": ["501"]
  }
}
```

El recibo también conserva vivero/especie, textos y snapshots iniciales. Su
saldo de 100 sigue siendo el saldo inicial confirmado después de una merma,
entrega o devolución; el saldo actual se consulta en la ficha M2 autorizada.

## Transacción y reintento

La RPC serializa cuenta → solicitud → lote nuevo → fotos ordenadas por ID.
Confirma lote, evento, extensión y vínculos en la misma transacción. Una
restricción única y una relectura tras el lock resuelven altas concurrentes.
La huella JSONB v1 normaliza IDs decimales, día, cantidad, textos `btrim`/NFC
o `null` y el conjunto de evidencias ordenado. No depende del saldo posterior.

Misma clave, autor e intención devuelve el mismo hecho. Otra intención da 409;
otro autor no obtiene el recibo. El replay propio sólo exige cuenta activa;
una escritura nueva vuelve a exigir autoridad vigente. Hecho, snapshots, clave
y eventos incorporados se conservan inmutables. No hay motor de corrección,
anulación o reciclaje de claves. La base viva única y las comprobaciones
diferidas impiden otra INCORPORACION, un EMBOLSADO adicional o una extensión
sin el evento/tipo/lote correspondientes, incluso en DML privilegiado permitido.

Sólo se persisten altas confirmadas. No existen PREPARADO persistido ni rechazo
durable. Timeout, 503 o `SIN_RESULTADO` son inconclusos: conservar solicitud,
intención y evidencias; consultar y eventualmente reenviar explícitamente la
misma intención y clave. Una ausencia no demuestra rollback. No crear otra
clave automáticamente. Una carga de fotos no acredita un ingreso de stock.

Storage está fuera de SQL. Ante incertidumbre después de intentar la RPC de
fotos no se borran objetos; la lectura de pendientes permite recuperar IDs.
La limpieza automática se limita a cargas propias ante un rechazo concluyente.
Los sobrantes inciertos requieren conciliación posterior, no borrado ciego.

## Lecturas y continuidad

Listado y detalle M2 agregan `origen.tipo=RECOLECCION|INCORPORACION`; este último
incluye modalidad, procedencia, tercero, referencia, día, cantidad y límites.
`historia_previa_no_registrada=true` identifica saldo inicial. Se preservan nulos,
snapshots y lotes agotados, accesibles con el filtro histórico existente.
El mapa de últimos eventos y timeline incluyen INCORPORACION. Para su
responsable se usa el snapshot de creación, no su nombre actual.

Las rutas genéricas `/api/evidencias-trazabilidad` excluyen el bucket privado
`vivero_incorporaciones`, también al listar por entidad; una consulta por ID
responde404 incluso para quien tiene acceso M2. Las fotos vinculadas se acceden
por `GET /api/lotes-vivero/:id/timeline` y las pendientes por el contexto propio
de la solicitud. Ambos flujos conservan su autorización y usan `signed_url`
de300segundos; no se construye `public_url` para este bucket.

Asignar descuenta Vivero una sola vez; Plantación consume la asignación.
Devolver repone el mismo lote de origen. Ejemplo: incorporar100, merma10,
entregar60, plantar45 y devolver15 → vivero45, campo0, plantadas45, merma10.
La devolución no es una nueva adquisición. Compra/saldo inicial no deben
contarse como producción del período; ésta conserva su evento EMBOLSADO.

La reposición interna conserva asignación, lote y especie exactos desde el DTO
hasta PostgreSQL y la respuesta, mediante106. Cadenas BIGINT se mantienen sin
convertirlas a Number; los números JSON sólo se aceptan si son seguros.106
proyecta IDs de consumos y arrays como texto antes de que Node parsee JSON y
conserva una sola ejecución de077, sin cambiar su autoridad ni sus efectos.

La [lectura propia mínima M3](t5-m3-procedencia.md) muestra cantidades finales
persistidas por lote/asignación, sin revelar ficha, terceros, textos o fotos M2.
No exige acceso M2 y no agrega datos privados a Impacto público. Los detalles
nuevos heredan nombres y variedad desde el lote; no se reescriben históricos.
La guía enlazada detalla los cambios PWA pendientes (`OrigenCard`, snapshots,
`VALID_KINDS`, URLs firmadas y consumos propios). La PWA no se modificó aquí.

## Aplicación y corte pendientes

La aplicación de SQL y los cambios del entorno los realizará Pablo después de
revisar esta entrega; esta tarea no los ejecuta. El cotejo integral del catálogo
destino sigue pendiente. Se recibió un extracto focal de los siete helpers de102;
[compatibilidad de la definición de fechas aportada](t5-102-fecha-compatibilidad.md).
Preparación propuesta para ese corte:

1. Ejecutar y revisar el [diagnóstico de catálogo de solo lectura](../scripts/qa/vivero-incorporacion-107-diagnostico.sql)
   antes de aplicar. Contrastar100, la RPC de EMBOLSADO095 y los CHECK010:
   el conflicto encontrado es local, no una afirmación sobre el destino.
   Mantener respaldo y pausar las escrituras durante el corte; sin resets ni
   reaplicación de100. Ante una discrepancia, revisar el JSON; no omitir preflight.
2. Aplicar en orden101 →102 →103 →104 →105 →106 →107; confirmar la transacción
   ENUM de101 antes de102. Los preflight fallan ante drift y no lo reparan.
   [Justificación de107 y conservación del legado](t5-107-embolsado.md).
3. Crear `vivero_incorporaciones` por la API oficial de Storage: privado,
   15728640 bytes, formatos anteriores. Si existe con otra configuración,
   revisar en destino.104 sólo instala políticas restrictivas de ese bucket;
   no crea buckets, mueve objetos ni privatiza almacenamiento legado.
4. Cotejar RLS, grants efectivos y configuración del bucket con el
   [diagnóstico de sólo lectura](../scripts/qa/vivero-incorporacion-storage-estado.sql).
   El backend falla antes de subir si el bucket falta o es público; las lecturas
   autorizadas usan URL firmada de 300 segundos, nunca `getPublicUrl` para T5.
5. Publicar backend y adaptar PWA de forma coordinada. Verificar HTTP/Storage
   en el entorno real por separado. Las pruebas locales no acreditan ese corte.

El estado canónico del repositorio hermano sigue requiriendo actualización
autorizada allí; se entrega una [propuesta concreta](t5-actualizacion-canonica.md).

## Límites funcionales conservados

No se incorpora aptitud EN_CUIDADO/LISTA_PARA_ENTREGA ni se certifica madurez.
No se abre recepción directa en campo, producción nueva fuera de M1, inventario
inicial en proceso, históricos ya plantados, transferencias o mezcla/división.
La merma del stock asignado en campo sigue sin comando operativo. La cancelación
vigente conserva su devolución automática y requiere una propuesta separada
para exigir recepción física. LIFO conserva atribución registrada, que no prueba
selección física cuando se mezclan lotes de la misma especie. Correcciones y
anulación de incorporaciones requieren un contrato aparte.

[OpenAPI M2 consumible](vivero-acceso-openapi.json) ·
[Revisión vigente y evidencia](t5-revision-2026-11-14.md) ·
[Verificación anterior del13](t5-validacion-local.md) ·
[Propuesta histórica de mayor alcance](../documentacion/tareas/plan-incorporacion-plantas-procedencia.md).
