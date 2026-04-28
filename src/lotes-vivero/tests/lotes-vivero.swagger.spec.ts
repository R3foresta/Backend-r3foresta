/**
 * Tests para los decoradores Swagger de lotes-vivero.
 *
 * Estrategia:
 *   1. Verificar que cada funcion exportada existe y es invocable.
 *   2. Aplicar cada decorador a un metodo stub y comprobar que NestJS/Swagger
 *      escribe los metadatos esperados via Reflect.
 *
 * Claves de metadatos usadas por @nestjs/swagger:
 *   - 'swagger/apiOperation'   -> ApiOperation
 *   - 'swagger/apiResponse'    -> ApiResponse (array)
 *   - 'swagger/apiParameters'  -> ApiParam / ApiQuery / ApiHeader (array)
 *   - 'swagger/consumes'       -> ApiConsumes
 */

import 'reflect-metadata';
import {
  ApiCrearEvidenciaPendiente,
  ApiCrearLoteDesdeRecoleccion,
  ApiListarLotes,
  ApiObtenerTimeline,
  ApiRegistrarAdaptabilidad,
  ApiRegistrarDespacho,
  ApiRegistrarEmbolsado,
  ApiRegistrarMerma,
} from '../api/docs/lotes-vivero.swagger';
import { CausaMermaVivero } from '../domain/enums/causa-merma-vivero.enum';
import { DestinoTipoVivero } from '../domain/enums/destino-tipo-vivero.enum';
import { EstadoLoteVivero } from '../domain/enums/estado-lote-vivero.enum';
import { MotivoCierreLote } from '../domain/enums/motivo-cierre-lote.enum';
import { SubetapaAdaptabilidad } from '../domain/enums/subetapa-adaptabilidad.enum';
import { TipoEventoVivero } from '../domain/enums/tipo-evento-vivero.enum';
import { UnidadMedidaVivero } from '../domain/enums/unidad-medida-vivero.enum';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Claves reales de @nestjs/swagger (ver node_modules/@nestjs/swagger/dist/constants.js)
const SWAGGER_OPERATION = 'swagger/apiOperation';
const SWAGGER_RESPONSE = 'swagger/apiResponse';
const SWAGGER_PARAMETERS = 'swagger/apiParameters';
const SWAGGER_CONSUMES = 'swagger/apiConsumes';

/**
 * Aplica un decorador de metodo a un metodo stub y devuelve la funcion del
 * metodo, que es donde @nestjs/swagger escribe los metadatos via
 * Reflect.defineMetadata(key, value, descriptor.value).
 */
function applyMethodDecorator(decorator: MethodDecorator): Function {
  class Stub {
    target() {
      /* stub */
    }
  }

  const descriptor = Object.getOwnPropertyDescriptor(Stub.prototype, 'target')!;
  decorator(Stub.prototype, 'target', descriptor);

  // Los decoradores de swagger guardan los datos en descriptor.value (la funcion),
  // no en el prototipo con clave de propiedad.
  return Stub.prototype.target;
}

function getOperation(fn: Function) {
  return Reflect.getMetadata(SWAGGER_OPERATION, fn) as Record<string, any> | undefined;
}

/**
 * ApiResponse almacena un objeto { [statusCode]: { description, ... } }
 * (no un array), por lo que devolvemos el objeto crudo.
 */
function getResponsesObj(fn: Function): Record<string, any> {
  return Reflect.getMetadata(SWAGGER_RESPONSE, fn) ?? {};
}

/**
 * Parametros: ApiParam, ApiQuery y ApiHeader los almacena createParamDecorator
 * como un array en descriptor.value.
 */
function getParameters(
  fn: Function,
): Array<{ in: string; name?: string; description?: string; schema?: { enum?: any[] } }> {
  return Reflect.getMetadata(SWAGGER_PARAMETERS, fn) ?? [];
}

function getConsumes(fn: Function): string[] | undefined {
  return Reflect.getMetadata(SWAGGER_CONSUMES, fn);
}

/** Devuelve los status codes como numeros a partir del objeto de respuestas. */
function getStatusCodes(fn: Function): number[] {
  return Object.keys(getResponsesObj(fn)).map(Number);
}

// ---------------------------------------------------------------------------
// Existencia y tipo de las funciones exportadas
// ---------------------------------------------------------------------------

