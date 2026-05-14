# Documentación — Backend Reforesta

Backend NestJS + Supabase + ethers.js para el sistema de trazabilidad forestal **Reforesta**: registra material vegetal desde la recolección en campo hasta el despacho de plantas, con evidencias fotográficas en Supabase Storage + IPFS (Pinata) y anclaje on-chain de eventos validados.

> Para una visión de arquitectura del repo y comandos de desarrollo, ver [CLAUDE.md](../CLAUDE.md) en la raíz.

## 🗺️ Flujo end-to-end

```
[Recolección en campo]
        │
        │ POST /api/recolecciones        (BORRADOR)
        │ PATCH /:id/submit              (PENDIENTE_VALIDACION)
        │ PATCH /:id/approve             (VALIDADO) ──► IPFS + NFT mint
        │
        ▼
[Lote de vivero]
        │
        │ POST /api/lotes-vivero/evidencias-pendientes
        │ POST /api/lotes-vivero                       (INICIO, consume saldo)
        │ POST /:id/embolsado                          (EMBOLSADO)
        │ POST /:id/adaptabilidad   SOMBRA → MEDIA_SOMBRA → SOL_DIRECTO
        │ POST /:id/merma                              (opcional)
        │ POST /:id/despacho                           (pendiente de implementar)
        │
        ▼
[Plantas despachadas]
```

Ver detalle en [arquitectura/flujo-end-to-end.md](./arquitectura/flujo-end-to-end.md).

## 📚 Índice

### Por módulo del backend

| Módulo | Documentación | Código fuente |
|---|---|---|
| Recolecciones | [modulos/recolecciones.md](./modulos/recolecciones.md) | [src/recolecciones/](../src/recolecciones/) |
| Lotes de Vivero | [modulos/lotes-vivero.md](./modulos/lotes-vivero.md) | [src/lotes-vivero/](../src/lotes-vivero/) |
| Plantas (catálogo) | [modulos/plantas.md](./modulos/plantas.md) + [storage](./modulos/plantas-storage.md) | [src/plantas/](../src/plantas/) |
| Autenticación WebAuthn | [modulos/auth-webauthn.md](./modulos/auth-webauthn.md) | [src/auth/](../src/auth/) |
| Blockchain (NFT) | [modulos/blockchain.md](./modulos/blockchain.md) | [src/blockchain/](../src/blockchain/) |
| Pinata / IPFS | [modulos/pinata.md](./modulos/pinata.md) + [integración automática](./modulos/pinata-integracion.md) | [src/pinata/](../src/pinata/) |

### Para frontend (consumo de la API)

- [frontend/webauthn.md](./frontend/webauthn.md) — registro y login con passkey
- [frontend/recolecciones.md](./frontend/recolecciones.md) — crear, editar, enviar a validación, listar
- [frontend/lotes-vivero.md](./frontend/lotes-vivero.md) — crear lote, eventos de vivero, timeline

### Arquitectura y decisiones

- [arquitectura/base-de-datos.md](./arquitectura/base-de-datos.md) — esquema completo (tablas, enums, RPCs, buckets de storage)
- [arquitectura/flujo-end-to-end.md](./arquitectura/flujo-end-to-end.md) — diagrama del flujo completo
- [arquitectura/adr/001-saldo-operativo-recoleccion.md](./arquitectura/adr/001-saldo-operativo-recoleccion.md) — por qué materializamos `saldo_actual` en la tabla
- [arquitectura/adr/002-decisiones-db.md](./arquitectura/adr/002-decisiones-db.md) — decisiones de diseño previas

### Pruebas manuales (Postman)

- [postman/README.md](./postman/README.md) — índice
- [postman/embolsado.md](./postman/embolsado.md), [adaptabilidad.md](./postman/adaptabilidad.md), [merma.md](./postman/merma.md), [timeline.md](./postman/timeline.md)

## 🔑 Convenciones que aplican a toda la API

- **Prefijo global**: todas las rutas viven bajo `/api/...`.
- **Swagger UI**: `http://localhost:3000/api/docs`.
- **Autenticación de endpoints**: header `x-auth-id: <auth_id_de_supabase>`. Algunos endpoints también requieren `x-user-role: GENERAL | VALIDADOR | ADMIN`. El módulo `auth` emite JWT (passkey), pero **el resto del backend identifica al caller por `x-auth-id`**, no por JWT bearer.
- **Idioma**: identificadores, DTOs, enums, mensajes y campos están en **español**. No traducir al consumir la API.
- **Validación**: `ValidationPipe` global con `whitelist + forbidNonWhitelisted + transform`. Cualquier campo extra devuelve 400.
- **Fotos**: nunca en base64 dentro del JSON. Subir como `multipart/form-data` al endpoint correspondiente, que las almacena en Supabase Storage.

## ⚠️ Pendientes / TODO

- **`POST /api/lotes-vivero/:id/despacho`** — endpoint expuesto pero el backend lanza `NotImplementedException`. La RPC `fn_vivero_registrar_despacho` existe en migración 020 pero no está conectada al servicio.
- **Decorador Swagger `ApiObtenerMermas`** — declara `x-auth-id` como requerido para un `GET /lotes-vivero/:id/merma` que en realidad no valida el header. Ajustar el decorador a la realidad.
- **Storage de challenges WebAuthn en memoria** — `AuthService` mantiene los challenges en un `Map` con TTL de 5 min. No es seguro para despliegues multi-instancia; reemplazar por Redis antes de escalar horizontalmente.
- **`JWT_SECRET` con default en código** — `auth.module.ts` cae a `'your-secret-key-change-in-production'` si la variable no está definida. Exigir override en producción.

## 🤖 Notas para agentes de IA

- **Antes de inventar un campo**: leer el DTO real en `src/<modulo>/api/dto/` o `src/<modulo>/dto/`. El `ValidationPipe` rechaza cualquier extra.
- **Antes de inventar un endpoint**: el inventario real está en cada `modulos/*.md`; lo que no figure ahí, no existe (o está marcado como TODO arriba).
- **Idioma del código**: respeta `tipo_material`, `cantidad_inicial_canonica`, `auth_id`, etc. No anglicizar.
- **Migraciones**: la BD se versiona en `migrations/` (001 → 021). Las RPCs pueden ser redefinidas por migraciones posteriores; gana la última aplicada.
