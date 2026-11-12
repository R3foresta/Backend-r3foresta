# Recepción única de Recolección en Vivero

Contrato local del 12 de noviembre de 2026 en la rama `recollection-refactoring`.
Requiere [100](../migrations/100_recoleccion_recepcion_unica.sql) después de 099,
reinicio operativo de los datos de prueba y corte coordinado de API y cliente.
Su presencia en el repositorio no acredita aplicación remota ni despliegue.
[OpenAPI reproducible](recepcion-semillas-openapi.json).

El 12 de noviembre Pablo confirmó en el chat el reinicio operativo con conteos
cero de recolecciones, lotes y eventos de Vivero, y posteriormente la ejecución
exitosa de 100. Es una aplicación reportada por el usuario. El cotejo independiente
del catálogo destino, la limpieza física de Storage y el corte API/PWA mantienen
su verificación separada.

## Flujo y autorización

El recolector crea `BORRADOR`, lo envía a `PENDIENTE_VALIDACION` y otra persona
confirma **recibir y validar** o rechaza con motivo. `PENDIENTE_VALIDACION`
representa espera de revisión y recepción física en Vivero. La confirmación
conforme produce `VALIDADO`; el rechazo produce `RECHAZADO`. El recolector corrige
la misma ficha/código, guarda `BORRADOR` y vuelve a enviar. No existe aprobación
documental autónoma, aceptación de diferencias, incidencia, recuento ni conciliación.

Bandeja, detalle, fotos y ambas decisiones requieren cuenta activa ADMIN, con
alcance global sin vigencia, o VALIDADOR con asignación explícita vigente al vivero
de almacenamiento. Se prohíbe la autorrecepción también para ADMIN. M1, equipo
y afiliación no conceden esta autoridad. GENERAL con M2 sigue pudiendo
operar material recibido mediante INICIO y DESECHO, sin ser receptor.

## API consumible

Todas las rutas usan Bearer JWT verificado y respuesta privada sin caché.
IDs y revisiones viajan como cadenas decimales exactas. El actor se obtiene de la
sesión; el vivero se deriva de la ficha. No se aceptan desde el body como permiso.

| Método y ruta bajo `/api/v1/recepcion-semillas` | Contrato |
|---|---|
| `GET /?antes_de_id=…&limite=20` | Bandeja de fichas pendientes en viveros autorizados. |
| `GET /:id` | Versión revisable, capacidad por objeto, recepción, historial y fotos autorizadas. |
| `POST /:id/evidencias` | Multipart `fotos`, 1–5 imágenes, máximo 15 MiB por archivo; contexto fijado por servidor. |
| `POST /:id/recibir-validar` | Confirma conformidad sobre la revisión precargada. |
| `POST /:id/rechazar` | Rechaza esa revisión con motivo de 10–500 caracteres, sin exigir foto. |
| `GET /comandos/:comando_id` | Solo recibo propio; cuenta activa incluso tras perder rol o asignación. |

Confirmación:

```json
{
  "comando_id": "4ff8f9bb-4280-463d-95c8-97a3f11f122c",
  "revision_esperada": "2",
  "cantidad_recibida": 0.1,
  "unidad_recibida": "KG",
  "fecha_recepcion": "2026-11-12",
  "evidencia_ids": ["42"]
}
```

Rechazo:

```json
{
  "comando_id": "59ecb1e1-06f9-4e9e-a421-e63e455c6825",
  "revision_esperada": "2",
  "motivo_rechazo": "La cantidad declarada no corresponde al material presentado."
}
```

Cantidad y unidad son responsabilidad del recolector. El receptor confirma la
versión cargada o la rechaza. Se comparan G/KG normalizados a G, con hasta seis
decimales canónicos; UNIDAD exige entero y ESQUEJE solo admite UNIDAD. Una cantidad
distinta no genera ajustes automáticos, recepción parcial ni saldo nuevo.

## Revisión, historial y corrección

El servidor fija `revision_captura` al cargar evidencia de recepción. Al confirmar
revalida actor, origen, vivero y esa revisión; una foto de una versión anterior no
sirve para decidir sobre la nueva. Cada decisión confirma revisión, historia y
recibo en la misma transacción. El historial de rechazo conserva el snapshot de
la ficha revisada antes del cambio: cantidad/unidad, vivero, ubicación, fecha,
revisión, motivo, actor y comando. Corregir 100 a 90 conserva el rechazo sobre 100.
`motivo_rechazo` resume solo el rechazo del ciclo actual; el historial conserva
los motivos anteriores.

En `PATCH /api/recolecciones/:id/draft`, omitir `ubicacion` conserva su ID,
coordenadas, comunidad/país, nombre, referencia, precisión y fuente. Enviar la
misma ubicación tampoco crea otra. Una edición explícita distinta crea una
nueva referencia y conserva la anterior; no modifica en sitio una ubicación
compartida. Corregir cantidad, unidad, notas o fotos no exige recapturar GPS.
Omitir `fecha` o conservar su valor mantiene el día original.

