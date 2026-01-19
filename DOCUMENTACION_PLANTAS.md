# 🌱 Documentación - API de Plantas

## 📋 Descripción General

Sistema de gestión del catálogo de especies vegetales con información taxonómica, morfológica y de uso.

**Base URL:** `http://localhost:3000/api/plantas`

---

## 🔗 Endpoints Disponibles

### 1. 📝 Crear Nueva Planta

Registra una nueva especie vegetal en el catálogo con información completa.

**Endpoint:** `POST /api/plantas`

#### Headers
```
Content-Type: application/json
```

#### Body Parameters

##### Campos Obligatorios

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `especie` | `string` | Nombre de la especie | `"Caoba"` |
| `nombre_cientifico` | `string` | Nombre científico (género + especie) | `"Swietenia macrophylla"` |
| `tipo_planta` | `string` | Tipo: Árbol, Arbusto, Hierba, Palmera, etc. | `"Árbol"` |
| `nombres_comunes` | `string` | Nombres comunes separados por comas | `"Caoba, Aguano, Araputanga"` |

##### Campos Opcionales - Información General

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `fuente` | `enum` | Tipo de material: `SEMILLA` o `ESQUEJE` | `"SEMILLA"` |
| `imagen_url` | `string` | URL de imagen representativa de la planta | `"https://ejemplo.com/caoba.jpg"` |
| `tipo_planta_otro` | `string` | Especificación cuando tipo_planta es "Otro" | `"Liana leñosa"` |
| `nombre_comun_principal` | `string` | Nombre común principal (el más usado) | `"Caoba"` |

##### Campos Opcionales - Taxonomía

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `reino` | `string` | Reino taxonómico | `"Plantae"` |
| `division` | `string` | División taxonómica | `"Magnoliophyta"` |
| `clase` | `string` | Clase taxonómica | `"Magnoliopsida"` |
| `orden` | `string` | Orden taxonómico | `"Sapindales"` |
| `familia` | `string` | Familia taxonómica | `"Meliaceae"` |
| `genero` | `string` | Género taxonómico | `"Swietenia"` |

##### Campos Opcionales - Información Ecológica y Morfológica

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `origen_geografico` | `string` | Región o país de origen de la especie | `"América Central y del Sur"` |
| `habitat_descripcion` | `string` | Descripción del hábitat natural | `"Bosques tropicales húmedos de tierras bajas"` |
| `descripcion_morfologica` | `string` | Descripción física de la planta | `"Árbol de gran tamaño hasta 40m de altura"` |

##### Campos Opcionales - Usos y Advertencias

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `usos_industriales` | `string` | Usos en industria y manufactura | `"Madera de alta calidad para mueblería"` |
| `usos_medicinales` | `string` | Usos medicinales tradicionales o documentados | `"Corteza usada para tratar fiebres"` |
| `usos_ornamentales` | `string` | Uso en jardinería y paisajismo | `"Árbol ornamental en parques y avenidas"` |
| `advertencia_toxicidad` | `string` | Advertencias sobre toxicidad o peligros | `"No tóxico"` |
| `notas_manejo_recoleccion` | `string` | Notas sobre manejo y recolección | `"Recolectar semillas maduras directamente del árbol"` |

#### Ejemplo de Request - Completo

```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Caoba, Aguano, Araputanga",
  "imagen_url": "https://ejemplo.com/imagenes/caoba-swietenia-macrophylla.jpg"
}
```

#### Ejemplo de Request - Con Todos los Campos Opcionales

```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Caoba, Aguano, Araputanga",
  "nombre_comun_principal": "Caoba",
  "imagen_url": "https://ejemplo.com/caoba.jpg",
  "reino": "Plantae",
  "division": "Magnoliophyta",
  "clase": "Magnoliopsida",
  "orden": "Sapindales",
  "familia": "Meliaceae",
  "genero": "Swietenia",
  "origen_geografico": "América Central y del Sur, desde México hasta Bolivia",
  "habitat_descripcion": "Bosques tropicales húmedos de tierras bajas, hasta 1400 msnm. Prefiere suelos profundos y bien drenados.",
  "descripcion_morfologica": "Árbol de gran tamaño que puede alcanzar hasta 40m de altura y 2m de diámetro. Corteza gruesa de color gris parduzco. Hojas compuestas pinnadas alternas.",
  "usos_industriales": "Madera de alta calidad para mueblería fina, ebanistería, construcción de embarcaciones y instrumentos musicales",
  "usos_medicinales": "La corteza se utiliza tradicionalmente para tratar fiebres, malaria y problemas gastrointestinales",
  "usos_ornamentales": "Árbol ornamental en parques y avenidas por su copa amplia y follaje verde brillante",
  "advertencia_toxicidad": "No presenta toxicidad conocida",
  "notas_manejo_recoleccion": "Recolectar semillas maduras directamente del árbol o del suelo. Las semillas pierden viabilidad rápidamente (2-3 meses). Almacenar en lugar fresco y seco."
}
```

