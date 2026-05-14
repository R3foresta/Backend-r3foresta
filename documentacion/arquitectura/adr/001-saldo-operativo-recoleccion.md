# Decisión Técnica — Saldo materializado en Recolección

## Problema

Las reglas operativas del módulo de Recolección ya hablan de:

- saldo disponible del lote origen
- estado operativo `ABIERTO | CERRADO`
- consumo hacia vivero basado en movimientos append-only

Pero esos dos conceptos no estaban materializados en `public.recoleccion`.

## Decisión

Se materializan dos campos en `public.recoleccion`:

- `saldo_actual numeric`
- `estado_operativo public.estado_operativo_recoleccion`

La fuente de verdad sigue siendo:

1. `recoleccion.cantidad_inicial_canonica`
2. el ledger append-only `recoleccion_movimiento.delta`

Los nuevos campos se tratan como cache materializada derivada.

## Fórmula

```sql
saldo_actual = cantidad_inicial_canonica + COALESCE(SUM(recoleccion_movimiento.delta), 0)
```

Regla de estado:

- `saldo_actual = 0` -> `CERRADO`
- `saldo_actual > 0` -> `ABIERTO`
- `saldo_actual < 0` -> inválido

## Sincronización elegida

Se usan triggers en dos puntos:

1. `BEFORE INSERT` en `recoleccion`
   - inicializa `saldo_actual = cantidad_inicial_canonica`
   - inicializa `estado_operativo`

2. `AFTER INSERT/UPDATE/DELETE` en `recoleccion_movimiento`
   - recalcula `saldo_actual` y `estado_operativo`

3. `AFTER UPDATE OF cantidad_inicial_canonica` en `recoleccion`
   - recalcula por si cambia la base del lote

La lógica compartida vive en:

- `public.fn_recoleccion_recalcular_saldo_operativo(bigint)`

## Por qué así

- evita recalcular saldo en cada consulta operativa
- mantiene consistente el inventario con el ledger
- deja lista la base para `fn_vivero_registrar_inicio(...)`
- concentra la regla en una sola función reusable

## Tradeoffs

- agrega complejidad en base de datos
- depende de que `recoleccion_movimiento` exista realmente en el entorno
- cualquier delta inválido falla transaccionalmente, que en este caso es deseable

## Nota operativa

`saldo_actual` y `estado_operativo` no deben editarse manualmente desde aplicación.

El camino correcto es:

- crear la recolección con `cantidad_inicial_canonica`
- registrar movimientos append-only
- dejar que la base recalcule automáticamente
