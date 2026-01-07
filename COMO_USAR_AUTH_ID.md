# 🔐 Cómo usar auth_id en las peticiones

## 📌 Problema Resuelto
Antes las recolecciones mostraban datos de todos los usuarios. Ahora solo muestra las recolecciones del usuario autenticado.

## ✅ Solución Implementada
El backend ahora requiere que envíes el `auth_id` del usuario logueado en cada petición a los endpoints de recolecciones.

---

## 🌐 Cómo enviar peticiones desde el Frontend

### 1️⃣ Guardar el auth_id al hacer login

Cuando el usuario se loguea exitosamente, guarda su `auth_id` en localStorage:

```javascript
// Después de un login exitoso
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(loginData)
});

const result = await loginResponse.json();

// Guardar el auth_id en localStorage
localStorage.setItem('auth_id', result.user.auth_id);
```

---

### 2️⃣ Enviar el header x-auth-id en cada petición

**Formato del header:**
```
x-auth-id: user_1766432630081_3qu6tz7g4
```

---

### 📝 Ejemplos de peticiones

#### **Listar recolecciones del usuario logueado**

```javascript
const authId = localStorage.getItem('auth_id');

const response = await fetch('http://localhost:3000/api/recolecciones', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'x-auth-id': authId  // ✅ Header requerido
  }
});

const data = await response.json();
console.log(data); // Solo verás TUS recolecciones
```

#### **Crear nueva recolección**

```javascript
const authId = localStorage.getItem('auth_id');
const formData = new FormData();
formData.append('fecha', '2025-12-20');
formData.append('cantidad', '5');
// ... otros campos

const response = await fetch('http://localhost:3000/api/recolecciones', {
  method: 'POST',
  headers: {
    'x-auth-id': authId  // ✅ Header requerido (NO agregar Content-Type con FormData)
  },
  body: formData
});
```

#### **Con filtros**

```javascript
const authId = localStorage.getItem('auth_id');

const response = await fetch('http://localhost:3000/api/recolecciones?estado=ALMACENADO&page=1&limit=20', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'x-auth-id': authId  // ✅ Header requerido
  }
});
```

---

## 🧪 Pruebas con cURL

```bash
# Listar recolecciones
curl -X GET http://localhost:3000/api/recolecciones \
  -H "Content-Type: application/json" \
  -H "x-auth-id: user_1766432630081_3qu6tz7g4"

# Crear recolección
curl -X POST http://localhost:3000/api/recolecciones \
  -H "x-auth-id: user_1766432630081_3qu6tz7g4" \
  -F "fecha=2025-12-20" \
  -F "cantidad=5" \
  -F "metodo_id=1"
```

---

## 🚨 Errores comunes

### ❌ Error: "Header x-auth-id es requerido"
**Causa:** No estás enviando el header `x-auth-id`

**Solución:**
```javascript
headers: {
  'x-auth-id': localStorage.getItem('auth_id')
}
```

### ❌ Error: "Usuario con auth_id XXX no encontrado"
**Causa:** El auth_id no existe en la base de datos o está mal escrito

**Solución:** Verifica que el auth_id sea correcto usando:
```sql
SELECT * FROM usuario WHERE auth_id = 'user_1766432630081_3qu6tz7g4';
```

---

## 🔄 Migración de código existente

Si ya tienes código que hace peticiones sin el header, actualízalo:

### ❌ Antes (incorrecto)
```javascript
fetch('http://localhost:3000/api/recolecciones')
```

### ✅ Después (correcto)
```javascript
fetch('http://localhost:3000/api/recolecciones', {
  headers: {
    'x-auth-id': localStorage.getItem('auth_id')
  }
})
```

---

## 📚 Resumen

1. ✅ Guarda el `auth_id` después del login
2. ✅ Envía el header `x-auth-id` en TODAS las peticiones a `/api/recolecciones`
3. ✅ El backend automáticamente filtrará los datos por usuario
4. ✅ Solo verás TUS propias recolecciones

---

## 🔮 Futuro: JWT Tokens

Cuando se implemente JWT completo, cambiaremos a:
```javascript
headers: {
  'Authorization': `Bearer ${token}`
}
```

Pero por ahora usa `x-auth-id` como se explica arriba.
