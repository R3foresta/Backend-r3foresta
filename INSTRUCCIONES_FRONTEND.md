# 📱 Instrucciones para el Frontend - WebAuthn con Persistencia

## 🎯 Cambios Importantes en el Backend

### ✅ Persistencia de Datos Implementada

El backend ahora **guarda automáticamente** todos los usuarios y credenciales en un archivo JSON, por lo que:

- ✅ **Ya NO se pierden los datos** al reiniciar el servidor
- ✅ **Las credenciales persisten** entre reinicios
- ✅ **Puedes registrarte y volver a hacer login** en cualquier momento

### 📂 Ubicación de los Datos

Los datos se guardan en: `backend/data/users.json`

## 🔍 Logs Detallados en Consola del Backend

El backend ahora muestra información detallada en la consola:

### Durante el REGISTRO:
```
🔵 ============ INTENTO DE REGISTRO ============
📥 Datos recibidos desde el frontend:
   • Usuario: juan_perez
   • Email: juan@ejemplo.com
   • Origin: http://localhost:5173
   • Challenge válido: Sí
🔐 Verificando credenciales WebAuthn...
✅ Credenciales WebAuthn verificadas correctamente
   • Credential ID: AbCdEf1234567890...
   • Algoritmo: ES256
💾 Creando usuario en el sistema...
✅ Usuario creado exitosamente
   • ID de usuario: user_1702512345_abc123
   • Total de credenciales: 1
💾 ✅ DATOS GUARDADOS EN PERSISTENCIA (data/users.json)
🔵 ============================================
```

### Durante el LOGIN:
```
🟢 ============ INTENTO DE LOGIN ============
📥 Solicitud de autenticación recibida
   • Origin: http://localhost:5173
   • Challenge válido: Sí
🔍 Buscando usuario con Credential ID: AbCdEf1234567890...
✅ Usuario encontrado en la persistencia:
   • Usuario: juan_perez
   • ID: user_1702512345_abc123
   • Email: juan@ejemplo.com
   • Registrado: 14/12/2025, 0:45:30
   • Último login: Primera vez
🔐 Verificando autenticación WebAuthn...
✅ Autenticación WebAuthn verificada correctamente
   • Counter anterior: 0
   • Counter nuevo: 1
💾 ✅ DATOS ACTUALIZADOS EN PERSISTENCIA
🎉 LOGIN EXITOSO para: juan_perez
🟢 ==========================================
```

## 🚀 Flujo Correcto de Uso

### 1️⃣ Primera Vez (Registro)

```javascript
// Frontend
1. Usuario hace clic en "Registrar con Passkey"
2. Backend genera un challenge
3. Frontend llama a WebAuthn del navegador
4. El navegador pide huella/Face ID/PIN
5. Frontend envía las credenciales al backend
6. Backend las valida y GUARDA EN PERSISTENCIA ✅
7. Usuario queda registrado permanentemente
```

### 2️⃣ Logins Posteriores

```javascript
// Frontend
1. Usuario hace clic en "Login con Passkey"
2. Backend genera un nuevo challenge
3. Frontend llama a WebAuthn
4. El navegador pide huella/Face ID/PIN
5. Frontend envía la autenticación al backend
6. Backend BUSCA EN PERSISTENCIA la credencial ✅
7. Si existe, autentica al usuario
8. Backend actualiza la persistencia con el nuevo login
```

## ⚠️ Ya NO Necesitas Hacer Esto:

❌ ~~NO reinicies el servidor después de registrarte~~
❌ ~~Regístrate de nuevo después de cada reinicio~~

## ✅ Ahora PUEDES Hacer Esto:

✅ Registrarte una vez
✅ Reiniciar el servidor cuando quieras
✅ Hacer login en cualquier momento
✅ Las credenciales siempre estarán disponibles

## 🔧 Configuración del Frontend (Sin Cambios)

El frontend sigue igual, solo asegúrate de tener:

