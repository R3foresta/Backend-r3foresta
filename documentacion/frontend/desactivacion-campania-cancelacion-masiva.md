# Guía frontend: desactivar campaña y cancelar subcampañas

Esta guía concentra el contrato y el flujo de interfaz necesarios para usar la
desactivación atómica de una campaña. El detalle general del módulo permanece
en [modulos/campanias.md](./modulos/campanias.md).

## Qué resuelve

Un `ADMIN` puede desactivar una campaña completa sin cancelar manualmente cada
subcampaña. La operación:

1. previsualiza elegibilidad y efectos;
2. cancela las subcampañas `BORRADOR` o `ACTIVA` sin plantaciones;
3. devuelve al vivero el saldo disponible de sus asignaciones activas;
4. aplica soft-delete a la campaña;
5. ejecuta todo en una transacción por campaña.

No elimina físicamente campañas ni subcampañas. Si una validación o devolución
falla, no queda ningún cambio parcial.

## Requisitos de acceso

- Header obligatorio: `x-auth-id: <supabase_auth_id>`.
- Rol requerido en ambos endpoints: `ADMIN`.
- No enviar `usuario_id`, `deleted_by` ni rol en el body. Backend resuelve al
  actor desde `x-auth-id`.

## Endpoints

### 1. Previsualización

```http
GET /api/campanias/:id/desactivacion/preview
x-auth-id: <auth-id-admin>
```

La previsualización es informativa: no bloquea ni reserva datos. Siempre se
debe volver a validar mediante el endpoint de ejecución.

```ts
type CodigoBloqueoDesactivacion =
  | 'SUBCAMPANIA_CON_PLANTACIONES'
  | 'ESTADO_NO_ELEGIBLE';

interface BloqueoDesactivacionCampania {
  subcampania_id: number;
  estado: string;
  total_plantado_inicial: number;
  codigo: CodigoBloqueoDesactivacion;
  mensaje: string;
}

interface PreviewDesactivacionCampania {
  campania_id: number;
  elegible: boolean;
  subcampanias_vivas: number;
  subcampanias_a_cancelar: number;
  borradores: number;
  activas_sin_plantar: number;
  ya_canceladas: number;
  asignaciones_con_saldo: number;
  unidades_a_devolver: number;
  bloqueos: BloqueoDesactivacionCampania[];
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}
```

Una campaña no elegible responde `200`, no `422`:

```json
{
  "success": true,
  "data": {
    "campania_id": 15,
    "elegible": false,
    "subcampanias_vivas": 2,
    "subcampanias_a_cancelar": 1,
    "borradores": 1,
    "activas_sin_plantar": 0,
    "ya_canceladas": 0,
    "asignaciones_con_saldo": 0,
    "unidades_a_devolver": 0,
    "bloqueos": [
      {
        "subcampania_id": 27,
        "estado": "COMPLETADA",
        "total_plantado_inicial": 80,
        "codigo": "SUBCAMPANIA_CON_PLANTACIONES",
        "mensaje": "La subcampaña tiene plantaciones iniciales y no puede cancelarse."
      },
      {
        "subcampania_id": 27,
        "estado": "COMPLETADA",
        "total_plantado_inicial": 80,
        "codigo": "ESTADO_NO_ELEGIBLE",
        "mensaje": "El estado COMPLETADA no permite cancelación masiva."
      }
    ]
  }
}
```

Una misma subcampaña puede tener más de un bloqueo. La UI debe renderizar la
lista recibida, sin deducir un único error por subcampaña.

### 2. Confirmación y ejecución

```http
POST /api/campanias/:id/desactivar
Content-Type: application/json
x-auth-id: <auth-id-admin>
```

```json
{
  "motivo": "Limpieza de campañas creadas por pruebas automatizadas"
}
```

Reglas de `motivo`:

- obligatorio;
- string;
- `trim` no vacío;
- entre 3 y 1000 caracteres después de normalizar.

```ts
interface ResultadoDesactivacionCampania {
  message: string;
  campania_id: number;
  deleted_at: string;
  subcampanias_canceladas: number;
  asignaciones_devueltas: number;
  unidades_devueltas: number;
}
```

Respuesta `200`:

```json
{
  "success": true,
  "data": {
    "message": "Campaña desactivada correctamente.",
    "campania_id": 15,
    "deleted_at": "2026-07-23T18:00:00.000Z",
    "subcampanias_canceladas": 20,
    "asignaciones_devueltas": 3,
    "unidades_devueltas": 450
  }
}
```

## Flujo recomendado de interfaz