La ventana de 45 días se aplica al crear o cambiar explícitamente la fecha de
recolección. Una captura válida puede corregirse, reenviarse y recibirse al
envejecer si conserva su fecha. Se exige
`fecha_recoleccion <= fecha_recepcion <= hoy` en `America/La_Paz`. INICIO no puede
preceder la recepción física. El material recibido no caduca al superar 45 días.

## Comandos, datos y límites

La clave `(actor, comando_id)` conserva intención y acción `RECIBIR`/`RECHAZAR`.
Repetir la misma clave y carga devuelve el resultado original; otra carga o acción
produce conflicto. Rechazar correctamente una ficha es un comando `CONFIRMADO`
con resultado de ficha `RECHAZADO`, distinto de un error de comando.

Una respuesta perdida, timeout o 503 no prueba rollback. Conservar clave,
intención y recursos; consultar el mismo comando sin reenvío automático. La
recuperación no abre la ficha ni concede permiso actual. `202 SIN_RESULTADO` es
inconcluso. Una excepción técnica no fabrica un rechazo durable.

Orden cooperativo: cuenta SHARE → comando → origen UPDATE → evidencias ASC.
Retiro, cambio de rol y baja toman UPDATE de cuenta. Recepción conforme única,
revisión, snapshots, historial, vínculos de evidencia y recibo se confirman juntos.
El hecho `recoleccion_recepcion` es inmutable y contiene `fecha_recepcion` física,
`recibido_por` y `registrado_en` real. Estos últimos sustituyen la persistencia de
`usuario_validacion_id` y `fecha_validacion` en Recolección.

Se conservan cuatro tablas de recepción: hecho, comando, contexto de evidencia y
vínculo evidencia–recepción. Se retiran observaciones y las cuatro tablas de
conciliación. INICIO y el ledger exigen recepción conforme, saldo suficiente y
un solo débito; Plantación consume la asignación M3 sin volver a descontar M1/M2.
El saldo exacto y `motivo_no_inicio` siguen disponibles en el selector de material.

Pinata/blockchain se ejecutan después de la primera confirmación conforme, fuera
de la transacción de PostgreSQL. El indicador privado `ejecucion_nueva`, confirmado con el comando, evita
repetir el mint al reproducir o recuperar un comando; el recibo indica `FUERA_TRANSACCION` en RECIBIR
y `NO_APLICA` en RECHAZAR. No existe outbox durable: una caída después del commit
puede dejar el anclaje pendiente y un error externo no revierte la recepción.
No se promete ejecución exactamente una vez ni recuperación automática.
Las cargas de Storage también son externas: conservar archivos/contextos ante
incertidumbre, sin interpretar una subida como una recepción.

La primera instalación de 100 requiere datos operativos vacíos. El reinicio
preparado está acotado a datos de prueba de Recolección/Vivero/Plantación y sus
dependencias; no crea recepciones ficticias ni migra inventario de prueba. La
limpieza remota, Storage, destino y corte deben revisarse antes de ejecutar.
Catálogos, infraestructura, usuarios y permisos se conservan salvo dependencia
real identificada. Ninguna instrucción de esta guía ejecuta ese reinicio.

Preparar el plan con `python3 scripts/qa/reset-operativo-pruebas.py --pg-bin /ruta/postgresql/bin`
(solo lectura por defecto), revisar destino/dependencias/archivos y después usar
`--execute HUELLA_REVISADA` en el mismo destino. La huella de inventario (conteos, estructura y objetos; no el contenido de cada fila) se vuelve a comprobar
bajo locks; una dependencia externa aborta sin CASCADE. El plan incluye campañas,
permisos por subcampaña, cargas/comandos e historial de autoridad relacionados:
revisar esas consecuencias además del inventario M1/M2/M3. El SQL conserva las
secuencias y no borra Storage; los objetos inventariados se limpian por su API
oficial, en un paso externo revisado. [Uso y regresión aislada](../test/README.md#reinicio-operativo-de-datos-de-prueba).

## Verificación

```sh
npm run build
npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/r3-jest
npm run test:db:recepcion -- --pg-bin /ruta/postgresql/bin --evidence /private/tmp/recepcion-unica.json
node scripts/qa/recepcion-semillas-openapi.cjs --check
node scripts/qa/vivero-acceso-openapi.cjs --check
```

El runner usa PostgreSQL privado desechable, socket sin TCP, sin `.env` ni servicios
externos; HTTP/JWT/RPC locales y Storage sintético. PostGIS solo queda acreditado
cuando se ejecuta con un runtime real compatible. Los resultados de esta rama se
reportan en el chat de implementación y revisión; no se trasladan automáticamente
los conteos históricos a la nueva implementación.

Los cortes [T4/096](evidencia/t4-recepcion-local-2026-11-06.json) y
[097–099](evidencia/vivero-conciliacion-099-destino-2026-11-10.json) conservan su
fecha, contratos anteriores y límites de entorno; no son instrucciones vigentes
para instalar recepción única.