### `.env`
```env
VITE_API_URL=http://localhost:3000
```

### Endpoints que usa el frontend:
```javascript
GET  http://localhost:3000/api/auth/challenge  // Obtener challenge
POST http://localhost:3000/api/auth/register   // Registrar usuario
POST http://localhost:3000/api/auth/login      // Login de usuario
```

## 🐛 Debugging

Si tienes problemas, revisa:

1. **Consola del Backend**: Verás logs detallados de cada operación
2. **Archivo de persistencia**: `backend/data/users.json` - puedes abrirlo y ver los usuarios registrados
3. **Consola del Navegador**: Verifica errores de WebAuthn

### Ver usuarios registrados:
```bash
# En la carpeta del backend
cat data/users.json  # En Linux/Mac
type data\users.json # En Windows
```

## 🎯 Testing Rápido

### Caso 1: Registro Nuevo
```
1. Abre http://localhost:5173
2. Ve a "Registrar"
3. Ingresa un username (ej: "test_user")
4. Haz clic en "Registrar con Passkey"
5. Usa tu huella/Face ID/PIN
6. Verás en la consola del backend: "DATOS GUARDADOS EN PERSISTENCIA"
```

### Caso 2: Login con Usuario Existente
```
1. Abre http://localhost:5173
2. Ve a "Login"
3. Haz clic en "Login con Passkey"
4. Usa tu huella/Face ID/PIN
5. Verás en la consola del backend: "Usuario encontrado en la persistencia"
6. Verás: "LOGIN EXITOSO para: test_user"
```

### Caso 3: Reiniciar Servidor
```
1. Detén el servidor (Ctrl+C)
2. Inicia el servidor: npm run start:dev
3. Verás en la consola: "✅ Cargados X usuarios desde archivo"
4. Intenta hacer login → Funcionará perfectamente ✅
```

## 📊 Estructura del Archivo de Persistencia

El archivo `data/users.json` tiene esta estructura:

```json
[
  {
    "id": "user_1702512345_abc123",
    "username": "juan_perez",
    "email": "juan@ejemplo.com",
    "credentials": [
      {
        "credentialId": "AbCdEf1234567890...",
        "publicKey": "MFkwEwYHKoZ...",
        "algorithm": "ES256",
        "counter": 3,
        "transports": ["internal"],
        "createdAt": "2025-12-14T00:45:30.123Z"
      }
    ],
    "createdAt": "2025-12-14T00:45:30.123Z",
    "lastLogin": "2025-12-14T01:23:45.678Z"
  }
]
```

## 🔒 Seguridad

- ✅ Las claves privadas **NUNCA** salen del dispositivo del usuario
- ✅ Solo se guarda la clave **pública** en el servidor
- ✅ Cada login incrementa el **counter** para prevenir replay attacks
- ✅ Los challenges expiran en **5 minutos**

## 💡 Tips

1. **Cada navegador/dispositivo** necesita su propio registro
2. **Modo incógnito** no recordará las credenciales
3. **Diferentes usuarios** pueden tener múltiples credenciales
4. **El counter** aumenta con cada login (normal)

---

## 📞 Resumen para tu Chat de Frontend

**Dile esto a tu chat de frontend:**

> "El backend ya tiene persistencia implementada. Los usuarios y credenciales se guardan automáticamente en `data/users.json` y persisten entre reinicios del servidor. Ya no es necesario mantener el servidor encendido todo el tiempo. El flujo es:
> 
> 1. Registro → Se guarda en persistencia
> 2. Reiniciar servidor → Los datos se cargan automáticamente
> 3. Login → Se busca en persistencia y autentica
> 
> El backend muestra logs detallados en consola de cada operación (registro y login) indicando si encontró los datos en la persistencia y si se guardaron correctamente. No hay cambios en el código del frontend, todo sigue funcionando igual."

---

**Estado**: ✅ Backend con persistencia completa y logs detallados funcionando
