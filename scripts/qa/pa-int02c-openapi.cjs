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
  'CORREGIR_OBSERVACIONES_PLANTACION',
  'CORREGIR_PARTICIPANTES_PLANTACION',
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
    revision_inicial: { type: 'string', enum: ['0'] },
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
      'CorreccionPlantacionResultado',
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
paths['/api/v1/subcampanias/{id}/miembros-participacion'].get.description =
  'ADMIN global o permiso contextual vigente PLANTADOR/ADMINISTRADOR_SUBCAMPANIA del ámbito. Solo lectura; no habilita gestión ni ámbitos ajenos.';
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
// INT03-A extiende el mismo contrato y conserva las rutas/recibos de C.
const initialOperation = {
  type: 'string',
  enum: ['REGISTRAR_PLANTACION_INICIAL'],
};
const count = { type: 'integer', minimum: 0, maximum: 2147483647 };
const quantity = { ...count, minimum: 1 };
const date = {
  type: 'string',
  format: 'date',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
};
const speciesQuantity = obj({ planta_id: id, cantidad: quantity });
const affiliation = {
  oneOf: [
    obj({
      tipo: { type: 'string', enum: ['ORGANIZACION_REGISTRADA'] },
      organizacion_id: id,
    }),
    obj({
      tipo: { type: 'string', enum: ['OTRA'] },
      nombre: { ...text, minLength: 1, maxLength: 150 },
    }),
    { type: 'object', nullable: true, enum: [null] },
  ],
};
schemas.RegistroInicialEntrada = obj(
  {
    comando_id: uuid,
    subcampania_id: id,
    plan_revision_esperada: revision,
    fecha_plantacion: date,
    latitud: {
      type: 'number',
      minimum: -90,
      maximum: 90,
      multipleOf: 0.000001,
    },
    longitud: {
      type: 'number',
      minimum: -180,
      maximum: 180,
      multipleOf: 0.000001,
    },
    especies: array(speciesQuantity, 1, 100),
    coresponsable_ids: { ...array(id, 0, 100), uniqueItems: true },
    evidencia_ids: { ...array(id, 1, 10), uniqueItems: true },
    observaciones: {
      ...nullableText,
      maxLength: 2000,
      description: 'NFC/trim; omitido, vacío y null equivalen a null.',
    },
    afiliaciones_declaradas: array(
      obj({ usuario_id: id, afiliacion: affiliation }),
      0,
      101,
    ),
  },
  ['observaciones', 'afiliaciones_declaradas'],
);
schemas.ContextoRegistro = obj({
  subcampania: obj({
    id,
    campania_id: id,
    nombre: text,
    campania_nombre: text,
    estado: { type: 'string', enum: ['ACTIVA'] },
    plan_revision: revision,
    meta_total_arboles: quantity,
    poligono: obj({
      type: { type: 'string', enum: ['Polygon'] },
      coordinates: array(array(array({ type: 'number' }, 2, 2), 4), 1),
    }),
  }),
  actor: obj({
    usuario_id: id,
    fuente_autoridad: { type: 'string', enum: ['GLOBAL', 'CONTEXTUAL'] },
  }),
  disponibilidad: { type: 'string', enum: ['DISPONIBLE', 'SIN_STOCK'] },
  especies: array(
    obj({
      planta_id: id,
      nombre: { ...text, description: 'Nombre operativo vivo: nombre_comun_principal y, si falta o está vacío, nombre_cientifico. No usa especie ni reemplaza snapshots históricos.' },
      porcentaje_objetivo: { type: 'number', minimum: 0, maximum: 100 },
      cantidad_objetivo: count,
      saldo_elegible: count,
      plantado_inicial: count,
      pendiente_meta: count,
    }),
    1,
    100,
  ),
  reglas: obj({
    hoy_operativo: date,
    fecha_minima_ventana: date,
    fecha_maxima: date,
    zona_horaria: { type: 'string', enum: ['America/La_Paz'] },
    ventana_retroactiva_dias: { type: 'integer', enum: [10] },
    fotos_min: { type: 'integer', enum: [1] },
    fotos_max: { type: 'integer', enum: [10] },
    exterior_permitido: { type: 'boolean', enum: [true] },
  }),
});
schemas.ParticipanteSnapshot = obj({
  usuario_id: id,
  nombre_snapshot: nullableText,
  afiliacion_snapshot: nullableText,
  afiliacion_estado: {
    type: 'string',
    enum: ['DECLARADA', 'NO_DECLARADA', 'HISTORICA_NO_DISPONIBLE'],
  },
  afiliacion_tipo: {
    type: 'string',
    nullable: true,
    enum: ['ORGANIZACION_REGISTRADA', 'OTRA', null],
  },
  organizacion_id_snapshot: {
    ...text,
    nullable: true,
    pattern: '^[1-9][0-9]*$',
    maxLength: 19,
  },
  es_responsable: bool,
});
schemas.DetallePropio = obj({
  registro_plantacion_id: id,
  codigo_trazabilidad: text,
  subcampania_id: id,
  fecha_plantacion: date,
  revision_registro: revision,
  relaciones: {
    ...array({ type: 'string', enum: ['AUTOR', 'PARTICIPANTE'] }, 1, 2),
    uniqueItems: true,
  },
  cantidad_total_plantada: quantity,
  especies: array(speciesQuantity, 1, 100),
  latitud: { type: 'number' },
  longitud: { type: 'number' },
  gps_dentro_poligono: bool,
  participantes: array(ref('ParticipanteSnapshot'), 1, 101),
  evidencia_ids: array(id, 0, 10),
  observaciones_autor: nullableText,
});
schemas.PreparacionEntrada = obj({
  comando_id: uuid,
  operacion: initialOperation,
  subcampania_id: id,
});
schemas.DescartePreparacionEntrada = obj({ operacion: initialOperation });
schemas.Preparacion = obj({
  comando_id: uuid,
  operacion: initialOperation,
  subcampania_id: id,
  estado: { type: 'string', enum: ['PREPARADO'] },
});
schemas.Carga = obj({
  carga_id: uuid,
  estado: {
    type: 'string',
    enum: [
      'RESERVADA',
      'DISPONIBLE',
      'VINCULADA',
      'DESCARTE_PENDIENTE',
      'DESCARTADA',
    ],
  },
  evidencia_id: {
    ...text,
    nullable: true,
    pattern: '^[1-9][0-9]*$',
    maxLength: 19,
  },
  creado_en: instant,
  expira_en: { ...instant, nullable: true },
});
schemas.Preview = obj({
  url: { type: 'string', format: 'uri' },
  expira_en: instant,
});
for (const [name, data] of [
  ['ContextoRegistroLectura', ref('ContextoRegistro')],
  ['DetallePropioLectura', ref('DetallePropio')],
  ['PreparacionLectura', ref('Preparacion')],
  ['CargaLectura', ref('Carga')],
  ['CargasLectura', array(ref('Carga'), 0, 10)],
  ['PreviewLectura', ref('Preview')],
])
  schemas[name] = obj({ data, observado_en: instant });
