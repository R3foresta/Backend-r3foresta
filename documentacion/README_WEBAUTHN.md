# Backend WebAuthn - Passkeys con NestJS

## 🎉 Implementación Completa

El backend de autenticación con passkeys (WebAuthn) ha sido implementado exitosamente siguiendo las especificaciones del documento `IMPLEMENTACION_REACT_VITE.md`.

## 📁 Estructura Creada

```
backend/
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts       ✅ Controlador de autenticación
│   │   ├── auth.service.ts          ✅ Lógica de WebAuthn
│   │   ├── auth.module.ts           ✅ Módulo de autenticación
│   │   └── dto/
│   │       ├── register.dto.ts      ✅ DTO de registro
│   │       └── login.dto.ts         ✅ DTO de login
│   ├── users/
│   │   ├── users.service.ts         ✅ Servicio de usuarios
│   │   ├── users.module.ts          ✅ Módulo de usuarios
│   │   └── entities/
│   │       ├── user.entity.ts       ✅ Entidad de usuario
│   │       └── credential.entity.ts ✅ Entidad de credenciales
│   ├── app.module.ts                ✅ Módulo principal actualizado
│   └── main.ts                      ✅ Configuración CORS y validación
├── .env                             ✅ Variables de entorno
└── package.json                     ✅ Dependencias instaladas
```

## ✅ Completado

- [x] Instalación de dependencias (WebAuthn, JWT, validación)
- [x] Creación de entidades (User, Credential)
- [x] Implementación de DTOs con validación
- [x] Implementación de UsersService
- [x] Implementación de AuthService con WebAuthn
- [x] Creación de AuthController con endpoints
- [x] Configuración de AuthModule con JWT
- [x] Configuración de CORS en main.ts
- [x] Configuración de variables de entorno
- [x] Actualización de AppModule

## 🚀 Servidor Iniciado

El servidor está corriendo en **http://localhost:3000**

### Endpoints Disponibles

1. **GET** `/api/auth/challenge`
   - Genera un challenge para WebAuthn
   - Respuesta: `{ challenge: string, sessionId: string }`

2. **POST** `/api/auth/register`
   - Registra un nuevo usuario con passkey
   - Body: `{ username, email?, registration, challenge }`
   - Respuesta: `{ success, user, token, message }`

3. **POST** `/api/auth/login`
   - Autentica al usuario con passkey
   - Body: `{ authentication, challenge }`
   - Respuesta: `{ success, user, token, message }`

## 🔧 Configuración

### Variables de Entorno (.env)
```env
PORT=3000
JWT_SECRET=tu-secret-key-super-seguro-cambiar-en-produccion
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### CORS Configurado
- `http://localhost:5173` (Frontend React + Vite)
- `http://localhost:3000` (Backend)

## 📦 Dependencias Instaladas

- `@passwordless-id/webauthn` - Cliente y servidor WebAuthn
- `@nestjs/jwt` - Autenticación JWT
- `@nestjs/passport` - Integración Passport
- `@nestjs/config` - Configuración de entorno
- `passport-jwt` - Estrategia JWT
- `class-validator` - Validación de DTOs
- `class-transformer` - Transformación de datos
- `@types/passport-jwt` - Tipos TypeScript

## 🎯 Próximos Pasos

### Para Conectar con Frontend:

1. **Crear el proyecto frontend** (si no existe):
   ```bash
   npm create vite@latest frontend -- --template react-ts
   cd frontend
   ```

2. **Instalar dependencias del frontend**:
   ```bash
   npm install @passwordless-id/webauthn
   ```

3. **Configurar variables de entorno del frontend** (`.env`):
   ```env
   VITE_API_URL=http://localhost:3000
   ```

4. **Copiar los archivos del documento MD**:
   - `src/types/auth.types.ts`
   - `src/services/webauthn.service.ts`
   - `src/hooks/useWebAuthn.ts`
   - `src/components/auth/RegisterForm.tsx`
   - `src/components/auth/LoginForm.tsx`

5. **Iniciar el frontend**:
   ```bash
   npm run dev
   ```

## 🧪 Probar la API

### Con curl:

```bash
# Obtener challenge
curl http://localhost:3000/api/auth/challenge

# Registro (requiere datos de WebAuthn del navegador)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Con el navegador:

Una vez que tengas el frontend configurado, visita:
- **http://localhost:5173** - Frontend React
- **http://localhost:3000/api/auth/challenge** - API Backend

## 🔒 Características de Seguridad

- ✅ Challenges con expiración de 5 minutos
- ✅ Validación de origin para prevenir phishing
- ✅ Counter para prevenir replay attacks
- ✅ JWT con expiración de 7 días
- ✅ Validación global de DTOs
- ✅ CORS configurado correctamente

## ⚠️ Notas Importantes

1. **HTTPS en producción**: WebAuthn requiere HTTPS (excepto localhost)
2. **Usar localhost**: NO usar `127.0.0.1` para evitar errores de dominio
3. **Persistencia de datos**: Los usuarios y credenciales se guardan en `data/users.json` y persisten entre reinicios del servidor
4. **Base de datos**: Para producción, implementar TypeORM/Mongoose con una base de datos real
5. **Redis**: Usar Redis para challenges en producción en lugar de Map
6. **JWT Secret**: Cambiar `JWT_SECRET` en producción

## 📚 Documentación de Referencia

- [WebAuthn Library](https://github.com/passwordless-id/webauthn)
- [NestJS Documentation](https://docs.nestjs.com/)
- [W3C WebAuthn Spec](https://w3c.github.io/webauthn/)

---

**Estado**: ✅ Backend completamente funcional y listo para conectar con el frontend
