# Usuarios, perfil y autoridad

**Revisado: 15 de octubre de 2026.** [Sesión WebAuthn](../webauthn.md), [controller legado](../../../src/users/users.controller.ts), [controller v1](../../../src/users/perfil-v1.controller.ts) y [DTO de perfil](../../../src/users/perfil-v1.dto.ts).

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
