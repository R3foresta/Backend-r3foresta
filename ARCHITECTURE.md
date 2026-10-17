# Arquitectura del backend

**Corte: 16 de octubre de 2026, base `a045d9d` más árbol local INT02-D, migraciones hasta080.**
Describe implementación; el contrato de producto y el estado de cada entorno
viven en [r3foresta-docs](https://github.com/R3foresta/r3foresta-docs).

## Fuentes y mapa de código

Producto/ADRs → controller/DTO/Swagger → última migración/RPC → guía de consumo.
Un archivo SQL local no acredita aplicación remota. Los [informes](docs/README.md)
identifican pruebas, fecha, revisión y entorno.

| Área | Código | Responsabilidad |
|---|---|---|
| Identidad | `src/auth`, `src/users` | WebAuthn, JWT, actividad y perfil privado |
| M1 | `src/recolecciones` | Validación, saldo operativo y snapshots |
| M2 | `src/lotes-vivero` | Transformación, merma, entrega y devolución |
| M3 | `src/campanias`, `subcampanias`, `plantaciones` | Plan/equipo/stock y hechos de campo |
| Acceso contextual | `src/participacion` | Capacidades, miembros, comandos de acceso y autoridad, recuperación |
| Registro participante | `src/participacion/application`, `cargas`, `domain/policies` | Contexto/personas, inicial LIFO, detalle propio, cargas/generaciones e imagen sanitizada |
| Público | `src/impact`, `src/health` | Impacto y liveness |
| Infraestructura | `src/supabase`, `pinata`, `blockchain`, `evidencias-trazabilidad` | DB/Storage e integraciones |

Los módulos operativos usan `api` → `application` → `domain/policies`, con pruebas
junto al módulo. Catálogos e integraciones conservan módulos planos.

## Petición privada y autorización

```text
Bearer JWT → guard → cuenta activa en DB → DTO/policy por objeto
          → service → consulta/RPC privada → respuesta
```

`VerifiedActorGuard` verifica HS256, firma, expiración y `sub`, resuelve la cuenta
por `usuario.auth_id` y rechaza inactivos. `x-auth-id` es opcional y debe coincidir
con `sub`; no reemplaza el JWT. `InternalActorGuard` añade el gate de roles internos
ADMIN/GENERAL/VALIDADOR y adapta los headers legados desde la identidad verificada.
Perfil/v1 y participación usan el guard de cuenta activa; cada operación valida su autoridad.
GET del plan conserva la lectura para cuentas activas y su escritura requiere ADMIN.

Los controllers de campañas, subcampañas, recolecciones, vivero, plantaciones,
organizaciones y evidencias usan guard interno. Usuarios/perfil y participación
usan guard verificado. **No existe guard global**: revisar cada ruta restante.
Impacto y las ceremonias WebAuthn son públicos por su contrato. CORS no autentica. Las13 entradas autorizadas de diagnósticos/mutaciones de catálogos usan guard interno; catálogos GET y consultas públicas de cadena conservan su audiencia.
`GET /health` es liveness sin consultas externas y no lleva prefijo `/api`.

El JWT WebAuthn tiene identidad propia; no asumir una sesión Supabase Auth ni
comparar el PK BIGINT con `auth.uid()`. `getAdminClient()` usa la clave privada
para identidad/datos/RPC restringidos y falla si no está configurada. El cliente
público permanece para proyecciones legitimadas. `JWT_SECRET` es obligatorio,
sin fallback, en los módulos de autenticación/usuario.

## Invariantes y transacciones

- Un lote tiene una Recolección origen. `INICIO` aún no crea saldo vivo;
  `EMBOLSADO` lo inaugura. Pérdida total anterior: descarte pre-embolsado.
- La asignación física descuenta Vivero y crea stock M3. Plantar aumenta consumo
  de esa asignación, sin un segundo descuento del lote.
- `disponible = asignado - consumido - devuelto - mermado`; asignado es inmutable.
  Devolver aumenta devuelto y repone el lote origen. `AUTOMATICO_PLANTACION` es legado.
- Campaña tiene estado derivado. `COORDINADOR` es logística de `subcampania_equipo`,
  separado de rol global y permiso contextual. Afiliación no concede autoridad.
- Historiales/eventos son append-only; snapshots conservan el pasado.
  Polígono/GPS autoritativos se validan con PostGIS.

Saldo y escrituras relacionadas usan RPC: asignación, plantación, devolución,
cancelación y revisión de plan, entre otras. Algunas operaciones legadas de M1
siguen usando llamadas separadas y compensaciones TypeScript; no equivalen a una
transacción única ante caída de proceso/red.

B/C añaden vigencias, revisión estable, auditoría y comandos durables. Cambio real,
revisión, historial y terminal se confirman juntos; un rechazo de negocio revierte
el dominio y conserva recibo. Infraestructura fallida conserva incertidumbre.
La [guía de participación](documentacion/modulos/participacion.md) define el contrato
consumible y sus límites, incluido el orden cooperativo de locks.

`service_role` puede eludir RLS y conserva escritura SQL privilegiada para RPC
SECURITY INVOKER. Los grants públicos están cerrados en las superficies verificadas;
RLS no sustituye autorización. La continuidad probada entre RPC no cubre
importaciones/SQL privilegiado que omitan la disciplina de cuentas → ámbitos.

La validación de una Recolección precede a Pinata/mint; errores externos no revierten
el hecho validado. No hay outbox/reintento durable para esos efectos. PostgreSQL
continúa siendo la fuente operativa de verdad.

## Migraciones y evidencia

Las migraciones son SQL ordenado, sin runner productivo en este repositorio.
La última redefinición de una RPC gana. No ejecutar 001–073 a ciegas sobre Supabase:
el catálogo legado tiene drift pendiente. Los fixtures aislados post-067 son
antecedentes mínimos, no una prueba de reconstrucción completa.

En participación: 068 crea comandos; 069 añade eventos ENUM y debe confirmar antes
de 070; 070 crea permisos/revisiones/ACL; 071 instala bootstrap sin ejecutarlo;
072/073 implementan gestión y lecturas privadas; 074 añade cargas/snapshots,
075 registro inicial LIFO/lecturas y replay de preparación, 076 conserva el día
DATE de entrada de entregas nuevas sin conciliar legado.077 ordena físicas/plan/reposición (campaña antes de hija también bajo FKs de eventos),078 lleva lifecycle a RPC,079 privatiza reposición y sanitiza foto pública,080 cierra el inventario fijo de tablas/vista/catálogos sin nuevos grants de servicio ni RLS. Preflight/postflight fallan ante drift fuera del alcance; no lo corrigen implícitamente. El backend privado consumidor debe
acompañar el cierre de grants. [Evidencia por entrega](docs/README.md).

## Pendientes materiales

1. Pinata upload, blockchain mint/wallet/diagnósticos y `/api/test-db` conservan
   entradas ahora protegidas en el alcance D autorizado; sus acciones externas no se ejecutan en las pruebas sintéticas. No considerar acreditado el despliegue por tener guards locales. `/api/auth/test-supabase` ya no existe en el controller actual.
2. INT03-A implementa registro/cargas/LIFO/snapshots con verificación aislada;
   [entrega y límites](docs/pa-int03a-entrega-local.md). D integra localmente autorización por objeto/rutas equivalentes/carreras compartidas; [informe D](docs/pa-int02d-entrega-local.md). Faltan aplicación/cotejo remotos y conciliación de entregas. La implementación local no habilita el piloto.
3. Catálogo remoto completo y manifest de transición real revisado. En C se confirmó
   aplicación 072/073 y REST; igualdad de cuerpos/catálogo remoto y despliegue externo
   siguen sin acreditarse. No modificar permisos reales con fixtures.
4. Challenges WebAuthn en memoria: no soportan varias instancias sin coordinación.
   Pinata/blockchain carecen de recuperación durable; referencias fijas requieren revisión.
5. Replay completo de DB pendiente: alineación `tipo_planta`/`planta.tipo_planta_id`
   y enum antiguo de destinos de 006. El despacho conserva discrepancias RF-VIV-05
   sobre referencia/comunidad. Conservar estas deudas hasta verificar su cierre.
6. Lint global con deuda anterior y versión Node aún sin fijar en `engines`.
   Build, pruebas locales y push no acreditan despliegue ni QA completo.