schemas.PreparacionORecibo = {
  oneOf: [ref('PreparacionLectura'), ref('Recibo')],
};
add(
  '/api/v1/subcampanias/{id}/contexto-registro',
  'get',
  'Contexto de registro',
  null,
  'ContextoRegistroLectura',
  [param('id', 'path', id, true)],
);
add(
  '/api/v1/subcampanias/{id}/participantes-seleccionables',
  'get',
  'Participantes elegibles',
  null,
  'PersonasLectura',
  [
    param('id', 'path', id, true),
    param('q', 'query', { ...text, minLength: 2, maxLength: 100 }),
    param('cursor', 'query', pagination.cursor),
    param('limite', 'query', pagination.limite),
  ],
);
add(
  '/api/v1/plantaciones/iniciales',
  'post',
  'REGISTRAR_PLANTACION_INICIAL',
  'RegistroInicialEntrada',
  null,
  [],
  true,
);
paths['/api/v1/plantaciones/iniciales'].post.responses = {
  ...commandResponses,
  422: response(
    'ReciboOError',
    'DTO inválido fuera de recibo o validación de negocio durable.',
  ),
  503: response(
    'ReciboOError',
    'Evaluador sin resultado durable o infraestructura inconclusa.',
  ),
};
add(
  '/api/v1/plantaciones/{id}/detalle-propio',
  'get',
  'Detalle propio histórico',
  null,
  'DetallePropioLectura',
  [param('id', 'path', id, true)],
);
add(
  '/api/v1/participacion/comandos/preparaciones',
  'post',
  'Preparar cargas propias',
  'PreparacionEntrada',
  'PreparacionORecibo',
);
const operationQuery = param('operacion', 'query', initialOperation, true);
add(
  '/api/v1/participacion/comandos/{comando_id}/cargas/{carga_id}',
  'put',
  'Cargar foto recuperable',
  null,
  'CargaLectura',
  [
    param('comando_id', 'path', uuid, true),
    param('carga_id', 'path', uuid, true),
    operationQuery,
  ],
);
const upload =
  paths['/api/v1/participacion/comandos/{comando_id}/cargas/{carga_id}'].put;
