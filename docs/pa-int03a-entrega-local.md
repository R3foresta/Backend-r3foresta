# PA-T-INT03-A · entrega local de registro participante

**Corte:** 15 de octubre de 2026. Base Git `345d8f2` más árbol de trabajo;
sin commit/push ni despliegue de esta entrega. SQL nuevo **074–076**, aplicado
únicamente en clústeres sintéticos aislados. La evidencia ejecutable contiene
SHA-256 de migraciones/fixtures y versiones; no acredita el catálogo remoto.

## Implementación y contrato para INT04

Se extiende el motor B/C: `participacion_comando`, identidad verificada,
canonicalización PA-COMANDO/1, recibos inmutables y GET común. Se conservan las
acciones de acceso, rol y baja. No se envía actor, rol, origen, lote ni reparto
desde el cliente. Los IDs/revisiones son cadenas BIGINT canónicas.

| Ruta `/api/v1` | Uso |
|---|---|
| `GET /subcampanias/:id/contexto-registro` | ACTIVA y autoridad contextual/global; plan/revisión, polígono y saldo por especie. Cero stock devuelve `SIN_STOCK`. |
| `GET /subcampanias/:id/participantes-seleccionables` | Cuentas activas habilitadas/ADMIN, sin actor ni contactos; `q`, `cursor` firmado y `limite` 1–20. Orden por ID. |
| `POST /participacion/comandos/preparaciones` | Prepara clave/ámbito sin reservar stock ni permiso. Terminal propio recupera recibo. |
| `PUT /participacion/comandos/:comando_id/cargas/:carga_id` | `?operacion=REGISTRAR_PLANTACION_INICIAL`, multipart con una `foto`, sin otros campos. UUID estable por archivo, hasta 10 archivos de 10 MiB. |
| `GET /participacion/comandos/:comando_id/cargas` | Misma query; recuperación propia incluso tras retiro, sin contexto operativo. |
| `GET /participacion/cargas/:carga_id/preview` | Solo propietario, URL del derivado válida cinco minutos; ADMIN no abre cargas ajenas. |
| `POST /participacion/comandos/:comando_id/descarte-preparacion` | Clausura PREPARADO; no cambia un terminal ordinario ni elimina VINCULADAS. |
| `POST /plantaciones/iniciales` | Una transacción de hecho/consumo/snapshots/vínculo/recibo. |
| `GET /plantaciones/:id/detalle-propio` | Autor/participante histórico activo, incluso tras retiro; observaciones solo para autor. |
| `GET /impact/fotos/:evidencia_id` | Sin cuenta; solo derivado sanitizado vinculado a hecho elegible. Nunca original ni pendiente. |

[OpenAPI/Swagger generado](pa-int02c-openapi.json) mantiene las 14 rutas de C y
añade diez rutas (24 en total). [DTO inicial](../src/participacion/dto/registro.dto.ts)
rechaza desconocidos, fechas inexistentes, duplicados, cantidades fuera de INT
y coordenadas con más de seis decimales. El contenido canónico representa las
coordenadas con seis posiciones; omisión/vacío/null de observaciones equivalen,
declaración de afiliación null es distinta de ausencia de declaración. Los
vectores de C se conservan y el vector inicial se coteja con Python independiente.

Confirmación y replay POST devuelven 200; rechazo durable conserva su HTTP.
GET común devuelve terminal histórico 200, PREPARADO como `SIN_RESULTADO` 202
con `Retry-After: 2`, o 404 inconcluso si no hay fila propia. Ante timeout,
conservar UUID/contenido y consultar/repetir la misma clave. Cancelación previa
es el único terminal con huella null: POST sigue devolviendo
`409 PREPARACION_CANCELADA`, sin reabrir ni convertirlo en clave reutilizada.

**Reutilización elegida para INT04:** conservar fotos locales y subirlas con
nuevos UUID de comando/carga después de un rechazo terminal y una nueva
confirmación explícita. No hay transferencia entre preparaciones en esta
entrega. Un timeout nunca autoriza generar otra clave.

## SQL y concurrencia

Instalar aditivamente sobre catálogo cotejado: 068, 069 (commit del ENUM),
070/071, 072/073, **074 → 075 → 076**. No ejecutar 001–076 a ciegas.