describe('lotes-vivero.swagger - exportaciones', () => {
  it.each([
    ['ApiCrearEvidenciaPendiente', ApiCrearEvidenciaPendiente],
    ['ApiCrearLoteDesdeRecoleccion', ApiCrearLoteDesdeRecoleccion],
    ['ApiRegistrarEmbolsado', ApiRegistrarEmbolsado],
    ['ApiRegistrarAdaptabilidad', ApiRegistrarAdaptabilidad],
    ['ApiRegistrarMerma', ApiRegistrarMerma],
    ['ApiRegistrarDespacho', ApiRegistrarDespacho],
    ['ApiListarLotes', ApiListarLotes],
    ['ApiObtenerTimeline', ApiObtenerTimeline],
  ])('%s es una funcion exportada', (_name, fn) => {
    expect(typeof fn).toBe('function');
  });

  it.each([
    ['ApiCrearEvidenciaPendiente', ApiCrearEvidenciaPendiente],
    ['ApiCrearLoteDesdeRecoleccion', ApiCrearLoteDesdeRecoleccion],
    ['ApiRegistrarEmbolsado', ApiRegistrarEmbolsado],
    ['ApiRegistrarAdaptabilidad', ApiRegistrarAdaptabilidad],
    ['ApiRegistrarMerma', ApiRegistrarMerma],
    ['ApiRegistrarDespacho', ApiRegistrarDespacho],
    ['ApiListarLotes', ApiListarLotes],
    ['ApiObtenerTimeline', ApiObtenerTimeline],
  ])('%s() devuelve un decorador (funcion)', (_name, fn) => {
    expect(typeof fn()).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// POST /lotes-vivero/evidencias-pendientes
// ---------------------------------------------------------------------------

describe('ApiCrearEvidenciaPendiente', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiCrearEvidenciaPendiente());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Crear evidencia pendiente de vivero');
  });

  it('incluye el header x-auth-id en los parametros', () => {
    const params = getParameters(fn);
    const header = params.find((p) => p.in === 'header' && p.name === 'x-auth-id');
    expect(header).toBeDefined();
  });

  it('declara consumo multipart/form-data', () => {
    const consumes = getConsumes(fn);
    expect(consumes).toContain('multipart/form-data');
  });

  it('expone los codigos de respuesta 201, 400, 401 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([201, 400, 401, 500]));
  });
});

// ---------------------------------------------------------------------------
// POST /lotes-vivero
// ---------------------------------------------------------------------------

describe('ApiCrearLoteDesdeRecoleccion', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiCrearLoteDesdeRecoleccion());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Crear lote de vivero desde recoleccion');
  });

  it('incluye el header x-auth-id', () => {
    const params = getParameters(fn);
    const header = params.find((p) => p.in === 'header' && p.name === 'x-auth-id');
    expect(header).toBeDefined();
  });

  it('expone los codigos de respuesta 201, 400, 401, 404 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([201, 400, 401, 404, 500]));
  });

  it('el esquema del body incluye todos los valores del enum UnidadMedidaVivero', () => {
    const params = getParameters(fn);
    const bodyParam = params.find((p) => p.in === 'body');
    const enumValues =
      bodyParam?.schema?.properties?.unidad_medida_inicial?.enum ?? [];
    expect(enumValues).toEqual(expect.arrayContaining(Object.values(UnidadMedidaVivero)));
  });
});

// ---------------------------------------------------------------------------
// POST /lotes-vivero/:id/embolsado
// ---------------------------------------------------------------------------

describe('ApiRegistrarEmbolsado', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiRegistrarEmbolsado());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Registrar evento de embolsado');
  });

  it('incluye el header x-auth-id', () => {
    const params = getParameters(fn);
    expect(params.find((p) => p.in === 'header' && p.name === 'x-auth-id')).toBeDefined();
  });

  it('declara el parametro de ruta :id', () => {
    const params = getParameters(fn);
    const pathParam = params.find((p) => p.in === 'path' && p.name === 'id');
    expect(pathParam).toBeDefined();
  });

  it('expone los codigos de respuesta 201, 400, 401, 404 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([201, 400, 401, 404, 500]));
  });
});

// ---------------------------------------------------------------------------
// POST /lotes-vivero/:id/adaptabilidad
// ---------------------------------------------------------------------------

describe('ApiRegistrarAdaptabilidad', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiRegistrarAdaptabilidad());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Registrar evento de adaptabilidad');
  });

  it('declara el parametro de ruta :id', () => {
    const params = getParameters(fn);
    expect(params.find((p) => p.in === 'path' && p.name === 'id')).toBeDefined();
  });

  it('el esquema del body incluye todos los valores del enum SubetapaAdaptabilidad', () => {
    const params = getParameters(fn);
    const bodyParam = params.find((p) => p.in === 'body');
    const enumValues =
      bodyParam?.schema?.properties?.subetapa_destino?.enum ?? [];
    expect(enumValues).toEqual(expect.arrayContaining(Object.values(SubetapaAdaptabilidad)));
  });

  it('expone los codigos de respuesta 201, 400, 401, 404 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([201, 400, 401, 404, 500]));
  });
});

// ---------------------------------------------------------------------------
// POST /lotes-vivero/:id/merma
// ---------------------------------------------------------------------------

