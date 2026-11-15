# T5 · dependencia backend para integración frontend

Entrega local del15 de noviembre de2026 sobre `69545ed`. Incorpora autorización
ADMIN global para altas T5, una lectura administrativa mínima por registro e
historial de lote paginado. Los cambios no modifican PWA, la autoridad general
T4/M2 ni el alcance de Impacto público.

## Migraciones y corte

Aplicar **109 y después110**, tras inventariar el catálogo destino101–108 y
revisar los preflight.109 coteja las funciones102/109 y el helper de cuenta077;
110 coteja los lectores073/103, columnas y su propia definición para repetición.
Ambas abortan ante deriva/ACL inesperadas y conservan los hechos existentes.
No reaplicar102 después de109 ni107 sobre108. No hay backfill ni nuevo stock.

- [109 · nuevas incorporaciones ADMIN](../migrations/109_t5_incorporacion_admin.sql).
- [110 · procedencia administrativa](../migrations/110_t5_procedencia_administrativa.sql).

No se aplicaron estas migraciones en remoto, ni se modificaron Storage, `.env`,
secretos, servicios ajenos o datos reales. La aplicación101–108 y el ensayo
anterior con fotos son antecedentes reportados en su informe propio; esta
entrega no los repite ni se los atribuye. Revertir Git no revierte SQL aplicado.

## Contratos definitivos

Todos los endpoints privados usan Bearer verificado, cuenta activa,
`Cache-Control: private, no-store` y `Vary: Authorization`.

| Ruta | Audiencia / resultado |
|---|---|
| `POST /api/lotes-vivero/incorporaciones` | Nueva clave: ADMIN global actual bajo lock de cuenta. Replay de UUID/intención propia CONFIRMADA: cuenta activa, incluso después de perder ADMIN/M2. |
| `POST /api/lotes-vivero/incorporaciones/:solicitud_id/evidencias-pendientes` | Multipart propio; ADMIN actual comprobado antes de Storage y otra vez en RPC bajo lock de cuenta. |
| `GET /api/lotes-vivero/incorporaciones/:solicitud_id/evidencias-pendientes?vivero_id=...` | ADMIN actual; sólo pendientes propias del contexto. |
| `GET /api/lotes-vivero/incorporaciones/:solicitud_id` | Resultado propio con cuenta activa. `SIN_RESULTADO` sigue inconcluso. |
| `GET /api/v1/plantaciones/:id/procedencia-administrativa` | ADMIN global activo; no exige autoría, participación ni M2. Administrador contextual no habilita esta lectura. |
| `GET /api/lotes-vivero/:id/timeline` | Autorización M2 por lote en cada página, también para lotes agotados. |

Alta:401 sesión inválida,403 autoridad insuficiente/cuenta inactiva/UUID ajeno,
400 entrada inválida,409 misma UUID con otra intención,503 resultado inconcluso.
No persistir rechazos como terminales ni generar otra UUID automáticamente.
Fotos rechazadas antes de la carga no suben archivos; un retiro durante la
carga se revalida en SQL y el rechazo concluyente permite compensar esa carga.
Una respuesta de transporte perdida conserva la incertidumbre y las referencias.

Procedencia administrativa no acepta query:401 sesión inválida,403 para cuenta
inactiva/no ADMIN (antes de consultar existencia),404 registro inexistente para
ADMIN,422 entrada/query inválida,503 infraestructura/proyección incompatible.
La lectura histórica por ID no toma filtros de elegibilidad pública. No crea
listado global; la lista pública actual conserva su alcance. `procedencia-propia`
sigue exigiendo autor/participante efectivo incluso para ADMIN.

Payload administrativo, idéntico a la proyección mínima propia:

```json
{
  "data": {
    "registro_plantacion_id": "9007199254740993",
    "cantidad_total_plantada": 3,
    "criterio_atribucion": "CONSUMOS_PERSISTIDOS",
    "consumos": [{
      "detalle_id": "9007199254740994",
      "asignacion_id": "9007199254740995",
      "lote_vivero_id": "9007199254740996",
      "codigo_lote": "VIV-INC-EJEMPLO-SINTETICO",
      "planta_id": "10",
      "cantidad": 3,
      "nombre_cientifico_snapshot": "Especie histórica",
      "nombre_comercial_snapshot": null,
      "variedad_snapshot": null,
      "origen": {
        "tipo": "INCORPORACION",
        "recoleccion_id": null,
        "modalidad": "RECEPCION",
        "procedencia": "DONACION"
      }
    }]
  },
  "observado_en": "2026-11-15T16:00:00.000000Z"
}
```

IDs como cadenas exactas; suma de cantidades cotejada con el total. Origen
`RECOLECCION`, `INCORPORACION` o `HISTORICO_SIN_ORIGEN`; snapshots históricos
null se conservan. No incluye tercero, referencia, observaciones ni fotos M2.
Lee consumos persistidos; no vuelve a resolver LIFO ni modifica inventario.

## Historial y fotografías

Contrato detallado de paginación/estados y ejemplo sintético en
[guía del timeline](../documentacion/postman/timeline.md). Los vínculos nuevos
se entregan en `payload` de DESPACHO/DEVOLUCION_PLANTACION:
`origen_despacho`, `asignacion_id`, `subcampania_id`, `campania_id`,
`registro_plantacion_id`. Los IDs son cadenas exactas o null; provienen del
evento, sin joins por especie ni inferencias. `naturaleza_devolucion` vale
`NO_REGISTRADA`: la tabla M2 no conserva un discriminador fiable entre retorno
automático de cancelación y devolución física. La regla de cancelación no cambia.

