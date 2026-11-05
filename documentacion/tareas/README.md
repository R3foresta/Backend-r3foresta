# Decisiones y propuestas técnicas

El trabajo vigente se sigue en [r3foresta-docs/ESTADO.md](../../../r3foresta-docs/ESTADO.md)
y en la [guía de participación](../modulos/participacion.md).

## Propuestas pendientes

[Incorporación de plantas y trazabilidad de procedencia](plan-incorporacion-plantas-procedencia.md):
compras, donaciones y saldo inicial. Conserva acuerdos del usuario y alternativas;
todavía no está implementada.

[Accesos de Recolección y Vivero](propuesta-permisos-por-vivero.md): opción elegida
de accesos fijos combinables y asignación por vivero. Incluye tablas propuestas,
matriz de permisos, una cuenta con ambos accesos y la continuidad de `VALIDADOR`.
Un único operario recibe y maneja su vivero. Diseño documental; no implementado.

[Encargos para implementar los accesos](encargos-accesos-recoleccion-vivero.md):
T1 Recolección, T2 Vivero y T3 administración en el módulo existente; recepción de
semillas e incorporación externa quedan como siguientes entregas. Tareas preparadas.

[T1 · Acceso explícito de Recolección](t1-acceso-recoleccion.md): borrador para
revisión del usuario; no iniciar investigación ni implementación antes de autorizarla.

## Decisiones y verificaciones conservadas

- [Especies fuera del plan](diagnostico-asignacion-especies-fuera-plan.md): diagnóstico del 8 de octubre, corrección060 y límites de los datos observados.
- [Metas orientativas y cierre manual](plantacion-metas-orientativas.md): decisión de producto, implementación061 y alcance de la verificación.
- [Revisión atómica del plan](subcampanias-revision-plan-atomica.md): ADR-PLA-05, contrato062–063 y pruebas.
- [Cotejo del plan en Supabase](verificacion-supabase-plan-062-063.md): consultas de solo lectura y comprobación HTTP del entorno destino.

## M2–M3: trabajo implementado

M2-M3-00 agrupó las siete tareas siguientes, implementadas en el repositorio al
7 de julio de 2026. Sus planes de ejecución se retiraron; el detalle original
permanece en Git. Esta tabla conserva los IDs y sus entregables, sin acreditar
aplicación SQL ni despliegue en un entorno concreto.

| ID | Entregable |
|---|---|
| M2-M3-01 | [051: esquema de asignación física](../../migrations/051_m2_m3_asignacion_fisica_schema.sql) |
| M2-M3-02 | [052: entrega física desde Vivero](../../migrations/052_vivero_asignar_stock_subcampania_rpc.sql) |
| M2-M3-03 | [053: plantación consume asignaciones sin descontar Vivero otra vez](../../migrations/053_m3_registrar_plantacion_sin_despacho.sql) |
| M2-M3-04 | [054: devolución física](../../migrations/054_m3_devolucion_fisica.sql) y [056: restricción de saldo](../../migrations/056_fix_devolucion_saldo_constraint.sql) |
| M2-M3-05 | [055: merma sobre saldo físico de Vivero](../../migrations/055_vivero_merma_fisica.sql) |
| M2-M3-06 | [Contrato para frontend](../frontend/guia-migracion-asignacion-fisica.md) y [receta de asignación/devolución](../postman/asignacion-fisica.md) |
| M2-M3-07 | [Pruebas de asignación](../../test/e2e/db/asignacion_fisica.e2e-spec.ts), [plantación](../../test/e2e/db/plantacion_fisica.e2e-spec.ts) y unitarios por módulo |

Las RPC tienen redefiniciones posteriores: consultar la [arquitectura](../../ARCHITECTURE.md)
y la última migración antes de cambiar una operación. Elegir las comprobaciones
según la [guía de pruebas](../../test/README.md).