upload.requestBody = {
  required: true,
  content: {
    'multipart/form-data': {
      schema: obj({
        foto: {
          type: 'string',
          format: 'binary',
          description:
            'Un archivo hasta 10 MiB. JPG/JPEG/PNG/WEBP/HEIC/HEIF decodificado; sin metadata libre.',
        },
      }),
    },
  },
};
upload.responses[201] = response('CargaLectura', 'Nueva carga disponible.');
upload.responses[202] = {
  ...response('CargaLectura', 'Lease vigente; estado reservado inconcluso.'),
  headers: {
    ...headers,
    'Retry-After': { schema: { type: 'string', enum: ['2'] } },
  },
};
add(
  '/api/v1/participacion/comandos/{comando_id}/cargas',
  'get',
  'Listar cargas propias',
  null,
  'CargasLectura',
  [param('comando_id', 'path', uuid, true), operationQuery],
);
add(
  '/api/v1/participacion/comandos/{comando_id}/descarte-preparacion',
  'post',
  'Descartar preparación propia',
  'DescartePreparacionEntrada',
  'Recibo',
  [param('comando_id', 'path', uuid, true)],
);
add(
  '/api/v1/participacion/cargas/{carga_id}/preview',
  'get',
  'Preview propio de cinco minutos',
  null,
  'PreviewLectura',
  [param('carga_id', 'path', uuid, true)],
);
add(
  '/api/v1/impact/fotos/{evidencia_id}',
  'get',
  'Foto pública sanitizada vinculada',
  null,
  'PreviewLectura',
  [param('evidencia_id', 'path', id, true)],
);
paths['/api/v1/impact/fotos/{evidencia_id}'].get.security = [];
paths['/api/v1/impact/fotos/{evidencia_id}'].get.responses[200].headers = {
  'Cache-Control': {
    schema: text,
    description: 'no-store; URL del derivado válida por cinco minutos.',
  },
};
paths['/api/v1/impact/imagenes/{evidenciaId}'] = {
  get: {
    summary:
      'JPEG público sanitizado de evidencia vinculada elegible, incluido legado',
    operationId: 'ImagenPublicaSanitizada',
    security: [],
    parameters: [param('evidenciaId', 'path', id, true)],
    responses: {
      200: {
        description: 'JPEG sin EXIF, nunca original ni pendiente.',
        headers: { 'Cache-Control': { schema: text, description: 'no-store' } },
        content: {
          'image/jpeg': { schema: { type: 'string', format: 'binary' } },
        },
      },
      404: { description: 'Imagen no elegible o no encontrada.' },
      503: { description: 'Imagen no disponible temporalmente.' },
    },
  },
};
// INT05: consulta común pública y recuperación histórica propia. La proyección
// corresponde a 081; ninguna respuesta incluye perfiles, stock u observaciones.
const nullableId = {
  ...text,
  nullable: true,
  pattern: '^[1-9][0-9]*$',
  maxLength: 19,
};
const total = { type: 'integer', minimum: 0 };
const impactPagination = {
  cursor: id,
  limite: { ...count, minimum: 1, maximum: 100, default: 20 },
};
const impactFilters = {
  campania_id: id,
  subcampania_id: id,
  organizacion_id: id,
  planta_id: id,
  desde: date,
  hasta: date,
  ...impactPagination,
};
schemas.ImpactoConsultaQuery = obj(impactFilters, Object.keys(impactFilters));
schemas.MisRegistrosQuery = obj(
  impactPagination,
  Object.keys(impactPagination),
);
schemas.ImpactoAfiliacion = obj({
  estado: {
    type: 'string',
    enum: ['DECLARADA', 'NO_DECLARADA', 'HISTORICA_NO_DISPONIBLE'],
  },
  tipo: {
    type: 'string',
    nullable: true,
    enum: ['ORGANIZACION_REGISTRADA', 'OTRA', null],
  },
  nombre: nullableText,
  organizacion_id: nullableId,
});
schemas.ImpactoPersona = obj({
  nombre: nullableText,
  es_responsable: bool,
  afiliacion: ref('ImpactoAfiliacion'),
});
schemas.ImpactoRegistro = obj({
  id,
  codigo_trazabilidad: text,
  campania_id: id,
  subcampania_id: id,
  campania_nombre: text,
  subcampania_nombre: text,
  fecha_plantacion: date,
  cantidad_total_plantada: quantity,
  es_reposicion: bool,
  registro_plantacion_origen_id: nullableId,
  latitud: { type: 'number', minimum: -90, maximum: 90 },
  longitud: { type: 'number', minimum: -180, maximum: 180 },
  gps_dentro_poligono: bool,
  especies: array(
    obj({ planta_id: id, nombre: nullableText, cantidad: quantity }),
  ),
  personas: array(ref('ImpactoPersona'), 1, 101),
  fotos: array(
    obj({
      id,
      url: { ...text, pattern: '^/api/v1/impact/imagenes/[1-9][0-9]*$' },
    }),
  ),
  seguimiento: obj({
    bajas_reportadas: total,
    reposiciones_registradas: total,
    bajas: array(obj({ evento_id: id, fecha: instant, cantidad: quantity })),
    reposiciones: array(
      obj({
        registro_id: id,
        fecha: date,
        cantidad: quantity,
        url_publica: {
          ...text,
          pattern: '^/api/v1/impact/registros/[1-9][0-9]*$',
        },
      }),
    ),
  }),
  organizaciones_campania: array(obj({ id, nombre: text })),
  url_publica: { ...text, pattern: '^/api/v1/impact/registros/[1-9][0-9]*$' },
});
schemas.ImpactoCampania = obj({
  id,
  nombre: text,
  plantacion_inicial: total,
  url_publica: { ...text, pattern: '^/api/v1/impact/campanias/[1-9][0-9]*$' },
});
schemas.ImpactoSubcampania = obj({
  id,
  campania_id: id,
  nombre: text,
  estado: {
    type: 'string',
    enum: ['ACTIVA', 'COMPLETADA', 'FINALIZADA_PARCIAL'],
  },
  zona: nullableText,
  poligono: {
    ...obj({
      type: { type: 'string', enum: ['Polygon'] },
      coordinates: array(array(array({ type: 'number' }, 2, 2), 4), 1),
    }),
    nullable: true,
    description:
      'Zona de trabajo; no representa superficie efectivamente plantada.',
  },
  meta_inicial: total,
  plantacion_inicial: total,
  faltantes: {
    ...total,
    description:
      'max(meta_inicial - plantacion_inicial, 0); bajas y reposiciones no lo modifican.',
  },
  avance_porcentaje: {
    type: 'number',
    minimum: 0,
    nullable: true,
    description:
      '100 * plantacion_inicial / meta_inicial; puede superar 100. null si no hay meta positiva.',
  },
  reposiciones: total,
  bajas_reportadas: total,
  registros: total,
  url_publica: {
    ...text,
    pattern: '^/api/v1/impact/subcampanias/[1-9][0-9]*$',
  },
});
schemas.ImpactoPunto = obj({
  registro_id: id,
  subcampania_id: id,
  latitud: { type: 'number', minimum: -90, maximum: 90 },
  longitud: { type: 'number', minimum: -180, maximum: 180 },
  cantidad_total_plantada: quantity,
  es_reposicion: bool,
  url_publica: { ...text, pattern: '^/api/v1/impact/registros/[1-9][0-9]*$' },
});
schemas.ImpactoConsulta = obj({
  indicadores: obj({
    plantacion_inicial: total,
    reposiciones: total,
    bajas_reportadas: total,
    registros: total,
  }),
  campanias: array(ref('ImpactoCampania')),
  subcampanias: array(ref('ImpactoSubcampania')),
  mapa: array(ref('ImpactoPunto')),
  registros: array(ref('ImpactoRegistro'), 0, 100),
  siguiente_cursor: nullableId,
});
schemas.MisRegistros = obj({
  registros: array(
    obj({
      id,
      subcampania_id: id,
      fecha_plantacion: date,
      codigo_trazabilidad: text,
      cantidad_total_plantada: quantity,
      es_reposicion: bool,
      relaciones: {
        ...array({ type: 'string', enum: ['AUTOR', 'PARTICIPANTE'] }, 1, 2),
        uniqueItems: true,
      },
      url_publica: {
        ...nullableText,
        pattern: '^/api/v1/impact/registros/[1-9][0-9]*$',
      },
      url_detalle_propio: {
        ...text,
        pattern: '^/api/v1/plantaciones/[1-9][0-9]*/detalle-propio$',
      },
    }),
    0,
    100,
  ),
  siguiente_cursor: nullableId,
});
for (const name of ['ImpactoConsulta', 'ImpactoRegistro', 'MisRegistros'])
  schemas[name + 'Respuesta'] = obj({ data: ref(name) });
