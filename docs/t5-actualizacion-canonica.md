# T5 · actualización propuesta para r3foresta-docs

Pendiente de aplicar en el repositorio hermano: esta sesión dispone de escritura
en Backend-r3foresta, no en r3foresta-docs. Los siguientes cambios son revisables;
no afirman actualización canónica ni aplicación remota. La revisión del14
agrega106/107 y [su informe](t5-revision-2026-11-14.md).

La propuesta vigente del15 para la dependencia de frontend es la
[entrada breve de integración backend](t5-integracion-backend-2026-11-15.md):
109 reserva nuevas incorporaciones/fotos a ADMIN global, preserva recibo/replay
propio activo;110 agrega procedencia administrativa separada y el timeline
expone paginación/estados de fotos. El bloque siguiente conserva el corte
histórico inicial; no usar su autoridad M2 como contrato vigente de T5 con109.

## Entrada breve para ESTADO.md y tablero de implementación

Bloque para copiar en `r3foresta-docs/ESTADO.md`; sus enlaces son relativos a
ese destino. El tablero puede enlazar esa entrada. Para revisarlo aquí:
[contrato](t5-incorporacion-plantas.md), [validación](t5-validacion-local.md) y
[M3](t5-m3-procedencia.md).

```markdown
T5 incorpora localmente el núcleo simplificado de plantas vivas en Vivero:
recepción de compra/donación y saldo inicial con procedencia, lote nuevo,
evento INCORPORACION y una única extensión1:1.101–107 agregan integridad,
recuperación de éxito propio, fotos privadas y continuidad M2/M3 sin doble
descuento. [Contrato backend](../Backend-r3foresta/docs/t5-incorporacion-plantas.md),
[validación y límites](../Backend-r3foresta/docs/t5-validacion-local.md) y
[procedencia propia M3](../Backend-r3foresta/docs/t5-m3-procedencia.md).
Código y pruebas locales no acreditan SQL aplicado, Storage configurado,
commit, push, despliegue ni PWA. Aptitud, merma en campo, recepción directa,
cambio de cancelación, selección física del lote y correcciones quedan fuera.
La revisión del14 conserva BIGINT en reposición HTTP→SQL, excluye fotos T5
privadas de rutas genéricas y alinea CHECK010 con EMBOLSADO095 sin reescribir
historia. El diagnóstico del catálogo destino continúa pendiente.
```

## Contratos y reglas de Vivero

En `02-vivero-module` y contrato90-02, distinguir los dos nacimientos vivos:
EMBOLSADO desde M1 e INCORPORACION sin Recolección. Sólo el primero es producción;
compra/saldo inicial no lo son. `INICIO` continúa sin saldo vivo. Modalidad y
procedencia son dimensiones diferentes. La recepción T4 no concede por sí sola
autoridad T5; con109 rige ADMIN global actual para alta/fotos y cuenta activa
para resultado/replay propio CONFIRMADO. T4 y las demás operaciones M2 conservan
su autoridad vigente.

Añadir a los flujos la recepción física en vivero y conteo de remanentes actuales.
El ejemplo300antiguas/210contadas registra210, sin compra nueva300 ni merma90.
Un nuevo ingreso crea otro lote aunque coincida el tercero. Asignación/consumo/
devolución conservan su lote de origen. No documentar origen biológico, aptitud,
edad o selección física como garantías derivadas del alta.

## Modelo físico

Conservar el extracto del catálogo aportado como evidencia histórica. Añadir
una sección separada de cambio local101–107, sin editarlo como si estuviera
desplegado: extensión `vivero_incorporacion(evento_id PK/FK, modalidad,
procedencia, tercero_origen?, referencia_documental?, solicitud_id UNIQUE,
huella_solicitud JSONB v1, registrado_en TIMESTAMPTZ)` y contexto de fotos
existente ampliado con `solicitud_id`. No hay nuevo inventario ni tablas genéricas.
`recoleccion_id` y material/cantidad/unidad en proceso son nulos sólo en el
camino incorporado, con integridad transaccional y base viva única.

## Integración Plantación/PWA

En contrato90-02, enlazar `GET /api/v1/plantaciones/:id/procedencia-propia`:
audiencia propia efectiva085, consumos persistidos y snapshots del detalle,
sin ficha/fotos privadas M2. Mantener Impacto público. Registrar los pendientes
PWA de la guía backend, sin presentarlos como implementados ni modificar D07/LIFO.
