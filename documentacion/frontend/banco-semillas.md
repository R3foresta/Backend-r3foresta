# Banco público de semillas

Contrato backend del 21 de octubre de 2026 para el portal `r3foresta-impacto`.
Implementación en `src/impact/seed-bank`, `application/seed-bank.service.ts` y
`domain/policies/seed-bank.policy.ts`. Swagger completo en `/api/docs` y
`/api/docs-json`: DTO de filtros y schemas cerrados de las respuestas.

## Rutas y audiencia

| GET bajo `/api/v1/impact/seed-bank` | Resultado |
| --- | --- |
| ruta base | `{ success: true, data: { summary, filters, generatedAt } }` |
| `/collections` | `{ success: true, data: { items, page, pageSize, total, totalPages } }` |
| `/collections/:id` | `{ success: true, data: { ...registro, metodo, observaciones_publicas, fotos, generatedAt } }` |
| `/collections/:id/photos/:photoId` | JPEG sanitizado, sin EXIF/XMP ni URL del original |

Todas son anónimas, `Cache-Control: no-store`. No requieren Bearer, cookies,
cuenta, organización, rol ni `x-auth-id`; un Bearer inválido tampoco bloquea la
lectura pública. Las rutas privadas de Recolecciones conservan sus guards.
La configuración CORS general permite los orígenes Vercel actuales; para un
dominio propio añadir su origen a `CORS_ORIGINS` en el entorno servidor.

## Universo, cantidades y filtros

La fuente es `recoleccion`, exclusivamente `tipo_material = SEMILLA`, global
entre cuentas y viveros. Se incluyen `BORRADOR`, `PENDIENTE_VALIDACION`, `VALIDADO`
y `RECHAZADO`, con o sin saldo, fotos o acuñación. No se incluyen esquejes.
Resumen, lista, catálogo y ficha comparten ese universo. No se consulta usuario
ni se publica identidad, correo, recolector, vivero, referencia GPS o notas.

La cantidad histórica es `cantidad_inicial_canonica`; `saldo_actual` conserva el
saldo materializado, nunca se sustituye por la cantidad inicial. `null` es
desconocido y `0` es cero real. `KG` legado se normaliza a `G`; `G` y `UNIDAD`
permanecen separados. Si falta cualquier saldo de una unidad, su total
`available` es `null`. `collected` suma cantidades históricas de todo el universo.
Las sumas se expresan con hasta seis decimales, sin convertir gramos en semillas.

`summary` contiene `collectionsCount`, `speciesCount`, `locationsCount`,
`mintedCollectionsCount`, `lastCollectionAt` y `totalsByUnit`.
Los tres primeros son conteos globales, con especies y ubicaciones deduplicadas
por ID; las ubicaciones ausentes no cuentan. `mintedCollectionsCount` cuenta
enlaces de explorador publicables. `lastCollectionAt` es la fecha máxima o `null`.
`totalsByUnit` es `{ unit: 'G' | 'UNIDAD', collected: number, available: number | null }[]`;
sin datos es `[]`. `generatedAt` es la generación de la respuesta en ISO UTC.

`filters.species` contiene `{ id, commonName, scientificName }[]` y
`filters.locations`, `{ id, name }[]`. Ambos catálogos cubren todas las páginas,
independientemente de los filtros activos. Los nombres históricos prevalecen
sobre el catálogo; para un mismo ID se elige la recolección más reciente de
forma determinista. Una ubicación sin nombre usa división, país o `Ubicación ID`.

| Query de `/collections` | Contrato |
| --- | --- |
| `q` | Texto de hasta 150 caracteres; código, nombre común o científico; ignora mayúsculas y acentos |
| `speciesId`, `locationId` | ID positivo |
| `from`, `to` | Fechas exactas `YYYY-MM-DD`, inclusivas; `from <= to` |
| `blockchain` | `with-link` o `without-link` |
| `sort` | `date-desc` por omisión, o `date-asc`; fecha e ID en el mismo sentido |
| `page` | Entero positivo, por omisión 1 |
| `pageSize` | Entero de 1 a 100, por omisión 12 |

Se rechazan parámetros desconocidos, repetidos, fechas normalizadas como
`2026-02-30` y números fuera del rango seguro de JavaScript. Resumen, detalle e
imágenes no aceptan query. El filtrado precede al conteo y la paginación.
Una página fuera del rango devuelve `items: []` con el conteo de la consulta.

