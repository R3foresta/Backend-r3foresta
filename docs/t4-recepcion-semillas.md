# T4 · Recepción de semillas

Contrato local del 6 de noviembre de 2026 sobre Backend `032527a` y PWA
`fc48be2`. Requiere 096 posterior a 095; no acredita aplicación ni corte remoto.

**Revisión coordinadora cerrada el 6 de noviembre**, con dos correcciones PWA y
regresión independiente aprobada. [Evidencia del cierre](evidencia/t4-revision-coordinadora-2026-11-06.json)
y [detalle de las correcciones](../../pwa-r3foresta/docs/QA_T4_REVISION_2026-11-06.md).
Sin hallazgos pendientes en esta revisión; conciliación y habilitación externa separadas.

## Hechos y autorización

`recoleccion_recepcion` registra una única recepción **total conforme** por origen:
custodia derivada de la ficha bajo lock, cantidad/unidad canónicas, día físico,
receptor verificado, instante de registro y comando. El autor M1 no cambia.
GENERAL/VALIDADOR activos con M2 de custodia y ADMIN global pueden recibir;
siempre se prohíbe autorrecepción. M1, afiliación y equipo no conceden recepción.
Las capacidades cerradas de participación y acceso M2 no cambian de forma: la
facultad de recepción deriva de `operar`, y el detalle devuelve la capacidad por
objeto tras verificar autor, estado, movimientos e incidencia.

`recoleccion_recepcion_observacion` conserva cantidad declarada y observada,
unidad, fecha, actor, evidencia y revisión por cada incidencia o conformidad.
Una diferencia no valida ni rechaza la ficha y no mueve saldo. Solo se permite
resolver la incidencia abierta mediante nueva comprobación física **conforme**,
indicando su ID, motivo y evidencia nueva. El faltante no se acepta parcialmente.
La corrección documental de cantidades con incidencia sigue bloqueada: requiere
un futuro procedimiento de negocio explícito. El original observado se conserva.

## Comando y transacción

La intención contiene `comando_id` UUID, `revision_esperada` decimal BIGINT,
`cantidad_recibida`, `unidad_recibida` (`G`, `KG`, `UNIDAD`), `fecha_recepcion`
YYYY-MM-DD, `evidencia_ids` y, para resolver, `incidencia_id` y `motivo_resolucion`.
KG se normaliza a G; UNIDAD exige entero y ESQUEJE exige UNIDAD. G respeta la
precisión canónica de M1 (hasta seis decimales). La fecha física debe estar entre
la recolección y hoy en America/La_Paz; no se infiere del instante de registro.

UUID es único por actor y carga canónica JSON. Replay devuelve el recibo original;
otra carga con la misma clave devuelve conflicto. La revisión es
`revision_captura`, compartida con mantenimiento/revisión documental: toda
incidencia y recepción la incrementa una vez. Un rechazo de negocio conserva
terminal, sin cambios parciales. Una excepción técnica conserva incertidumbre y
no fabrica un rechazo. Recuperar solo revela el terminal propio; no concede
acceso actual a origen/fotos. Exige cuenta activa, aun después de perder M2/rol.

Orden: cuenta SHARE → clave de comando → origen UPDATE → evidencias ASC. Retiro,
rol y baja conservan UPDATE de cuenta según 072/094. Recepción, aprobación nueva,
snapshots, revisión, historia, auditoría y recibo se confirman juntos. Saldo inicial
se conserva; no se inserta una segunda entrada. No se llama a Pinata/mint desde
el nuevo comando: esos servicios legados no tienen outbox durable y quedan como
anclaje externo pendiente, explícito en el recibo, sin presentar fallo como rollback.

## Transición y stock

Nuevos CONSUMO_A_VIVERO y DESECHO exigen recepción conforme y VALIDADO también
en el ledger, cerrando RPC/rutas legadas. Las proyecciones de orígenes aplican la
misma condición. M3 conserva sus asignaciones y no vuelve a debitar M2/M1.

