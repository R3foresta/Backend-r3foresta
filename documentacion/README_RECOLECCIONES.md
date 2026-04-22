# 📦 Módulo de Recolecciones - Backend NestJS

## ✅ Implementación Completada

Se ha implementado el sistema completo de registro de recolecciones según las especificaciones del documento `PROMPT_BACKEND_RECOLECCIONES.md`.

---

## 📁 Estructura de Archivos Creados

```
src/
├── recolecciones/
│   ├── recolecciones.module.ts
│   ├── recolecciones.controller.ts
│   ├── recolecciones.service.ts
│   ├── dto/
│   │   ├── create-recoleccion.dto.ts
│   │   ├── create-ubicacion.dto.ts
│   │   ├── create-planta.dto.ts
│   │   └── filters-recoleccion.dto.ts
│   ├── entities/
│   │   ├── recoleccion.entity.ts
│   │   ├── recoleccion-foto.entity.ts
│   │   ├── ubicacion.entity.ts
│   │   └── planta.entity.ts
│   └── enums/
│       ├── tipo-material.enum.ts
│       ├── estado-recoleccion.enum.ts
│       └── fuente-planta.enum.ts
├── viveros/
│   ├── viveros.module.ts
│   ├── viveros.controller.ts
│   └── viveros.service.ts
├── metodos-recoleccion/
│   ├── metodos-recoleccion.module.ts
│   ├── metodos-recoleccion.controller.ts
│   └── metodos-recoleccion.service.ts
└── plantas/
    ├── plantas.module.ts
    ├── plantas.controller.ts
    └── plantas.service.ts
```

---

## 🚀 Endpoints Implementados

### 1️⃣ **POST /api/recolecciones**
Crea una nueva recolección con todas sus relaciones.

**Headers:**
```
Content-Type: multipart/form-data
Authorization: Bearer <token> (por implementar)
```

**Body (multipart/form-data):**
```json
{
  "fecha": "2025-12-20",
  "cantidad": 15.5,
  "unidad": "kg",
  "tipo_material": "SEMILLA",
  "estado": "ALMACENADO",
  "especie_nueva": false,
  "observaciones": "Material de buena calidad",
  "ubicacion": {
    "pais": "Bolivia",
    "departamento": "La Paz",
    "provincia": "Murillo",
    "comunidad": "San Pedro",
    "zona": "Norte",
    "latitud": -16.5000,
    "longitud": -68.1500
  },
  "vivero_id": 1,
  "metodo_id": 1,
  "planta_id": 1,
  "nombre_cientifico": "Swietenia macrophylla",
  "nombre_comercial": "Caoba",
  "fotos": [archivo1.jpg, archivo2.jpg]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "fecha": "2025-12-20",
    "usuario": { "id": 1, "nombre": "Juan Pérez" },
    "ubicacion": { "id": 456, "latitud": -16.5, "longitud": -68.15 },
    "vivero": { "id": 1, "nombre": "VIVERO_CENTRAL" },
    "fotos": [
      { "id": 1, "url": "https://...", "formato": "JPG" }
    ]
  }
}
```

---

### 2️⃣ **GET /api/recolecciones**
Lista recolecciones con filtros y paginación.

**Query params:**
- `usuario_id` (opcional): Filtrar por usuario
- `fecha_inicio` (opcional): Fecha desde (YYYY-MM-DD)
- `fecha_fin` (opcional): Fecha hasta (YYYY-MM-DD)
- `estado` (opcional): ALMACENADO | EN_PROCESO | UTILIZADO | DESCARTADO
- `vivero_id` (opcional): Filtrar por vivero
- `tipo_material` (opcional): SEMILLA | ESTACA | PLANTULA | INJERTO
- `page` (opcional): Número de página (default: 1)
- `limit` (opcional): Items por página (default: 10)

