# Timeline privado del lote de Vivero

Contrato local T5 del15 de noviembre de2026. `GET /api/lotes-vivero/:id/timeline`
requiere Bearer JWT verificado, cuenta activa y autorización M2 por lote en
**cada página**. `x-auth-id` sin JWT no autentica. Responde `private, no-store`
y `Vary: Authorization`. Los lotes agotados conservan su historial autorizado.

## Consulta y paginación

```http
GET /api/lotes-vivero/123/timeline?limite=100
Authorization: Bearer <JWT>
```

| Query | Contrato |
|---|---|
| `tipo_evento` | Tipo de evento real, opcional. |
| `responsable_id` | BIGINT exacto; cadena decimal o número legado seguro. |
| `fecha_inicio`, `fecha_fin` | Filtros inclusivos sobre fecha física. |
| `limite` | Entero1–200; omisión100. |
| `cursor` | Token opaco devuelto por backend; conservar lote/filtros. |

Orden fijo: `fecha_evento ASC`, `created_at ASC`, `id ASC`. No representa
una secuencia para reconstruir stock: la fecha física puede ser retroactiva.
La incorporación guarda `registrado_en` real; el resto conserva null cuando
sólo existe DATE. No convertir `2026-11-15` en una hora ni restarle un día
al presentarla en America/La_Paz.

```json
{
  "success": true,
  "data": {
    "lote_id": 123,
    "codigo_trazabilidad": "VIV-EJEMPLO-SINTETICO",
    "estado_lote": "ACTIVO",
    "total_eventos": 100,
    "eventos": [],
    "paginacion": {
      "limite": 100,
      "devueltos": 100,
      "total_en_lectura": 231,
      "hay_mas": true,
      "cursor_siguiente": "<token-devuelto-por-backend>",
      "lectura_completa": false,
      "corte_evento_id": "9007199254741500",
      "orden": ["fecha_evento", "created_at", "id"]
    }
  }
}
```

El ejemplo abrevia `eventos`; `total_eventos` y `devueltos` son el tamaño de
esa página, no el total histórico. `total_en_lectura` cuenta el conjunto con
filtros y corte. Reunir todas las páginas hasta `hay_mas:false` y
`cursor_siguiente:null`. **`lectura_completa:true` indica sólo la última página
del corte**, no que una página aislada contenga todo el historial. La completitud
de fotos se informa por separado. Se detectan límites PostgREST menores a la
página solicitada mediante conteo exacto; se continúa con el último evento
realmente recibido, sin saltar por un offset supuesto.

El cursor es base64url de JSON versión1 con
`{version,contexto,orden,corte,total,fecha,creado,id}`. `contexto` liga lote y
los cuatro filtros; `orden` es `ASC`, IDs son cadenas y `total` es el conteo
inicial. El consumidor **no debe construir ni editar el cursor**. No concede
permisos y se vuelve a autorizar el lote en cada petición.

El corte es el máximo ID visible al iniciar; las inserciones posteriores por
encima del corte esperan a una nueva lectura sin cursor. No es un snapshot
transaccional mantenido entre peticiones. Una transacción pendiente podría
confirmar un ID inferior al corte: se compara el conteo inicial antes y después
de cada página, incluidas primera/última y firma de fotos. Si cambia, responde409
`HISTORIAL_CAMBIO_DURANTE_LECTURA`; descartar las páginas de ese intento y
reiniciar sin cursor para evitar omisiones silenciosas. La garantía es el
conjunto observado bajo ese corte, no una instantánea permanente del futuro.

## Eventos, vínculos y responsables

Tipos conservados: `INICIO`, `INCORPORACION`, `EMBOLSADO`,
`DESCARTE_PRE_EMBOLSADO`, `ADAPTABILIDAD`, `MERMA`, `DESPACHO`,
`DEVOLUCION_PLANTACION`, `CIERRE_AUTOMATICO`. No inferir fases faltantes ni
eliminar tipos desconocidos silenciosamente en la UI.

Ejemplo de devolución sintética abreviado:

