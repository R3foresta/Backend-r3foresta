import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text = { type: 'string', minLength: 1 } as const;
const nullableText = { ...text, nullable: true };
const id = { type: 'integer', minimum: 1 } as const;
const quantity = { type: 'number', minimum: 0 } as const;
const nullableQuantity = { ...quantity, nullable: true };
const timestamp = { type: 'string', format: 'date-time' } as const;
const date = { type: 'string', format: 'date' } as const;
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const envelope = (data: SchemaObject) =>
  object({ success: { type: 'boolean', enum: [true] }, data });
const unit: SchemaObject = { type: 'string', enum: ['G', 'UNIDAD'] };
export const seedCollectionProperties: Record<string, SchemaObject> = {
  id,
  codigo_trazabilidad: text,
  tipo_material: { type: 'string', enum: ['SEMILLA'] },
  fecha: date,
  cantidad_inicial_canonica: quantity,
  unidad_canonica: unit,
  saldo_actual: nullableQuantity,
  estado_registro: {
    type: 'string',
    enum: ['BORRADOR', 'PENDIENTE_VALIDACION', 'VALIDADO', 'RECHAZADO'],
  },
  planta: object({
    id,
    nombre_comun_principal: nullableText,
    nombre_cientifico: nullableText,
  }),
  ubicacion: {
    ...object({
      id,
      nombre: nullableText,
      division: nullableText,
      pais: nullableText,
      latitud: { type: 'number', minimum: -90, maximum: 90, nullable: true },
      longitud: { type: 'number', minimum: -180, maximum: 180, nullable: true },
    }),
    nullable: true,
  },
  blockchain: {
    ...object({
      explorer_url: { ...nullableText, format: 'uri' },
      token_id: nullableText,
      transaction_hash: nullableText,
      network: nullableText,
      minted_at: { ...timestamp, nullable: true },
    }),
    nullable: true,
  },
};
export const seedOverviewSchema = envelope(
  object({
    summary: object({
      collectionsCount: { type: 'integer', minimum: 0 },
      speciesCount: { type: 'integer', minimum: 0 },
      locationsCount: { type: 'integer', minimum: 0 },
      mintedCollectionsCount: { type: 'integer', minimum: 0 },
      lastCollectionAt: { ...date, nullable: true },
      totalsByUnit: array(
        object({ unit, collected: quantity, available: nullableQuantity }),
      ),
    }),
    filters: object({
      species: array(
        object({ id, commonName: nullableText, scientificName: nullableText }),
      ),
      locations: array(object({ id, name: text })),
    }),
    generatedAt: timestamp,
  }),
);
export const seedPageSchema = envelope(
  object({
    items: array(object(seedCollectionProperties)),
    page: id,
    pageSize: { ...id, maximum: 100 },
    total: { type: 'integer', minimum: 0 },
    totalPages: { type: 'integer', minimum: 0 },
  }),
);
export const seedDetailSchema = envelope(
  object({
    ...seedCollectionProperties,
    metodo: nullableText,
    observaciones_publicas: nullableText,
    fotos: array(
      object({
        id,
        url: {
          type: 'string',
          pattern:
            '^/api/v1/impact/seed-bank/collections/[1-9][0-9]*/photos/[1-9][0-9]*$',
        },
        descripcion: nullableText,
      }),
    ),
    generatedAt: timestamp,
  }),
);
