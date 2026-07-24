# Documentación — Backend R3Foresta

Guías de implementación y consumo de la API NestJS/Supabase de R3Foresta.

> La arquitectura implementada y sus riesgos están en
> [ARCHITECTURE.md](../ARCHITECTURE.md). Los requerimientos, reglas de negocio,
> contratos entre módulos, esquema canónico y estado de producción viven en
> [`R3foresta/r3foresta-docs`](https://github.com/R3foresta/r3foresta-docs).
> Esta carpeta no reemplaza esas fuentes.

## Flujo end-to-end

```text
RECOLECCIÓN
  BORRADOR → PENDIENTE_VALIDACION → VALIDADO
                                        │
                                        ▼
VIVERO
  INICIO → EMBOLSADO → saldo_vivo_actual
               │
               ├─ MERMA
               ├─ DESPACHO MANUAL
               └─ ASIGNACIÓN FÍSICA A SUBCAMPAÑA
                                │ descuenta el lote y crea stock M3
                                ▼
PLANTACIÓN
  PLANTACION_INICIAL / REPOSICION
  consume saldo_asignado_disponible; no vuelve a descontar Vivero
```

El detalle completo está en
[arquitectura/flujo-end-to-end.md](arquitectura/flujo-end-to-end.md).

## Índice

### Arquitectura

- [Flujo end-to-end](arquitectura/flujo-end-to-end.md)
- [Resumen de base de datos](arquitectura/base-de-datos.md)
- [ADR-001: saldo operativo de Recolección](arquitectura/adr/001-saldo-operativo-recoleccion.md)
- [ADR-002: decisiones de BD](arquitectura/adr/002-decisiones-db.md)

### Módulos

- [Recolecciones](modulos/recolecciones.md)
- [Lotes de Vivero](modulos/lotes-vivero.md)
- [Plantas](modulos/plantas.md) y [Storage de plantas](modulos/plantas-storage.md)
- [WebAuthn](modulos/auth-webauthn.md)
- [Pinata](modulos/pinata.md) e [integración Pinata](modulos/pinata-integracion.md)
- [Blockchain](modulos/blockchain.md)

Los contratos M3 más recientes se mantienen junto a las guías de frontend y en
Swagger. La fuente canónica de M3 sigue siendo `r3foresta-docs`.

### Frontend

- [Referencia general de API](frontend/api-reference.md)
- [Recolecciones](frontend/recolecciones.md)
- [Lotes de Vivero](frontend/lotes-vivero.md)
- [Asignación física M2→M3](frontend/guia-migracion-asignacion-fisica.md)
- [WebAuthn](frontend/webauthn.md)
- [Desactivación masiva de Campaña](frontend/desactivacion-campania-cancelacion-masiva.md)
- `frontend/modulos/`: contratos de Campañas, Subcampañas, Plantaciones,
  Organizaciones, Ubicaciones y Usuarios.

### Postman

Ver [postman/README.md](postman/README.md). Incluye recetas para embolsado,
adaptabilidad, merma, despacho, asignación física, devolución, plantación,
timeline y cancelación.

### Tareas históricas de integración

`tareas/` conserva el plan M2↔M3 y sus criterios de cierre. Describe el cambio
desde reserva lógica/despacho automático hacia asignación física. Las secciones
“antes” y las menciones a `AUTOMATICO_PLANTACION` son contexto histórico, no el
flujo vigente.

## Convenciones HTTP reales

- Prefijo: `/api`.
- Swagger: `/api/docs`.
- DTOs: `ValidationPipe` rechaza campos no declarados.
- Imágenes: `multipart/form-data`, nunca base64 en JSON.
- Identidad heredada: snapshots en los módulos operativos.
- Saldos y escrituras múltiples: RPC PostgreSQL cuando la atomicidad es una
  invariante.

## Autenticación: estado actual

WebAuthn emite JWT, pero la mayoría de endpoints operativos identifica al
solicitante mediante `x-auth-id`. Los services por capas consultan el usuario y rol
en BD; `x-user-role` no debe considerarse una autoridad.

No existe aún un guard JWT global y varios GET son públicos. También hay
endpoints privilegiados o de diagnóstico sin protección. Ver el P0 de
`ARCHITECTURE.md` antes de ampliar la exposición de la API.

## Estado vigente M2↔M3

- `POST /api/lotes-vivero/:id/despacho` está implementado para salidas
  manuales y rechaza `PLANTACION_CAMPANIA`.
- `POST /api/lotes-vivero/:id/asignaciones` realiza la entrega física a una
  Subcampaña, exige evidencia y descuenta `saldo_vivo_actual`.
- Plantar consume asignaciones; no genera un nuevo despacho M2.
- La devolución física repone el lote origen.
- `POST /:id/reservas` fue retirado.
- `AUTOMATICO_PLANTACION` queda solo para historial legado.

## Deuda que debe permanecer visible

1. Autenticación JWT no aplicada globalmente y endpoints privilegiados sin
   guard.
2. Challenges WebAuthn en memoria; no soportan despliegue multiinstancia.
3. `JWT_SECRET` conserva un fallback inseguro en código.
4. El esquema no es reproducible desde cero:
   - falta la migración que crea/alinea `tipo_planta` y
     `planta.tipo_planta_id`;
   - la migración `006` conserva `DONACION_COMUNIDAD`, mientras el contrato
     actual usa `PLANTACION_COMUNIDAD` y `DONACION`.
5. `RF-VIV-05` no está completamente reflejado por el backend: el DTO/RPC
   exige `destino_referencia` para todos los destinos y no exige
   `comunidad_destino_id` para `DONACION`.
6. Algunos GET y sus decoradores Swagger discrepan sobre si requieren
   `x-auth-id`.

## Regla para mantener sincronía

Un cambio de contrato debe actualizar, en el mismo trabajo:

1. DTO y controller;
2. service y migración/RPC;
3. Swagger;
4. guía frontend y receta Postman;
5. requerimiento/regla/decisión en `r3foresta-docs`;
6. `r3foresta-docs/ESTADO.md` cuando haya evidencia de implementación o
   despliegue.