const publicHeaders = {
  'Cache-Control': { schema: text, description: 'no-store' },
};
function impactResponse(schema, description, privateRead = false) {
  return {
    ...response(schema, description),
    headers: privateRead ? headers : publicHeaders,
  };
}
function impactRead(route, summary, schema, params, privateRead = false) {
  paths[route] = {
    get: {
      summary,
      operationId: summary.replace(/[^a-zA-Z]/g, ''),
      description: privateRead
        ? 'JWT vigente y cuenta activa. Autoría o participación histórica; no exige permiso operativo. Una fila por registro y relaciones identificables. No concede crédito individual ni campos privados del autor al participante. Cursor decimal exclusivo: id < cursor, orden id DESC. Solo cursor y limite; campos desconocidos rechazados con 422.'
        : 'Sin JWT, cuenta, perfil ni capacidades; misma proyección con sesión ausente o vencida. Solo ACTIVA, COMPLETADA y FINALIZADA_PARCIAL, sin borrados. Filtros estrictos: desconocidos o incompatibles con la ruta producen 422; desde/hasta inclusivos y desde <= hasta. Los agregados y el mapa incluyen todo el alcance filtrado; cursor y limite paginan solamente registros, en orden id DESC, id < cursor. planta_id selecciona registros que contienen la especie y conserva la cantidad grupal completa. Sin inferir stock, superficie plantada, afiliación vigente ni crédito exclusivo.',
      security: privateRead ? [{ bearerAuth: [] }] : [],
      parameters: params,
      responses: {
        200: impactResponse(
          schema + 'Respuesta',
          privateRead
            ? 'Lista propia histórica deduplicada.'
            : 'Proyección pública elegible.',
          privateRead,
        ),
        ...(privateRead
          ? {
              401: impactResponse(
                'ErrorFueraDeRecibo',
                'Sesión ausente o vencida.',
                true,
              ),
              403: impactResponse(
                'ErrorFueraDeRecibo',
                'CUENTA_INACTIVA; recuperar sesión con una cuenta activa.',
                true,
              ),
            }
          : {}),
        404: impactResponse(
          'ErrorFueraDeRecibo',
          'RECURSO_NO_VISIBLE; no confirma existencia de ámbitos internos o ajenos.',
          true,
        ),
        422: impactResponse(
          'ErrorFueraDeRecibo',
          'ENTRADA_INVALIDA; filtros, identificador o paginación inválidos.',
          true,
        ),
        503: impactResponse(
          'ErrorFueraDeRecibo',
          'RESULTADO_NO_DETERMINADO; lectura no disponible temporalmente, reintento NO_APLICA.',
          true,
        ),
      },
    },
  };
}
const impactParams = (names) =>
  names.map((name) => param(name, 'query', impactFilters[name]));