| Migración | Efecto |
|---|---|
| [074](../migrations/074_pa_int03a_cargas.sql) | Cargas/generaciones/ledger durable, snapshots y revisión de hecho, fecha operativa nullable, bucket privado y RPC privadas de preparación/carga/mantenimiento/imagen. |
| [075](../migrations/075_pa_int03a_registro.sql) | Contexto/personas/detalle; inicial atómica LIFO y extensión compatible de replay PREPARADO/cancelado. |
| [076](../migrations/076_pa_int03a_fecha_entrega.sql) | Conserva la fecha DATE de entrada de nuevas entregas físicas; resto del cuerpo 060 preservado. Sin backfill/cast del timestamp legado. |

Registro bloquea cuentas ASC y organizaciones ASC → subcampaña → mutex de
código → comando → permisos/revisiones → asignaciones ASC → cargas/generaciones
→ evidencias. **El reparto es `fecha_asignacion DESC, id DESC`**, independiente
de los locks. Filtra ACTIVA/PLANTACION_INICIAL, mismo ámbito/especie y día de
entrega conciliado no posterior a la plantación. Día único `America/La_Paz`,
ventana inclusiva `[hoy-10,hoy]`. Stock candidato sin día conciliado rechaza
`CONTEXTO_INCOMPLETO`; [procedimiento de conciliación](pa-int03a-conciliacion-entregas.md).

Superar metas dentro del stock está permitido y no cierra el ámbito. Aumenta
solo consumo M3 y contador inicial; mantiene cantidad asignada/saldo vivo M2,
sin segundo despacho. PostGIS evalúa interior/exterior; exterior válido se
admite. Solo el rechazo controlado del evaluador produce terminal 503; errores
SQL inesperados, deadlock y timeout conservan incertidumbre/rollback.

Nombre/afiliación quedan congelados bajo locks. Registro del día toma perfil
o declaración específica; retroactivo usa declaración expresa o
`HISTORICA_NO_DISPONIBLE`, nunca copia el perfil actual como pasado.
La declaración no cambia perfiles ni permisos; revisión del hecho inicia en 0.

Storage ocurre fuera de locks DB. Se reservan lease de dos minutos y generación
antes de IO; se descargan y verifican hashes antes de finalizar. La generación
obsoleta no publica evidencia. Clausura, expiración o confirmación que omite
fotos invalidan sus leases y dejan compensaciones durables; el barrido revisita
incluso `BORRADO_VERIFICADO` para limpiar uploads tardíos reaparecidos. Ninguna
compensación elimina la generación vinculada. Claves/tombstones/recibos no se
reciclan durante el piloto.

El worker se habilita por configuración del operador
`PARTICIPACION_CARGAS_CLEANUP_ENABLED=true`; se deshabilita en tests. El ledger
persiste mientras esté detenido. JPG/JPEG/PNG/WEBP se decodifican con sharp;
HEIC/HEIF con libheif WASM (`heic-decode`), en worker acotado. Derivado JPEG sin
EXIF/XMP/ICC, hasta 2400 px; límites de 40 millones de píxeles, dos decoders
concurrentes y plazo de 15 segundos por worker. El límite de heap V8 es 256 MiB;
no constituye un límite duro de RSS de código nativo/WASM. El original permanece
en bucket privado.

## Verificación reproducible

```sh
npm ci
npm run build
npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/r3-jest
npm run test:db:participacion
npm run test:db:acceso
npm run test:db:registro -- --pg-bin /ruta/runtime-postgis/bin
node scripts/qa/pa-int02c-openapi.cjs --check
```

En macOS sin PostGIS, `sh scripts/qa/pa-int03a-postgis-preparar.sh` prepara un
runtime oficial Postgres.app 2.9.6 en `/tmp`, verifica el SHA-256 fijado y no
instala PostgreSQL del sistema. Usar el directorio `bin` que imprime. En Linux,
proveer un runtime PostgreSQL/PostGIS instalado y pasar `--pg-bin`.

El runner nuevo exige **PostGIS real**; si falta, falla explícitamente. No lee
`.env`, elimina variables libpq heredadas, abre solo socket privado para DB y
destruye exclusivamente su clúster/objetos sintéticos. El antecedente mínimo
post-073 incluye geometría y stock representativos; no acredita replay completo
001–073. HTTP usa guards/services/RPC reales con adaptador psql por socket;
Storage de prueba conserva bytes privados y valida decodificación y hashes.

### Entorno local para INT04

```sh
npm run preview:registro -- --pg-bin /ruta/runtime-postgis/bin
# Comprobación reproducible de arranque y parada:
npm run preview:registro -- --pg-bin /ruta/runtime-postgis/bin --check
```

