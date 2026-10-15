#!/usr/bin/env node
// Contrato PA v1 consumible, generado sin .env ni conexión a servicios.
const fs = require('node:fs');
const path = require('node:path');
const ref = (name) => ({ $ref: '#/components/schemas/' + name });
const obj = (properties, optional = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
});
const array = (items, minItems, maxItems) => ({
  type: 'array',
  items,
  ...(minItems === undefined ? {} : { minItems }),
  ...(maxItems === undefined ? {} : { maxItems }),
});
const text = { type: 'string' };
const nullableText = { type: 'string', nullable: true };
const bool = { type: 'boolean' };
const permission = {
  type: 'string',
  nullable: true,
  enum: ['PLANTADOR', 'ADMINISTRADOR_SUBCAMPANIA', null],
};
const roles = {
  type: 'string',
  enum: ['ADMIN', 'GENERAL', 'VALIDADOR', 'VOLUNTARIO'],
};
const id = ref('Id'),
  revision = ref('Revision'),
  uuid = ref('ComandoId'),
  instant = { type: 'string', format: 'date-time', pattern: 'Z$' };
const scopes = array(id, 1, 100);
scopes.uniqueItems = true;
const operations = [
  'OTORGAR_PLANTADOR',
  'RETIRAR_PLANTADOR',
  'DESIGNAR_ADMINISTRADOR',
  'CAMBIAR_ADMINISTRADOR_A_PLANTADOR',
  'RETIRAR_ADMINISTRADOR',
  'REEMPLAZAR_ADMINISTRADOR',
  'CAMBIAR_ROL_GLOBAL',
  'INACTIVAR_CUENTA',
  'REGISTRAR_PLANTACION_INICIAL',
];
const pagination = {
  cursor: { type: 'string', minLength: 1, maxLength: 1024 },
  limite: { type: 'integer', minimum: 1, maximum: 20, default: 20 },
};
const change = { type: 'string', enum: ['CAMBIO_APLICADO', 'SIN_CAMBIOS'] };
const schemas = {
  Id: {
    type: 'string',
    pattern: '^[1-9][0-9]*$',
    maxLength: 19,
    description:
      'Decimal canónico positivo hasta 9223372036854775807; nunca JSON number.',
  },
  Revision: {
    type: 'string',
    pattern: '^(0|[1-9][0-9]*)$',
    maxLength: 19,
    description: 'Decimal canónico 0..9223372036854775807.',
  },
  ComandoId: {
    type: 'string',
    format: 'uuid',
    pattern:
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  },
  ErrorEstable: obj({
    codigo: text,
    mensaje: text,
    campos: array(text),
    ambitos: array(id),
    reintento: {
      type: 'string',
      enum: [
        'MISMA_CLAVE',
        'NUEVA_CONFIRMACION',
        'RECUPERAR_SESION',
        'NO_APLICA',
      ],
    },
  }),
  ErrorFueraDeRecibo: obj({
    error: ref('ErrorEstable'),
    comando_id: { ...schemasNullableId() },
    resultado_concluyente: { type: 'boolean', enum: [false] },
  }),
  PersonaMinima: obj({
    usuario_id: id,
    nombre: text,
    organizacion: nullableText,
  }),
  AmbitoRevision: obj({ subcampania_id: id, revision_esperada: revision }),
  AmbitoReemplazo: obj({
    subcampania_id: id,
    revision_saliente_esperada: revision,
    revision_reemplazo_esperada: revision,
  }),
  AccesoEntrada: obj({
    comando_id: uuid,
    usuario_destino_id: id,
    ambitos: array(ref('AmbitoRevision'), 1, 100),
  }),
  ReemplazoEntrada: obj({
    comando_id: uuid,
    usuario_saliente_id: id,
    usuario_reemplazo_id: id,
    tratamiento_saliente: { type: 'string', enum: ['PLANTADOR', 'SIN_ACCESO'] },
    ambitos: array(ref('AmbitoReemplazo'), 1, 100),
  }),
  RolesEntrada: obj({
    comando_id: uuid,
    rol_global: roles,
    revision_esperada: revision,
    motivo: {
      type: 'string',
      minLength: 3,
      maxLength: 1000,
      description: 'NFC y trim; se conservan espacios interiores.',
    },
  }),
  InactivacionEntrada: obj({
    comando_id: uuid,
    revision_esperada: revision,
    motivo: { type: 'string', minLength: 3, maxLength: 1000 },
  }),
  BuscarEntrada: {
    oneOf: ['NOMBRE', 'CORREO_EXACTO'].map((modo) =>
      obj(
        {
          modo: { type: 'string', enum: [modo] },
          consulta: {
            type: 'string',
            minLength: modo === 'NOMBRE' ? 2 : 1,
            maxLength: modo === 'NOMBRE' ? 100 : 254,
          },
          accion: {
            type: 'string',
            enum: [
              'OTORGAR_PLANTADOR',
              'DESIGNAR_ADMINISTRADOR',
              'REEMPLAZAR_ADMINISTRADOR',
            ],
          },
          subcampania_ids: scopes,
          ...pagination,
        },
        ['cursor', 'limite'],
      ),
    ),
  },
  RevisarEntrada: obj({ usuario_destino_id: id, subcampania_ids: scopes }),
  Miembro: obj({
    usuario_id: id,
    nombre: text,
    organizacion: nullableText,
    permiso_contextual: permission,
    revision_permiso: revision,
    acceso_global: bool,
    etiqueta_acceso_global: {
      type: 'string',
      nullable: true,
      enum: ['Administrador · Acceso global', null],
    },
    responsabilidad_logistica: {
      type: 'string',
      nullable: true,
      enum: ['COORDINADOR', 'OPERARIO', null],
    },
  }),
  Acciones: obj(
    Object.fromEntries(
      [
        'preparar_registro',
        'registrar_inicial',
        'incorporar_plantador',
        'retirar_plantador',
        'designar_administrador',
        'cambiar_administrador',
        'retirar_administrador',
        'reemplazar_administrador',
      ].map((key) => [key, bool]),
    ),
  ),
  CapacidadSubcampania: obj({
    campania_id: id,
    campania_nombre: text,
    subcampania_id: id,
    nombre: text,
    estado: {
      type: 'string',
      enum: [
        'BORRADOR',
        'ACTIVA',
        'COMPLETADA',
        'FINALIZADA_PARCIAL',
        'PAUSADA',
        'CANCELADA',
      ],
    },
    permiso_contextual: permission,
    revision_permiso: revision,
    fuente_autoridad: { type: 'string', enum: ['GLOBAL', 'CONTEXTUAL'] },
    acciones: ref('Acciones'),
  }),
  Capacidades: obj({
    actor: obj({ usuario_id: id, rol_global: roles }),
    capacidades_globales: obj({
      asignar_roles: bool,
      designar_administradores: bool,
      leer_plan: bool,
    }),
    subcampanias: array(ref('CapacidadSubcampania')),
  }),
  RevisionAmbito: obj({
    subcampania_id: id,
    permiso_contextual: permission,
    revision_permiso: revision,
    acceso_global: bool,
  }),
  RevisionAccesos: obj({
    usuario: ref('PersonaMinima'),
    ambitos: array(ref('RevisionAmbito'), 1, 100),
  }),
  Autoridad: obj({
    usuario_id: id,
    nombre: text,
    rol_global: roles,
    activo: bool,
    revision_autoridad: revision,
  }),
  CambioUsuario: obj({
    usuario_id: id,
    permiso_anterior: permission,
    permiso_nuevo: permission,
    revision_anterior: revision,
    revision_nueva: revision,
    cambio: change,
    conserva_acceso_global: bool,
  }),
  AccesoResultado: obj({
    tipo: { type: 'string', enum: ['ACCESO'] },
    cambios: array(
      obj({ subcampania_id: id, usuarios: array(ref('CambioUsuario'), 1, 2) }),
      1,
      100,
    ),
  }),
  RolResultado: obj({
    tipo: { type: 'string', enum: ['ROL_GLOBAL'] },
    usuario_id: id,
    rol_anterior: roles,
    rol_nuevo: roles,
    revision_anterior: revision,
    revision_nueva: revision,
    cambio: change,
  }),
  InactivacionResultado: obj({
    tipo: { type: 'string', enum: ['CUENTA_INACTIVADA'] },
    usuario_id: id,
    activo: { type: 'boolean', enum: [false] },
    revision_anterior: revision,
    revision_nueva: revision,
    cambio: change,
  }),
  PlantacionResultado: obj({
    tipo: { type: 'string', enum: ['PLANTACION_INICIAL'] },
    registro_plantacion_id: id,
    codigo_trazabilidad: text,
    subcampania_id: id,
    responsable_id: id,
    fecha_plantacion: { type: 'string', format: 'date' },
    cantidad_total_plantada: {
      type: 'integer',
      minimum: 1,
      maximum: 2147483647,
    },
    especies: array(
      obj({
        planta_id: id,
        cantidad: { type: 'integer', minimum: 1, maximum: 2147483647 },
      }),
    ),
    gps_dentro_poligono: bool,
    gps_distancia_a_poligono_m: { type: 'number', nullable: true },
    revision_inicial: revision,
  }),
};
function schemasNullableId() {
  return { type: 'string', format: 'uuid', nullable: true };
}
const receiptBase = {
  comando_id: uuid,
  operacion: { type: 'string', enum: operations },
  finalizado_en: instant,
};
schemas.Confirmado = obj({
  ...receiptBase,
  estado: { type: 'string', enum: ['CONFIRMADO'] },
  resultado: {
    oneOf: [
      'AccesoResultado',
      'RolResultado',
      'InactivacionResultado',
      'PlantacionResultado',
    ].map(ref),
  },
  error: { type: 'object', nullable: true, enum: [null] },
});
schemas.Rechazado = obj({
  ...receiptBase,
  estado: { type: 'string', enum: ['RECHAZADO'] },
  resultado: { type: 'object', nullable: true, enum: [null] },
  error: ref('ErrorEstable'),
});
schemas.SinResultado = obj({
  comando_id: uuid,
  operacion: { type: 'string', enum: ['REGISTRAR_PLANTACION_INICIAL'] },
  estado: { type: 'string', enum: ['SIN_RESULTADO'] },
  resultado: { type: 'object', nullable: true, enum: [null] },
  error: { type: 'object', nullable: true, enum: [null] },
  finalizado_en: { type: 'string', nullable: true, enum: [null] },
});
schemas.Recibo = { oneOf: [ref('Confirmado'), ref('Rechazado')] };
for (const [name, data, page] of [
  ['CapacidadesLectura', ref('Capacidades'), true],
  ['MiembrosLectura', array(ref('Miembro')), true],
  ['PersonasLectura', array(ref('PersonaMinima')), true],
  ['RevisionLectura', ref('RevisionAccesos'), false],
  ['AutoridadLectura', ref('Autoridad'), false],
])
  schemas[name] = obj({
    data,
    observado_en: instant,
    ...(page ? { siguiente_cursor: nullableText } : {}),
  });