impactRead(
  '/api/v1/impact/global',
  'Impacto global público',
  'ImpactoConsulta',
  impactParams(Object.keys(impactFilters)),
);
impactRead(
  '/api/v1/impact/campanias/{id}',
  'Impacto público de campaña',
  'ImpactoConsulta',
  [
    param('id', 'path', id, true),
    ...impactParams(
      Object.keys(impactFilters).filter((name) => name !== 'campania_id'),
    ),
  ],
);
impactRead(
  '/api/v1/impact/subcampanias/{id}',
  'Impacto público de subcampaña',
  'ImpactoConsulta',
  [
    param('id', 'path', id, true),
    ...impactParams(
      Object.keys(impactFilters).filter(
        (name) => !['campania_id', 'subcampania_id'].includes(name),
      ),
    ),
  ],
);
impactRead(
  '/api/v1/impact/registros/{id}',
  'Registro grupal público',
  'ImpactoRegistro',
  [param('id', 'path', id, true)],
);
paths['/api/v1/impact/registros/{id}'].get.description =
  'Detalle público compartible sin JWT, cuenta ni perfil. No acepta query. Devuelve 404 para inexistentes, borrados o ámbitos no elegibles sin distinguirlos. Nombres y afiliación son snapshots históricos; NO_DECLARADA e HISTORICA_NO_DISPONIBLE son estados distintos. Fotos solo vinculadas elegibles sanitizadas mediante /api/v1/impact/imagenes/:id; nunca originales, pendientes ni metadatos fotográficos.';
