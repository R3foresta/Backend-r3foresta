# Módulo: Usuarios

Base URL: `/api/users`

---

## GET /users

**Rol mínimo**: GENERAL
**Descripción**: Lista usuarios para selectores (dropdowns), filtrados por nombre y/o rol.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario autenticado |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| q | string | — | Búsqueda ILIKE por nombre (case-insensitive) |
| rol | string | — | Filtrar por rol exacto (ADMIN, GENERAL, VALIDADOR, VOLUNTARIO) |

**Respuesta exitosa** `200`
```json
[
  {
    "id": 1,
    "nombre": "Juan Pérez",
    "rol": "ADMIN"
  },
  {
    "id": 2,
    "nombre": "María González",
    "rol": "GENERAL"
  }
]
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Rol inválido, parámetros malformados |
| 401 | Header x-auth-id ausente |

**Ejemplo cURL**
```bash
curl -X GET "http://localhost:3000/api/users?q=juan&rol=ADMIN" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /users/rol/:rol

**Rol mínimo**: GENERAL
**Descripción**: Alias explícito para listar usuarios por rol. Útil para selectores de coordinadores/equipo.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario autenticado |

**Path Parameters**
| Parámetro | Tipo | Descripción |
|-----------|------|------------|
| rol | string | Rol exacto: ADMIN, GENERAL, VALIDADOR, VOLUNTARIO |

**Query Parameters**
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|------------|
| q | string | — | Búsqueda ILIKE por nombre |

**Respuesta exitosa** `200`
```json
[
  {
    "id": 7,
    "nombre": "Coord Pepe",
    "rol": "GENERAL"
  }
]
```

**Notas**
- Es equivalente a `GET /users?rol=:rol&q=...`.
- Para coordinadores de subcampaña, filtrar por el rol de usuario que producto defina como elegible y luego asignarlo con rol de equipo `COORDINADOR`.

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Rol inválido o parámetros malformados |
| 401 | Header x-auth-id ausente |

**Ejemplo cURL**
```bash
curl -X GET "http://localhost:3000/api/users/rol/GENERAL?q=coord" \
  -H "x-auth-id: <tu-auth-id>"
```

---

## GET /users/profile

**Rol mínimo**: GENERAL (leer el propio perfil)  
**Descripción**: Obtiene los datos completos del usuario autenticado.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id (dev mode); o JWT Bearer (prod) |

**Respuesta exitosa** `200`
```json
{
  "id": 1,
  "username": "juan.perez",
  "correo": "juan@example.com",
  "auth_id": "user_1716910800000_abc123",
  "nombre": "Juan Pérez",
  "apellido": "González",
  "doc_identidad": "12345678",
  "wallet_address": "0x1234567890123456789012345678901234567890",
  "organizacion": "Fundacion Verde",
  "contacto": "555-1234",
  "rol": "ADMIN",
  "foto_perfil_url": "https://supabase.../imagenes-perfil/user_1716910800000_abc123/profile-picture.jpg?v=1716920000000",
  "created_at": "2026-05-28T10:00:00Z",
  "updated_at": "2026-05-28T10:00:00Z"
}
```

**Campos Opcionales** (pueden ser `null`):
- `apellido`
- `doc_identidad`
- `wallet_address`
- `organizacion`
- `contacto`
- `foto_perfil_url`

**Errores**
| Status | Cuándo |
|--------|--------|
| 401 | Token JWT inválido o ausente; x-auth-id no encontrado |
| 404 | Usuario no encontrado en BD |

**Ejemplo cURL**
```bash
curl -X GET http://localhost:3000/api/users/profile \
  -H "x-auth-id: <tu-auth-id>"
```

---

## POST /users/register-form

**Rol mínimo**: GENERAL (completar el propio registro)  
**Descripción**: Completa los datos del formulario de registro tras el login WebAuthn.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id (dev) o Bearer JWT (prod) |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| nombre | string | ✓ | max 200 caracteres |
| apellido | string | — | max 200 caracteres |
| doc_identidad | string | ✓ | unique en tabla usuario |
| wallet_address | string | — | unique si se envía; debe ser valid Ethereum address |
| organizacion | string | — | max 200 caracteres |
| contacto | string | — | max 200 caracteres (teléfono o email adicional) |
| rol | string | — | Default: GENERAL; client nunca puede auto-elevar a ADMIN |

