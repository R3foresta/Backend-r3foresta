# Autenticación WebAuthn

**Actualización del alta del 16 de noviembre de 2026.** Contrato en `src/auth/auth.controller.ts`,
`auth.service.ts` y `dto/register.dto.ts`. JWT propio de la aplicación, no Supabase Auth.

## Ceremonia

1. Obtener `GET /api/auth/challenge`: devuelve `challenge` y `sessionId`.
2. Completar WebAuthn en el navegador con el challenge y el origen del frontend.
3. Enviar el objeto serializado de la ceremonia al endpoint correspondiente:

| Endpoint público | Body |
|---|---|
| `POST /api/auth/register` | `username`, `email` opcional, `registration`, `challenge` |
| `POST /api/auth/login` | `authentication`, `challenge` |

`registration`/`authentication` son los objetos WebAuthn serializados esperados por
`@passwordless-id/webauthn`; no enviar una instancia Credential sin serializar sus
buffers. La respuesta satisfactoria incluye `success`, `auth_id`, `user`, `token`
y `message`. `user.id`/`auth_id` identifican aquí la identidad textual; no convertirlos
al PK BIGINT del perfil.

Tras verificar la ceremonia, el servidor crea la cuenta **VOLUNTARIO** y su primera
credencial en una sola transacción. Si PostgreSQL rechaza la credencial, revierte
también la nueva cuenta. El registro puede intentarse de nuevo con un desafío nuevo.
Si se perdió la respuesta al alta, se puede intentar el login con la passkey creada.

Un payload con rol u otros campos de perfil/autoridad se rechaza; después usar
[perfil v1](modulos/usuarios.md).
Conservar el token recibido y enviarlo a las rutas privadas:

```http
Authorization: Bearer <token-de-la-aplicacion>
```

El guard verifica firma/expiración HS256, `sub` y actividad. Si se conserva
`x-auth-id`, debe coincidir con `sub`; nunca autentica solo. Los cambios de permiso
no se resuelven leyendo un rol del token: el servidor consulta autoridad vigente.
Una sesión expirada requiere autenticarse de nuevo; no fabricar tokens en el cliente.

## Condiciones y límites

`CORS_ORIGINS` define la lista completa de sitios permitidos por CORS y WebAuthn,
separados por coma. Cada entrada debe ser un origen exacto, sin ruta, barra final
ni comodines. Por ejemplo:

```dotenv
CORS_ORIGINS=https://pwa-r3foresta.vercel.app
```

Con `NODE_ENV=production`, la lista es obligatoria y solo admite HTTPS. Fuera de
producción, omitirla admite `http://localhost:5173`, `http://127.0.0.1:5173` y
`http://localhost:3000`. Una lista explícita reemplaza esos valores; para probar
otra PWA o un preview, añadir su origen concreto.

Registro y login requieren el header `Origin` del navegador. El backend lo
compara con su configuración y exige que coincida con el origen de la ceremonia
en `clientDataJSON`. Un origen ausente o no permitido produce `400` en registro
y `401` en login si la solicitud alcanza esos endpoints; CORS puede rechazarla
antes. Los clientes HTTP sin `Origin` siguen pudiendo consultar rutas como salud
o Impacto, según su contrato.

Se conserva el RP ID derivado del hostname del frontend. Cambiar el dominio de
la API no requiere registrar otra passkey si se conserva el dominio de la PWA.
Mover la PWA a otro hostname requiere revisar las credenciales existentes.
`JWT_SECRET` es obligatorio al arrancar; no hay fallback. No publicar JWT reales
en ejemplos/logs. CORS no sustituye la verificación WebAuthn ni el guard.

Los challenges expiran y se consumen en memoria del proceso. Reiniciar puede
invalidar una ceremonia en curso; varias instancias necesitan almacenamiento
compartido antes de ofrecer ese despliegue. El preview de participación usa tokens
sintéticos y **no prueba login WebAuthn**.

Impacto público no requiere token; no bloquear su consulta al expirar sesión.
Autoridad contextual y recibos: [participación](../modulos/participacion.md).
