# PA-T-INT05 — Entrega backend local

**Corte de pruebas: 17 de octubre de 2026. BE01–BE06 verificadas.** El ensayo original usó el árbol sobre `10e5dc59ee4eec9b94142fa7b2aeadaafc838263`; sus manifests y huellas se conservan como evidencia de esa ejecución.

**Consolidación local del 19 de octubre:** revisión independiente sin defectos bloqueantes; 30/30 huellas del árbol y los tres informes de ensayo cotejados. OpenAPI se reproduce y una comprobación adicional de consulta, aliases y contrato aprobó 3 suites/40 pruebas. Frontend FE01–FE06 y QA integrado local completados el 18; [informe PWA](../../pwa-r3foresta/docs/QA_IMPACTO_INT05.md). Los cambios posteriores al cotejo de huellas son documentales; las versiones de entrega se registran en [ESTADO](../../r3foresta-docs/ESTADO.md). Commit local, push, aplicación SQL y despliegue conservan evidencias separadas.

Entrada consumible: [contrato y matriz de audiencias](pa-int05-contrato.md), [OpenAPI 1.3.0](pa-int02c-openapi.json) y [cinco respuestas HTTP reales sintéticas](pa-int05-ejemplos.json). El contrato contiene filtros, paginación, errores, caché y ejemplos de interpretación; esta entrada registra ejecución y entorno.

| Tarea | Resultado verificado |
|---|---|
| BE01 | Matriz pública/propia/operativa, DTO estricto, ejemplos y compatibilidad de aliases. |
| BE02 | Global, campaña, subcampaña y registro públicos sin JWT; misma elegibilidad en agregados, mapa y detalle. |
| BE03 | 30 + 20 = 50, sin multiplicación por tres personas/dos organizaciones; inicial/reposiciones/bajas separados, 125% y faltantes por subcampaña. |
| BE04 | Mis registros por responsable o participante histórico, deduplicados y paginados; autor revocado conserva lectura propia. |
| BE05 | Snapshots históricos, ausencia declarada frente a historia no disponible, seguimiento fechado, fotos sanitizadas elegibles; GET plan sigue autenticado. |
| BE06 | Build/unitarios, SQL/HTTP/Storage aislados, preview INT05 y regresión D; entorno reproducible para frontend. |

## Implementación y catálogo

[081](../migrations/081_pa_int05_consulta.sql) añade RPC/helpers de lectura `SECURITY INVOKER` privados al servicio. Una proyección STABLE conserva la instantánea entre totales, mapa y página, antes de unir personas/organizaciones. Reutiliza hechos, snapshots y la elegibilidad de fotos de079; no crea tablas ni estado persistido de campaña. El detalle propio legado se redefine aditivamente para mostrar una sola persona cuando el responsable también figura como corresponsable, manteniendo ambas relaciones y su política de observaciones. No modifica las transacciones de registro/stock, revisiones, auditoría o recibos.

El preflight exige antecedentes y snapshots; el postflight rechaza privilegios heredados de ejecución pública. El ensayo instala068–081 sobre antecedentes parciales B/C/A/D con PostGIS real y aplica081 dos veces. Verifica catálogo/ACL de ese clúster. No demuestra reconstrucción001–073 ni igualdad con el catálogo Supabase destino. Antes de aplicar081 al remoto, cotejar las dependencias074–080, columnas031 y privilegios; no ejecutar fixtures en Supabase.

Las rutas nuevas viven en `src/impact/application` y `domain/policies`; el controller delega y el servicio usa exclusivamente `getAdminClient()`. La respuesta se valida contra la lista permitida del mismo OpenAPI. Los aliases `organizations/*` conservan sus URLs, corrigen estados elegibles, fotos y porcentaje, y retiran metadatos fotográficos; su compatibilidad está detallada en el contrato. La API de participación y sus escrituras conservan su contrato.

## Verificación reproducible

```sh
npm run build
npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/r3-jest
node scripts/qa/pa-int02c-openapi.cjs --check
npm run test:db:impacto -- --pg-bin /ruta/runtime-postgis/bin
npm run preview:impacto -- --pg-bin /ruta/runtime-postgis/bin --check
```