**Respuesta exitosa** `200`
```json
{
  "id": 1,
  "username": "juan.perez",
  "correo": "juan@example.com",
  "auth_id": "user_1716910800000_abc123",
  "nombre": "Juan Pérez",
  "apellido": "González",
  "doc_identidad": "12345678",
  "wallet_address": "0x1234567890123456789012345678901234567890",
  "organizacion": "Fundacion Verde",
  "contacto": "555-1234",
  "rol": "GENERAL",
  "created_at": "2026-05-28T10:00:00Z",
  "updated_at": "2026-05-28T10:30:00Z"
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida: campo mal formado |
| 401 | Token inválido o ausente |
| 409 | `doc_identidad` o `wallet_address` ya existen en otra cuenta |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/users/register-form \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "nombre": "Juan",
    "apellido": "Pérez",
    "doc_identidad": "12345678",
    "wallet_address": "0x1234567890123456789012345678901234567890",
    "organizacion": "Fundacion Verde",
    "contacto": "555-1234"
  }'
```

---

## PATCH /users/profile/photo 📎

**Rol mínimo**: GENERAL (actualizar propia foto)  
**Descripción**: Sube o reemplaza la foto de perfil. Solo 1 foto activa por usuario.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id |
| Content-Type | ✓ | `multipart/form-data` |

**Body** (`multipart/form-data`)
| Campo | Tipo | Requerido | Validación |
|-------|------|-----------|------------|
| file | file | ✓ | max 2 MB; tipos: PNG, JPEG, JPG, WebP |

**Respuesta exitosa** `200`
```json
{
  "id": 1,
  "username": "juan.perez",
  "nombre": "Juan Pérez",
  "foto_perfil_url": "https://supabase.../imagenes-perfil/user_1716910800000_abc123/profile-picture.jpg?v=1716920000000",
  "updated_at": "2026-05-28T12:30:00Z"
}
```

**Notas**
- URL incluye `?v=timestamp` para forzar recarga del navegador (bypass caché local)
- Foto anterior es eliminada automáticamente
- Almacenamiento: `supabase/imagenes-perfil/{auth_id}/profile-picture.{ext}`
- Caché control: `cacheControl: '0'` (no cachea en CDN de Supabase)

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Archivo demasiado grande, tipo incorrecto, o error de upload |
| 401 | Header x-auth-id ausente |

**Ejemplo cURL**
```bash
curl -X PATCH http://localhost:3000/api/users/profile/photo \
  -H "x-auth-id: <tu-auth-id>" \
  -F "file=@/path/to/photo.jpg"
```

---

## Tipos & Estructuras

### Usuario (completo)
```typescript
{
  id: number;
  username: string;
  correo: string;
  auth_id: string;
  nombre: string;
  apellido?: string;
  doc_identidad?: string;
  wallet_address?: string;
  organizacion?: string;
  contacto?: string;
  rol: 'ADMIN' | 'VALIDADOR' | 'GENERAL' | 'VOLUNTARIO';
  foto_perfil_url?: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}
```

### Usuario (selector/lista)
```typescript
{
  id: number;
  nombre: string;
  rol: string;
}
```

---

## Reglas de Negocio

1. **Rol default**: Nuevo usuario tiene rol `GENERAL`; solo ADMIN puede cambiar roles.
2. **doc_identidad**: Unique constraint, case-sensitive.
3. **wallet_address**: Opcional; si se envía, debe ser única y válida (Ethereum format).
4. **Foto de perfil**: Se borra al actualizar. URL generada con `?v=timestamp` (cache-busting).
5. **Autenticación dual**:
   - **Dev**: Acepta header `x-auth-id` directo
   - **Prod**: Requiere JWT en `Authorization: Bearer <token>`

---

## Flujo Típico

1. **Registro WebAuthn** → Genera usuario con username/email, rol GENERAL
2. **POST /register-form** → Completa nombre, documento, organización
3. **GET /profile** → Lee datos actualizados
4. **PATCH /profile/photo** → Sube foto
5. **GET /users?q=...** o **GET /users/rol/:rol?q=...** → Búsqueda de usuarios para asignaciones/equipo