**Ejemplo:**
```
GET /api/recolecciones?estado=ALMACENADO&page=1&limit=10
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "fecha": "2025-12-20",
      "tipo_material": "SEMILLA",
      "cantidad": 15.5,
      "unidad": "kg",
      "estado": "ALMACENADO",
      "usuario": { "id": 1, "nombre": "Juan Pérez" },
      "vivero": { "nombre": "VIVERO_CENTRAL" }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

---

### 3️⃣ **GET /api/recolecciones/:id**
Obtiene detalle completo de una recolección.

**Ejemplo:**
```
GET /api/recolecciones/123
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 123,
    "fecha": "2025-12-20",
    "nombre_cientifico": "Swietenia macrophylla",
    "cantidad": 15.5,
    "usuario": { "id": 1, "nombre": "Juan Pérez", "correo": "juan@example.com" },
    "ubicacion": { "latitud": -16.5, "longitud": -68.15 },
    "vivero": { "codigo": "VIV001", "nombre": "VIVERO_CENTRAL" },
    "metodo": { "nombre": "DIRECTA_ARBOL", "descripcion": "..." },
    "planta": { "especie": "Caoba", "fuente": "NATIVA" },
    "fotos": [
      { "id": 1, "url": "https://...", "formato": "JPG" }
    ]
  }
}
```

---

### 4️⃣ **GET /api/viveros**
Lista todos los viveros disponibles.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "codigo": "VIV001",
      "nombre": "VIVERO_CENTRAL",
      "ubicacion": {
        "departamento": "La Paz",
        "comunidad": "San Pedro"
      }
    }
  ]
}
```

---

### 5️⃣ **GET /api/metodos-recoleccion**
Lista todos los métodos de recolección.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "nombre": "DIRECTA_ARBOL",
      "descripcion": "Recolección directa del árbol madre"
    },
    {
      "id": 2,
      "nombre": "DEL_SUELO",
      "descripcion": "Recolección del suelo bajo el árbol"
    }
  ]
}
```

---

### 6️⃣ **GET /api/plantas**
Lista todas las plantas (con búsqueda opcional).

**Query params:**
- `q` (opcional): Término de búsqueda

**Ejemplo:**
```
GET /api/plantas?q=caoba
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "especie": "Caoba",
      "nombre_cientifico": "Swietenia macrophylla",
      "variedad": "Tipo A",
      "tipo_planta": "ARBOL",
      "fuente": "NATIVA"
    }
  ]
}
```

---

### 7️⃣ **GET /api/plantas/search**
Busca plantas por nombre (autocomplete).

**Query params:**
- `q` (requerido): Término de búsqueda

**Ejemplo:**
```
GET /api/plantas/search?q=ced
```

---

## ✅ Validaciones Implementadas

### ✔️ Fecha
- No puede ser futura
- No puede ser mayor a 45 días atrás
- Formato: YYYY-MM-DD

### ✔️ Cantidad
- Debe ser mayor a 0
- Máximo 2 decimales

### ✔️ Tipo Material
- SEMILLA | ESTACA | PLANTULA | INJERTO

### ✔️ Estado
- ALMACENADO | EN_PROCESO | UTILIZADO | DESCARTADO

### ✔️ Ubicación
- Latitud: -90 a 90
- Longitud: -180 a 180
- Coordenadas requeridas

### ✔️ Fotos
- Máximo 5 archivos
- Formatos: JPG, JPEG, PNG
- Tamaño máximo: 5MB por archivo

### ✔️ Relaciones
- vivero_id: Valida que exista en BD
- metodo_id: Valida que exista en BD (requerido)
- planta_id: Valida que exista si especie_nueva = false

### ✔️ Especie Nueva
- Si especie_nueva = true: nueva_planta es requerido
- Si especie_nueva = false: planta_id es requerido

### ✔️ Autorización (Pendiente)
- Solo usuarios con rol ADMIN o TECNICO pueden crear recolecciones
- Se debe extraer usuario_id del JWT token

---

## 🔄 Flujo de Creación

1. **Validación de permisos**: Verificar rol del usuario (ADMIN/TECNICO)
2. **Validación de fecha**: Verificar rango de 45 días
3. **Validación de relaciones**: Verificar vivero, método, planta
4. **Crear ubicación**: INSERT en tabla `ubicacion`
5. **Crear planta (si especie nueva)**: INSERT en tabla `planta`
6. **Subir fotos**: Upload a Supabase Storage bucket `recolecciones`
7. **Crear recolección**: INSERT en tabla `recoleccion`
8. **Rollback automático** en caso de error en cualquier paso

---

## 🚨 Manejo de Errores

### 400 Bad Request
- Validación de datos fallida
- Fecha fuera de rango
- Cantidad inválida
- Coordenadas fuera de rango

### 401 Unauthorized
- Token de autenticación inválido o expirado

### 403 Forbidden
- Usuario sin permisos (rol GENERAL o CONSULTOR)

### 404 Not Found
- Vivero no encontrado
- Método de recolección no encontrado
- Planta no encontrada
- Recolección no encontrada

### 413 Payload Too Large
- Archivo supera 5MB

### 415 Unsupported Media Type
- Formato de archivo no permitido (debe ser JPG/JPEG/PNG)

### 500 Internal Server Error
- Error al crear ubicación
- Error al crear planta
- Error al subir foto
- Error al crear recolección

---

## 📝 Logs Implementados

El servicio incluye logs detallados en consola:

```
🌱 ============ CREANDO RECOLECCIÓN ============
📥 Datos recibidos:
   • Fecha: 2025-12-20
   • Cantidad: 15.5 kg
   • Tipo material: SEMILLA
   • Usuario ID: 1