`registrado_en` sólo existe para INCORPORACION; para otros eventos es null.
`created_at` DATE no se convierte en hora. El nombre de incorporación usa su
snapshot; otros eventos declaran `CUENTA_ACTUAL` o `NO_REGISTRADO` mediante
`responsable_nombre_fuente`. No completar retrospectivamente snapshots ausentes.

Cada evento declara `estado_evidencias=CONSULTADAS|ERROR_CONSULTA`.
Un error de consulta no significa ausencia de fotos. Cada foto conserva
`titulo`, `tamano_bytes` y `tomado_en` disponibles, y declara
`estado_url=DISPONIBLE|ERROR_FIRMA|ERROR_URL`. Una foto no firmable mantiene
metadatos y `signed_url:null`, sin perder otras fotos/eventos. Las fotos del
bucket `vivero_incorporaciones` usan `signed_url` privado y TTL300; nunca
`public_url`. Renovar mediante otra lectura backend autorizada.

Paginación: `limite`1–200 (100 por omisión), `cursor` opaco ligado a lote/filtros;
orden físico `fecha_evento`, `created_at`, `id` ASC. El sobre añade `paginacion`
con `limite`, `devueltos`, `total_en_lectura`, `hay_mas`, `cursor_siguiente`,
`lectura_completa`, `corte_evento_id` y `orden`. Reunir páginas hasta `hay_mas:false`.
`lectura_completa:true` sólo marca la página final del corte; fotos tienen su
completitud independiente. El cursor contiene el corte y conteo inicial;
cambio del conjunto append-only bajo ese corte produce409
`HISTORIAL_CAMBIO_DURANTE_LECTURA`: descartar ese intento y reiniciar sin cursor.
No es un snapshot transaccional permanente entre peticiones.

Compatibilidad101–108: no expone la nueva ruta administrativa ni marcadores de
completitud/fotos. Su ausencia se trata como contrato legado/incompleto, sin
afirmar historial completo. El cierre de nuevas altas depende de109 aplicado:
ocultar la UI no aporta esa garantía en un backend todavía anterior.

No sumar el timeline para reconstruir saldo: la fecha física puede ser
retroactiva y el saldo autoritativo viene del servidor. Plantar consume la
asignación, sin otro débito del lote de Vivero.

## Verificación local y límites

Resultados sobre Node24.19.0, PostgreSQL14.24, PostGIS3.2.10/GEOS3.10.7:
[Resumen verificable con comandos y huellas](evidencia/t5-integracion-checks-2026-11-15.json).

| Comprobación | Resultado |
|---|---|
| `npm run build` | Aprobado. |
| `npm run test:unit -- --runInBand --cacheDirectory=/private/tmp/r3-jest-t5-integracion` |97 suites,1411 pruebas aprobadas. |
| `python3 scripts/qa/vivero-incorporacion-test.py --postgis --pg-bin <runtime>/14/bin --evidence <archivo-nuevo>.json` |144 grupos SQL,18 carreras y10 HTTP aprobados. [Evidencia nueva](evidencia/t5-integracion-backend-local-2026-11-15.json). |
| `node scripts/qa/vivero-acceso-openapi.cjs --check` |43 rutas reproducibles. |
| `node scripts/qa/pa-int02c-openapi.cjs --check` |43 rutas/90 schemas reproducibles. |
| `node scripts/qa/recepcion-semillas-openapi.cjs --check` |6 rutas reproducibles; contrato T4 intacto. |
| `git diff --check` | Aprobado. |

SQL cubre instalación/repetición/rollback, preflight adversario y preservación
de hechos; ADMIN sin M2, GENERAL/VALIDADOR M2 rechazados, UUID ajeno, replay y
GET propios tras pérdida de rol, carreras con autoridad072 en ambos órdenes
y compensación de foto ante retiro durante carga.110 verifica consumos reales
de COMPRA/DONACION/RECOLECCION con BIGINT/snapshots, rechazo de administrador
contextual real y conservación de la audiencia propia al retirar/restaurar
participantes. `HISTORICO_SIN_ORIGEN` se prueba en la proyección unitaria; no se
fabrican lotes nuevos incompatibles con102 para representar historia ausente.

La suite de timeline cubre más de1000 eventos y1000 fotos, cap PostgREST73,
empates/IDs vecinos, fecha retroactiva, cambios bajo corte y nuevas filas fuera
del corte, reautorización por página, fallos parciales/metadata y URLs privadas.
Dos revisiones independientes no encontraron defectos materiales adicionales.

El sandbox inicial bloqueó memoria compartida de PostgreSQL y sockets Supertest;
las ejecuciones finales autorizadas usaron el clúster privado y HTTP local fuera
de ese límite. Los intentos fallidos del harness se corrigieron antes de la
evidencia final; no se alteraron servicios externos para hacer pasar pruebas.
El runner usa PostgreSQL/PostGIS real aislado, socket privado
sin TCP/.env y fixtures sintéticos; su HTTP/Storage es de prueba. No acredita
replay completo001–100, Supabase/PostgREST/Storage remoto ni despliegue.

Los contratos OpenAPI consumibles provienen de sus generadores:
[participación](pa-int02c-openapi.json) y [Vivero](vivero-acceso-openapi.json).
Los informes históricos conservan su fecha/entorno. La actualización del estado
canónico en el repositorio hermano queda para coordinación junto con la
aplicación109/110 y el corte de frontend; este chat modifica sólo backend.
