# Base de datos

## Resumen

R3foresta utiliza PostgreSQL sobre Supabase como base de datos transaccional principal. El modelo está orientado a la trazabilidad completa del flujo operativo: recolección de material vegetal, gestión de vivero, asignación a campañas y subcampañas, plantación en campo y respaldo con evidencias.

## Dominios principales

- **Catálogos y territorio**: países, divisiones administrativas y ubicaciones georreferenciadas.
- **Identidad y acceso**: usuarios y credenciales de autenticación.
- **Biodiversidad y operación base**: plantas, métodos de recolección, viveros y organizaciones.
- **Recolección**: registros de recolección, historial de estados y movimientos de material.
- **Vivero**: lotes de vivero, eventos operativos, saldos y despachos.
- **Planificación y plantación**: campañas, subcampañas, equipos, metas por especie y registros de plantación.
- **Evidencias**: archivos y metadatos asociados a distintas entidades operativas.

## Relaciones clave

1. Una **recolección** vincula especie, ubicación, responsable y vivero de destino.
2. Una **recolección** puede dar origen a uno o varios **lotes de vivero**.
3. Cada **lote de vivero** mantiene su historial mediante **eventos** y control de saldos.
4. Los **lotes** pueden asignarse a **subcampañas** para reservar stock antes de la plantación.
5. Los **registros de plantación** consumen asignaciones de vivero y preservan la trazabilidad hasta el lote de origen.
6. Las **evidencias** pueden asociarse a entidades del proceso para soporte documental y auditoría.

## Criterios del modelo

- La trazabilidad es el eje del diseño de datos.
- El modelo combina datos maestros, snapshots operativos e historiales de eventos.
- Varias operaciones usan saldos materializados o derivados para soportar la operación diaria.
- La georreferenciación forma parte central del registro operativo.

## Referencia

Esta documentación resume la arquitectura de forma general y evita el detalle tabla por tabla. Para revisar el esquema completo, campos, enums y relaciones, consultar el repositorio público [R3foresta/r3foresta-docs](https://github.com/R3foresta/r3foresta-docs), en particular el archivo `database/00_database_schema.md`.