impactRead(
  '/api/v1/plantaciones/mis-registros',
  'Mis registros históricos',
  'MisRegistros',
  impactParams(['cursor', 'limite']),
  true,
);
// INT07: observaciones (084), participantes y lecturas por audiencia (085).
schemas.CorreccionObservacionesEntrada = obj({
  comando_id: uuid,
  revision_esperada: revision,
  motivo: {
    ...text,
    minLength: 3,
    maxLength: 1000,
    description: 'Texto NFC/trim obligatorio; nunca se incluye en el recibo.',
  },
  observaciones: {
    ...nullableText,
    maxLength: 2000,
    description: 'Campo obligatorio; NFC/trim. Vacío equivale a null.',
  },
});
schemas.CorreccionParticipantesEntrada = obj({
  comando_id: uuid,
  revision_esperada: revision,
  motivo: {
    ...text,
    minLength: 3,
    maxLength: 1000,
    description: 'NFC/trim obligatorio; nunca se incluye en el recibo.',
  },
  coresponsable_ids: {
    ...array(id, 0, 100),
    uniqueItems: true,
    description:
      'Conjunto completo de corresponsables efectivos; excluye al responsable. Se canonicaliza por ID numérico. Admite cuentas inactivas sin permiso operativo.',
  },
});
schemas.ParticipanteSnapshotCorreccion = obj({
  ...schemas.ParticipanteSnapshot.properties,
  procedencia: {
    ...text,
    enum: ['ORIGINAL', 'ALTA_CORRECCION', 'RESTAURACION'],
  },
  capturado_en: { ...instant, nullable: true },
  nombre_capturado_correccion: nullableText,
});
schemas.CorreccionPlantacionResultado = obj({
  tipo: { ...text, enum: ['CORRECCION_PLANTACION'] },
  correccion_id: nullableId,
  registro_plantacion_id: id,
  subcampania_id: id,
  caso: { ...text, enum: ['OBSERVACIONES', 'PARTICIPANTES'] },
  revision_anterior: revision,
  revision_nueva: revision,
  revision_grupo_anterior: revision,
  revision_grupo_nueva: revision,
  cambio: change,
  estado_logico: { ...text, enum: ['VIGENTE'] },
  registro_vigente_id: { ...nullableId, enum: [null] },
});
schemas.ContextoCorreccion = obj({
  registro_plantacion_id: id,
  subcampania_id: id,
  campania_id: id,
  estado_subcampania: {
    ...text,
    enum: [
      'BORRADOR',
      'ACTIVA',
      'PAUSADA',
      'COMPLETADA',
      'FINALIZADA_PARCIAL',
      'CANCELADA',
    ],
  },
  es_reposicion: bool,
  estado_logico: { ...text, enum: ['VIGENTE', 'REVERTIDO'] },
  revision_registro: revision,
  revision_grupo: revision,
  observaciones_visibles: bool,
  original: obj({
    observaciones: nullableText,
    participantes: array(ref('ParticipanteSnapshotCorreccion'), 1, 101),
  }),
  efectivo: obj({
    observaciones: nullableText,
    participantes: array(ref('ParticipanteSnapshotCorreccion'), 1, 101),
  }),
  capacidades: obj({
    corregir_observaciones: bool,
    corregir_participantes: bool,
  }),
});
schemas.HistoriaCorreccionObservaciones = obj({
  correccion_id: id,
  caso: { ...text, enum: ['OBSERVACIONES'] },
  actor: obj({ usuario_id: id, nombre_snapshot: nullableText }),
  fecha: instant,
  revision_anterior: revision,
  revision_nueva: revision,
  revision_grupo_anterior: revision,
  revision_grupo_nueva: revision,
  motivo: nullableText,
  observaciones_visibles: bool,
  antes: obj({ observaciones: nullableText }),
  despues: obj({ observaciones: nullableText }),
  efectos_consumo: array(obj({}), 0, 0),
});
schemas.HistoriaCorreccionParticipantes = obj({
  correccion_id: id,
  caso: { ...text, enum: ['PARTICIPANTES'] },
  actor: obj({ usuario_id: id, nombre_snapshot: nullableText }),
  fecha: instant,
  revision_anterior: revision,
  revision_nueva: revision,
  revision_grupo_anterior: revision,
  revision_grupo_nueva: revision,
  motivo: text,
  antes: obj({
    participantes: array(ref('ParticipanteSnapshotCorreccion'), 1, 101),
  }),
  despues: obj({
    participantes: array(ref('ParticipanteSnapshotCorreccion'), 1, 101),
  }),
  efectos_consumo: array(obj({}), 0, 0),
});
schemas.HistoriaCorreccion = {
  oneOf: [
    ref('HistoriaCorreccionObservaciones'),
    ref('HistoriaCorreccionParticipantes'),
  ],
};
schemas.ContextoCorreccionLectura = obj({
  data: ref('ContextoCorreccion'),
  observado_en: instant,
});
schemas.HistorialCorreccionesLectura = obj({
  data: array(ref('HistoriaCorreccion'), 0, 50),
  observado_en: instant,
  siguiente_cursor: nullableText,
});
add(
  '/api/v1/plantaciones/{id}/contexto-correccion',
  'get',
  'Contexto autorizado de corrección',
  null,
  'ContextoCorreccionLectura',
  [param('id', 'path', id, true)],
);
add(
  '/api/v1/plantaciones/{id}/historial-correcciones',
  'get',
  'Historial autorizado de correcciones',
  null,
  'HistorialCorreccionesLectura',
  [
    param('id', 'path', id, true),
    param('cursor', 'query', { ...text, minLength: 1, maxLength: 1024 }),
    param('limite', 'query', {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      default: 20,
    }),
  ],
);
add(
  '/api/v1/plantaciones/{id}/correcciones/observaciones',
  'post',
  'CORREGIR_OBSERVACIONES_PLANTACION',
  'CorreccionObservacionesEntrada',
  null,
  [param('id', 'path', id, true)],
  true,
);
paths['/api/v1/plantaciones/{id}/correcciones/observaciones'].post.responses = {
  ...commandResponses,
  422: response(
    'ReciboOError',
    'DTO inválido inconcluso o rechazo de negocio durable.',
  ),
  503: response(
    'ErrorFueraDeRecibo',
    'Infraestructura inconclusa; recuperar con la misma clave.',
  ),
};
paths['/api/v1/plantaciones/{id}/correcciones/observaciones'].post.description =
  'Solo ADMIN global y subcampaña ACTIVA. Original conservado; overlay, revisión, historial y recibo en una transacción. Replay terminal precede a nueva autorización. SIN_CAMBIOS no incrementa revisiones ni crea historial. No modifica stock. El recibo no contiene observaciones ni motivo.';