API sintética en `http://127.0.0.1:3303/api/v1`; para la PWA configurar
`VITE_API_URL=http://127.0.0.1:3303`. El fixture de sesión solo existe en este
launcher: `GET /_fixture/sesion/:usuario_id` entrega credencial efímera sintética
para consumo local. No guardar su respuesta en documentación ni conectar este
launcher a una base/bucket compartidos. Reiniciar resetea datos; Ctrl+C detiene
API y limpia clúster/objetos. Este mecanismo no prueba WebAuthn.

| ID sintético | Perfil autorizado del fixture |
|---|---|
| `800` | ADMIN global activo |
| `801` | VOLUNTARIO plantador, afiliación catálogo |
| `802` | VOLUNTARIO elegible como participante |
| `803` | Otro ADMIN global sin permiso contextual explícito |
| `804` | VOLUNTARIO sin autoridad contextual |
| `805` | Cuenta inactiva |

Campaña `800`; subcampañas `820`–`824` ACTIVA, especie `8`, meta 5 y stock
elegible 20 cada una; `825` ACTIVA sin stock. `801`/`802` están habilitados en
esos ámbitos. Coordenadas de ensayo dentro del polígono: `-16.5,-68.1`.
El launcher rechaza destinos DB/Storage externos; sesión y URLs de objetos
se sirven solo desde el harness sintético local.

Resultados ejecutados sobre el árbol entregado: [checks](evidencia/pa-int03a-checks.json),
[matriz SQL/HTTP y saldos](evidencia/pa-int03a-local.json),
[ejemplos HTTP sin credenciales](pa-int03a-ejemplos.json) y
[launcher verificado](evidencia/pa-int03a-preview-local.json).

| Comprobación | Resultado |
|---|---|
| Build | Correcto, Node 24.19.0 |
| Unitarios | 62 suites / 690 pruebas aprobadas |
| Regresión B | 53 casos / 78 denegaciones SQL reales |
| Regresión C basal | 22 grupos SQL / 8 carreras / 13 HTTP |
| INT03-A | 22 grupos SQL/PostGIS / 10 carreras con espera Lock observada / 16 HTTP/Storage |
| C después de instalar 075 | C04–C09, rol/baja y once replay/GET idénticos sin nuevos efectos |
| OpenAPI/Swagger | 24 rutas / 52 schemas; generador `--check` aprobado |
| Preview INT04 | Arranque/parada, contexto PostGIS, SIN_STOCK y HEIC aprobados |

B/C se ejecutaron nuevamente con PostgreSQL 14.17 Homebrew; sus archivos
históricos se conservan. INT03-A usa PostgreSQL 14.24 Postgres.app y PostGIS
3.2.10. Los clústeres/objetos sintéticos quedaron detenidos y eliminados.
El SHA de cada fuente instalada figura en la evidencia. Los fallos de red,
Storage, evaluador sin resultado y efectos parciales se inyectan explícitamente;
los puntos dentro/fuera se evalúan con PostGIS real y los binarios se decodifican.
El fixture Storage también prueba RLS real frente a una política permisiva
legada y mantiene el límite de `service_role` con BYPASSRLS. Esto no acredita
las políticas ni las URLs del bucket Supabase remoto.

## Audiencias y límites de despliegue

Tablas/RPC nuevas cerradas a PUBLIC/anon/authenticated, incluidas sobrecargas;
servicio privado revalida actor. RLS no aísla SQL privilegiado de `service_role`:
las garantías requieren disciplina cooperativa entre RPC. Timeouts de entrada
deben configurarse antes del statement, como en C: lock 5 s/statement 30 s;
un `set_config` dentro de una función no demuestra por sí solo ese límite.

Rutas generales de evidencias excluyen el nuevo bucket y rechazan sus IDs.
Inventario para D: `/api/evidencias-trazabilidad` y aliases por entidad/ID,
`/api/plantaciones` y sus evidencias, proyección `/api/impact`, RPC 060/061/062,
URLs `getPublicUrl` del bucket compartido `recoleccion_fotos` y cachés/CDN
heredadas. 074 no vuelve privado ese bucket ni migra sus binarios. El corte
completo, política remota/lectura anónima Supabase y `409 CLIENTE_INCOMPATIBLE`
se verifican en INT02-D; no habilitar participantes reales antes de ese corte.

No se modificó la reposición compartida ni se concede por permiso de inicial;
PA-ID25 y regresiones completas con plan/cierre/logística permanecen en D.
Las pruebas locales no acreditan aplicación SQL remota, conciliación de fechas
reales, transición de personas, publicación Git, despliegue, frontend INT04,
Impacto agregado INT05, correcciones INT07 ni piloto INT08.