VALIDADO histórico es aprobación documental, nunca prueba física. Puede
conciliarse mediante comprobación total real solo si no hay movimientos/lotes y
la ficha cumple las reglas vigentes de fecha/completitud. Si ya hay movimientos o
envejeció fuera de la ventana M1, requiere conciliación específica antes del corte;
no se cambia su fecha, recepción, saldo, movimientos, lotes o asignaciones.
El diagnóstico privado ADMIN enumera estos casos y sus saldos actuales. No hay
backfill ni creación automática de hechos. El corte real requiere diagnóstico,
inventario físico de remanentes y decisión documentada para cada caso bloqueado.

## Evidencia y cliente

Las nuevas fotos se cargan por multipart en contexto actor/origen/custodia; SQL
vuelve a comprobarlo al vincular, en la misma transacción del comando. Evidencia
de incidencia y de resolución permanece vinculada a su observación. La cola y
detalle M2 exponen la proyección necesaria y fotos autorizadas, sin abrir fichas
privadas M1 ajenas. El bucket legado y URLs públicas existentes conservan audiencia.

La PWA muestra cantidad declarada, aprobación documental y recepción por separado,
confirmación, carga, error, incidencia y recuperación. Ante resultado incierto
conserva la intención y ofrece consultar el mismo comando; no reenvía ni crea otra
clave automáticamente. Todos los IDs/revisiones viajan como cadenas exactas.

## API consumible

Todas las rutas requieren Bearer verificado, cuenta activa y cliente privado.
No reciben actor ni vivero concedidos por el body. [OpenAPI reproducible](recepcion-semillas-openapi.json).

| Método y ruta bajo `/api/v1/recepcion-semillas` | Contrato |
|---|---|
| `GET /?antes_de_id=…&limite=20` | Cola M2 por custodia; incluye incidencias/legados pendientes y propias sin capacidad de recibirlas. Cursor/IDs/revisión como texto. |
| `GET /:id` | Proyección mínima, capacidad por objeto, recepción, incidencia, historial y fotos autorizadas. No abre la ficha privada M1. |
| `POST /:id/evidencias` | Multipart `fotos`, 1–5 archivos, máximo 15 MB por archivo. Sin campos JSON/base64. Devuelve 201 y `evidencia_ids` exactos. |
| `POST /:id/recibir-validar` | Intención cerrada, resultado durable; ejemplo abajo. |
| `GET /comandos/:comando_id` | Solo recibo propio. 200 terminal original, 202 `SIN_RESULTADO`; no carga el origen ni sus fotos. |
| `GET /diagnostico?antes_de_id=…&limite=20` | Solo ADMIN. Array de VALIDADO sin recepción, cantidad original, saldo actual, número de movimientos/lotes. Cursor siguiente: último ID de la página. |

```json
{
  "comando_id": "4ff8f9bb-4280-463d-95c8-97a3f11f122c",
  "revision_esperada": "9007199254740992",
  "cantidad_recibida": 0.1,
  "unidad_recibida": "KG",
  "fecha_recepcion": "2026-11-06",
  "evidencia_ids": ["9007199254740993"]
}
```

Para resolver añadir `incidencia_id` exacto y `motivo_resolucion` de 10–500
caracteres. Se exige nueva evidencia pendiente del mismo actor/origen/custodia.
Resultado 200 `CONFIRMADO` o `INCIDENCIA`: `resultado` incluye origen, custodia,
observación, recepción/incidencia, revisión anterior/nueva, cantidad/unidad/fecha,
receptor, saldo conservado, estado documental y anclaje externo pendiente.

Rechazos de negocio 403/404/409/422 conservan `estado=RECHAZADO`, `resultado=null`,
`error.codigo` y fecha terminal. `REVISION_OBSOLETA` exige releer y confirmar
otra intención; `CONCILIACION_HISTORICA_REQUERIDA` bloquea la vía total;
`INCIDENCIA_REQUIERE_COMPROBACION_CONFORME` no admite faltantes.
Reutilizar UUID con otra carga produce 409 `CONFLICTO_CLAVE`, sin reemplazar
el terminal original. 503 o respuesta inválida significa incertidumbre: persistir
la intención y consultar el mismo comando. 202 tampoco prueba rollback. El reenvío
con la misma carga/clave requiere acción explícita; nunca se hace automáticamente.