```json
{
  "id": "9007199254741000",
  "lote_vivero_id": 123,
  "tipo_evento": "DEVOLUCION_PLANTACION",
  "fecha_evento": "2026-11-15",
  "created_at": "2026-11-15",
  "registrado_en": null,
  "responsable_id": 20,
  "responsable_nombre": "Nombre actual de cuenta sintética",
  "responsable_nombre_fuente": "CUENTA_ACTUAL",
  "observaciones": null,
  "payload": {
    "tipo": "DEVOLUCION_PLANTACION",
    "cantidad_afectada": 2,
    "saldo_vivo_antes": 0,
    "saldo_vivo_despues": 2,
    "origen_despacho": null,
    "asignacion_id": "9007199254741001",
    "subcampania_id": "11",
    "campania_id": "1",
    "registro_plantacion_id": null,
    "naturaleza_devolucion": "NO_REGISTRADA"
  },
  "estado_evidencias": "CONSULTADAS",
  "evidencias": []
}
```

DESPACHO y DEVOLUCION_PLANTACION exponen los vínculos **persistidos en el evento**:
`origen_despacho`, `asignacion_id`, `subcampania_id`, `campania_id`,
`registro_plantacion_id`, como strings exactos/null. No se enlazan por especie
ni se inventa una Plantación. M2 no conserva un discriminador fiable entre
retorno automático de cancelación y devolución física explícita; por eso
`naturaleza_devolucion=NO_REGISTRADA`. No cambia la cancelación vigente.

Los IDs legados del sobre/evento conservan compatibilidad number seguro|string;
los nuevos vínculos son string|null. No convertir BIGINT a Number en frontend.
INCORPORACION añade `registrado_en` y mantiene modalidad/procedencia/cantidad.
Su responsable usa el snapshot del lote (`SNAPSHOT_INCORPORACION`); otros
nombres son `CUENTA_ACTUAL` o null/`NO_REGISTRADO`. No acreditan nombre histórico
si falta snapshot y no se rellenan retrospectivamente.

## Fotos y errores parciales

Cada evento tiene `estado_evidencias=CONSULTADAS|ERROR_CONSULTA`. Sólo
`CONSULTADAS` con `evidencias:[]` acredita que no hay fotos vinculadas visibles.
Un fallo de catálogo/consulta/paginación conserva eventos, marca ERROR_CONSULTA
y puede conservar las fotos parciales ya obtenidas. La consulta de evidencias
legadas también pagina para evitar truncamiento por límites PostgREST.

Cada foto conserva `id`, ruta, MIME, tipo, principalidad, orden y metadata real
`titulo`, `tamano_bytes`, `tomado_en` (null si falta; tamaño number seguro|string).
`estado_url` es `DISPONIBLE`, `ERROR_FIRMA` o `ERROR_URL`.

- Bucket privado `vivero_incorporaciones`: `signed_url` y
  `url_expira_en_segundos:300`; nunca `public_url`. Ante fallo mantiene metadata,
  `estado_url:ERROR_FIRMA`, `signed_url:null` y TTL null.
- Bucket legado: `public_url`; si falla se marca ERROR_URL y URL null.
- Una foto no firmable no elimina otras fotos ni eventos. Renovar firma mediante
  otra lectura backend autorizada. No exportar las URLs temporales como prueba
  durable ni construir una URL pública para el bucket privado.

## Errores y compatibilidad de despliegue

| HTTP | Significado |
|---|---|
|401 | Bearer ausente/inválido o identidad discordante. |
|403 | Cuenta inactiva, rol/permiso M2 insuficiente. |
|404 | Lote inexistente. |
|400 | Query, límite o cursor inválido/de otro contexto. |
|409 | `error.codigo=HISTORIAL_CAMBIO_DURANTE_LECTURA`; reiniciar sin cursor. |
|500 | No se pudo leer/comprobar eventos; no representar como historial vacío. |

El backend101–108 previo no entrega `paginacion`, estos estados ni todos los
vínculos. Su ausencia **no acredita historial completo ni fotos consultadas**.
El frontend debe admitir esa compatibilidad como resultado legado/incompleto y
no invocar procedencia-administrativa hasta disponibilidad del backend110.
La UI oculta no sustituye la autorización SQL109 de nuevas incorporaciones.
[Entrega backend y comprobaciones](../../docs/t5-integracion-backend-2026-11-15.md).
