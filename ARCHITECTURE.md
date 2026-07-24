# Arquitectura — Backend R3Foresta

> Estado observado: 2026-07-23, contrastado con el código de `main` en
> `f7c691a`, las migraciones `001`–`057` y los requerimientos vigentes de
> `r3foresta-docs`.
>
> Este documento describe la implementación actual. No reemplaza los
> requerimientos funcionales ni afirma por sí solo qué migraciones están
> aplicadas en producción.

## 1. Propósito y alcance

R3Foresta es una API REST de trazabilidad forestal. Sigue material vegetal
desde su recolección, pasando por su transformación en plantas vivas dentro de
un vivero, hasta la entrega y plantación en campo.

La cadena principal es:

```text
M1 Recolección → M2 Vivero → asignación física → M3 Plantación
```

El diseño combina:

- estado materializado para operación diaria;
- historiales y eventos append-only para auditoría;
- snapshots para no reescribir el pasado cuando cambia un dato maestro;
- funciones PostgreSQL para operaciones atómicas de múltiples filas;
- evidencia fotográfica en Supabase Storage;
- metadata en IPFS y anclaje blockchain para la validación de recolecciones.

No es event sourcing puro: PostgreSQL conserva tanto el estado actual como los
eventos que explican sus cambios.

## 2. Fuentes de verdad y orden de lectura

Cuando dos fuentes difieren, usar este orden:

