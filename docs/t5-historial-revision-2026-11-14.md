# Historial del lote · revisión del14 de noviembre de2026

**Conclusión:** se pueden reconstruir los hechos conservados desde la entrada
del lote al sistema. La interfaz actual no los representa fielmente para
INCORPORACION y el timeline, por sí solo, no entrega toda la continuidad M2→M3.
No se puede reconstruir la producción anterior de un saldo inicial desconocido.

Revisión de solo lectura: backend `cc38aed`, PWA `0007ee0`, Supabase de pruebas
`vyrjlehkhabydkhjxagx`, Chrome con sesión ADMIN indicada por Pablo. Sin cambios
de producto, migraciones, altas, edición de eventos o nuevas fotos.
[Datos acotados y observaciones de pantalla](evidencia/t5-historial-auditoria-2026-11-14.json).

## Dos lotes contrastados

| Lote | Historia que sí está registrada | Pantalla actual |
|---|---|---|
|122 | Recolección300 → INICIO336 del12/11/2026,5 UNIDAD en proceso. No tiene EMBOLSADO ni saldo vivo nacido. | Historial visible con origen, INICIO y una foto. La fecha del origen se muestra11/11 aunque la fecha persistida es12/11. |
|124 | INCORPORACION338 del14/11/2026: SALDO_INICIAL, DONACION declarada,3 UNIDAD, saldo0→3; registro real16:10:20.685689 UTC. Sin eventos posteriores. | La ficha queda en blanco: `IndicadoresRapidos` intenta ejecutar `toLocaleString` sobre el material inicial nulo, que es legítimo en este origen. |

La lectura correcta de124 es «Ingreso de plantas vivas · saldo inicial ·
donación declarada ·3 unidades ·14/11/2026; sin seguimientos posteriores
registrados; historia previa no registrada». No ha pasado por INICIO ni
EMBOLSADO dentro de este sistema. La procedencia declarada no prueba dónde o
cómo se produjeron biológicamente esas plantas.

## Hallazgos de presentación