describe('ApiRegistrarMerma', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiRegistrarMerma());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Registrar merma de plantas');
  });

  it('declara el parametro de ruta :id', () => {
    const params = getParameters(fn);
    expect(params.find((p) => p.in === 'path' && p.name === 'id')).toBeDefined();
  });

  it('el esquema del body incluye todos los valores del enum CausaMermaVivero', () => {
    const params = getParameters(fn);
    const bodyParam = params.find((p) => p.in === 'body');
    const enumValues = bodyParam?.schema?.properties?.causa_merma?.enum ?? [];
    expect(enumValues).toEqual(expect.arrayContaining(Object.values(CausaMermaVivero)));
  });

  it('expone los codigos de respuesta 201, 400, 401, 404 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([201, 400, 401, 404, 500]));
  });
});

// ---------------------------------------------------------------------------
// POST /lotes-vivero/:id/despacho
// ---------------------------------------------------------------------------

describe('ApiRegistrarDespacho', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiRegistrarDespacho());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Registrar despacho de plantas');
  });

  it('declara el parametro de ruta :id', () => {
    const params = getParameters(fn);
    expect(params.find((p) => p.in === 'path' && p.name === 'id')).toBeDefined();
  });

  it('el esquema del body incluye todos los valores del enum DestinoTipoVivero', () => {
    const params = getParameters(fn);
    const bodyParam = params.find((p) => p.in === 'body');
    const enumValues = bodyParam?.schema?.properties?.destino_tipo?.enum ?? [];
    expect(enumValues).toEqual(expect.arrayContaining(Object.values(DestinoTipoVivero)));
  });

  it('expone los codigos de respuesta 201, 400, 401, 404 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([201, 400, 401, 404, 500]));
  });
});

// ---------------------------------------------------------------------------
// GET /lotes-vivero
// ---------------------------------------------------------------------------

describe('ApiListarLotes', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiListarLotes());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Listar lotes de vivero');
  });

  it('declara los query params de paginacion (page, limit)', () => {
    const params = getParameters(fn);
    const queryNames = params.filter((p) => p.in === 'query').map((p) => p.name);
    expect(queryNames).toContain('page');
    expect(queryNames).toContain('limit');
  });

  it('declara el query param estado_lote con el enum EstadoLoteVivero', () => {
    const params = getParameters(fn);
    const estadoParam = params.find((p) => p.in === 'query' && p.name === 'estado_lote');
    expect(estadoParam).toBeDefined();
    // ApiQuery con enum almacena los valores en schema.enum (via addEnumSchema)
    expect(estadoParam?.schema?.enum).toEqual(expect.arrayContaining(Object.values(EstadoLoteVivero)));
  });

  it('declara el query param motivo_cierre con el enum MotivoCierreLote', () => {
    const params = getParameters(fn);
    const motivoParam = params.find((p) => p.in === 'query' && p.name === 'motivo_cierre');
    expect(motivoParam).toBeDefined();
    expect(motivoParam?.schema?.enum).toEqual(expect.arrayContaining(Object.values(MotivoCierreLote)));
  });

  it('declara los query params de filtro: vivero_id, recoleccion_id, lote_vivero_id, fecha_inicio, fecha_fin, q', () => {
    const params = getParameters(fn);
    const queryNames = params.filter((p) => p.in === 'query').map((p) => p.name);
    expect(queryNames).toEqual(
      expect.arrayContaining([
        'vivero_id',
        'recoleccion_id',
        'lote_vivero_id',
        'fecha_inicio',
        'fecha_fin',
        'q',
      ]),
    );
  });

  it('expone los codigos de respuesta 200, 400 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([200, 400, 500]));
  });
});

// ---------------------------------------------------------------------------
// GET /lotes-vivero/:id/timeline
// ---------------------------------------------------------------------------

describe('ApiObtenerTimeline', () => {
  let fn: Function;

  beforeEach(() => {
    fn = applyMethodDecorator(ApiObtenerTimeline());
  });

  it('define summary correcto en ApiOperation', () => {
    const op = getOperation(fn);
    expect(op?.summary).toBe('Obtener timeline de eventos del lote');
  });

  it('declara el parametro de ruta :id', () => {
    const params = getParameters(fn);
    expect(params.find((p) => p.in === 'path' && p.name === 'id')).toBeDefined();
  });

  it('declara el query param tipo_evento con el enum TipoEventoVivero', () => {
    const params = getParameters(fn);
    const tipoParam = params.find((p) => p.in === 'query' && p.name === 'tipo_evento');
    expect(tipoParam).toBeDefined();
    // ApiQuery con enum almacena los valores en schema.enum (via addEnumSchema)
    expect(tipoParam?.schema?.enum).toEqual(expect.arrayContaining(Object.values(TipoEventoVivero)));
  });

  it('declara los query params de filtro: responsable_id, fecha_inicio, fecha_fin', () => {
    const params = getParameters(fn);
    const queryNames = params.filter((p) => p.in === 'query').map((p) => p.name);
    expect(queryNames).toEqual(
      expect.arrayContaining(['responsable_id', 'fecha_inicio', 'fecha_fin']),
    );
  });

  it('expone los codigos de respuesta 200, 400, 404 y 500', () => {
    expect(getStatusCodes(fn)).toEqual(expect.arrayContaining([200, 400, 404, 500]));
  });
});