Resultado: build correcto, **65 suites / 816 unitarios**, contrato reproducible **30 rutas / 65 schemas**, **16 casos HTTP/SQL/Storage** y cuatro probes SQL. [Resumen de verificación y huellas](evidencia/pa-int05-verificacion.json), [ensayo INT05](evidencia/pa-int05-local.json), [preview INT05](evidencia/pa-int05-preview-local.json) y [regresión del preview D](evidencia/pa-int05-regresion-d.json). D conserva cinco grupos de comprobaciones; su informe original quedó intacto y esa regresión usa hasta080. El ensayo INT05 acredita081 por separado.

Entorno usado: Node24.19.0, PostgreSQL14.24/Postgres.app, PostGIS3.2.10, Storage privado de archivos sintéticos y HTTP local. El runner no lee `.env`, la DB no abre TCP y cada ejecución crea su socket/clúster privados. Los tests y `--check` detienen y eliminan sus fixtures. El primer intento unitario encontró `listen EPERM` del sandbox; se repitió con autorización de ejecución local y pasó. No fue un fallo de lógica ni acceso a servicios reales.

La cobertura comprueba igualdad anónimo/VOLUNTARIO/sesión vencida, 404 uniforme de ámbitos no publicables, filtros y paginación coherentes, snapshots pese a cambio de perfil, autor retirado, participante sin observaciones privadas, IDs ajenos, JWT/caché propia y exclusión raw de tablas/RPC para roles públicos. Verifica bytes JPEG sin EXIF, pendiente404 y cambio de elegibilidad que retira registro/foto públicos sin perder historial propio. La regresión D añade carga, reposición, pausa/replay/terminal y HEIC real.

## Entorno para frontend

```sh
npm run preview:impacto -- --pg-bin /tmp/pa-postgis-runtime.CQOFCC/14/bin
```

El runtime indicado fue el usado localmente; si ya no existe, preparar otro con `scripts/qa/pa-int03a-postgis-preparar.sh` o usar PostgreSQL/PostGIS instalado. La API sintética queda en **http://127.0.0.1:3305**; configurar `VITE_API_URL=http://127.0.0.1:3305`, sin añadir `/api`. Reiniciar resetea datos y secretos; consultar de nuevo las sesiones. Ctrl+C detiene y elimina el fixture.

| Dato sintético | Uso |
|---|---|
| `/api/v1/impact/global` | 50 iniciales, 4 reposiciones, 11 bajas reportadas, cuatro registros/mapa. |
| Campañas800/801 | 30 y20 iniciales; cada una asociada a dos organizaciones. |
| Subcampaña826 | Meta20, inicial25, avance125%, faltantes0; baja6 y reposición4 fechadas. |
| Registro826000 /827000 | Tres personas con snapshots mixtos; el segundo conserva historia no disponible. |
| `/_fixture/sesion/{800,801,802,803,804,805,901}` | Respuesta privada con Bearer sintético actual; no guardar tokens en Git. |
| Actor801 /802 /804 /805 | Autor retirado826 y participante827 / participante826 / ajeno / inactivo. |
| Foto900050 /900051 | Elegible sanitizada / pendiente privada404. |
| Ámbitos828–832 | Borrador, cancelada, pausada, subcampaña eliminada y campaña eliminada. |

El fixture mantiene registro/cargas INT04: ámbitos820–824 con stock,825 sin stock, actor901 GENERAL/OPERARIO820, origen820000 con mortandad5, asignación82099 de reposición10 y origen ajeno827000. Las mutaciones cambian indicadores; los50 iniciales son la base al arrancar. Las sesiones de fixture no existen en `AppModule`, no son WebAuthn ni credenciales de Supabase.

## Límites conservados

Pendientes: push INT05, cotejo/aplicación remotos081 y antecedentes aún pendientes, Storage/RLS/URLs/CDN históricos remotos, WebAuthn real, UX humana, QA completo en entorno externo, despliegue y piloto. El mapa contiene todo el alcance filtrado y solo la lista se pagina; no se acreditó carga masiva/producción. No se ofrece superficie plantada, carbono, composición viva por especie ni crédito individual. La consulta no habilita permisos operativos y la escritura inicial normal continúa pausada por omisión.