#### Ejemplo de Request - Solo Campos Básicos

```json
{
  "especie": "Roble",
  "nombre_cientifico": "Quercus robur",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Roble, Roble común, Carballo"
}
```

#### Respuesta Exitosa - `201 Created`

```json
{
  "success": true,
  "message": "Planta creada exitosamente",
  "data": {
    "id": 1,
    "especie": "Caoba",
    "nombre_cientifico": "Swietenia macrophylla",
    "variedad": "Común",
    "tipo_planta": "Árbol",
    "tipo_planta_otro": null,
    "fuente": "SEMILLA",
    "nombre_comun_principal": "Caoba",
    "nombres_comunes": "Caoba, Aguano, Araputanga",
    "reino": "Plantae",
    "division": "Magnoliophyta",
    "clase": "Magnoliopsida",
    "orden": "Sapindales",
    "familia": "Meliaceae",
    "genero": "Swietenia",
    "origen_geografico": "América Central y del Sur",
    "habitat_descripcion": "Bosques tropicales húmedos de tierras bajas hasta 1400 msnm",
    "descripcion_morfologica": "Árbol de gran tamaño que puede alcanzar hasta 40m de altura...",
    "usos_industriales": "Madera de alta calidad para mueblería fina...",
    "usos_medicinales": "La corteza se utiliza tradicionalmente para tratar fiebres...",
    "usos_ornamentales": "Árbol ornamental en parques y avenidas...",
    "advertencia_toxicidad": "No presenta toxicidad conocida",
    "notas_manejo_recoleccion": "Recolectar semillas maduras directamente del árbol...",
    "imagen_url": "https://ejemplo.com/imagenes/caoba-swietenia-macrophylla.jpg",
    "created_at": "2026-01-15T10:30:00.000Z"
  }
}
```

#### Posibles Errores

##### 1. Campo obligatorio faltante - `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": [
    "especie should not be empty",
    "nombre_cientifico should not be empty",
    "nombres_comunes should not be empty"
  ],
  "error": "Bad Request"
}
```

##### 2. Tipo de fuente inválido - `400 Bad Request`
```json
{
  "statusCode": 400,
  "message": [
    "fuente must be one of the following values: SEMILLA, ESQUEJE"
  ],
  "error": "Bad Request"
}
```

##### 3. Planta duplicada - `409 Conflict`
```json
{
  "statusCode": 409,
  "message": "Ya existe una planta con nombre científico \"Swietenia macrophylla\"",
  "error": "Conflict"
}
```

##### 4. Error interno del servidor - `500 Internal Server Error`
```json
{
  "statusCode": 500,
  "message": "Error al crear planta",
  "error": "Internal Server Error"
}
```
```json
{
  "statusCode": 500,
  "message": "Error al crear planta",
  "error": "Internal Server Error"
}
```

---

### 2. 📋 Listar Todas las Plantas

Obtiene el listado completo de plantas registradas, con opción de búsqueda.

**Endpoint:** `GET /api/plantas`

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` | `string` | ❌ No | Término de búsqueda (busca en especie y nombre_cientifico) |

#### Ejemplos de Request

**Sin búsqueda:**
```
GET http://localhost:3000/api/plantas
```

**Con búsqueda:**
```
GET http://localhost:3000/api/plantas?q=caoba
```

