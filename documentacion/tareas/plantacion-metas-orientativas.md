# Plantación con metas orientativas y cierre manual

Decisión del usuario, 2026-10-08: se admiten más plantas que las cantidades
previstas en el plan, pero únicamente de las especies incluidas en él. La
subcampaña permanece ACTIVA hasta que se cierre manualmente.

## Flujo y saldos

`LOTE VIV-000116-REC-2026-114` contiene Tilo, `Sparrmannia africana L. f.`,
`planta_id` 39. La consulta de solo lectura confirmó 50 plantas entregadas
a la subcampaña 54 en la asignación 48, PLANTACION_INICIAL, con 0 consumidas
y 50 disponibles. Su objetivo por especie es 40.

La regla anterior admitía entregar las 50, pero impedía plantar más de
40. Los 10 restantes seguían físicamente asignados a la subcampaña; no
habían desaparecido. Con la nueva regla:

- Plantar las 50 en un registro consume las 50 y deja la asignación AGOTADA.
- Plantar 40 deja 10 disponibles; se pueden plantar después en otro registro.
- Plantar 51 con solo 50 disponibles se rechaza sin cambios de saldo,
  evidencias ni registros.
- Las metas originales se conservan como referencia de planificación.
  Los contadores guardan la cantidad real plantada, incluso si supera la meta.

El stock restante también puede devolverse al vivero. Una asignación con
propósito PLANTACION_INICIAL sigue sirviendo para plantación inicial;
para reposición se usa stock con propósito REPOSICION y se informa el
grupo origen. La reposición conserva el límite de muertas menos repuestas.

## Implementación

- La migración 060 impide entregar especies fuera del plan para plantación
  inicial; esa validación permanece vigente.
- La migración 061 reemplaza `fn_m3_registrar_plantacion`, elimina el tope
  de cantidades por meta y conserva pertenencia al plan, estados, permisos,
  evidencia, propósito y saldo asignado no negativo.
- `REGLAS_PLANTACION_INICIAL.permite_exceder_meta_especie` pasa a true. El
  formulario PWA ya usa esa regla para tomar el stock asignado como máximo.
- El backend actual no implementa cierre automático por cumplimiento de meta.
  `POST /subcampanias/:id/cerrar` ofrece cierre manual por ADMIN y entra en
  mantenimiento; después se bloquean las nuevas plantaciones iniciales.
- La PWA incorpora «Más opciones → Cerrar subcampaña» para ADMIN cuando
  está ACTIVA. El diálogo exige confirmación y fechas de cierre y fin de
  mantenimiento; propone tres años de mantenimiento, editables. Al alcanzar
  o superar la meta cierra como COMPLETADA. Por debajo de ella requiere un
  motivo de catálogo y cierra como FINALIZADA_PARCIAL.
- El formulario conserva los valores si falla la petición, evita envíos
  duplicados y actualiza el estado desde la confirmación del backend. El
  stock sin utilizar sigue asignado y su devolución se registra por separado.
  Los listados de campañas incluyen también las finalizadas parcialmente.

La decisión reemplaza el tope de RN-PLA-18 y la propuesta de cierre
automático de RN-PLA-10 en la documentación histórica. El plan de especies
y las restricciones de reposición siguen vigentes.

## Despliegue y comprobación

Aplicar 060 y 061 y desplegar el backend coordinadamente: el contexto no
debe anunciar que se permite exceder la meta mientras la RPC anterior
siga rechazándolo. Desplegar también la PWA para exponer el cierre manual.
La investigación no aplicó migraciones, desplegó cambios ni registró
plantaciones o devoluciones en la base compartida.

PostgreSQL local desechable: la RPC 053 reprodujo el rechazo de 50 con
meta 40 y stock asignado 50. La 061 permite tanto 50 de una vez como
40 + 10 en transacciones separadas, mantiene ACTIVA y conserva las metas.
Ambos casos mantienen sin cambios los saldos y eventos de vivero.
Exceso de stock, especie fuera del plan y reposición mayor al pendiente
se rechazan de forma atómica. Aplicar 061 dos veces preserva identidad y
permisos de la función.

Validación del código: 39 tests relacionados de backend y build aprobados.
PWA: 11 tests de cierre manual, lint de los archivos cambiados, chequeo
TypeScript y build de producción aprobados. Tras incorporar el parche, se
confirmó que sus siete archivos conservaban el flujo validado; el 2026-10-09
se repitieron los 11 tests y el build sobre una copia aislada del código
actual, ambos aprobados.

## Límites de la verificación

El flujo comprobado es entrega de una especie del plan → stock asignado →
registro por encima de la meta → actualización del saldo y contador real →
cierre explícito por ADMIN → mantenimiento.

| Frontera | Evidencia |
| --- | --- |
| Formulario y respuesta de cierre | Tests de componentes: confirmación, cierre completo/parcial, permisos visibles, reintento y doble envío |
| PWA → API de cierre | Test de servicio: POST al endpoint existente, cabeceras de autenticación y respuesta de error 403 |
| API de cierre → datos | Contrato cotejado con DTO, políticas y servicio existentes; tests unitarios de cierre aprobados |
| RPC de asignación/plantación → datos | PostgreSQL local: pertenencia al plan, conservación del stock, consumo 50 y 40 + 10, rechazo atómico y permisos preservados |
| Contexto → formulario de plantación | Test del contexto con meta superada y stock disponible; formulario existente usa la regla para limitar por stock |

No se completó una prueba interactiva en navegador ni una prueba E2E contra
la base compartida. Los tests de interfaz usan respuestas simuladas y los
tests SQL una base local desechable. El diagnóstico registra por separado
los errores previos del chequeo global de tipos del backend.
