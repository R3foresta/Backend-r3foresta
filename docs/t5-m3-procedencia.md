# T5 · procedencia de plantas consumidas en Plantación

Contrato backend local, 13 de noviembre de 2026. Requiere las migraciones T5
101/102 y [103](../migrations/103_t5_procedencia_plantacion.sql), con la autorización
efectiva propia de 085 como antecedente. La entrega backend completa utiliza
101–107 tras la revisión del14; véase el [contrato de incorporación](t5-incorporacion-plantas.md).
Código local y pruebas aisladas no acreditan SQL aplicado, publicación ni despliegue.

La integración local del15 de noviembre añade110 después de109 para la
audiencia administrativa descrita abajo. [Entrega, contrato y evidencia](t5-integracion-backend-2026-11-15.md).

## Lectura mínima propia

```http
GET /api/v1/plantaciones/123/procedencia-propia
Authorization: Bearer <JWT>
```

La cuenta debe estar activa y ser autora o participante efectivo del registro,
con las reglas de 085. Se revalida esa relación en cada lectura, incluso para
ADMIN. No requiere acceso M2 ni permiso operativo actual de la subcampaña.
Para quien accede exclusivamente como participante, retirarlo extingue la
lectura y restaurarlo la recupera. La autoría conserva su propia legitimación.
No acepta parámetros de consulta. Responde `private, no-store` y
`Vary: Authorization`; la ficha ajena o inexistente produce el mismo 404.
Impacto público conserva su contrato y no incluye esta información.

## Lectura administrativa por registro

`GET /api/v1/plantaciones/:id/procedencia-administrativa` exige Bearer verificado,
cuenta activa y ADMIN **global** actual, revalidado en
`pa_registro_procedencia_administrativa_leer` bajo SHARE de cuenta. No exige
autoría, participación ni acceso M2. Administrar una subcampaña no concede
esta ruta. Comparte exactamente el payload mínimo del ejemplo siguiente y
su validador de IDs/cantidades/snapshots con la lectura propia.

No acepta query; responde `private, no-store` y `Vary: Authorization`.
Sin JWT responde401, cuenta inactiva o rol insuficiente403. El no ADMIN recibe
403 antes de consultar el registro, también para IDs inexistentes; ADMIN
recibe404 si el registro no existe. La lectura histórica por ID no adopta los
filtros de elegibilidad pública de campaña/subcampaña. No añade un listado
global ni amplía el listado público usado actualmente por la PWA; sólo permite
enriquecer registros que ADMIN ya puede seleccionar.

La ruta propia anterior sigue requiriendo autoría/participación efectiva incluso
para ADMIN. No se exponen tercero, referencia, observaciones ni fotos M2 en
ninguna de las dos rutas. Ninguna lectura escribe stock o recalcula LIFO.

```json
{
  "data": {
    "registro_plantacion_id": "123",
    "cantidad_total_plantada": 45,
    "criterio_atribucion": "CONSUMOS_PERSISTIDOS",
    "consumos": [{
      "detalle_id": "456",
      "asignacion_id": "789",
      "lote_vivero_id": "321",
      "codigo_lote": "VIV-INC-EJEMPLO",
      "planta_id": "10",
      "cantidad": 45,
      "nombre_cientifico_snapshot": "Especie histórica",
      "nombre_comercial_snapshot": "Nombre histórico",
      "variedad_snapshot": "Variedad histórica",
      "origen": {
        "tipo": "INCORPORACION",
        "recoleccion_id": null,
        "modalidad": "RECEPCION",
        "procedencia": "DONACION"
      }
    }]
  },
  "observado_en": "2026-11-13T16:00:00.000000Z"
}
```

Todos los IDs BIGINT son cadenas decimales exactas; las cantidades son enteros
positivos y la suma de `consumos.cantidad` coincide con `cantidad_total_plantada`.
Cada fila corresponde al detalle que se confirmó al plantar: no se vuelve a
asignar LIFO en una lectura ni se deduce el consumo desde el saldo actual.
Los lotes de una misma especie conservan su separación aunque otra pantalla
presente un agregado por especie.