const headers = {
  'Cache-Control': { schema: text, description: 'private, no-store' },
  Vary: { schema: text, description: 'Authorization' },
};
const response = (schema, description) => ({
  description,
  headers,
  content: { 'application/json': { schema: ref(schema) } },
});
const external = Object.fromEntries(
  [401, 403, 404, 409, 422, 503].map((code) => [
    code,
    response(
      'ErrorFueraDeRecibo',
      'Error fuera de recibo; resultado inconcluso.',
    ),
  ]),
);
const commandResponses = {
  ...external,
  200: response('Confirmado', 'Confirmado, incluyendo replay.'),
  403: response(
    'ReciboOError',
    'Capacidad insuficiente durable o cuenta inactiva fuera de recibo.',
  ),
  404: response(
    'ReciboOError',
    'Recurso no visible durable o fuera de recibo.',
  ),
  409: response(
    'ReciboOError',
    'Revisión/estado/continuidad rechazados durables o clave reutilizada fuera de recibo.',
  ),
  422: response(
    'ErrorFueraDeRecibo',
    'DTO inválido; no publica un rechazo durable.',
  ),
};
schemas.ReciboOError = { oneOf: [ref('Rechazado'), ref('ErrorFueraDeRecibo')] };
const param = (name, location, schema, required = false) => ({
  name,
  in: location,
  required,
  schema,
});
const pageParams = [
  param('cursor', 'query', pagination.cursor),
  param('limite', 'query', { ...pagination.limite, maximum: 100 }),
];
const paths = {};
function add(
  route,
  method,
  summary,
  body,
  responseSchema,
  params = [],
  commands = false,
) {
  paths[route] = {
    [method]: {
      summary,
      operationId: summary.replace(/[^a-zA-Z]/g, ''),
      security: [{ bearerAuth: [] }],
      parameters: params,
      ...(body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: ref(body) } },
            },
          }
        : {}),
      responses: commands
        ? commandResponses
        : { ...external, 200: response(responseSchema, 'Lectura privada.') },
    },
  };
}
add(
  '/api/v1/participacion/capacidades',
  'get',
  'Capacidades propias',
  null,
  'CapacidadesLectura',
  [param('campania_id', 'query', id), ...pageParams],
);
add(
  '/api/v1/subcampanias/{id}/miembros-participacion',
  'get',
  'Miembros del ambito',
  null,
  'MiembrosLectura',
  [param('id', 'path', id, true), ...pageParams],
);
add(
  '/api/v1/participacion/personas/buscar',
  'post',
  'Buscar personas',
  'BuscarEntrada',
  'PersonasLectura',
);
add(
  '/api/v1/participacion/accesos/revisar',
  'post',
  'Revisar accesos',
  'RevisarEntrada',
  'RevisionLectura',
);
for (const [suffix, operation] of [
  ['otorgar-plantador', 'OTORGAR_PLANTADOR'],
  ['retirar-plantador', 'RETIRAR_PLANTADOR'],
  ['designar-administrador', 'DESIGNAR_ADMINISTRADOR'],
  ['administrador-a-plantador', 'CAMBIAR_ADMINISTRADOR_A_PLANTADOR'],
  ['retirar-administrador', 'RETIRAR_ADMINISTRADOR'],
  ['reemplazar-administrador', 'REEMPLAZAR_ADMINISTRADOR'],
])
  add(
    '/api/v1/participacion/accesos/' + suffix,
    'post',
    operation,
    suffix === 'reemplazar-administrador'
      ? 'ReemplazoEntrada'
      : 'AccesoEntrada',
    null,
    [],
    true,
  );
