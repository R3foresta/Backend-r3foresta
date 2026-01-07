# 📋 ENDPOINT BACKEND - LISTAR RECOLECCIONES DEL USUARIO

## 🔗 URL del Endpoint
```
GET http://localhost:3000/api/recolecciones
```

## 🔐 Autenticación
El backend extrae automáticamente el `usuario_id` del token JWT. **NO envíes `usuario_id` como parámetro**.

---

## ⚙️ Query Parameters (Todos Opcionales)

| Parámetro | Tipo | Descripción | Ejemplo |
|-----------|------|-------------|---------|
| `page` | number | Página actual (default: 1) | `?page=2` |
| `limit` | number | Registros por página (default: 10, max: 50) | `?limit=20` |
| `fecha_inicio` | string | Filtrar desde fecha (YYYY-MM-DD) | `?fecha_inicio=2025-01-01` |
| `fecha_fin` | string | Filtrar hasta fecha (YYYY-MM-DD) | `?fecha_fin=2025-12-31` |
| `estado` | string | ALMACENADO \| EN_PROCESO \| UTILIZADO \| DESCARTADO | `?estado=ALMACENADO` |
| `tipo_material` | string | SEMILLA \| ESTACA \| PLANTULA \| INJERTO | `?tipo_material=SEMILLA` |
| `vivero_id` | number | ID del vivero | `?vivero_id=1` |
| `search` | string | Buscar en nombre científico/comercial | `?search=Mara` |

### Ejemplos de URLs:

```bash
# Listar todas (página 1, 10 registros)
GET http://localhost:3000/api/recolecciones

# Página 2 con 20 registros
GET http://localhost:3000/api/recolecciones?page=2&limit=20

# Filtrar por estado ALMACENADO
GET http://localhost:3000/api/recolecciones?estado=ALMACENADO

# Filtrar por rango de fechas
GET http://localhost:3000/api/recolecciones?fecha_inicio=2025-01-01&fecha_fin=2025-12-31

# Buscar por nombre de planta
GET http://localhost:3000/api/recolecciones?search=Mara

# Combinar filtros
GET http://localhost:3000/api/recolecciones?estado=ALMACENADO&tipo_material=SEMILLA&page=1&limit=20
```

---

## 📦 Estructura de Respuesta

### ✅ Respuesta Exitosa (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "fecha": "2025-12-21",
      "cantidad": 10,
      "unidad": "kg",
      "tipo_material": "SEMILLA",
      "estado": "ALMACENADO",
      "especie_nueva": false,
      "nombre_cientifico": "Swietenia macrophylla",
      "nombre_comercial": "Caoba",
      "observaciones": "Recolección en buen estado",
      
      "planta": {
        "id": 1,
        "especie": "Mara",
        "nombre_cientifico": "Swietenia macrophylla",
        "variedad": "Común",
        "fuente": "NATIVA"
      },
      
      "ubicacion": {
        "id": 1,
        "pais": "Bolivia",
        "departamento": "La Paz",
        "provincia": "Murillo",
        "comunidad": "San Pedro",
        "zona": "Norte",
        "latitud": -16.5,
        "longitud": -68.15
      },
      
      "metodo": {
        "id": 1,
        "nombre": "Manual",
        "descripcion": "Recolección manual directa del árbol"
      },
      
      "vivero": {
        "id": 1,
        "codigo": "VIV-001",
        "nombre": "Vivero Central La Paz",
        "ubicacion": {
          "departamento": "La Paz",
          "comunidad": "Sopocachi"
        }
      },
      
      "usuario": {
        "id": 9,
        "nombre": "Juan Pérez",
        "username": "juanperez"
      },
      
      "fotos": [
        {
          "id": 1,
          "recoleccion_id": 1,
          "url": "https://storage.supabase.co/bucket/foto.jpg",
          "peso_bytes": 524288,
          "formato": "JPG",
          "created_at": "2025-12-21T10:30:00.000Z"
        },
        {
          "id": 2,
          "recoleccion_id": 1,
          "url": "https://storage.supabase.co/bucket/foto2.jpg",
          "peso_bytes": 612352,
          "formato": "PNG",
          "created_at": "2025-12-21T10:30:00.000Z"
        }
      ],
      
      "created_at": "2025-12-21T10:30:00.000Z",
      "updated_at": "2025-12-21T10:30:00.000Z"
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

### ❌ Respuestas de Error

#### 401 Unauthorized - Token inválido o expirado
```json
{
  "success": false,
  "message": "Token no válido o expirado",
  "statusCode": 401
}
```