#### Respuesta Exitosa - `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "especie": "Caoba",
      "nombre_cientifico": "Swietenia macrophylla",
      "variedad": "Común",
      "tipo_planta": "Árbol",
      "tipo_planta_otro": null,
      "fuente": "SEMILLA",
      "nombre_comun_principal": "Caoba",
      "nombres_comunes": "Caoba, Aguano, Araputanga",
      "reino": "Plantae",
      "division": "Magnoliophyta",
      "clase": "Magnoliopsida",
      "orden": "Sapindales",
      "familia": "Meliaceae",
      "genero": "Swietenia",
      "origen_geografico": "América Central y del Sur",
      "habitat_descripcion": "Bosques tropicales húmedos",
      "descripcion_morfologica": "Árbol de gran tamaño...",
      "usos_industriales": "Madera de alta calidad...",
      "usos_medicinales": "Corteza para fiebres...",
      "usos_ornamentales": "Árbol ornamental...",
      "advertencia_toxicidad": "No tóxico",
      "notas_manejo_recoleccion": "Recolectar semillas maduras",
      "imagen_url": "https://ejemplo.com/caoba.jpg",
      "created_at": "2026-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### 3. 🔍 Buscar Plantas

Endpoint alternativo para búsqueda de plantas (funcionalmente idéntico a GET /plantas?q=).

**Endpoint:** `GET /api/plantas/search`

#### Query Parameters

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` | `string` | ✅ Sí | Término de búsqueda |

#### Ejemplo de Request

```
GET http://localhost:3000/api/plantas/search?q=caoba
```

#### Respuesta

Misma estructura que el endpoint de listar plantas.

---

## 🧪 Pruebas en Postman

### Configuración Inicial

1. **Crear una nueva colección:** "Reforesta - Plantas"
2. **Establecer variable de entorno:**
   - Variable: `base_url`
   - Valor: `http://localhost:3000/api`

### Caso de Prueba 1: Crear Planta con Campos Básicos

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Headers:**
   - `Content-Type: application/json`
4. **Body (raw JSON):**
```json
{
  "especie": "Caoba",
  "nombre_cientifico": "Swietenia macrophylla",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Caoba, Aguano, Araputanga",
  "imagen_url": "https://ejemplo.com/caoba.jpg"
}
```
5. **Resultado esperado:** Status `201`, planta creada con ID

### Caso de Prueba 2: Crear Planta con Información Completa

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Body (raw JSON):**
```json
{
  "especie": "Roble",
  "nombre_cientifico": "Quercus robur",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Roble, Roble común, Carballo",
  "familia": "Fagaceae",
  "genero": "Quercus",
  "origen_geografico": "Europa",
  "habitat_descripcion": "Bosques templados y mixtos",
  "descripcion_morfologica": "Árbol caducifolio de hasta 40m",
  "usos_industriales": "Madera para construcción y tonelería",
  "usos_medicinales": "Corteza astringente",
  "imagen_url": "https://ejemplo.com/roble.jpg"
}
```
4. **Resultado esperado:** Status `201`, planta creada con todos los campos

### Caso de Prueba 3: Crear Planta Mínima

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Body (raw JSON):**
```json
{
  "especie": "Pino",
  "nombre_cientifico": "Pinus sylvestris",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Pino silvestre, Pino albar"
}
```
4. **Resultado esperado:** Status `201`, planta creada solo con campos obligatorios

### Caso de Prueba 3: Crear Planta Mínima

1. **Método:** `POST`
2. **URL:** `{{base_url}}/plantas`
3. **Body (raw JSON):**
```json
{
  "especie": "Pino",
  "nombre_cientifico": "Pinus sylvestris",
  "tipo_planta": "Árbol",
  "fuente": "SEMILLA",
  "nombres_comunes": "Pino silvestre, Pino albar"
}
```
4. **Resultado esperado:** Status `201`, planta creada solo con campos obligatorios

### Caso de Prueba 4: Validar Duplicados

1. Crear una planta con nombre científico "Quercus robur"
2. Intentar crear otra planta con el mismo nombre científico
3. **Resultado esperado:** Status `409 Conflict`

### Caso de Prueba 5: Validar Campos Obligatorios

1. **Body incompleto:**
```json
{
  "especie": "Planta incompleta",
  "fuente": "SEMILLA"
}
```
2. **Resultado esperado:** Status `400`, error de validación (falta nombre_cientifico, tipo_planta, nombres_comunes)

### Caso de Prueba 5: Validar Campos Obligatorios

1. **Body incompleto:**
```json
{
  "especie": "Planta incompleta",
  "fuente": "SEMILLA"
}
```
2. **Resultado esperado:** Status `400`, error de validación (falta nombre_cientifico, tipo_planta, nombres_comunes)

### Caso de Prueba 6: Listar y Buscar

