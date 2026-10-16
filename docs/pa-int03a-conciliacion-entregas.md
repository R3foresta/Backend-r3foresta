# Fecha operativa de entregas existentes · D07

074 añade `fecha_entrega_operativa` nullable. 076 conserva la entrada DATE de
la entrega física nueva; no modifica `fecha_asignacion`. No hay backfill.

Antes de habilitar un ámbito real, preparar un manifest específico revisable
con `asignacion_id`, `fecha_asignacion_original` exacta, `fecha_entrega_operativa`,
`fuente` verificable de la fecha de entrada, `zona_insercion` acreditada y
`referencia_evidencia`. Registrar aparte excepciones sin fuente, discrepancias
y asignaciones que ya tienen un día distinto. No inferir el día convirtiendo
el timestamp a `America/La_Paz`: una entrada DATE insertada bajo UTC puede
mostrarse el día anterior.

Ejemplo de estructura **sin datos reales ni autorización de ejecución**:

```json
{
  "entorno": "POR_IDENTIFICAR",
  "revision_catalogo": "POR_COTEJAR",
  "entregas": [],
  "excepciones": []
}
```

La ejecución de ese manifest requiere cotejar origen y catálogo del destino.
Bloquear cuentas/ámbitos/asignaciones en el orden compartido; comparar el
timestamp original y el día previo, actualizar únicamente los IDs revisados
y guardar manifest, fuente, resultado y conteos en la evidencia de transición.
Una discrepancia aborta el conjunto; no sobrescribir un día ya conciliado ni
usar el manifest sintético de pruebas. Las excepciones quedan sin día y
producen `CONTEXTO_INCOMPLETO` mientras tengan stock candidato.

Este procedimiento prepara la conciliación, no acredita una conciliación real.
El [preflight de solo lectura](../scripts/sql/pa-int03a-catalog-preflight.sql)
aporta firmas, columnas, ACL y configuración Storage; no contiene personas ni
equivale al corte de rutas equivalentes de INT02-D.