#### 404 Not Found - Usuario no encontrado
```json
{
  "success": false,
  "message": "Usuario con auth_id xxx no encontrado",
  "statusCode": 404
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Error al obtener recolecciones",
  "statusCode": 500
}
```

---

## 📌 Casos Especiales

### Usuario sin recolecciones
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

### Recolección sin fotos
```json
{
  "id": 1,
  "fotos": [],
  // ... otros campos
}
```

### Recolección sin vivero
```json
{
  "id": 1,
  "vivero": null,
  // ... otros campos
}
```

---

## 🎨 Código Frontend (React/TypeScript)

### 1. Tipos TypeScript

```typescript
interface Recoleccion {
  id: number;
  fecha: string;
  cantidad: number;
  unidad: string;
  tipo_material: 'SEMILLA' | 'ESTACA' | 'PLANTULA' | 'INJERTO';
  estado: 'ALMACENADO' | 'EN_PROCESO' | 'UTILIZADO' | 'DESCARTADO';
  especie_nueva: boolean;
  nombre_cientifico?: string;
  nombre_comercial?: string;
  observaciones?: string;
  planta?: {
    id: number;
    especie: string;
    nombre_cientifico: string;
    variedad: string;
    fuente: string;
  };
  ubicacion: {
    id: number;
    pais: string;
    departamento: string;
    provincia: string;
    comunidad: string;
    zona?: string;
    latitud: number;
    longitud: number;
  };
  metodo: {
    id: number;
    nombre: string;
    descripcion: string;
  };
  vivero?: {
    id: number;
    codigo: string;
    nombre: string;
    ubicacion: {
      departamento: string;
      comunidad: string;
    };
  };
  usuario: {
    id: number;
    nombre: string;
    username: string;
  };
  fotos: Array<{
    id: number;
    recoleccion_id: number;
    url: string;
    formato: string;
    peso_bytes: number;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface PaginacionResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface RecoleccionesResponse {
  success: boolean;
  data: Recoleccion[];
  pagination: PaginacionResponse;
}
```

### 2. Servicio API