Las cargas de Storage siguen fuera de SQL. No tienen recuperación durable propia:
si su respuesta se pierde pueden quedar archivos/contextos pendientes sin vínculo;
no se interpretan como recepción ni se borran ante incertidumbre. Un nuevo comando
no vuelve a subir imágenes ni ejecuta Pinata/mint. La PWA guarda solo la intención
validada por actor; un error de almacenamiento local bloquea el envío antes del POST.

## Conciliación antes del corte real

1. Exportar el diagnóstico ADMIN paginado y contrastar movimientos, lotes y
   asignaciones contra el catálogo/datos de destino, con versión y fecha.
2. Hacer inventario físico de cada remanente. Conservar la cantidad original,
   saldo actual y todos los hechos históricos como evidencia separada.
3. Sin movimientos/lotes, dentro de la ventana M1 vigente y con ficha completa:
   otra persona autorizada puede confirmar una comprobación total real, con día
   físico y fotos reales. La aprobación documental antigua y sus snapshots no
   se reemplazan; la recepción nueva tiene su receptor/instante propios.
4. Con movimientos/lotes, saldo distinto del original o fecha envejecida: mantener
   bloqueado el nuevo consumo/desecho y decidir un procedimiento explícito para
   remanentes antes de habilitar el corte. Esta versión no inventa recepción parcial,
   backfill de VALIDADO, fechas, receptores, correcciones o entradas de stock.
5. Verificar correspondencias de acceso y coordinar API, 096 y cliente. M3 continúa
   consumiendo lo ya asignado sin otra recepción ni nuevo débito de Vivero.

La implementación y pruebas locales se documentan en la
[evidencia de entrega](evidencia/t4-validacion-2026-11-06.json); el
[ensayo SQL/HTTP/PostGIS](evidencia/t4-recepcion-local-2026-11-06.json) y el
[informe PWA](../../pwa-r3foresta/docs/QA_T4_RECEPCION.md) conservan sus límites.

## Verificación local del 6 de noviembre

Backend: build y **89 suites / 1.268 unitarios** aprobados con Node24.19.0,
npm12.0.2. ESLint sin `--fix` aprobado en el núcleo nuevo DTO/Swagger/controller/
service/validador/pruebas; no se acredita lint global del código legado.
OpenAPI T4 (6 rutas), T2 (36), M1 (5) y participación (41/86 schemas) reproducibles.

Runner privado: **69 grupos SQL, 8 carreras y 7 HTTP** aprobados en PostgreSQL14.24
con PostGIS3.2.10 real, socket privado sin TCP/.env; clúster detenido/eliminado.
Comprueba replay/revisión, cantidades/unidades, incidencia/resolución, fechas,
rollback intermedio/terminal, retiro/rol/baja en ambos órdenes, BIGINT vecinos de
actor/custodia/origen/revisión, rechazo de drift/ACL heredadas, legado diagnosticado,
bypass cerrado y M3 sin doble débito. Storage HTTP es sintético; no ejecuta
WebAuthn, Pinata/mint ni servicios remotos. Antecedentes mínimos T1/T2/077:
no acredita reconstrucción001–096 ni catálogo Supabase destino.

PWA: build/lint y **92 archivos / 1.263 pruebas**, más **28 checks de Chrome y
10 capturas** con HTTP sintético local. Finales con Node24.19 explícito por comando,
Chrome156.0.8078.80 y Playwright1.64.1. Metadatos/logs en
[qa/t4-recepcion-2026-11-06](qa/t4-recepcion-2026-11-06/); se inspeccionaron las
capturas de incidencia móvil y confirmación de escritorio. Este corte inicial se
complementa con la revisión coordinadora enlazada arriba: PWA 1.273 pruebas tras
las correcciones. Catálogo/aplicación096, conciliación, corte y despliegue se
acreditan por separado.