add(
  '/api/v1/usuarios/{usuario_id}/roles',
  'post',
  'CAMBIAR_ROL_GLOBAL',
  'RolesEntrada',
  null,
  [param('usuario_id', 'path', id, true)],
  true,
);
add(
  '/api/v1/usuarios/{usuario_id}/inactivaciones',
  'post',
  'INACTIVAR_CUENTA',
  'InactivacionEntrada',
  null,
  [param('usuario_id', 'path', id, true)],
  true,
);
add(
  '/api/v1/usuarios/{usuario_id}/autoridad',
  'get',
  'Leer autoridad',
  null,
  'AutoridadLectura',
  [param('usuario_id', 'path', id, true)],
);
add(
  '/api/v1/participacion/comandos/{comando_id}',
  'get',
  'Recuperar comando propio',
  null,
  'Recibo',
  [
    param('comando_id', 'path', uuid, true),
    param('operacion', 'query', { type: 'string', enum: operations }, true),
  ],
);
paths['/api/v1/participacion/comandos/{comando_id}'].get.responses[202] = {
  ...response(
    'SinResultado',
    'Preparado sin resultado; repetir misma clave y consultar con backoff.',
  ),
  headers: {
    ...headers,
    'Retry-After': { schema: { type: 'string', enum: ['2'] } },
  },
};
const document = {
  openapi: '3.0.3',
  info: {
    title: 'R3Foresta Participación aliada — INT02-C',
    version: '1.0.0',
    description:
      'Contrato de 14 rutas implementadas localmente. REGISTRAR_PLANTACION_INICIAL sólo se recupera, su ejecución depende de INT03-A. IDs/revisiones BIGINT en cadenas. Unknown fields rechazados. 404 COMANDO_NO_CONFIRMADO y 503 RESULTADO_NO_DETERMINADO no son rechazos durables.',
  },
  servers: [{ url: 'http://localhost:3000' }],
  paths,
  components: {
    schemas,
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
};
const target = path.resolve(__dirname, '../../docs/pa-int02c-openapi.json');
const encoded = JSON.stringify(document, null, 2) + '\n';
const runtimeTarget = path.resolve(
  __dirname,
  '../../src/participacion/participacion-openapi.generated.ts',
);
const runtimeEncoded =
  "// Generado por scripts/qa/pa-int02c-openapi.cjs.\n/* eslint-disable prettier/prettier */\nimport type { OpenAPIObject } from '@nestjs/swagger';\nexport const participacionOpenApi = " +
  JSON.stringify(
    { paths: document.paths, components: document.components },
    null,
    2,
  ) +
  " as unknown as Pick<OpenAPIObject, 'paths' | 'components'>;\n";
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== encoded)
    throw new Error('OpenAPI no corresponde al generador');
  if (fs.readFileSync(runtimeTarget, 'utf8') !== runtimeEncoded)
    throw new Error('OpenAPI runtime no corresponde al generador');
  console.log(
    'OpenAPI reproducible: 14 rutas, ' +
      Object.keys(schemas).length +
      ' schemas.',
  );
} else {
  fs.writeFileSync(target, encoded);
  fs.writeFileSync(runtimeTarget, runtimeEncoded);
  console.log('OpenAPI generado: ' + target);
}