```typescript
const API_URL = 'http://localhost:3000/api';

export const recoleccionesAPI = {
  /**
   * Listar recolecciones del usuario autenticado
   */
  listar: async (params?: {
    page?: number;
    limit?: number;
    fecha_inicio?: string;
    fecha_fin?: string;
    estado?: string;
    tipo_material?: string;
    vivero_id?: number;
    search?: string;
  }): Promise<RecoleccionesResponse> => {
    const queryParams = new URLSearchParams();
    
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.fecha_inicio) queryParams.append('fecha_inicio', params.fecha_inicio);
    if (params?.fecha_fin) queryParams.append('fecha_fin', params.fecha_fin);
    if (params?.estado) queryParams.append('estado', params.estado);
    if (params?.tipo_material) queryParams.append('tipo_material', params.tipo_material);
    if (params?.vivero_id) queryParams.append('vivero_id', params.vivero_id.toString());
    if (params?.search) queryParams.append('search', params.search);
    
    const url = `${API_URL}/recolecciones${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Error ${response.status}`);
    }
    
    return response.json();
  },
};
```

### 3. Componente React

```tsx
import { useState, useEffect } from 'react';

export default function ListaRecolecciones() {
  const [recolecciones, setRecolecciones] = useState<Recoleccion[]>([]);
  const [pagination, setPagination] = useState<PaginacionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [search, setSearch] = useState('');

  const cargarRecolecciones = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await recoleccionesAPI.listar({
        page,
        limit: 10,
        estado: estado || undefined,
        search: search || undefined,
      });
      
      setRecolecciones(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar recolecciones');
      console.error('Error cargando recolecciones:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarRecolecciones();
  }, [page, estado, search]);

  return (
    <div className="container">
      <h1>Mis Recolecciones</h1>
      
      {/* Filtros */}
      <div className="filtros">
        <input
          type="text"
          placeholder="Buscar por nombre de planta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="ALMACENADO">Almacenado</option>
          <option value="EN_PROCESO">En Proceso</option>
          <option value="UTILIZADO">Utilizado</option>
          <option value="DESCARTADO">Descartado</option>
        </select>
      </div>
      
      {/* Loading */}
      {loading && <p>Cargando recolecciones...</p>}
      
      {/* Error */}
      {error && (
        <div className="error">
          <p>❌ {error}</p>
        </div>
      )}
      
      {/* Lista vacía */}
      {!loading && !error && recolecciones.length === 0 && (
        <p>No tienes recolecciones registradas</p>
      )}
      
      {/* Lista de recolecciones */}
      <div className="recolecciones-grid">
        {recolecciones.map((rec) => (
          <div key={rec.id} className="recoleccion-card">
            {/* Foto principal */}
            {rec.fotos.length > 0 ? (
              <img 
                src={rec.fotos[0].url} 
                alt={rec.planta?.especie || rec.nombre_cientifico}
                className="recoleccion-imagen"
              />
            ) : (
              <div className="sin-imagen">Sin foto</div>
            )}
            
            {/* Información */}
            <div className="recoleccion-info">
              <h3>{rec.planta?.especie || rec.nombre_cientifico}</h3>
              <p className="nombre-cientifico">
                {rec.planta?.nombre_cientifico || rec.nombre_cientifico}
              </p>
              
              <div className="detalles">
                <span className="badge">{rec.tipo_material}</span>
                <span className={`estado ${rec.estado.toLowerCase()}`}>
                  {rec.estado}
                </span>
              </div>
              
              <p>📅 {new Date(rec.fecha).toLocaleDateString('es-BO')}</p>
              <p>⚖️ {rec.cantidad} {rec.unidad}</p>
              <p>📍 {rec.ubicacion.comunidad}, {rec.ubicacion.departamento}</p>
              
              {rec.vivero && (
                <p>🏡 {rec.vivero.nombre}</p>
              )}
              
              {rec.fotos.length > 1 && (
                <p>📸 {rec.fotos.length} fotos</p>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Paginación */}
      {pagination && pagination.totalPages > 1 && (
        <div className="paginacion">
          <button 
            onClick={() => setPage(page - 1)} 
            disabled={!pagination.hasPrevPage}
          >
            ← Anterior
          </button>
          
          <span>
            Página {pagination.page} de {pagination.totalPages} 
            ({pagination.total} total)
          </span>
          
          <button 
            onClick={() => setPage(page + 1)} 
            disabled={!pagination.hasNextPage}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 🧪 Pruebas con cURL

```bash
# 1. Listar todas las recolecciones (requiere token)
curl -X GET "http://localhost:3000/api/recolecciones" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# 2. Filtrar por estado ALMACENADO
curl -X GET "http://localhost:3000/api/recolecciones?estado=ALMACENADO" \
  -H "Authorization: Bearer ..."

# 3. Paginación (página 2, 20 registros)
curl -X GET "http://localhost:3000/api/recolecciones?page=2&limit=20" \
  -H "Authorization: Bearer ..."

# 4. Buscar por nombre
curl -X GET "http://localhost:3000/api/recolecciones?search=Mara" \
  -H "Authorization: Bearer ..."

# 5. Rango de fechas
curl -X GET "http://localhost:3000/api/recolecciones?fecha_inicio=2025-01-01&fecha_fin=2025-12-31" \
  -H "Authorization: Bearer ..."
```

---

## 📝 Notas Importantes

1. ✅ **Autenticación requerida** - El endpoint requiere JWT válido en el header Authorization
2. ✅ **Filtrado automático por usuario** - Solo devuelve recolecciones del usuario autenticado
3. ✅ **NO enviar usuario_id** - El backend lo extrae del token automáticamente
4. ✅ **Fotos puede ser array vacío** - Siempre verifica `fotos.length > 0` antes de renderizar
5. ✅ **Vivero puede ser null** - Verifica `rec.vivero` antes de acceder a propiedades
6. ✅ **Ordenamiento** - Recolecciones ordenadas por fecha descendente (más recientes primero)
7. ✅ **Límite máximo** - El parámetro `limit` tiene un máximo de 50 registros por página
8. ✅ **Planta puede ser null** - Si `especie_nueva = true`, usa `nombre_cientifico` en lugar de `planta.especie`

---

## ✅ Checklist de Implementación Frontend

- [ ] Crear tipos TypeScript para `Recoleccion` y `PaginacionResponse`
- [ ] Implementar servicio API `recoleccionesAPI.listar()`
- [ ] Crear componente de lista con estado (useState)
- [ ] Implementar filtros (estado, search, fechas)
- [ ] Implementar paginación (prev/next buttons)
- [ ] Mostrar fotos de recolecciones
- [ ] Manejar estados vacíos (sin recolecciones)
- [ ] Manejar errores (401, 404, 500)
- [ ] Agregar loading state
- [ ] Estilos CSS para cards y grid
- [ ] Probar con datos reales

---

**Implementado:** 21 de diciembre de 2025  
**Backend:** NestJS + Supabase  
**Estado:** ✅ Funcional y listo para usar