1. **Ficha de incorporación bloqueada.**
   [IndicadoresRapidos:47](../../pwa-r3foresta/src/modules/vivero/components/IndicadoresRapidos.tsx#L47)
   no trata `cantidadInicialEnProceso=null`. Error reproducido en Chrome para124.
2. **Se elimina el primer hecho.**
   [Mapper](../../pwa-r3foresta/src/modules/vivero/mappers/lote.mapper.ts#L148)
   no admite INCORPORACION y el servicio filtra el resultado nulo. El historial
   quedaría vacío aun corrigiendo el fallo anterior. Las fotos sólo mapean
   `public_url`, omitiendo `signed_url`/TTL de las privadas.
3. **Se inventa un origen y posibles fases.**
   [OrigenCard](../../pwa-r3foresta/src/modules/vivero/components/OrigenCard.tsx#L13)
   sólo contempla Recolección y puede enlazar a una ficha con ID nulo.
   [SubetapasBar](../../pwa-r3foresta/src/modules/vivero/components/SubetapasBar.tsx#L14)
   infiere SOMBRA desde el inicio/embolsado sin evento, usa primeras visitas a
   MEDIA_SOMBRA/SOL_DIRECTO y termina con el primer despacho, incluso parcial.
   El dominio admite seguimientos opcionales, saltos y repeticiones; esa barra
   no acredita el recorrido real.
4. **Fechas y datos de respaldo pueden alterar el relato.** `OrigenCard` parsea
   DATE con `new Date`: el origen300 del12/11 se observó como11/11 en La Paz.
   [EventCard:89](../../pwa-r3foresta/src/modules/vivero/components/EventCard.tsx#L89)
   muestra «Sustrato A · estándar» si no hay dato. Otros respaldos asignan una
   subetapa o destino; deben decir «No registrado». Los nombres actuales no
   deben desplazar snapshots históricos.
5. **Ausencia de historia y fallo de lectura se confunden.**
   [useViveroDetail](../../pwa-r3foresta/src/modules/vivero/hooks/useViveroDetail.ts#L32)
   transforma un error del timeline en una lista vacía. El usuario recibe
   «No hay eventos» sin saber que no pudo cargarse el historial.
6. **La exportación no reconstruye el lote.**
   [AuditoriaSection](../../pwa-r3foresta/src/modules/vivero/components/AuditoriaSection.tsx#L13)
   exporta metadatos/códigos, sin la colección de eventos, snapshots y vínculos.
   No debe presentarse como evidencia completa de reconstrucción.

## Qué conserva la base y qué debe completar la lectura

- Detalle/listado distinguen `origen.tipo=RECOLECCION|INCORPORACION`, modalidad,
  procedencia y límite `historia_previa_no_registrada`; hay snapshots de especie,
  variedad, comunidad y responsable inicial. Los hechos son inmutables y las
  lecturas mantienen autorización por lote.
- El [timeline](../src/lotes-vivero/application/vivero-timeline.service.ts#L148)
  ya mapea los nueve tipos de eventos, pero omite vínculos persistidos de
  entrega/devolución: `origen_despacho`, asignación, subcampaña y campaña.
  Para seguir hasta Plantación se requieren las fuentes autorizadas de M3;
  un saldo actual no reemplaza esos vínculos. Plantar consume la asignación,
  sin descontar otra vez el lote de Vivero.
- El orden por `fecha_evento`, `created_at`, ID no es una hora de registro:
  `created_at` histórico es DATE. La incorporación sí tiene `registrado_en`,
  pero no lo entrega el timeline. Por inferencia del contrato retroactivo,
  ordenar por fecha física puede no encadenar los saldos de movimientos
  registrados en otro orden. No reconstruir stock sumando esa lista ni
  atribuir horas a datos que sólo conservan día.
- Salvo INCORPORACION, el nombre del responsable del timeline viene de la
  cuenta actual. Identidad y nombre histórico no son equivalentes; donde
  falte snapshot debe explicitarse ese límite, sin rellenarlo retrospectivamente.
- La consulta de fotos puede fallar y devolverse como vacía; tampoco hay un
  protocolo de paginado/completitud del timeline. Es un riesgo de lectura
  incompleta, no una truncación remota demostrada con estos dos fixtures.

## Propuesta para revisar antes de implementar

1. Cabecera de procedencia discriminada, snapshots y límite histórico visible.
   Enlazar Recolección sólo cuando exista y la cuenta tenga permiso.
2. Cronología «Desde el origen» y «Más recientes», con todos los eventos
   registrados, fecha física, registro cuando exista, cantidad/unidad,
   saldo antes/después, responsable y fotos privadas. No descartar tipos nuevos.
3. Recorrido basado en eventos reales. Recolección puede tener INICIO y luego
   EMBOLSADO; incorporación comienza en su ingreso. Una fase no observada dice
   «Sin registro», sin inventar producción, adaptabilidad o supervivencia.
4. Movimientos con sus vínculos: entrega manual o asignación física,
   devolución y consulta autorizada del consumo M3. Diferenciar stock en
   Vivero, stock asignado y consumo de Plantación.
5. Fallos y completitud explícitos; exportación auditable con contrato y
   audiencia definidos, sin JWT, URLs firmadas ni datos de otra audiencia.

Aceptación propuesta:122 conserva su material en proceso;124 abre y muestra
INCORPORACION con su foto y procedencia, sin Recolección ficticia. Agregar
ensayos de adaptabilidad repetida/fuera de orden, despacho parcial,
asignación/devolución, fecha retroactiva, DATE de La Paz, error de fotos y
historial largo. La revisión actual no crea esos movimientos ni los acredita
en el entorno remoto; su cobertura funcional se implementará tras revisar el plan.
