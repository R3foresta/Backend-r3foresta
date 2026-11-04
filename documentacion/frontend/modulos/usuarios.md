# Usuarios, perfil y autoridad

**Revisado: 3 de noviembre de 2026.** [Sesión WebAuthn](../webauthn.md), [controller legado](../../../src/users/users.controller.ts), [controller v1](../../../src/users/perfil-v1.controller.ts) y [DTO de perfil](../../../src/users/perfil-v1.dto.ts).

Todas las rutas de esta guía exigen Bearer verificado y cuenta activa. El actor se toma de la sesión, no de un ID del body. `x-auth-id` puede omitirse; si se envía debe coincidir. El alta empieza VOLUNTARIO; la afiliación declarada no concede permisos.

## Perfil propio v1

`GET /api/v1/usuarios/me/perfil` devuelve `{data:PerfilPropio, observado_en}`. Todos los campos del perfil son requeridos:

```json
{
  "usuario_id": "42",
  "nombre": "Persona de prueba",
  "apellido": null,
  "afiliacion": null,
  "rol_global": "VOLUNTARIO"
}
```

`usuario_id` es BIGINT decimal como cadena; este ID es distinto del `auth_id` del JWT. No se devuelven correo, contacto, wallet, documento ni credenciales.

`PATCH /api/v1/usuarios/me/perfil` acepta al menos uno de estos campos; rechaza desconocidos y autoridad:

| Campo | Regla |
|---|---|
| `nombre?` | Texto NFC/trim de 1..100 caracteres; no null |
| `apellido?` | Texto de 1..30; null o vacío normalizado elimina el dato opcional |
| `afiliacion?` | null, organización registrada o texto «Otra» |

Omitir conserva el dato anterior. Formas de afiliación:

```json
{"afiliacion":{"tipo":"ORGANIZACION_REGISTRADA","organizacion_id":"7"}}
```

```json
{"afiliacion":{"tipo":"OTRA","nombre":"Agrupación de prueba"}}
```

Catálogo: el servidor valida la organización activa y obtiene su nombre. «Otra»: NFC/trim de 1..150, sin crear una organización maestra. La salida usa `{tipo,organizacion_id,nombre}`, con ID null para «Otra». Ninguna selección es obligatoria.

`GET /api/v1/participacion/organizaciones-seleccionables` permite a cualquier cuenta activa recorrer el catálogo mínimo: `consulta?` de 2..100, `cursor?`, `limite?` entero 1..20, default 20. Devuelve `{data:[{organizacion_id,nombre}],observado_en,siguiente_cursor}`. Un vínculo previamente guardado a una organización luego inactiva se conserva en el perfil, pero no habilita una nueva selección de esa organización.

## Administración de roles globales

Solo un `ADMIN` global activo puede escoger una cuenta y cambiar su rol. Cada cuenta tiene un rol global: `ADMIN`, `GENERAL`, `VALIDADOR` o `VOLUNTARIO`. `VALIDADOR` sigue en uso en Recolección y Vivero. Ser administrador de una subcampaña no autoriza esta gestión global.

| Ruta | Uso |
|---|---|
| `GET /api/v1/usuarios` | Lista paginada de cuentas activas para escoger usuario, con su rol y revisión actuales |
| `GET /api/v1/usuarios/:usuario_id/autoridad` | Relee la autoridad de la cuenta seleccionada antes de confirmar |
| `POST /api/v1/usuarios/:usuario_id/roles` | Asigna el rol elegido y devuelve un recibo durable |

El listado acepta únicamente estos parámetros opcionales:

| Parámetro | Regla |
|---|---|
| `consulta` | NFC/trim de 2..100 caracteres; busca una parte literal del nombre o `username`, sin distinguir mayúsculas. `%` y `_` son caracteres literales |
| `rol_global` | Uno de los cuatro roles globales |
| `cursor` | Cursor firmado de 1..1024 caracteres; conservar filtros y sesión al pedir la página siguiente |
| `limite` | Entero de 1..20; default 20 |

Sin filtros devuelve las primeras cuentas activas por `usuario_id` ascendente. La respuesta es:

```json
{
  "data": [{
    "usuario_id": "42",
    "nombre": "Persona de prueba",
    "username": "persona.prueba",
    "rol_global": "VOLUNTARIO",
    "activo": true,
    "revision_autoridad": "0"
  }],
  "observado_en": "2026-11-03T12:00:00Z",
  "siguiente_cursor": null
}
```

Los IDs y revisiones son cadenas decimales; no convertirlos a `number`. `username` es cadena o null si falta o está vacío; `nombre` usa el nombre disponible, luego `username` y finalmente «Usuario». La proyección no expone correo, contacto ni credenciales. Una página vacía se representa con `data:[]`; un fallo de consulta devuelve error, no una lista vacía.
La lectura de `/autoridad` conserva también «Usuario» como presentación cuando una cuenta legada carece de nombre y username, de modo que pueda revisarse y recibir su rol.

Flujo de consumo: listar/buscar, escoger la cuenta, releer `/autoridad` y confirmar el rol con la revisión obtenida. El cambio acepta exclusivamente:

