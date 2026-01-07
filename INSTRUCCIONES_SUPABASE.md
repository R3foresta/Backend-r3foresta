# ✅ CONFIGURACIÓN SUPABASE COMPLETADA

## 📋 Cambios Implementados

### 1. **Nuevas Dependencias Instaladas**
```bash
npm install @supabase/supabase-js
```

### 2. **Archivos Creados**
- `src/supabase/supabase.service.ts` - Servicio de Supabase
- `src/supabase/supabase.module.ts` - Módulo de Supabase
- `supabase-webauthn-schema.sql` - Script SQL para crear tabla de credenciales

### 3. **Variables de Entorno Agregadas** (`.env`)
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-publishable-api-key-aqui
```

---

## 🚀 PASOS PARA COMPLETAR LA CONFIGURACIÓN

### PASO 1: Ejecutar el Script SQL en Supabase

1. Abre tu proyecto en [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Ve a **SQL Editor** en el menú lateral
3. Copia y pega el contenido del archivo `supabase-webauthn-schema.sql`
4. Click en **RUN** para crear la tabla `usuario_credencial`

### PASO 2: Obtener Credenciales de Supabase

1. En el Dashboard de Supabase, ve a **Settings** → **API**
2. Copia los siguientes valores:

   **Project URL:**
   ```
   https://xxxxxxxxxx.supabase.co
   ```
   
   **Publishable API Key (anon/public):**
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### PASO 3: Actualizar `.env`

Abre el archivo `.env` y reemplaza las credenciales:

```env
PORT=3000
JWT_SECRET=tu-secret-key-super-seguro-cambiar-en-produccion
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=https://tu-proyecto-real.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tu-key-real...
```

### PASO 4: Reiniciar el Servidor

```bash
npm run start:dev
```

---

## 📊 Estructura de Tablas en Supabase

### Tabla: `usuario`
Ya existe en tu base de datos. Se guardarán estos campos al registrarse:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigint | ID autogenerado de la BD |
| `username` | text | Nombre de usuario (único) |
| `auth_id` | text | ID generado (ej: user_1765190079182_4d6jbna6i) |
| `correo` | text | Email del usuario |
| `nombre` | text | Nombre completo (por defecto = username) |
| `rol` | enum | Rol del usuario (DEFAULT: 'GENERAL') |

### Tabla: `usuario_credencial` (NUEVA)
Se creará con el script SQL. Almacena las credenciales de WebAuthn:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | bigserial | ID autogenerado |
| `usuario_id` | bigint | FK a tabla usuario |
| `credential_id` | text | ID de la credencial WebAuthn (único) |
| `public_key` | text | Clave pública para verificar firmas |
| `algorithm` | text | Algoritmo criptográfico (ES256) |
| `counter` | integer | Contador anti-replay |
| `transports` | text[] | Métodos de transporte del autenticador |
| `created_at` | timestamp | Fecha de creación |
| `last_used_at` | timestamp | Última vez que se usó |

---

## 🔐 Flujo de Registro Actualizado

```
1. Usuario se registra desde el frontend
   ↓
2. Backend recibe: { username, email, registration, challenge }
   ↓
3. Se verifica la credencial WebAuthn
   ↓
4. Se inserta en tabla `usuario`:
   - username → username
   - email → correo
   - auth_id → user_xxxxx (generado)
   - nombre → username (por defecto)
   - rol → 'GENERAL'
   ↓
5. Se inserta en tabla `usuario_credencial`:
   - usuario_id → FK del usuario creado
   - credential_id → ID de la passkey
   - public_key → Clave pública
   - algorithm, counter, transports
   ↓
6. ✅ Se retorna JWT con el auth_id
```

---

## 🔍 Logs de Registro

Al registrarse, verás estos logs en consola:

```
🔵 ============ INTENTO DE REGISTRO ============
📥 Datos recibidos desde el frontend:
   • Usuario: ana
   • Email: ana@gmail.com
   • Origin: http://localhost:5173
   • Challenge válido: Sí
🔐 Verificando credenciales WebAuthn...
✅ Credenciales WebAuthn verificadas correctamente
   • Credential ID: 2mrpDE62nOSfA6--OQyi...
   • Algoritmo: ES256
💾 Creando usuario en el sistema...
✅ Usuario insertado en Supabase tabla usuario:
   • ID DB: 123
   • Username: ana
   • Auth ID: user_1766190079182_4d6jbna6i
   • Email: ana@gmail.com
💾 ✅ DATOS GUARDADOS EN SUPABASE
   • Tabla usuario: ✓
   • Tabla usuario_credencial: ✓
```

---

## 🗑️ Archivo users.json YA NO SE USA

El archivo `data/users.json` ha sido reemplazado por Supabase. Los datos ahora persisten en la nube y no se perderán al reiniciar el servidor.

---

## ✅ Verificación

Para verificar que todo funciona:

1. Reinicia el servidor: `npm run start:dev`
2. Deberías ver: `✅ Supabase client inicializado correctamente`
3. Regístrate desde el frontend
4. Ve a Supabase Dashboard → Table Editor → `usuario` y `usuario_credencial`
5. Verifica que los datos se guardaron correctamente

---

## ⚠️ IMPORTANTE

- **NO subas el archivo `.env` a Git** (ya está en `.gitignore`)
- La **SUPABASE_KEY** debe ser la **"anon/public"**, NO la "service_role"
- Asegúrate de que RLS (Row Level Security) esté configurado si lo necesitas

---

## 🆘 Solución de Problemas

### Error: "SUPABASE_URL y SUPABASE_KEY deben estar configurados"
- Verifica que las variables estén en `.env`
- Reinicia el servidor después de modificar `.env`

### Error: "relation 'usuario_credencial' does not exist"
- Ejecuta el script SQL en Supabase SQL Editor
- Verifica que la tabla se creó en Table Editor

### Error al insertar usuario:
- Verifica que el campo `username` sea único
- Revisa los logs de consola para más detalles
- Verifica la configuración de RLS en Supabase si está habilitado