paths['/api/v1/plantaciones/{id}/contexto-correccion'].get.description =
  'ADMIN global o administrador vigente de la subcampaña exacta. El administrador contextual recibe observaciones null y corregir_observaciones false; ambos pueden corregir participantes en ámbito ACTIVA y registro VIGENTE. Responsable inmutable. Leer no reserva revisión, autoridad ni estado; no acepta query.';
paths['/api/v1/plantaciones/{id}/historial-correcciones'].get.description =
  'Auditoría privada autorizada, ID DESC. Cursor firmado ligado a actor, sesión, registro y audiencia; revalida autoridad en cada página. El administrador contextual recibe motivo y textos null solamente en OBSERVACIONES. PARTICIPANTES expone motivo y snapshots antes/después a ambas autoridades. Sin perfiles ni fotos privadas.';
add(
  '/api/v1/plantaciones/{id}/correcciones/participantes',
  'post',
  'CORREGIR_PARTICIPANTES_PLANTACION',
  'CorreccionParticipantesEntrada',
  null,
  [param('id', 'path', id, true)],
  true,
);
paths['/api/v1/plantaciones/{id}/correcciones/participantes'].post.responses = {
  ...paths['/api/v1/plantaciones/{id}/correcciones/observaciones'].post
    .responses,
};
paths['/api/v1/plantaciones/{id}/correcciones/participantes'].post.description =
  'ADMIN global o administrador vigente de la subcampaña exacta, ACTIVA y registro VIGENTE. Alta/retiro/restauración histórica sin exigir cuenta activa ni permiso operativo al participante. No admite responsable en coresponsable_ids (CASO_NO_SOPORTADO); usuario inexistente produce PARTICIPANTE_NO_REGISTRADO durable. Originales/snapshots conservados; overlay, revisión de registro, historial y recibo atómicos. No altera grupo, cantidad, stock ni permisos. SIN_CAMBIOS no materializa overlay ni incrementa revisión. Replay terminal precede a nueva autorización. El recibo no incluye participantes, nombres ni motivo.';
const correctionPageParams = [
  param('cursor', 'query', { ...text, minLength: 1, maxLength: 1024 }),
  param('limite', 'query', {
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
  }),
];
schemas.ParticipanteHistoricoSeleccionable = obj({
  usuario_id: id,
  nombre_actual: nullableText,
  activo: bool,
  relacion_historica: {
    ...text,
    enum: ['PRESENTE', 'RETIRADO', 'SIN_RELACION'],
  },
});
schemas.ParticipantesHistoricosLectura = obj({
  data: array(ref('ParticipanteHistoricoSeleccionable'), 0, 50),
  observado_en: instant,
  siguiente_cursor: nullableText,
});
add(
  '/api/v1/plantaciones/{id}/participantes-historicos-seleccionables',
  'get',
  'Buscar participantes históricos',
  null,
  'ParticipantesHistoricosLectura',
  [
    param('id', 'path', id, true),
    param(
      'q',
      'query',
      {
        ...text,
        minLength: 1,
        maxLength: 100,
        description:
          'Obligatorio. ID decimal canónico exacto desde un carácter o nombre NFC/trim de 3..100 caracteres, búsqueda literal sin comodines. No busca correo ni username.',
      },
      true,
    ),
    ...correctionPageParams,
  ],
);
paths[
  '/api/v1/plantaciones/{id}/participantes-historicos-seleccionables'
].get.description =
  'Autoridad global o contextual de corrección, revalidada por página. Incluye inactivos y excluye al responsable; no consulta permiso operativo. ID ASC, cursor firmado ligado a actor, sesión, registro, modo y consulta normalizada. Solo q/cursor/limite. La lectura puede continuar con ámbito cerrado sin habilitar escritura.';
