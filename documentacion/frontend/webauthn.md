# Autenticación WebAuthn

**Corte: 15 de octubre de 2026.** Contrato en `src/auth/auth.controller.ts`,
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

El alta asigna **VOLUNTARIO** en servidor. Un payload con rol u otros campos de
perfil/autoridad se rechaza; después usar [perfil v1](modulos/usuarios.md).
Conservar el token recibido y enviarlo a las rutas privadas:

```http
Authorization: Bearer <token-de-la-aplicacion>
```

El guard verifica firma/expiración HS256, `sub` y actividad. Si se conserva
`x-auth-id`, debe coincidir con `sub`; nunca autentica solo. Los cambios de permiso
no se resuelven leyendo un rol del token: el servidor consulta autoridad vigente.
Una sesión expirada requiere autenticarse de nuevo; no fabricar tokens en el cliente.

## Condiciones y límites

El origen debe corresponder a la ceremonia y estar admitido por CORS. CORS no
sustituye la verificación WebAuthn ni el guard. `JWT_SECRET` es obligatorio al
arrancar el backend; no hay fallback. No publicar JWT reales en ejemplos/logs.

Los challenges expiran y se consumen en memoria del proceso. Reiniciar puede
invalidar una ceremonia en curso; varias instancias necesitan almacenamiento
compartido antes de ofrecer ese despliegue. El preview de participación usa tokens
sintéticos y **no prueba login WebAuthn**.

Impacto público no requiere token; no bloquear su consulta al expirar sesión.
Autoridad contextual y recibos: [participación](../modulos/participacion.md).
