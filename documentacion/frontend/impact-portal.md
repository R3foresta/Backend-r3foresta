# Impact Portal — contrato frontend

Base URL: `/api/v1/impact`

Estado al 9 de septiembre de 2026: los cinco endpoints descritos en este
documento están implementados en la rama `impacto`.

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
  speciesMix: SpeciesMixItem[];
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

### Mezcla de especies

`speciesMix` consolida por `speciesId` las cantidades realmente plantadas en
las campañas asociadas:

```ts
interface SpeciesMixItem {
  speciesId: number;
  commonName: string | null;
  scientificName: string | null;
  taxonomyId: null;
  ecologicalCategory: null;
  origin: 'UNKNOWN';
  quantity: number;
  quantityStage: 'PLANTED';
}
```

La taxonomía, categoría ecológica y origen permanecen sin clasificar porque
esos atributos todavía no existen en la fuente operativa. No deben inferirse
en el frontend.

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

## 4. Serie histórica de monitoreo

```http
GET /api/v1/impact/organizations/:organizationId/monitoring-timeline
GET /api/v1/impact/organizations/:organizationId/monitoring-timeline?campaignId=32
```

La serie combina registros iniciales, reposiciones y eventos reales
`MORTANDAD_REPORTADA`. Está ordenada de forma ascendente por fecha y cada
punto contiene los acumulados después del evento:

```ts
interface MonitoringTimelinePoint {
  date: string;
  campaignId: number;
  monitoringRecordId: number;
  treesMonitored: number;
  treesAlive: number;
  deathsNew: number;
  deathsAccumulated: number;
  replacementsNew: number;
  replacementsAccumulated: number;
  source:
    | 'PLANTING_INITIAL'
    | 'PLANTING_REPLACEMENT'
    | 'MORTALITY_REPORT';
}
```

Estructura completa:

```ts
interface MonitoringTimelineResponse {
  success: true;
  data: {
    organization: ImpactOrganization;
    campaignId: number | null;
    points: MonitoringTimelinePoint[];
    dataAvailability: {
      plantingRecordsCount: number;
      mortalityReportsCount: number;
      hasMortalityMonitoring: boolean;
    };
    generatedAt: string;
  };
}
```

`treesMonitored` representa el total acumulado incorporado al seguimiento
(plantación inicial más reposiciones), no una afirmación de que todos esos
árboles hayan sido inspeccionados físicamente. `monitoringRecordId` identifica
el registro que originó el punto: un `registro_plantacion` para fuentes
`PLANTING_*` o un `evento_plantacion` para `MORTALITY_REPORT`; debe interpretarse
junto con `source`.

La respuesta incluye `dataAvailability.hasMortalityMonitoring`. Cuando es
`false`, los puntos de plantación siguen siendo válidos, pero el frontend no
debe presentar la serie como monitoreo de supervivencia realizado.

## 5. Galería pública paginada

```http
GET /api/v1/impact/organizations/:organizationId/evidence
```

Parámetros opcionales:

| Parámetro | Regla |
| --- | --- |
| `page` | Entero desde 1; default `1` |
| `pageSize` | Entre 1 y 100; default `24` |
| `campaignId` | Debe pertenecer a la organización |
| `speciesId` | Conserva evidencias de plantaciones con esa especie |
| `from` | Fecha ISO mínima, inclusive |
| `to` | Fecha ISO máxima, inclusive |

```ts
interface PaginatedEvidence {
  items: ImpactEvidence[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
```

La respuesta HTTP envuelve ese objeto como `{ success: true, data: ... }`.

```ts
interface ImpactEvidence {
  id: number;
  plantingRecordId: number;
  campaignId: number;
  subcampaignId: number;
  publicTraceabilityCode: string | null;
  title: string | null;
  imageUrl: string;
  takenAt: string | null;
  isPrimary: boolean;
  species: Array<{
    id: number;
    commonName: string | null;
    scientificName: string | null;
    quantity: number;
  }>;
}
```

El orden es `takenAt DESC, id DESC`. Cada evidencia incluye
`publicTraceabilityCode` y las `species` agregadas de su registro de
plantación. Los filtros `from` y `to` se aplican sobre `takenAt`, que usa la
fecha de captura y, si falta, la fecha de creación. No expone hashes ni rutas
internas de Storage.

## Alcance y privacidad

La respuesta pública incluye impacto, GPS, polígonos, especies y fotografías.
No incluye:

- responsables ni integrantes de equipo;
- IDs de usuarios o autenticación;
- lotes, stock, asignaciones, despachos o datos de vivero;
- hashes, buckets, rutas o metadatos internos de archivos;
- observaciones operativas ni motivos internos de cierre;
- códigos internos distintos del `publicTraceabilityCode` aprobado.

La evidencia pública se limita al tipo `REGISTRO_PLANTACION` y expone una URL
de imagen ya resuelta, nunca la estructura interna de Storage.

## Integración frontend

- Usar `GET /organizations` para el selector.
- Al elegir una organización, pedir una sola vez su `/dashboard`.
- Dibujar `map.areas` como polígonos y `map.plantingPoints` como marcadores.
- Usar `campaignId` y `subcampaignId` para filtros locales del mapa.
- Abrir el endpoint de detalle solamente cuando el usuario entra a una campaña.
- Usar `speciesMix` del dashboard en lugar de pedir cada campaña para crear el
  agregado general.
- Usar `/monitoring-timeline` solo como monitoreo cuando
  `hasMortalityMonitoring` sea `true`.
- Usar `/evidence` para la galería completa y conservar `evidencePreview` para
  la portada.
- Las respuestas permiten caché pública por 60 segundos y revalidación en
  segundo plano por 5 minutos.

## Datos todavía no publicables

La API no devuelve estados de validación GPS/fotográfica, verificación de
integridad, anclaje blockchain, clasificación ecológica ni CO₂. Aunque existen
algunos campos operativos relacionados, todavía no hay una regla pública ni
datos suficientes para afirmar esos estados.

## Atribución

El modelo actual relaciona organizaciones con campañas, pero no reparte una
cantidad de árboles entre organizaciones. Por ello la interfaz debe decir
“impacto asociado” o “impacto de campañas asociadas”, no “árboles financiados
exclusivamente”.