1. **Contrato de producto y dominio:** repositorio
   [`R3foresta/r3foresta-docs`](https://github.com/R3foresta/r3foresta-docs).
   Sus módulos, contratos de integración, decisiones y esquema describen el
   comportamiento esperado. `ESTADO.md` distingue diseño de implementación y
   despliegue.
2. **Contrato HTTP implementado:** controllers, DTOs y Swagger bajo `src/`.
   El `ValidationPipe` rechaza campos que no existan en los DTOs.
3. **Persistencia implementada:** `migrations/`, leyendo siempre la última
   redefinición de una función o constraint.
4. **Guías de consumo del backend:** `documentacion/`. Ayudan al frontend y a
   pruebas manuales, pero no deben contradecir las tres fuentes anteriores.

El esquema narrativo de `r3foresta-docs/database/00_database_schema.md` no
sustituye una inspección del esquema vivo cuando se diseña una migración.

## 3. Stack y proceso de arranque

- NestJS 11 y TypeScript 5.7, con target ES2023.
- Node.js como runtime. `package.json` aún no fija una versión mediante
  `engines`.
- Supabase: PostgreSQL, Auth y Storage.
- PostGIS para polígonos y validación geográfica de M3.
- `@supabase/supabase-js` para consultas y RPC.
- WebAuthn/passkeys con `@passwordless-id/webauthn`.
- JWT emitido por `@nestjs/jwt`.
- Pinata/IPFS para metadata NFT.
- ethers.js v6 para el contrato `TokenJham`.
- `class-validator` y `class-transformer` para los DTOs.

`src/main.ts` configura:

- prefijo global `/api`;
- Swagger UI en `/api/docs`;
- `ValidationPipe` con `whitelist`, `forbidNonWhitelisted` y `transform`;
- límite de 5 MB para JSON y URL-encoded;
- bypass deliberado de esos parsers para `multipart/form-data`;
- CORS con orígenes locales, el frontend productivo, `CORS_ORIGINS` y cualquier
  subdominio `*.vercel.app`.

Variables obligatorias para el arranque actual:

- `SUPABASE_URL` y `SUPABASE_KEY`;
- `PINATA_JWT` y `GATEWAY_URL`;
- `RPC_URL`, `PRIVATE_KEY` y `CONTRACT_ADDRESS`.

`SUPABASE_SERVICE_ROLE_KEY` es opcional para construir el cliente admin, pero
operaciones como cancelación de subcampañas y desactivación masiva de campañas
la requieren. `JWT_SECRET` tiene hoy un fallback inseguro en código y debe
configurarse siempre fuera de desarrollo.

## 4. Mapa de módulos

`src/app.module.ts` es la raíz de composición.

| Contexto | Módulos | Responsabilidad |
|---|---|---|
| M1 | `recolecciones` | Borrador, validación, saldo de origen, snapshots e historial |
| M2 | `lotes-vivero` | Inicio, embolsado, descarte, adaptabilidad, merma, despacho, asignación y devolución |
| M3 | `campanias`, `subcampanias`, `plantaciones`, `organizaciones` | Planificación, equipo, polígono, stock recibido y plantación |
| Maestros | `plantas`, `viveros`, `ubicaciones`, `comunidades`, `metodos-recoleccion`, `users` | Catálogos y referencias compartidas |
| Infraestructura | `supabase`, `auth`, `evidencias-trazabilidad`, `pinata`, `blockchain`, `pingrepet` | Persistencia, identidad, archivos, anclaje y salud |

Existe además `src/common/ubicaciones/` como servicio de lectura compartido,
en paralelo al módulo HTTP `src/ubicaciones/`.

## 5. Estilos internos de módulo

### 5.1 Módulos por capas

`recolecciones`, `lotes-vivero`, `campanias`, `subcampanias` y `plantaciones`
usan, con pequeñas variaciones, esta estructura:

```text
src/<modulo>/
├── api/             controllers, DTOs, Swagger y parsers HTTP
├── application/     casos de uso, consultas y orquestación
├── domain/          enums y policies puras
└── tests/           unitarios colocados junto al módulo
```

El servicio principal de cada contexto es un orquestador delgado. Una
transición nueva debe ir en un servicio de aplicación enfocado y una regla sin
I/O debe ir en `domain/policies/`.

### 5.2 Módulos planos

Los módulos de catálogo o integración más pequeños conservan controller,
service, DTOs y documentación sin la separación completa por capas. No se debe
forzar la estructura por capas si el módulo no tiene suficiente lógica, pero
tampoco agregar reglas de negocio complejas a un service plano sin reevaluarlo.

## 6. Flujo de una petición y seguridad real

Flujo habitual de escritura:

```text
Controller
  → DTO / parser multipart
  → resolución de x-auth-id en tabla usuario
  → autorización por rol o membresía
  → service de aplicación
  → consulta/RPC Supabase
  → respuesta HTTP
```

### 6.1 Autenticación implementada

WebAuthn registra o autentica al usuario y emite un JWT. Sin embargo, la mayor
parte de la API **no valida ese JWT**: acepta `x-auth-id` y busca directamente
ese valor en `usuario.auth_id`.

Por tanto, en el estado actual:

- `x-auth-id` identifica, pero no demuestra por sí solo, la identidad;
- no existe un guard global de autenticación;
- los permisos de los módulos por capas se derivan del rol leído desde BD, no
  de `x-user-role`;
- `x-user-role` todavía aparece en endpoints de Recolección, pero las
  decisiones sensibles vuelven a consultar el rol real en BD;
- varios GET de catálogos, Recolección y Vivero son públicos por decisión o
  deuda histórica;
- Swagger y la implementación no coinciden en todos los GET.

Este contrato es una deuda crítica antes de exponer la API a clientes no
confiables. CORS no es un control de autenticación.

### 6.2 Superficies privilegiadas sin protección

Al momento de esta revisión no exigen autenticación:

- `POST /api/blockchain/mint`;
- `POST /api/pinata/upload-json`;
- `GET /api/auth/test-supabase`;
- `GET /api/test-db`;
- endpoints de diagnóstico de wallet/contrato blockchain.

El mint usa la wallet privada del backend y `test-supabase` devuelve datos de
usuarios. Estos endpoints deben retirarse de producción o quedar detrás de
autenticación y autorización administrativa.

## 7. Límites transaccionales y consistencia

### 7.1 Operaciones atómicas en PostgreSQL

Las operaciones que conservan saldos o escriben varias entidades relacionadas
se implementan como RPC PostgreSQL, por ejemplo:

- crear lote y consumir saldo de Recolección;
- embolsar, registrar merma o despacho;
- asignar físicamente stock a una subcampaña;
- consumir asignaciones al plantar;
- devolver stock al vivero;
- cancelar subcampañas y desactivar campañas en forma masiva.

El service y la última migración que define la RPC forman un único contrato.
Cambiar solo uno de los dos produce drift.

### 7.2 Operaciones orquestadas fuera de una transacción

No todo el backend usa RPC. Algunos flujos de Recolección actualizan una fila,
insertan historial y manipulan evidencia mediante llamadas separadas, con
rollback compensatorio en TypeScript. Ese rollback reduce errores visibles,
pero no ofrece las garantías de una transacción PostgreSQL única ante caída de
proceso o fallo de red.

### 7.3 Efectos externos

Al aprobar una Recolección:

1. se persiste `VALIDADO`;
2. se construye y sube metadata a Pinata;
3. se mintea un NFT;
4. se guardan referencias blockchain en PostgreSQL.

Los errores del paso externo se registran y no revierten la validación. No hay
outbox, cola, reintento durable ni clave de idempotencia. También hay direcciones
de destinatario y URLs de explorador/contrato codificadas dentro de
`recoleccion-blockchain.service.ts`.

PostgreSQL sigue siendo la fuente de verdad; IPFS y blockchain son capas de
auditoría complementarias.

## 8. Ciclos de vida e invariantes

### 8.1 M1 — Recolección

```text
BORRADOR
  → PENDIENTE_VALIDACION
      → VALIDADO
      → RECHAZADO
          → BORRADOR al volver a editar
```

Solo una Recolección `VALIDADO` con saldo operativo puede alimentar Vivero. El
saldo materializado se acompaña de movimientos e historial.

### 8.2 M2 — Lote de vivero

```text
Recolección VALIDADA con saldo
  → INICIO
      ├─ DESCARTE_PRE_EMBOLSADO → CIERRE_AUTOMATICO
      └─ EMBOLSADO
           ├─ ADAPTABILIDAD*
           ├─ MERMA*
           ├─ DESPACHO MANUAL*
           ├─ ASIGNACION_SUBCAMPANIA*
           ├─ DEVOLUCION_PLANTACION*
           └─ saldo 0 → CIERRE_AUTOMATICO
```

Invariantes principales:

- `INICIO` representa material en proceso; aún no crea saldo vivo.
- `EMBOLSADO` crea `plantas_vivas_iniciales` y `saldo_vivo_actual`.
- `DESCARTE_PRE_EMBOLSADO` es total y no es una merma.
- una merma M2 solo afecta plantas que permanecen físicamente en el vivero;
- un despacho manual nunca representa una salida hacia subcampaña;
- una asignación a subcampaña es una entrega física: descuenta el lote al
  asignar, no al plantar;
- los eventos del lote son append-only.

### 8.3 Frontera M2 → M3

La identidad contable vigente es:

```text
saldo_asignado_disponible
= cantidad_asignada
- cantidad_consumida
- cantidad_devuelta
- cantidad_mermada
```

`cantidad_asignada` es inmutable. Plantar o reponer aumenta
`cantidad_consumida`; no vuelve a descontar `lote_vivero.saldo_vivo_actual`.
Una devolución aumenta `cantidad_devuelta` y repone físicamente el saldo del
lote origen.

El flujo legado `AUTOMATICO_PLANTACION` no debe recibir escrituras nuevas.

### 8.4 M3 — Campañas, subcampañas y plantación

```text
Organización ↔ Campaña → Subcampaña → Registro de plantación
```

- La Campaña agrupa organizaciones y subcampañas. Su estado operativo es
  derivado; no se persiste como una columna de estado.
- La Subcampaña contiene polígono PostGIS, plan por especie, equipo y stock
  asignado.
- `COORDINADOR` es una membresía de `subcampania_equipo`, no un rol global.
- Una Subcampaña puede activarse con cero stock asignado; las asignaciones
  ocurren después de `ACTIVA`.
- La plantación inicial consume asignaciones con propósito
  `PLANTACION_INICIAL`; la reposición consume `REPOSICION`.
- Cancelar solo es válido sin plantación inicial; si ya existe plantación, el
  cierre anticipado es `FINALIZADA_PARCIAL`.
- La validación geográfica autoritativa vive en PostgreSQL/PostGIS.

## 9. Evidencia

Las imágenes se reciben como `multipart/form-data` y se guardan en Supabase
Storage. Muchos flujos permiten pre-subir evidencia con `entidad_id = 0` y
vincular sus IDs dentro de la operación final.

No se suben todas las fotos a IPFS. En la validación de Recolección se sube un
JSON de metadata NFT que referencia URLs de las fotos almacenadas en Supabase.

La escritura de evidencia y la operación de dominio deben revisarse juntas:
varios RPC validan y vinculan IDs de evidencia dentro de la misma transacción.

## 10. Datos y migraciones

- El backend contiene 57 migraciones numeradas (`001`–`057`).
- Varias funciones se redefinen en migraciones posteriores; gana la última
  versión aplicada.
- No hay un runner de migraciones ni metadata de aplicación dentro de este
  repositorio. El número de archivo no demuestra por sí solo el estado de
  producción.
- `r3foresta-docs/database/migrations/` mantiene una copia documental que debe
  permanecer byte a byte sincronizada con el backend.
- Las RPC críticas conceden ejecución a `service_role`; el uso de
  `SUPABASE_KEY` frente a `SUPABASE_SERVICE_ROLE_KEY` debe ser explícito y
  consistente por operación.

Drift conocido que impide reproducir desde cero el esquema vivo:

1. `planta.tipo_planta_id` y la tabla `tipo_planta` existen en el contrato y
   código actuales, pero no se crean completamente en las migraciones.
2. La migración `006` crea el enum antiguo `DONACION_COMUNIDAD`; el código y
   esquema canónico usan `PLANTACION_COMUNIDAD` y `DONACION` por separado.
   `023` documenta ese estado vivo, pero no ejecuta la alineación.

No debe declararse reproducible el esquema hasta cerrar ambos puntos con nuevas
migraciones de alineamiento verificadas sobre una base vacía.

## 11. Pruebas y verificación

Configuraciones reales:

- `npm test` / `npm run test:unit`: `src/**/*.spec.ts` y
  `test/unit/**/*.spec.ts`;
- `npm run test:integration`: `test/integration/**/*.spec.ts`, con servicios
  reales cuando corresponde;
- `npm run test:e2e`: `test/e2e/**/*.e2e-spec.ts`;
- `npm run test:e2e:p0`: flujos HTTP P0;
- `npm run test:e2e:db`: migraciones y RPC;
- `npm run build`: compilación Nest.

La configuración usada por los scripts tiene `rootDir: ".."`; el bloque Jest
embebido en `package.json` no es el que gobierna estos comandos.

Verificación realizada durante esta revisión:

- build correcto;
- 42 suites unitarias correctas;
- 415 pruebas unitarias correctas.

No se ejecutaron integración ni e2e durante esta revisión porque dependen del
entorno externo y pueden escribir datos.

## 12. Convenciones para cambios

1. Mantener nombres de dominio, DTOs, mensajes y documentación en español.
2. No engordar los servicios orquestadores de los módulos por capas.
3. Expresar reglas puras como policies con pruebas unitarias.
4. Tratar DTO, Swagger, guía de frontend y ejemplo Postman como un mismo
   contrato HTTP.
5. Implementar conservación de saldos en una RPC y probar concurrencia.
6. Actualizar service y migración en el mismo cambio.
7. No aceptar base64 para imágenes.
8. No editar una migración ya aplicada para desplegar una corrección; agregar
   una migración nueva. Las copias documentales sí deben sincronizarse.
9. Registrar en `r3foresta-docs/ESTADO.md` qué está implementado y qué fue
   confirmado en producción.

## 13. Riesgos priorizados

### P0 — antes de ampliar exposición

1. Validar JWT o sesión en un guard global y derivar `auth_id` del token; dejar
   `x-auth-id` solo para un modo de desarrollo explícito.
2. Proteger o retirar los endpoints de mint, Pinata y diagnóstico.
3. Eliminar el fallback de `JWT_SECRET` en producción.

### P1 — integridad y operación

1. Añadir outbox, reintentos e idempotencia para Pinata/blockchain.
2. Mover los challenges WebAuthn a un almacenamiento compartido antes de usar
   más de una instancia.
3. Cerrar las dos migraciones de alineamiento y probar un replay desde cero.
4. Alinear `RF-VIV-05` con la implementación: hoy el DTO/RPC exige
   `destino_referencia` para todos los despachos y no exige
   `comunidad_destino_id` para `DONACION`, contrario a la matriz canónica.
5. Unificar qué GET son públicos y hacer coincidir controller, Swagger y
   documentación.

### P2 — mantenibilidad

1. Fijar la versión soportada de Node.
2. Incorporar CI para build, unitarios y replay de migraciones en una base
   efímera.
3. Reducir duplicación entre `ARCHITECTURE.md`, guías de backend y documentos
   canónicos mediante enlaces y ownership explícito.