1. Mostrar la acción solo a usuarios `ADMIN`.
2. Al seleccionar la acción, solicitar el preview.
3. Mostrar:
   - subcampañas que serán canceladas;
   - borradores y activas sin plantar;
   - asignaciones que serán devueltas;
   - unidades que volverán al vivero.
4. Si `elegible === false`:
   - mostrar los bloqueos agrupados por subcampaña;
   - deshabilitar la confirmación;
   - no ofrecer atajos para eliminar, inventar polígonos o cambiar estados.
5. Si `elegible === true`:
   - solicitar el motivo;
   - exigir confirmación explícita;
   - ejecutar un solo `POST` para esa campaña.
6. Durante el `POST`, bloquear doble envío y mostrar progreso.
7. Tras éxito:
   - retirar la campaña de listas activas;
   - invalidar/refrescar campañas, subcampañas, métricas, actividad y stock de
     vivero si esas vistas están montadas;
   - mostrar el resumen devuelto por backend.
8. Tras error, conservar la campaña visible y volver a consultar el preview
   antes de permitir otro intento.

El frontend no debe cancelar subcampañas en un bucle antes de llamar al
endpoint de campaña. Eso rompe la atomicidad y recrea el flujo que esta acción
reemplaza.

## Estados y elegibilidad

| Estado vivo | `total_plantado_inicial` | Resultado |
|---|---:|---|
| `BORRADOR` | `0` | Se cancelará; no necesita polígono |
| `ACTIVA` | `0` | Se cancelará |
| `CANCELADA` | `0` | Ya satisface la postcondición |
| Cualquier estado | `> 0` | Bloquea |
| `COMPLETADA` | cualquiera | Bloquea |
| `FINALIZADA_PARCIAL` | cualquiera | Bloquea |
| `PAUSADA` | cualquiera | Bloquea |

Una campaña sin subcampañas vivas es elegible y devuelve contadores en cero.
La ejecución vuelve a comprobar todas las reglas dentro de la transacción,
porque el estado puede cambiar entre preview y confirmación.

## Manejo de errores

El formato de error de NestJS es:

```ts
interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}
```

| Status | Acción recomendada |
|---:|---|
| `400` | Mostrar validación del motivo; no reintentar automáticamente |
| `401` | Solicitar autenticación o corregir `x-auth-id` |
| `403` | Ocultar la acción y mostrar falta de permisos |
| `404` | Refrescar la lista; la campaña no existe o ya fue desactivada |
| `409` | Informar conflicto, refrescar preview y permitir reintento manual |
| `422` | Refrescar preview y mostrar los bloqueos actuales |
| `500` | Mostrar error operativo; no asumir que hubo cambios parciales |

Un `422` en ejecución puede aparecer aunque el preview anterior haya sido
elegible: otra operación pudo plantar, cerrar o pausar una subcampaña. Backend
hace rollback completo.

## Varias campañas

No existe un endpoint transaccional para varias campañas. Si la UI permite
selección múltiple:

- ejecutar una campaña por vez;
- obtener preview y confirmación por campaña;
- mostrar resultado independiente;
- no usar `Promise.all` para disparar cancelaciones masivas simultáneas.

## Acciones que permanecen separadas

| Acción | Endpoint | Uso |
|---|---|---|
| Desactivar estrictamente | `DELETE /api/campanias/:id` | Solo si ya no hay subcampañas vivas no canceladas |
| Desactivar cancelando hijas | `POST /api/campanias/:id/desactivar` | Flujo nuevo, explícito y atómico |
| Cancelar una subcampaña | `POST /api/subcampanias/:id/cancelar` | Acción individual |
| Eliminar borrador | `DELETE /api/subcampanias/:id` | Contrato distinto; no sustituye cancelación |

`DELETE /api/campanias/:id` no cancela hijas automáticamente.

## Ejemplo de consumo

```ts
async function api<T>(
  path: string,
  authId: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-auth-id': authId,
      ...init?.headers,
    },
  });

  const payload = await response.json();
  if (!response.ok) throw payload as ApiError;
  return payload as T;
}

export function previewDesactivacion(campaniaId: number, authId: string) {
  return api<ApiSuccess<PreviewDesactivacionCampania>>(
    `/campanias/${campaniaId}/desactivacion/preview`,
    authId,
  );
}

export function desactivarCampania(
  campaniaId: number,
  motivo: string,
  authId: string,
) {
  return api<ApiSuccess<ResultadoDesactivacionCampania>>(
    `/campanias/${campaniaId}/desactivar`,
    authId,
    {
      method: 'POST',
      body: JSON.stringify({ motivo: motivo.trim() }),
    },
  );
}
```

No persistir el preview como autorización ni recalcular localmente los
contadores. Backend es la fuente de verdad.
