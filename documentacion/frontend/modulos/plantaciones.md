# Módulo: Plantaciones (Registros de Plantación)

Base URL: `/api/registros-plantacion`

---

## POST /registros-plantacion/evidencias-pendientes 📎

**Rol mínimo**: GENERAL  
**Descripción**: Crea un registro de evidencias (fotos) previas a la plantación. Se suben fotos y se genera un ID para vincular después a un registro de plantación.

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `multipart/form-data` |

**Body** (`multipart/form-data`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| fotos | file[] | ✓ | max 10 archivos, max 5MB total |
| titulo | string | — | max 120 caracteres |
| descripcion | string | — | max 1000 caracteres |
| metadata | string | — | JSON serializado (opcional) |
| tomado_en | string | — | ISO date |
| es_principal | boolean | — | true si es la foto principal (default false) |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 50,
    "titulo": "Zona de plantación antes",
    "descripcion": "Fotos del terreno preparado",
    "cantidad_fotos": 5,
    "es_principal": true,
    "tomado_en": "2026-05-28T10:00:00Z",
    "created_at": "2026-05-28T10:30:00Z"
  }
}
```

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida, archivos inválidos |
| 401 | Header x-auth-id ausente |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/registros-plantacion/evidencias-pendientes \
  -H "x-auth-id: <tu-auth-id>" \
  -F "titulo=Zona de plantación antes" \
  -F "descripcion=Fotos del terreno preparado" \
  -F "es_principal=true" \
  -F "fotos=@/path/to/photo1.jpg" \
  -F "fotos=@/path/to/photo2.jpg" \
  -F "fotos=@/path/to/photo3.jpg"
```

---

## POST /registros-plantacion

**Rol mínimo**: GENERAL  
**Descripción**: Registra una plantación. Vincula un lote asignado a una subcampaña con evidencias de plantación (fotos).

**Headers**
| Header | Requerido | Descripción |
|--------|-----------|-------------|
| x-auth-id | ✓ | Supabase auth_id del usuario |
| Content-Type | ✓ | `application/json` |

**Body** (`application/json`)
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| subcampania_id | number | ✓ | ID de subcampaña activa |
| es_reposicion | boolean | — | true si es replantación; default false |
| registro_plantacion_origen_id | number | — | Requerido si es reposición (plantación original) |
| fecha_plantacion | string | ✓ | ISO date (YYYY-MM-DD) |
| latitud | number | ✓ | Valid latitude (-90 a 90) |
| longitud | number | ✓ | Valid longitude (-180 a 180) |
| observaciones | string | — | max 2000 caracteres |
| coresponsable_ids | number[] | — | IDs de usuarios coresponsables |
| detalles | PlantacionDetalle[] | ✓ | Array de al menos 1 detalle |
| evidencia_ids | number[] | ✓ | IDs de evidencias previas |

**PlantacionDetalle**:
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|------------|
| asignacion_id | number | ✓ | ID de asignación (lote a subcampaña) |
| especie | string | ✓ | Nombre de especie |
| cantidad_plantada | number | ✓ | >= 1 |
| tolerancia_gps | number | — | Tolerancia GPS en metros |

**Respuesta exitosa** `201`
```json
{
  "success": true,
  "data": {
    "id": 1,
    "subcampania_id": 5,
    "codigo_trazabilidad": "RG-2026-001",
    "fecha_plantacion": "2026-05-28",
    "latitud": -16.2902,
    "longitud": -68.1193,
    "es_reposicion": false,
    "cantidad_total_plantada": 100,
    "estado": "REGISTRADO",
    "observaciones": "Plantación exitosa",
    "created_at": "2026-05-28T14:00:00Z",
    "updated_at": "2026-05-28T14:00:00Z"
  }
}
```

**Campos GENERATED**:
- `codigo_trazabilidad`: Generado automáticamente como `RG-YYYY-NNN`
- `estado`: "REGISTRADO"
- `cantidad_total_plantada`: Suma de cantidad_plantada en detalles

**Errores**
| Status | Cuándo |
|--------|--------|
| 400 | Validación fallida: GPS inválido, detalles vacíos, evidencias no encontradas |
| 401 | Header x-auth-id ausente |
| 404 | Subcampaña, asignación, o evidencia no encontrada |
| 422 | Subcampaña no está ACTIVA; cantidad_plantada > asignación disponible |

**Ejemplo cURL**
```bash
curl -X POST http://localhost:3000/api/registros-plantacion \
  -H "Content-Type: application/json" \
  -H "x-auth-id: <tu-auth-id>" \
  -d '{
    "subcampania_id": 5,
    "fecha_plantacion": "2026-05-28",
    "latitud": -16.2902,
    "longitud": -68.1193,
    "observaciones": "Plantación exitosa en zona preparada",
    "detalles": [
      {
        "asignacion_id": 10,
        "especie": "Aliso",
        "cantidad_plantada": 100,
        "tolerancia_gps": 25
      }
    ],
    "evidencia_ids": [50, 51]
  }'
```

---

## Tipos & Estructuras

### PlantacionDetalle
```typescript
{
  asignacion_id: number;
  especie: string;
  cantidad_plantada: number;
  tolerancia_gps?: number;
}
```

### Plantación (Registro)
```typescript
{
  id: number;
  subcampania_id: number;
  codigo_trazabilidad: string; // RG-YYYY-NNN
  fecha_plantacion: string; // ISO date
  latitud: number;
  longitud: number;
  es_reposicion: boolean;
  registro_plantacion_origen_id?: number;
  cantidad_total_plantada: number; // GENERATED
  estado: string; // REGISTRADO
  observaciones?: string;
  created_at: string;
  updated_at: string;
}
```

### Evidencia Pendiente
```typescript
{
  id: number;
  titulo?: string;
  descripcion?: string;
  cantidad_fotos: number;
  es_principal: boolean;
  tomado_en?: string;
  created_at: string;
}
```

---

## Reglas de Negocio

1. **Evidencias previas**: Requeridas para cada plantación (fotos de zona, etc.)
2. **Detalles requeridos**: Mínimo 1 detalle de plantación (especie + cantidad)
3. **Cantidad máxima**: No puede superar la cantidad asignada en cada asignación
4. **Código automático**: Generado como `RG-YYYY-NNN`
5. **Reposición**: Si `es_reposicion=true`, requiere `registro_plantacion_origen_id`
6. **GPS válido**: Latitud [-90, 90], Longitud [-180, 180]
7. **Subcampaña**: Debe estar en estado ACTIVA
8. **Coresponsables**: Usuarios adicionales implicados en la plantación

---

## Flujo Típico

1. **POST /evidencias-pendientes** → Subir fotos de preparación del terreno
2. **POST /** → Registrar plantación con:
   - Subcampaña activa
   - Ubicación GPS exacta
   - Detalles de species/cantidades
   - IDs de evidencias previas
3. **Resultado**: Registro de plantación con código de trazabilidad generado automáticamente

---

## Notas

- **Múltiples especies**: Un registro puede plantar varias especies (array detalles)
- **Tolerancia GPS**: Cada especie puede tener tolerancia distinta de GPS
- **Reposición**: Segundo registro vinculado al primero si hay replantación
- **Auditoría**: Cada registro queda asociado a usuario y fecha exacta
