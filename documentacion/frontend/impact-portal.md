# Impact Portal — contrato frontend

Base URL: `/api/v1/impact`

Esta API es pública, de solo lectura y usa la información operativa existente.
No requiere `x-auth-id` y no crea una fuente de datos paralela.

## Flujo del MVP

```text
Seleccionar organización
        ↓
Consultar dashboard
        ↓
Ver campañas, progreso, mapa y evidencias
        ↓
Abrir el detalle de una campaña
```

## 1. Selector de organizaciones

```http
GET /api/v1/impact/organizations
```

Devuelve organizaciones activas, aunque todavía no tengan campañas o
plantaciones. `description` permanece en `null` porque ese atributo aún no
existe en la fuente de verdad.

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "name": "Empresa Verde",
      "logo": "https://...",
      "description": null
    }
  ]
}
```

## 2. Dashboard por organización

```http
GET /api/v1/impact/organizations/:organizationId/dashboard
```

Es la consulta principal. Incluye:

- resumen agregado;
- todas las campañas asociadas no eliminadas, sin filtrar por estado;
- subcampañas no eliminadas;
- puntos GPS de los registros de plantación;
- polígonos GeoJSON de las subcampañas;
- vista previa de evidencias fotográficas.

Estructura resumida:

```ts
interface ImpactDashboard {
  organization: ImpactOrganization;
  attribution: {
    label: 'Impacto asociado';
    method: 'CAMPAIGN_ASSOCIATION';
    quantified: false;
    note: string;
  };
  summary: ImpactMetrics & {
    campaignsCount: number;
    subcampaignsCount: number;
    locationsCount: number;
    plantingRecordsCount: number;
    evidenceCount: number;
    lastActivityAt: string | null;
  };
  campaigns: ImpactCampaignCard[];
  map: {
    plantingPoints: ImpactPlantingPoint[];
    areas: ImpactArea[];
  };
  evidencePreview: ImpactEvidence[];
  generatedAt: string;
}
```

### Métricas

```ts
interface ImpactMetrics {
  treesTarget: number;
  treesPlantedInitial: number;
  treesReplanted: number;
  treesAliveReported: number;
  progressPct: number | null;
  survivalPct: number | null;
  hectares: number;
}
```

Reglas importantes:

- `progressPct = treesPlantedInitial / treesTarget`.
- Las reposiciones no inflan el avance de la meta.
- `survivalPct = treesAliveReported / (treesPlantedInitial + treesReplanted)`.
- Si no existe denominador, el porcentaje es `null`; el frontend debe mostrar
  “Sin datos” y no `0 %`.
- Los porcentajes están acotados entre 0 y 100.

### Mapa

```ts
interface ImpactPlantingPoint {
  id: number;
  campaignId: number;
  subcampaignId: number;
  latitude: number;
  longitude: number;
  plantedAt: string;
  treesPlanted: number;
  replacement: boolean;
  withinArea: boolean;
  distanceToAreaMeters: number | null;
  evidenceCount: number;
}

interface ImpactArea {
  campaignId: number;
  subcampaignId: number;
  name: string;
  locationName: string | null;
  hectares: number;
  polygon: GeoJSON.Polygon | null;
}
```

Para GeoJSON el orden de cada coordenada es `[longitud, latitud]`. En los
puntos individuales se usan propiedades separadas `latitude` y `longitude`.

## 3. Detalle de campaña

```http
GET /api/v1/impact/organizations/:organizationId/campaigns/:campaignId
```

Solo responde si la campaña pertenece a la organización indicada. Entrega:

- tarjeta y métricas de campaña;
- subcampañas con ubicación, polígono y progreso;
- registros de plantación con GPS y especies;
- galería completa de evidencia asociada a esas plantaciones;
- la misma estructura de mapa del dashboard, limitada a la campaña.

Las especies usan primero los nombres históricos congelados al plantar y el
catálogo actual únicamente como respaldo.

## Alcance y privacidad

La respuesta pública incluye impacto, GPS, polígonos, especies y fotografías.
No incluye:

- responsables ni integrantes de equipo;
- IDs de usuarios o autenticación;
- lotes, stock, asignaciones, despachos o datos de vivero;
- hashes, buckets, rutas o metadatos internos de archivos;
- observaciones operativas ni motivos internos de cierre;
- códigos internos de trazabilidad.

La evidencia pública se limita al tipo `REGISTRO_PLANTACION` y expone una URL
de imagen ya resuelta, nunca la estructura interna de Storage.

## Integración frontend

- Usar `GET /organizations` para el selector.
- Al elegir una organización, pedir una sola vez su `/dashboard`.
- Dibujar `map.areas` como polígonos y `map.plantingPoints` como marcadores.
- Usar `campaignId` y `subcampaignId` para filtros locales del mapa.
- Abrir el endpoint de detalle solamente cuando el usuario entra a una campaña.
- Las respuestas permiten caché pública por 60 segundos y revalidación en
  segundo plano por 5 minutos.

## Atribución

El modelo actual relaciona organizaciones con campañas, pero no reparte una
cantidad de árboles entre organizaciones. Por ello la interfaz debe decir
“impacto asociado” o “impacto de campañas asociadas”, no “árboles financiados
exclusivamente”.