| Campo | Fuente |
|---|---|
| Cantidad, asignación, lote, especie y snapshots | `registro_plantacion_detalle` persistido |
| Código del lote | `lote_vivero.codigo_trazabilidad` |
| Origen M1 | `lote_vivero.recoleccion_id`; modalidad/procedencia `null` |
| Origen incorporado | Evento `INCORPORACION` y su extensión `vivero_incorporacion` |
| Audiencia | Cuenta activa y relación propia efectiva de 085 |

`origen.tipo` admite `RECOLECCION`, `INCORPORACION` o
`HISTORICO_SIN_ORIGEN`. El último conserva una ausencia histórica sin fabricar
una Recolección. Los snapshots históricos pueden ser `null`; no se completan
con el catálogo actual. En incorporación, `RECEPCION` admite compra/donación y
`SALDO_INICIAL` también producción propia/desconocida. No se exponen tercero,
referencia documental, observaciones ni fotos de M2.

## Continuidad de escritura

La migración 103 añade un trigger de inserción en detalles de Plantación:
comprueba que asignación, lote, especie y subcampaña coincidan y hereda
nombre científico, comercial y variedad del snapshot del lote. Cubre tanto el
registro participante 075 como el interno 077 y conserva sus históricos. La
inicial mantiene LIFO; la reposición interna mantiene las asignaciones
declaradas. La variedad persistida proviene del snapshot del lote.
La fecha de consumo conserva la ventana de 10 días en America/La_Paz y no
precede al día físico de entrega cuando existe. Una incorporación exige ese
día conocido y no permite consumos anteriores a su recepción/conteo. La
reposición interna 077 fija la misma zona horaria; la inicial 075 ya lo hacía.
El trigger no añade locks de lote/asignación en orden inverso; los ejecutores
conservan su protocolo cooperativo de locks y el consumo transaccional.

Asignar descuenta Vivero; plantar consume esa asignación y no vuelve a descontar
el lote ni M1. La devolución real permanece vinculada a la misma asignación y
al lote original, sin nuevo ingreso externo. Esta entrega conserva la
cancelación automática vigente y no crea merma en campo. Los wrappers 105
proyectan IDs exactos antes de JSON y conservan los efectos de las operaciones
existentes; el contrato de reintento por `solicitud_id` pertenece al alta de
incorporación.

106 cierra la frontera HTTP de reposición interna: los DTO conservan cadenas
BIGINT y números legados seguros; la RPC proyecta registro, consumos y arrays
de IDs como texto antes de JSON. La selección declarada de DONACION no se
convierte en una asignación vecina de COMPRA al pasar por Node. También conserva
los IDs del ámbito y las evidencias al cargar o descartar fotos de reposición.
Esta ruta mantiene el contrato de reintento previo de077; no hereda por ello la
idempotencia de `solicitud_id` del alta T5.

## Integración PWA pendiente

La PWA no se modifica en esta entrega. Debe incorporar esta lectura como una
sección propia del registro, usando los consumos finales persistidos. No debe
usar el origen de la especie ni inferirlo desde un código de lote. Cuando haya
varios lotes de una especie, la atribución LIFO registrada no acredita qué lote
se eligió físicamente: la confirmación física por lote sigue fuera del contrato.

En la ficha M2, `OrigenCard` debe aceptar origen por incorporación o Recolección,
respetar IDs y cantidades `null`, y priorizar snapshots históricos sobre nombres
y variedad vivos. `VALID_KINDS` debe incluir `INCORPORACION` y
`DEVOLUCION_PLANTACION`. Las fotos privadas de incorporación en M2 usan
`signed_url` temporal (300 segundos); su renovación se obtiene desde una nueva
lectura backend autorizada. La PWA debe conservar este acceso firmado en lugar
de construir una URL pública. Los lotes agotados mantienen su historial autorizado.
Las rutas genéricas de evidencias excluyen las fotos `vivero_incorporaciones`;
para las vinculadas se usa el timeline M2, sin conceder esa ficha al plantador.
Compra y saldo inicial no son producción del período; saldo físico restante no
es supervivencia ni edad biológica. Un tercero conocido no prueba origen
biológico. La condición de aptitud no queda validada por esta incorporación.

[OpenAPI consumible](pa-int02c-openapi.json), [guía de participación](../documentacion/modulos/participacion.md).