```json
{
  "comando_id": "a0c976ce-2b10-4f2c-a88e-7db287fc3454",
  "rol_global": "GENERAL",
  "revision_esperada": "0",
  "motivo": "Asignación de funciones internas"
}
```

`comando_id` es UUIDv4; `motivo` es texto NFC/trim de 3..1000 caracteres. La identidad del administrador se obtiene del JWT. El destino es el `usuario_id` de la ruta. El servidor confirma en una transacción el rol, la revisión, el historial y el recibo; elegir el rol vigente devuelve `SIN_CAMBIOS` después de validar autorización y revisión.

Ante `409 REVISION_OBSOLETA`, releer la cuenta y confirmar de nuevo con otra clave. `409 ULTIMO_ADMIN_GLOBAL` impide dejar el sistema sin un administrador global activo; `409 DESTINO_INACTIVO` informa que la cuenta elegida fue inactivada. Estos rechazos de negocio conservan recibo `RECHAZADO`. Si falla la red o llega `503 RESULTADO_NO_DETERMINADO`, conservar clave e intención y recuperar con `GET /api/v1/participacion/comandos/:comando_id?operacion=CAMBIAR_ROL_GLOBAL`; no crear otra clave para resolver la incertidumbre. El recibo propio sigue recuperable tras perder el rol, mientras la cuenta permanezca activa. Un replay terminal no acredita permisos actuales: refrescar capacidades/listado después del resultado.

El listado requiere la [migración091](../../../migrations/091_usuarios_administracion_lectura.sql), aditiva de lectura. El cambio usa las RPC existentes de072. [Verificación local](../../../docs/evidencia/usuarios-administracion-local-2026-11-03.json) y [ejemplos ejecutados](../../../docs/usuarios-administracion-ejemplos.json). SQL aplicado y despliegue se comprueban en el entorno destino. DTO y respuestas completas: [OpenAPI generado](../../../docs/pa-int02c-openapi.json).
La PWA integra este flujo en `/app/usuarios`, con entrada «Usuarios y permisos» para ADMIN y recuperación del pendiente propio tras perder ese rol. [Implementación y QA frontend](../../../../pwa-r3foresta/docs/QA_USUARIOS_ADMINISTRACION.md).
Pablo confirmó que091 ya está aplicada; [registro de la confirmación](../../../docs/evidencia/usuarios-administracion-091-aplicacion-reportada.json). No se identificó el entorno en ese mensaje; el cotejo de catálogo y HTTP remoto siguen pendientes.

## Autoridad y gestión contextual

Perfil no admite `rol`, `rol_global`, `activo`, revisión de autoridad, actor ni permisos. Los cambios administrativos separados son:

- `GET /api/v1/usuarios/:usuario_id/autoridad`.
- `POST /api/v1/usuarios/:usuario_id/roles`.
- `POST /api/v1/usuarios/:usuario_id/inactivaciones`.

Exigen ADMIN global y tienen revisión/continuidad, motivo e historial/recibo atómicos. DTO y errores: [OpenAPI C](../../../docs/pa-int02c-openapi.json) y [ejemplos ejecutados](../../../docs/pa-int02c-ejemplos.json). El permiso PLANTADOR/ADMINISTRADOR_SUBCAMPANIA es contextual y se gestiona en `/api/v1/participacion/accesos/*`, separado de roles globales y del equipo logístico.

## Compatibilidad `/api/users`

Estas rutas conservan su respuesta legada; no mezclarlas con los envelopes/IDs v1:

| Ruta | Audiencia y comportamiento |
|---|---|
| `GET /api/users?q=&rol=` | Directorio/selector interno para ADMIN, GENERAL o VALIDADOR; devuelve `[{id,nombre,rol,foto_perfil_url}]`. ID numérico sólo en rango seguro |
| `GET /api/users/rol/:rol?q=` | Alias del selector; mismo control interno |
| `GET /api/users/profile` | Perfil legado **propio**, con campos históricos y afiliación; no es directorio de terceros |
| `POST /api/users/register-form` | Adaptador de edición propia; permite nombre/apellido, organización como «Otra» y campos históricos documento/wallet/contacto según validación. No exige esos datos para el nuevo recorrido; `rol` u otro campo ajeno devuelve 422 |
| `PATCH /api/users/profile/photo` | Multipart, campo `file`, máximo 2 MiB y formato PNG/JPEG/JPG/WebP. Actualiza sólo foto propia y devuelve perfil legado |

No usar el directorio interno para buscar participantes contextuales. Usar `/api/v1/participacion/personas/buscar`, autorizado por acción y selección completa, que no expone correo ni roles internos de terceros.

```sh
curl http://localhost:3000/api/v1/usuarios/me/perfil \
  -H "Authorization: Bearer <token>"
```

Privacidad: perfil y participación se sirven fuera de caché pública. No generalizar el envelope de error de C a todas las rutas legadas. Los errores/limitaciones precisos de cada contrato están en su implementación y [pruebas de perfil](../../../src/users/perfil-v1.http.spec.ts).