📍 Paso 1: Creando ubicación...
✅ Ubicación creada con ID: 456
🌿 Paso 2: Usando planta existente ID: 50
📸 Paso 3: Subiendo 2 fotos...
✅ Fotos subidas correctamente
📦 Paso 4: Creando registro de recolección...
✅ Recolección creada con ID: 123
💾 Paso 5: Guardando 2 fotos en BD...
✅ Fotos guardadas en base de datos
🎉 ✅ RECOLECCIÓN CREADA EXITOSAMENTE
🌱 ==========================================
```

---

## ⚙️ Configuración Requerida

### 1. Variables de entorno (.env)
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key
```

### 2. Bucket de Supabase Storage
Crear bucket llamado `recolecciones` en Supabase Dashboard:
- Dashboard → Storage → New Bucket
- Name: `recolecciones`
- Public: true (para URLs públicas)

### 3. Tablas en Supabase
Ejecutar SQL para crear tablas:
- `ubicacion`
- `planta`
- `recoleccion`
- `vivero`
- `metodo_recoleccion`
- `usuario`

---

## 🔐 Pendiente: Autenticación

**Actualmente se usan valores hardcodeados para pruebas:**
```typescript
const userId = 1; // Cambiar por req.user.id
const userRole = 'ADMIN'; // Cambiar por req.user.rol
```

**Para habilitar autenticación:**
1. Descomentar `@UseGuards(JwtAuthGuard)` en el controlador
2. Descomentar `@Request() req` en el método create
3. Usar `req.user.id` y `req.user.rol` en lugar de valores hardcodeados

---

## 🧪 Testing

### Probar creación de recolección (Postman/cURL):

```bash
curl -X POST http://localhost:3000/api/recolecciones \
  -H "Content-Type: multipart/form-data" \
  -F "fecha=2025-12-20" \
  -F "cantidad=15.5" \
  -F "unidad=kg" \
  -F "tipo_material=SEMILLA" \
  -F "especie_nueva=false" \
  -F "planta_id=1" \
  -F "metodo_id=1" \
  -F "vivero_id=1" \
  -F "ubicacion[latitud]=-16.5" \
  -F "ubicacion[longitud]=-68.15" \
  -F "fotos=@foto1.jpg" \
  -F "fotos=@foto2.jpg"
```

### Probar listado:
```bash
curl http://localhost:3000/api/recolecciones
```

### Probar viveros:
```bash
curl http://localhost:3000/api/viveros
```

### Probar plantas:
```bash
curl http://localhost:3000/api/plantas?q=caoba
```

---

## ✅ Checklist de Implementación

- [x] Módulo recolecciones creado
- [x] DTOs con validaciones completas
- [x] Endpoint POST /api/recolecciones
- [x] Validación de fecha (últimos 45 días)
- [x] Validación de cantidad (> 0)
- [x] Validación de coordenadas
- [x] Creación de ubicación
- [x] Creación de planta si especie_nueva = true
- [x] Upload de fotos a Supabase Storage
- [x] Transacciones con rollback
- [x] Endpoint GET /api/recolecciones (con filtros)
- [x] Endpoint GET /api/recolecciones/:id
- [x] Endpoint GET /api/viveros
- [x] Endpoint GET /api/metodos-recoleccion
- [x] Endpoint GET /api/plantas
- [x] Endpoint GET /api/plantas/search
- [x] Manejo de errores con códigos HTTP
- [x] Logs detallados en consola
- [x] Módulos registrados en app.module.ts
- [ ] Autenticación JWT (pendiente)
- [ ] Autorización por roles (pendiente)
- [ ] Rate limiting (pendiente)
- [ ] Tests unitarios (pendiente)

---

## 🎯 Próximos Pasos

1. **Habilitar autenticación JWT**
   - Descomentar guards en el controlador
   - Extraer userId y userRole del token

2. **Crear bucket en Supabase**
   - Dashboard → Storage → New Bucket: `recolecciones`

3. **Poblar tablas de referencia**
   - Insertar viveros
   - Insertar métodos de recolección
   - Insertar plantas existentes

4. **Probar desde el frontend**
   - Conectar formulario de recolección
   - Implementar upload de fotos
   - Manejar respuestas de error

---

**¡Módulo de Recolecciones implementado correctamente! 🚀**
