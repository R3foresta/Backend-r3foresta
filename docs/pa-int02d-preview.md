# Preview local INT02-D para INT04

Entorno sintético con PostgreSQL/PostGIS real, guards/services/RPC D y objetos privados de disco. No usa `.env`, Supabase remoto, personas reales, Pinata ni blockchain. Cada arranque crea una base/Storage efímeros y cada detención los elimina. El fixture es parcial post-076: no acredita replay completo ni ACL/Storage del destino.

## Arrancar y verificar

```sh
python3 scripts/qa/pa-int02d-db-test.py --pg-bin /tmp/pa-postgis-runtime.CQOFCC/14/bin --serve
```

API: `http://127.0.0.1:3303/api`, participación: `http://127.0.0.1:3303/api/v1`. Cambiar puerto con `PA_A_HTTP_PORT` si hace falta. `Ctrl+C` detiene API y limpia exclusivamente el clúster/objetos que creó el runner. Para una comprobación automática que se detiene sola:

```sh
python3 scripts/qa/pa-int02d-db-test.py --pg-bin /tmp/pa-postgis-runtime.CQOFCC/14/bin --serve --check
```

El runtime indicado es el PostGIS aislado usado para esta entrega; si fue limpiado, preparar otro mediante `scripts/qa/pa-int03a-postgis-preparar.sh` y pasar su directorio `bin`. El launcher D usa `scripts/qa/pa-int02d-preview-server.ts`, `scripts/qa/pa-int02d-harness.ts` y `test/db/pa-int02d-preview-fixture.sql`, que incluye el fixture A sin modificarlo. **No ejecutar los fixtures SQL en otro destino.**

El harness inicia con `controls.initialWrites=true`: representa `PARTICIPACION_INICIAL_ESCRITURA_HABILITADA=true` para el recorrido local. En el backend real la puerta sigue necesitando configuración y corte/drenaje acreditados; iniciar este preview no habilita usuarios reales.

## Sesiones y datos de prueba

`GET /_fixture/sesion/:actor` devuelve `{actor_id, authorization, sintetico:true}`. Usar `authorization` como valor completo de `Authorization`; este endpoint existe únicamente en el fixture de localhost y no es un login WebAuthn. El servidor permite CORS desde localhost/127.0.0.1 para una PWA local.

| Actor | Rol / autoridad sintética |
|---|---|
| `800` | ADMIN global; COORDINADOR logístico de 820 |
| `801` | VOLUNTARIO plantador en 820–825 |
| `802` | VOLUNTARIO plantador/seleccionable en 820–825 |
| `803` | Otro ADMIN; sin equipo logístico de 820 |
| `804` | VOLUNTARIO sin permiso |
| `805` | ADMIN inactivo; las APIs privadas lo rechazan |
| `901` | GENERAL, OPERARIO logístico de 820; sesión interna para FE07 |

Campaña `800`; subcampañas `820`–`824` ACTIVA con stock inicial, `825` ACTIVA SIN_STOCK. El plan es planta `8`, meta `5`. El polígono cubre el punto interior `latitud:-16.5,longitud:-68.1`.

Para reposición FE07 en 820: origen inicial `820000` con cantidad `5` y mortandad acumulada `5`; asignación `82099`, lote `81`, planta `8`, propósito `REPOSICION`, stock disponible `10`. Actor `901` o `800` puede usar el recorrido interno. El origen ajeno `821000` pertenece a 821 y debe rechazarse al enviarlo a 820. El fixture refleja consumo inicial previo: 820 conserva `15` unidades iniciales disponibles y 821 conserva `19`; las demás asignaciones iniciales tienen `20`. No hay un segundo débito de Vivero por plantar.

Los checks automáticos consumen datos exclusivamente en su clúster efímero. Un arranque normal nuevo conserva el seed descrito y no ejecuta esos checks destructivos sobre la sesión de desarrollo.

## Contrato que recibe frontend

Inicial usa únicamente `/api/v1`: contexto `GET /subcampanias/:id/contexto-registro`, preparación `POST /participacion/comandos/preparaciones`, carga `PUT /participacion/comandos/:comando/cargas/:carga?operacion=REGISTRAR_PLANTACION_INICIAL` con multipart `foto`, envío `POST /plantaciones/iniciales` con la misma clave y recuperación `GET /participacion/comandos/:comando?operacion=REGISTRAR_PLANTACION_INICIAL`. Consultar la guía y OpenAPI de participación para payloads completos.

Las rutas internas anteriores para inicial/contexto y uploads sin ámbito devuelven `409 CLIENTE_INCOMPATIBLE`. El servidor no inventa una clave v1 para compatibilidad. `GET /api/subcampanias/:id/plan` conserva JWT de cualquier cuenta activa, incluido VOLUNTARIO; la escritura de plan exige ADMIN.

Reposición conserva `POST /api/registros-plantacion` con `es_reposicion:true`, origen del mismo ámbito, fecha/GPS, detalles de stock REPOSICION y fotos propias. Primero cargar `POST /api/registros-plantacion/evidencias-pendientes` con multipart `subcampania_id:820`, `es_reposicion:true` y campo repetido `fotos`; la respuesta incluye `evidencia_ids`. Para el fixture usar:

```json
{
  "subcampania_id": 820,
  "es_reposicion": true,
  "registro_plantacion_origen_id": 820000,
  "fecha_plantacion": "YYYY-MM-DD",
  "latitud": -16.5,
  "longitud": -68.1,
  "detalles": [{"asignacion_id": 82099, "lote_vivero_id": 81, "planta_id": 8, "cantidad": 1}],
  "evidencia_ids": [123],
  "coresponsable_ids": []
}
```

Reemplazar fecha por el día actual en America/La_Paz e IDs de foto por los recibidos del upload. ADMIN sin pertenencia al equipo no obtiene excepción en reposición; permiso contextual de inicial no la habilita. Descarte interno: `DELETE /api/registros-plantacion/evidencias-pendientes` con `subcampania_id`, `es_reposicion:true`, `evidencia_ids`; propiedad también para ADMIN y sin eliminar vínculos confirmados.

Una pendiente no se abre mediante API general ni URL pública. Al confirmar un registro elegible, `GET /api/v1/impact/imagenes/:evidenciaId` responde sin JWT con bytes JPEG sanitizados, sin EXIF ni rutas de originales. Los originales locales y previews firmados siguen privados. Esto no acredita políticas ni revocación de URLs/CDN históricos del bucket remoto.

## Alcance del check

`--serve --check` comprueba sesión interna D, JWT, contexto/PostGIS y SIN_STOCK; GET plan con VOLUNTARIO; 409 de contratos antiguos; upload interno con ámbito; rechazo de origen ajeno sin consumo; reposición propia; fotografía pública binaria JPEG sin EXIF; inicial v1 con pausa `503 RESULTADO_NO_DETERMINADO`/GET/misma clave y replay terminal en pausa; conflicto de contenido distinto y decoder HEIC real. Emite `PA_INT02D_PREVIEW_CHECKS` y el runner conserva los resultados y hashes en `docs/evidencia/pa-int02d-preview-local.json`.

El preview instala077–080 solo en su clúster sintético, sin conceder nuevos privilegios al servicio ni cambiar RLS; los objetos fuera del inventario fijo deben pasar el preflight. No acredita catálogo/Storage remotos, URLs/CDN históricas, guards de catálogos/diagnósticos (su suite HTTP separada usa fixtures), despliegue o piloto. La entrega técnica D y la habilitación real se registran por separado.
