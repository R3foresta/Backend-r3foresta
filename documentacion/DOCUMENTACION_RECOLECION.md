# 📚 Documentación Completa del Módulo de Recolecciones

## 📋 Índice

1. [Descripción General](#descripción-general)
2. [Arquitectura del Módulo](#arquitectura-del-módulo)
3. [Estructura de Archivos](#estructura-de-archivos)
4. [Endpoints de la API](#endpoints-de-la-api)
5. [Modelos de Datos (DTOs)](#modelos-de-datos-dtos)
6. [Entidades](#entidades)
7. [Enumeraciones](#enumeraciones)
8. [Ejemplos de Uso con Postman](#ejemplos-de-uso-con-postman)
9. [Flujo de Trabajo Completo](#flujo-de-trabajo-completo)
10. [Validaciones y Reglas de Negocio](#validaciones-y-reglas-de-negocio)
11. [Manejo de Errores](#manejo-de-errores)

---

## 🎯 Descripción General

El módulo de **Recolecciones** es responsable de gestionar el proceso completo de registro de recolecciones de material vegetal (semillas, estacas, plántulas, injertos). Este módulo integra múltiples servicios para:

- ✅ Crear registros de recolecciones con ubicación geográfica
- 📸 Almacenar fotografías en Supabase Storage
- 🔗 Generar código de trazabilidad único
- ☁️ Subir metadata a IPFS mediante Pinata
- 🪙 Mintear NFTs en blockchain automáticamente
- 🔍 Listar y filtrar recolecciones
- 📊 Obtener detalles completos de recolecciones

---

## 🏗️ Arquitectura del Módulo

El módulo sigue la arquitectura NestJS con inyección de dependencias:

```
recolecciones.module.ts
├── RecoleccionesController (Capa de presentación)
├── RecoleccionesService (Lógica de negocio)
└── Dependencias externas:
    ├── SupabaseModule (Base de datos)
    ├── PinataModule (IPFS)
    └── BlockchainModule (NFT minting)
```

---

## 📁 Estructura de Archivos

### **Archivos Principales**

| Archivo | Propósito | Responsabilidad |
|---------|-----------|-----------------|
| `recolecciones.module.ts` | **Módulo raíz** | Define las importaciones, controladores y proveedores del módulo |
| `recolecciones.controller.ts` | **Controlador HTTP** | Maneja las rutas REST, validación de entrada y respuestas HTTP |
| `recolecciones.service.ts` | **Servicio de negocio** | Contiene la lógica de negocio, transacciones, integración con servicios externos |

---

### **📂 Carpeta `dto/` (Data Transfer Objects)**

Define la estructura de datos para las peticiones entrantes y validaciones.

| Archivo | Propósito |
|---------|-----------|
| `create-recoleccion.dto.ts` | DTO principal para crear una recolección |
| `create-ubicacion.dto.ts` | DTO para datos de ubicación geográfica |
| `create-planta.dto.ts` | DTO para registrar nueva especie de planta |
| `filters-recoleccion.dto.ts` | DTO para filtros de búsqueda y paginación |

---

### **📂 Carpeta `entities/`**

Define las interfaces TypeScript que representan la estructura de datos de la base de datos.

| Archivo | Propósito |
|---------|-----------|
| `recoleccion.entity.ts` | Entidad principal de recolección |
| `ubicacion.entity.ts` | Entidad de ubicación geográfica |
| `planta.entity.ts` | Entidad de planta/especie |
| `recoleccion-foto.entity.ts` | Entidad de fotos asociadas |

---

### **📂 Carpeta `enums/`**

Define constantes y valores permitidos.

| Archivo | Valores Permitidos | Uso |
|---------|-------------------|-----|
| `tipo-material.enum.ts` | `SEMILLA`, `ESTACA`, `PLANTULA`, `INJERTO` | Define el tipo de material recolectado |
| `estado-recoleccion.enum.ts` | `ALMACENADO`, `EN_PROCESO`, `UTILIZADO`, `DESCARTADO` | Estado actual del material |
| `fuente-planta.enum.ts` | `NATIVA`, `INTRODUCIDA`, `ENDEMICA` | Origen de la especie |

---

## 🌐 Endpoints de la API

### **Base URL**: `http://localhost:3000/api/recolecciones`

---

### 1️⃣ **POST /api/recolecciones** - Crear Recolección

**Descripción**: Crea una nueva recolección con fotos, ubicación y planta.

**Autenticación**: Requiere header `x-auth-id`

**Headers Requeridos**:
```
x-auth-id: <auth_id_del_usuario>
Content-Type: multipart/form-data
```

**Body (FormData)**:
```json
{
  "fecha": "2024-01-15",
  "cantidad": 2.5,
  "unidad": "kg",
  "tipo_material": "SEMILLA",
  "estado": "ALMACENADO",
  "especie_nueva": false,
  "planta_id": 5,
  "observaciones": "Recolección en buen estado",
  "ubicacion[pais]": "Bolivia",
  "ubicacion[departamento]": "La Paz",
  "ubicacion[provincia]": "Murillo",
  "ubicacion[comunidad]": "Achocalla",
  "ubicacion[zona]": "Central",
  "ubicacion[latitud]": -16.5833,
  "ubicacion[longitud]": -68.15,
  "fotos": [archivo1.jpg, archivo2.jpg]
}
```

**Respuesta Exitosa (201)**:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "codigo_trazabilidad": "REC-2024-045",
    "fecha": "2024-01-15",
    "cantidad": 2.5,
    "unidad": "kg",
    "tipo_material": "SEMILLA",
    "estado": "ALMACENADO",
    "blockchain_url": "https://shannon-explorer.somnia.network/token/0x.../instance/456",
    "token_id": "456",
    "transaction_hash": "0xabc...",
    "usuario": {
      "id": 10,
      "nombre": "Juan Pérez",
      "username": "jperez"
    },
    "planta": {
      "id": 5,
      "especie": "Ceibo",
      "nombre_cientifico": "Ceiba pentandra"
    },
    "ubicacion": {
      "id": 200,
      "pais": "Bolivia",
      "departamento": "La Paz",
      "latitud": -16.5833,
      "longitud": -68.15
    },
    "fotos": [
      {
        "id": 500,
        "url": "https://supabase.co/storage/.../foto1.jpg",
        "peso_bytes": 2048576,
        "formato": "JPG"
      }
    ]
  }
}
```

---

### 2️⃣ **GET /api/recolecciones** - Listar Recolecciones del Usuario

**Descripción**: Obtiene todas las recolecciones del usuario autenticado con filtros y paginación.

**Autenticación**: Requiere header `x-auth-id`

**Headers Requeridos**:
```
x-auth-id: <auth_id_del_usuario>
```

**Query Parameters**:
| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `page` | number | Número de página (default: 1) | `?page=2` |
| `limit` | number | Registros por página (max: 50, default: 10) | `?limit=20` |
| `fecha_inicio` | string | Fecha inicio (YYYY-MM-DD) | `?fecha_inicio=2024-01-01` |
| `fecha_fin` | string | Fecha fin (YYYY-MM-DD) | `?fecha_fin=2024-12-31` |
| `estado` | enum | Estado de recolección | `?estado=ALMACENADO` |
| `tipo_material` | enum | Tipo de material | `?tipo_material=SEMILLA` |
| `vivero_id` | number | ID del vivero | `?vivero_id=3` |
| `search` | string | Búsqueda por nombre | `?search=ceibo` |

**Ejemplos de URLs**:
```
GET /api/recolecciones?page=1&limit=10
GET /api/recolecciones?fecha_inicio=2024-01-01&fecha_fin=2024-06-30
GET /api/recolecciones?estado=ALMACENADO&tipo_material=SEMILLA
GET /api/recolecciones?search=ceibo&vivero_id=3
```

**Respuesta Exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "codigo_trazabilidad": "REC-2024-045",
      "fecha": "2024-01-15",
      "cantidad": 2.5,
      "unidad": "kg",
      "tipo_material": "SEMILLA",
      "estado": "ALMACENADO",
      "usuario": { "id": 10, "nombre": "Juan Pérez" },
      "planta": { "id": 5, "especie": "Ceibo" },
      "ubicacion": { "departamento": "La Paz", "comunidad": "Achocalla" },
      "fotos": [...]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 45,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

### 3️⃣ **GET /api/recolecciones/vivero/:viveroId** - Listar por Vivero

**Descripción**: Obtiene todas las recolecciones asociadas a un vivero específico.

**URL Example**: `GET /api/recolecciones/vivero/3?page=1&limit=10`

**Query Parameters**: (Mismos que el endpoint anterior)

**Respuesta**: Similar al endpoint anterior

---

### 4️⃣ **GET /api/recolecciones/:id** - Obtener Detalle

**Descripción**: Obtiene el detalle completo de una recolección específica.

**URL Example**: `GET /api/recolecciones/123`

**Respuesta Exitosa (200)**:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "codigo_trazabilidad": "REC-2024-045",
    "fecha": "2024-01-15",
    "cantidad_inicial_canonica": 2500,
    "unidad_canonica": "G",
    "tipo_material": "SEMILLA",
    "estado": "ALMACENADO",
    "especie_nueva": false,
    "observaciones": "Recolección en buen estado",
    "blockchain_url": "https://shannon-explorer.somnia.network/...",
    "token_id": "456",
    "transaction_hash": "0xabc...",
    "created_at": "2024-01-15T10:30:00Z",
    "usuario": {
      "id": 10,
      "nombre": "Juan Pérez",
      "username": "jperez",
      "correo": "juan@example.com"
    },
    "ubicacion": {
      "id": 200,
      "pais": "Bolivia",
      "departamento": "La Paz",
      "provincia": "Murillo",
      "comunidad": "Achocalla",
      "zona": "Central",
      "latitud": -16.5833,
      "longitud": -68.15
    },
    "vivero": {
      "id": 3,
      "codigo": "VIV-003",
      "nombre": "Vivero Central"
    },
    "metodo": {
      "id": 1,
      "nombre": "Manual",
      "descripcion": "Recolección manual directa"
    },
    "planta": {
      "id": 5,
      "especie": "Ceibo",
      "nombre_cientifico": "Ceiba pentandra",
      "variedad": "Común",
      "fuente": "NATIVA"
    },
    "fotos": [
      {
        "id": 500,
        "recoleccion_id": 123,
        "url": "https://supabase.co/storage/.../foto1.jpg",
        "peso_bytes": 2048576,
        "formato": "JPG",
        "created_at": "2024-01-15T10:30:05Z"
      }
    ]
  }
}
```

---

## 📝 Modelos de Datos (DTOs)

### **CreateRecoleccionDto** (create-recoleccion.dto.ts)

**Propósito**: Validar los datos de entrada al crear una recolección.

```typescript
{
  fecha: string;                    // Formato: "YYYY-MM-DD", no más de 45 días atrás
  cantidad: number;                  // Mayor a 0 (el backend convierte a canónico)
  unidad: string;                    // Ej: "kg", "g", "unidad" (el backend normaliza)
  tipo_material: TipoMaterial;       // SEMILLA | ESQUEJE
  estado?: EstadoRecoleccion;        // Default: ALMACENADO
  especie_nueva: boolean;            // true = nueva especie, false = existente
  observaciones?: string;            // Máx. 1000 caracteres
  ubicacion: CreateUbicacionDto;     // Objeto anidado
  vivero_id?: number;                // Opcional
  metodo_id: number;                 // Requerido
  planta_id?: number;                // Requerido si especie_nueva = false
  nueva_planta?: CreatePlantaDto;    // Requerido si especie_nueva = true
}
```

**Validaciones**:
- ✅ `fecha` no puede ser futura ni mayor a 45 días atrás
- ✅ `cantidad` debe ser mayor a 0.01
- ✅ Si `especie_nueva = false`, `planta_id` es obligatorio
- ✅ Si `especie_nueva = true`, `nueva_planta` es obligatorio

---

### **CreateUbicacionDto** (create-ubicacion.dto.ts)

**Propósito**: Validar datos de ubicación geográfica.

```typescript
{
  pais?: string;
  departamento?: string;
  provincia?: string;
  comunidad?: string;
  zona?: string;
  latitud: number;     // Entre -90 y 90 (requerido)
  longitud: number;    // Entre -180 y 180 (requerido)
}
```

---

### **CreatePlantaDto** (create-planta.dto.ts)

**Propósito**: Registrar nueva especie cuando `especie_nueva = true`.

```typescript
{
  especie: string;               // Nombre común (requerido)
  nombre_cientifico: string;     // Nombre científico (requerido)
  variedad: string;              // Variedad (requerido)
  tipo_planta?: string;          // Ej: "Árbol", "Arbusto"
  tipo_planta_otro?: string;     // Si tipo_planta = "Otro"
  fuente: FuentePlanta;          // NATIVA | INTRODUCIDA | ENDEMICA
}
```

---

### **FiltersRecoleccionDto** (filters-recoleccion.dto.ts)

**Propósito**: Validar parámetros de búsqueda y filtros.

```typescript
{
  usuario_id?: number;           // Filtro por usuario (interno)
  fecha_inicio?: string;         // YYYY-MM-DD
  fecha_fin?: string;            // YYYY-MM-DD
  estado?: EstadoRecoleccion;    // Filtro por estado
  vivero_id?: number;            // Filtro por vivero
  tipo_material?: TipoMaterial;  // Filtro por tipo
  page?: number;                 // Default: 1
  limit?: number;                // Default: 10, Max: 50
  search?: string;               // Búsqueda por nombre
}
```

---

## 🗂️ Entidades

Las entidades representan la estructura de las tablas en Supabase.

### **Recoleccion** (recoleccion.entity.ts)

```typescript
{
  id: number;
  fecha: Date;
  nombreCientifico?: string;
  nombreComercial?: string;
  cantidad: number;
  unidad: string;
  tipoMaterial: TipoMaterial;
  estado: EstadoRecoleccion;
  especieNueva: boolean;
  observaciones?: string;
  usuarioId: number;
  ubicacionId: number;
  viveroId?: number;
  metodoId: number;
  plantaId?: number;
  codigoTrazabilidad: string;      // Formato: REC-YYYY-NNN
  blockchainUrl?: string;           // URL en blockchain explorer
  tokenId?: string;                 // ID del NFT
  transactionHash?: string;         // Hash de la transacción
  createdAt: Date;
}
```

---

### **Ubicacion** (ubicacion.entity.ts)

```typescript
{
  id: number;
  pais?: string;
  departamento?: string;
  provincia?: string;
  comunidad?: string;
  zona?: string;
  latitud: number;
  longitud: number;
  createdAt: Date;
}
```

---

### **Planta** (planta.entity.ts)

```typescript
{
  id: number;
  especie: string;
  nombreCientifico: string;
  variedad: string;
  tipoPlanta?: string;
  tipoPlantaOtro?: string;
  fuente: FuentePlanta;
  createdAt: Date;
}
```

---

### **RecoleccionFoto** (recoleccion-foto.entity.ts)

```typescript
{
  id: number;
  recoleccionId: number;
  url: string;           // URL pública de Supabase Storage
  pesoBytes: number;     // Tamaño del archivo
  formato: string;       // JPG, JPEG, PNG
  createdAt: Date;
}
```

---

## 🔤 Enumeraciones

### **TipoMaterial** (tipo-material.enum.ts)

```typescript
enum TipoMaterial {
  SEMILLA = 'SEMILLA',
  ESTACA = 'ESTACA',
  PLANTULA = 'PLANTULA',
  INJERTO = 'INJERTO'
}
```

---

### **EstadoRecoleccion** (estado-recoleccion.enum.ts)

```typescript
enum EstadoRecoleccion {
  ALMACENADO = 'ALMACENADO',      // Material guardado
  EN_PROCESO = 'EN_PROCESO',      // En tratamiento/preparación
  UTILIZADO = 'UTILIZADO',        // Ya usado en producción
  DESCARTADO = 'DESCARTADO'       // Descartado por mala calidad
}
```

---

### **FuentePlanta** (fuente-planta.enum.ts)

```typescript
enum FuentePlanta {
  NATIVA = 'NATIVA',              // Originaria de la región
  INTRODUCIDA = 'INTRODUCIDA',    // Introducida de otra región
  ENDEMICA = 'ENDEMICA'           // Exclusiva de la zona
}
```

---

## 🧪 Ejemplos de Uso con Postman

### **Colección Postman: Recolecciones**

---

### **1. Crear Recolección con Especie Existente**

**Request**:
```
POST http://localhost:3000/api/recolecciones
Headers:
  x-auth-id: user_2kL9xW3mN5pQ7rT8vY1zX
  Content-Type: multipart/form-data
```

**Body (form-data)**:
```
fecha: 2024-01-20
cantidad: 3.5
unidad: kg
tipo_material: SEMILLA
estado: ALMACENADO
especie_nueva: false
planta_id: 10
metodo_id: 2
vivero_id: 5
nombre_cientifico: Swietenia macrophylla
nombre_comercial: Mara
observaciones: Semillas de alta calidad
ubicacion[pais]: Bolivia
ubicacion[departamento]: Santa Cruz
ubicacion[comunidad]: San Ignacio
ubicacion[latitud]: -16.5
ubicacion[longitud]: -62.8
fotos: [archivo1.jpg] (File)
fotos: [archivo2.jpg] (File)
```

---

### **2. Crear Recolección con Nueva Especie**

**Request**:
```
POST http://localhost:3000/api/recolecciones
Headers:
  x-auth-id: user_2kL9xW3mN5pQ7rT8vY1zX
  Content-Type: multipart/form-data
```

**Body (form-data)**:
```
fecha: 2024-01-22
cantidad: 150
unidad: unidades
tipo_material: PLANTULA
estado: ALMACENADO
especie_nueva: true
metodo_id: 1
vivero_id: 3
nombre_cientifico: Jacaranda mimosifolia
nombre_comercial: Jacaranda
nueva_planta[especie]: Jacarandá
nueva_planta[nombre_cientifico]: Jacaranda mimosifolia
nueva_planta[variedad]: Común
nueva_planta[tipo_planta]: Árbol
nueva_planta[fuente]: INTRODUCIDA
ubicacion[pais]: Bolivia
ubicacion[departamento]: Cochabamba
ubicacion[provincia]: Cercado
ubicacion[comunidad]: Tiquipaya
ubicacion[latitud]: -17.33
ubicacion[longitud]: -66.21
fotos: [foto.jpg] (File)
```

---

### **3. Listar Recolecciones (Paginado)**

**Request**:
```
GET http://localhost:3000/api/recolecciones?page=1&limit=20
Headers:
  x-auth-id: user_2kL9xW3mN5pQ7rT8vY1zX
```

---

### **4. Filtrar por Fecha y Estado**

**Request**:
```
GET http://localhost:3000/api/recolecciones?fecha_inicio=2024-01-01&fecha_fin=2024-01-31&estado=ALMACENADO
Headers:
  x-auth-id: user_2kL9xW3mN5pQ7rT8vY1zX
```

---

### **5. Buscar por Nombre**

**Request**:
```
GET http://localhost:3000/api/recolecciones?search=mara
Headers:
  x-auth-id: user_2kL9xW3mN5pQ7rT8vY1zX
```

---

### **6. Listar Recolecciones de un Vivero**

**Request**:
```
GET http://localhost:3000/api/recolecciones/vivero/5?page=1&limit=10
```

---

### **7. Obtener Detalle de Recolección**

**Request**:
```
GET http://localhost:3000/api/recolecciones/123
```

---

## 🔄 Flujo de Trabajo Completo

### **Proceso de Creación de Recolección**

```
1. Usuario envía FormData con fotos
   ↓
2. Controller valida el header x-auth-id
   ↓
3. Controller parsea FormData anidado (ubicacion[pais], nueva_planta[especie])
   ↓
4. Controller convierte strings a tipos correctos (cantidad → number)
   ↓
5. Controller valida DTO con class-validator
   ↓
6. Service busca usuario en BD por auth_id
   ↓
7. Service valida permisos (ADMIN o TECNICO)
   ↓
8. Service valida fecha (no futura, no más de 45 días)
   ↓
9. Service valida vivero_id, metodo_id, planta_id
   ↓
10. Service crea ubicación en BD
   ↓
11. Service crea planta (si especie_nueva = true)
   ↓
12. Service sube fotos a Supabase Storage
   ↓
13. Service genera código de trazabilidad (REC-YYYY-NNN)
   ↓
14. Service crea registro de recolección
   ↓
15. Service guarda registros de fotos en BD
   ↓
16. Service construye metadata NFT
   ↓
17. Service sube JSON a Pinata (IPFS)
   ↓
18. Service mintea NFT en blockchain
   ↓
19. Service actualiza recolección con blockchain_url, token_id, transaction_hash
   ↓
20. Service retorna datos completos
```

---

## ✅ Validaciones y Reglas de Negocio

### **Validaciones de Entrada**

| Campo | Validación |
|-------|-----------|
| `fecha` | ❌ No puede ser futura<br>❌ No más de 45 días atrás |
| `cantidad` | ❌ Debe ser mayor a 0.01 |
| `tipo_material` | ✅ Solo valores del enum |
| `estado` | ✅ Solo valores del enum |
| `especie_nueva` | ✅ Booleano requerido |
| `planta_id` | ❌ Requerido si especie_nueva = false<br>✅ Debe existir en BD |
| `nueva_planta` | ❌ Requerido si especie_nueva = true |
| `metodo_id` | ✅ Debe existir en BD |
| `vivero_id` | ✅ Debe existir en BD (si se envía) |
| `ubicacion.latitud` | ✅ Entre -90 y 90 |
| `ubicacion.longitud` | ✅ Entre -180 y 180 |
| `fotos` | ❌ Máximo 5 archivos<br>❌ Solo JPG, JPEG, PNG<br>❌ Máximo 5MB por archivo |

---

### **Reglas de Negocio**

1. **Autenticación**: Todas las operaciones requieren `x-auth-id`
2. **Autorización**: Solo usuarios con rol ADMIN o TECNICO pueden crear recolecciones
3. **Trazabilidad**: Cada recolección recibe un código único `REC-YYYY-NNN`
4. **IPFS**: Metadata se sube automáticamente a Pinata
5. **Blockchain**: Se mintea NFT automáticamente (no bloquea si falla)
6. **Rollback**: Si falla algún paso, se revierten los cambios previos
7. **Paginación**: Máximo 50 registros por página
8. **Filtro de Usuario**: El endpoint GET filtra automáticamente por usuario autenticado

---

## ⚠️ Manejo de Errores

### **Errores Comunes**

| Código | Error | Causa |
|--------|-------|-------|
| 400 | `Validación fallida` | Datos de entrada inválidos |
| 401 | `Header x-auth-id es requerido` | Falta autenticación |
| 403 | `No tienes permisos` | Usuario sin rol ADMIN/TECNICO |
| 404 | `Usuario con auth_id ... no encontrado` | auth_id no existe en BD |
| 404 | `Planta no encontrada` | planta_id no existe |
| 404 | `Vivero no encontrado` | vivero_id no existe |
| 404 | `Método de recolección no encontrado` | metodo_id no existe |
| 404 | `Recolección no encontrada` | ID de recolección no existe |
| 500 | `Error al crear ubicación` | Fallo en BD |
| 500 | `Error al subir foto` | Fallo en Supabase Storage |

### **Ejemplos de Respuestas de Error**

```json
{
  "statusCode": 400,
  "message": "Validación fallida: La fecha debe ser válida; La cantidad debe ser mayor a 0",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 401,
  "message": "Header x-auth-id es requerido",
  "error": "Unauthorized"
}
```

```json
{
  "statusCode": 404,
  "message": "Usuario con auth_id user_123 no encontrado",
  "error": "Not Found"
}
```

---

## 🔧 Configuración de Postman

### **Environment Variables**

```json
{
  "base_url": "http://localhost:3000/api",
  "auth_id": "user_2kL9xW3mN5pQ7rT8vY1zX"
}
```

### **Pre-request Script (Autenticación)**

```javascript
pm.request.headers.add({
    key: 'x-auth-id',
    value: pm.environment.get('auth_id')
});
```

---

## 📊 Ejemplo de Colección Postman Completa

### **Estructura de Carpetas**

```
📁 Recolecciones API
├── 📂 Crear
│   ├── POST Crear con Especie Existente
│   └── POST Crear con Nueva Especie
├── 📂 Listar
│   ├── GET Listar Todas (Paginado)
│   ├── GET Filtrar por Fecha
│   ├── GET Filtrar por Estado
│   ├── GET Buscar por Nombre
│   └── GET Listar por Vivero
└── 📂 Detalle
    └── GET Obtener por ID
```

---

## 🎯 Buenas Prácticas

1. **Siempre incluir paginación** en las consultas GET
2. **Usar filtros específicos** para reducir tráfico de red
3. **Validar datos en frontend** antes de enviar
4. **Manejar errores de red** con reintentos
5. **Guardar fotos optimizadas** (no más de 5MB)
6. **Incluir observaciones** para trazabilidad
7. **Verificar blockchain_url** para confirmar minteo exitoso

---

## 📚 Recursos Adicionales

- **Supabase Docs**: https://supabase.com/docs
- **Pinata Docs**: https://docs.pinata.cloud
- **NestJS Docs**: https://docs.nestjs.com
- **Class Validator**: https://github.com/typestack/class-validator

---

## 🆘 Soporte y Escalabilidad

### **Escalabilidad a Largo Plazo**

El módulo está diseñado para ser escalable:

- ✅ **DTOs separados** permiten agregar nuevos campos sin afectar código existente
- ✅ **Enums** centralizados facilitan agregar nuevos estados
- ✅ **Servicios desacoplados** (Supabase, Pinata, Blockchain) son intercambiables
- ✅ **Paginación** permite manejar grandes volúmenes de datos
- ✅ **Filtros opcionales** reducen carga en BD
- ✅ **Validaciones con class-validator** permiten reglas complejas
- ✅ **Transacciones con rollback** garantizan integridad

### **Mantenimiento**

- 🔧 Cada archivo tiene una **responsabilidad única**
- 🔧 Los **enums** centralizan valores permitidos
- 🔧 Los **DTOs** documentan la estructura de datos
- 🔧 Las **entities** reflejan la estructura de BD
- 🔧 El **service** contiene toda la lógica de negocio

---

**Documentación creada para**: Backend Reforesta  
**Versión**: 1.0  
**Última actualización**: 2 de febrero de 2026