El backend carga una proyección explícita por bloques, usando `count: exact`
y avanzando por las filas recibidas, también si PostgREST limita cada bloque
a menos de 500. No utiliza una página privada para construir totales globales.
Las ubicaciones se leen por lotes de IDs del catálogo enriquecido configurado
con `UBICACION_VIEW_NAME`. Datos incompatibles o conteos cambiantes durante
la lectura producen 503; no se publican sumas parciales como banco vacío.
Son lecturas sin locks ni snapshot transaccional entre consultas: una actividad
concurrente puede requerir repetir la lectura. No se modifican saldos ni datos.

## Registro y ficha

Cada registro devuelve exactamente `id`, `codigo_trazabilidad`, `tipo_material`,
`fecha`, `cantidad_inicial_canonica`, `unidad_canonica`, `saldo_actual`,
`estado_registro`, `planta`, `ubicacion` y `blockchain`.

- `planta`: `{ id, nombre_comun_principal, nombre_cientifico }`; nombres anulables,
  resueltos con snapshots históricos y fallback del catálogo.
- `ubicacion`: `null` o `{ id, nombre, division, pais, latitud, longitud }`;
  nombres/coordenadas pueden ser `null`. No se publica `referencia`.
- `blockchain`: `null` o `{ explorer_url, token_id, transaction_hash, network,
  minted_at }`, con los cinco valores anulables. No se inventan red ni fecha:
  `network` y `minted_at` son actualmente `null`.

El explorador procede de `blockchain_url`. Se admiten los hosts de la fuente
vigente `shannon-explorer.somnia.network` y `explorer.somnia.network`, con ruta
`/token/0xCONTRATO/instance/TOKEN` o `/tx/0xHASH`. Si token/hash existen en la
fuente deben coincidir con el enlace. No se reconstruyen enlaces ni se aceptan
IPFS, gateways, imágenes, credenciales en URL, query o fragmentos. Otros
exploradores requieren cotejar su origen antes de ampliar la política.
Tener un token sin enlace no oculta la recolección ni cuenta como enlace público.

La ficha añade `metodo: string | null`, `observaciones_publicas: null`,
`fotos: { id, url, descripcion: null }[]` y `generatedAt` ISO UTC.
No hay aprobación separada de observaciones o captions en la fuente actual;
esos textos internos no se publican.

### Fotografías y ajuste coordinado con el portal

**`fotos[].url` es una ruta relativa al backend**, del patrón
`/api/v1/impact/seed-bank/collections/ID/photos/PHOTO_ID`. Es el único ajuste al
contrato inicial del portal, coordinado con su chat; los enlaces de explorador
siguen siendo HTTP(S) absolutos. Resolver fotos contra `VITE_API_URL`, no contra
el dominio del portal. No se necesita configuración nueva de origen en backend.

Solo una recolección `VALIDADO` permite publicar sus fotos vinculadas de tipo
`RECOLECCION`/`FOTO`, no eliminadas, del bucket `recoleccion_fotos` y con ruta
local segura. La validación es la regla explícita para las fotos; **no filtra
los registros del banco**. Los otros estados devuelven `fotos: []`.
Se revalida elegibilidad y pertenencia al descargar. No se siguen URLs externas
ni se devuelven originales, rutas de Storage, captions o metadata. El decoder
existente limita a 10 MiB/40 MP y entrega JPEG sin EXIF/XMP/ICC. No persiste
derivados ni realiza escrituras. Una imagen ajena/eliminada/no publicable da 404;
problemas de descarga/decodificación dan 503.

## Errores y ejecución local

400 indica entrada inválida; 404, recolección inexistente o un ID de esqueje;
503, fuente/configuración/infraestructura incompatible o no disponible.
Una consulta sin coincidencias devuelve 200 vacío. Los mensajes no incluyen
errores internos de Supabase, claves ni datos de personas.

```sh
npm run build
node scripts/qa/seed-bank-readonly.cjs
```

El launcher usa la configuración local de Supabase y escucha únicamente en
`http://127.0.0.1:3306`. Solo carga el módulo de lectura; no importa módulos de
autenticación, Pinata, blockchain, comandos ni workers de limpieza, y no carga
fixtures ni migraciones. Permite CORS anónimo para revisar el portal local.
`SEED_BANK_PREVIEW_PORT` cambia el puerto. Swagger está en `/api/docs`.
El backend normal incluye el mismo módulo a través de `ImpactModule`.

Verificación: build, unitarios/HTTP con Supabase sustituido, fotos sanitizadas
con decoder real, Swagger y lectura local real contrastada con Zod del portal.
Los fixtures están bajo `test/fixtures`, fuera del build productivo.
[Versión, resultados y límites](../../docs/evidencia/banco-semillas-local-2026-10-21.json).
No requiere migraciones/grants ni cambios a guards privados. Push y despliegue
se acreditan por separado; la lectura local no prueba la versión de Render.