1. **GET** `{{base_url}}/plantas` → Obtener todas
2. **GET** `{{base_url}}/plantas?q=caoba` → Buscar por término
3. **GET** `{{base_url}}/plantas/search?q=caoba` → Búsqueda alternativa

---

## 🔒 Validaciones y Reglas de Negocio

### Validaciones a Nivel de Base de Datos

1. **Unicidad:**
   - El `nombre_cientifico` debe ser único (case-insensitive)

2. **Campos obligatorios en BD:**
   - `especie`, `nombre_cientifico`, `variedad`, `fuente`

### Validaciones a Nivel de Aplicación

1. **Campos obligatorios en API:**
   - `especie`, `nombre_cientifico`, `tipo_planta`, `nombres_comunes`

2. **Enumeración fuente:**
   - Solo acepta: `SEMILLA` o `ESQUEJE`

3. **Prevención de duplicados:**
   - Consulta previa antes de inserción por `nombre_cientifico`

4. **Valor por defecto:**
   - `variedad`: Se guarda como "Común" automáticamente

---

## 📝 Notas Importantes

1. **Campos obligatorios vs opcionales:**
   - **Obligatorios:** `especie`, `nombre_cientifico`, `tipo_planta`, `nombres_comunes`
   - **Opcionales:** Todos los demás campos pueden omitirse o enviarse según disponibilidad
   - El frontend puede enviar información parcial y completarla después

2. **Formato de nombres comunes:**
   - Debe ser una lista separada por comas
   - Ejemplo: `"Caoba, Aguano, Araputanga"`
   - Incluir el nombre más usado primero

3. **Tipos de planta sugeridos:**
   - Árbol, Arbusto, Hierba, Palmera, Helecho, Cactus, Suculenta, Trepadora, Enredadera

4. **Información taxonómica:**
   - Todos los campos de taxonomía son opcionales
   - Útiles para búsquedas y clasificaciones científicas
   - Campos: `reino`, `division`, `clase`, `orden`, `familia`, `genero`

5. **Descripciones y usos:**
   - Campos de texto libre para información detallada
   - Pueden contener descripciones largas y específicas
   - Útiles para educación y consulta

6. **URLs de imágenes:**
   - Se recomienda usar servicios de almacenamiento como Supabase Storage o Pinata/IPFS
   - Validar que las URLs sean accesibles públicamente
   - Opcional pero recomendado incluir imagen

7. **Nomenclatura científica:**
   - Seguir nomenclatura binomial: `Género especie`
   - Ejemplo correcto: `Swietenia macrophylla`
   - Primera letra del género en mayúscula

8. **Variedad automática:**
   - El campo `variedad` se guarda automáticamente como "Común"
   - No es necesario enviarlo desde el frontend

4. **Material de origen:**
   - `SEMILLA`: Para propagación sexual
   - `ESQUEJE`: Para propagación vegetativa/asexual

---

## 🐛 Solución de Problemas Comunes

### Error: "Cannot POST /plantas"
**Solución:** Verificar que la URL incluya `/api` → `http://localhost:3000/api/plantas`

### Error: "fuente must be one of the following values"
**Solución:** Usar valores en MAYÚSCULAS: `SEMILLA` o `ESQUEJE`

### Error: "Ya existe una planta..."
**Solución:** El nombre científico ya existe en la base de datos. Verificar si es un duplicado real o si necesitas usar un nombre científico diferente.

### Error: Connection refused
**Solución:** Verificar que el servidor esté corriendo con `npm run start:dev`

### Error: "nombres_comunes should not be empty"
**Solución:** El campo nombres_comunes es obligatorio. Agregar al menos un nombre común.

---

## 📊 Estructura de Respuestas

Todas las respuestas siguen un formato consistente:

**Éxito:**
```json
{
  "success": true,
  "message": "Mensaje descriptivo",
  "data": { ... }
}
```

**Error:**
```json
{
  "statusCode": 400,
  "message": "Descripción del error o array de errores",
  "error": "Tipo de error"
}
```

---

## 🔄 Próximas Funcionalidades

- [ ] Actualizar planta existente (PUT /plantas/:id)
- [ ] Eliminar planta (DELETE /plantas/:id)
- [ ] Obtener planta por ID (GET /plantas/:id)
- [ ] Paginación para listado de plantas
- [ ] Filtros avanzados (por familia, género, tipo, etc.)
- [ ] Carga masiva de plantas desde CSV/JSON
- [ ] Búsqueda avanzada con múltiples criterios