const logicalState = { ...text, enum: ['VIGENTE', 'REVERTIDO'] };
schemas.EstadoRegistroPropio = obj({
  registro_plantacion_id: id,
  codigo_trazabilidad: text,
  subcampania_id: id,
  es_reposicion: bool,
  registro_plantacion_origen_id: nullableId,
  estado_logico: logicalState,
  tiene_correcciones: bool,
  revision_registro: revision,
  revision_grupo: revision,
  relaciones: {
    ...array({ ...text, enum: ['AUTOR', 'PARTICIPANTE'] }, 1, 2),
    uniqueItems: true,
  },
  cantidad_original: quantity,
  cantidad_efectiva: { type: 'integer', minimum: 0 },
  especies_originales: array(speciesQuantity, 1, 100),
  especies_efectivas: array(
    obj({ planta_id: id, cantidad: { type: 'integer', minimum: 0 } }),
    1,
    100,
  ),
  participantes: array(ref('ParticipanteSnapshotCorreccion'), 1, 101),
  registro_vigente_id: nullableId,
  url_detalle_efectivo: nullableText,
});
schemas.HistoriaCorreccionPropia = obj({
  correccion_id: id,
  caso: { ...text, enum: ['OBSERVACIONES', 'PARTICIPANTES'] },
  actor: obj({ usuario_id: id, nombre_snapshot: nullableText }),
  fecha: instant,
  revision_anterior: revision,
  revision_nueva: revision,
});
schemas.EstadoRegistroPublico = obj({
  registro_plantacion_id: id,
  estado_logico: logicalState,
  tiene_correcciones: bool,
  url_detalle_efectivo: nullableText,
  registro_vigente: {
    ...obj({ registro_plantacion_id: id, url_publica: text }),
    nullable: true,
  },
});
schemas.EstadoRegistroPropioLectura = obj({
  data: ref('EstadoRegistroPropio'),
  observado_en: instant,
});
schemas.HistorialPropioLectura = obj({
  data: array(ref('HistoriaCorreccionPropia'), 0, 50),
  observado_en: instant,
  siguiente_cursor: nullableText,
});
schemas.MisRegistrosEstadoLectura = obj({
  data: array(ref('EstadoRegistroPropio'), 0, 50),
  observado_en: instant,
  siguiente_cursor: nullableText,
});
schemas.EstadoRegistroPublicoLectura = obj({
  data: ref('EstadoRegistroPublico'),
  observado_en: instant,
});
for (const [route, summary, schema, paged] of [
  [
    '/api/v1/plantaciones/{id}/estado-propio',
    'Estado efectivo propio',
    'EstadoRegistroPropioLectura',
    false,
  ],
  [
    '/api/v1/plantaciones/{id}/historial-propio',
    'Historia mínima propia',
    'HistorialPropioLectura',
    true,
  ],
  [
    '/api/v1/plantaciones/mis-registros/estado',
    'Estados de mis registros',
    'MisRegistrosEstadoLectura',
    true,
  ],
]) {
  add(route, 'get', summary, null, schema, [
    ...(route.includes('{id}') ? [param('id', 'path', id, true)] : []),
    ...(paged ? correctionPageParams : []),
  ]);
  paths[route].get.description =
    'JWT vigente y cuenta activa, autoría o participación efectiva revalidada en cada lectura, incluso para ADMIN. Retirar un participante extingue su acceso propio; restaurarlo lo recupera. Sin motivo, observaciones ni antes/después administrativos. Paginación ID DESC con cursor firmado ligado a actor, sesión, objeto y audiencia propia. No requiere permiso operativo.';
}
add(
  '/api/v1/impact/registros/{id}/estado',
  'get',
  'Estado público del registro',
  null,
  'EstadoRegistroPublicoLectura',
  [param('id', 'path', id, true)],
);
const publicState = paths['/api/v1/impact/registros/{id}/estado'].get;
publicState.security = [];
publicState.description =
  'Sin JWT ni cuenta; misma respuesta con bearer ausente o vencido. Solo registros elegibles según INT05. Estado y enlace mínimos, sin participantes, actor, motivo ni observaciones. No acepta query.';
for (const value of Object.values(publicState.responses))
  value.headers = publicHeaders;
delete publicState.responses[401];
delete publicState.responses[403];
const document = {
  openapi: '3.0.3',
  info: {
    title:
      'R3Foresta Participación aliada — INT02-C / INT03-A / INT02-D / INT05 / INT07',
    version: '1.5.0',
    description:
      'Gestión C, registro inicial INT03-A, consulta INT05 y correcciones INT07 de observaciones/participantes con recuperación durable, contexto/historial privados, búsqueda histórica y estado propio/público. IDs/revisiones BIGINT en cadenas. Campos desconocidos rechazados. 404 COMANDO_NO_CONFIRMADO y 503 RESULTADO_NO_DETERMINADO son inconclusos. INT02-D retira inicial/contexto legados y añade JPEG público sanitizado. SQL/corte remotos y habilitación real conservan su evidencia separada.',
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
    'OpenAPI reproducible: ' +
      Object.keys(paths).length +
      ' rutas, ' +
      Object.keys(schemas).length +
      ' schemas.',
  );
} else {
  fs.writeFileSync(target, encoded);
  fs.writeFileSync(runtimeTarget, runtimeEncoded);
  console.log('OpenAPI generado: ' + target);
}
