import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BlockchainService } from '../blockchain/blockchain.service';
import { UbicacionesReadService } from '../common/ubicaciones/ubicaciones-read.service';
import { PinataService } from '../pinata/pinata.service';
import { PlantasService } from '../plantas/plantas.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RecoleccionElegibilidadService } from './recoleccion-elegibilidad.service';
import { RecoleccionHistorialService } from './recoleccion-historial.service';
import { RecoleccionSnapshotsService } from './recoleccion-snapshots.service';
import { RecoleccionesService } from './recolecciones.service';

/**
 * FUNCIÓN HELPER: Crea un mock de QueryBuilder
 * 
 * En Supabase/PostgreSQL, los query builders son objetos que tienen métodos encadenables
 * (patrón builder pattern). Este helper simula ese comportamiento con Jest mocks.
 * 
 * Por ejemplo, en el código real harías:
 *   supabase
 *     .from('recoleccion')
 *     .select('*')           <- select() devuelve this (chainable)
 *     .eq('id', 9)           <- eq() devuelve this (chainable)
 *     .single()              <- single() devuelve una Promise
 * 
 * Cada método que termina en () y devuelve this() permite encadenar.
 */
function createQueryBuilder(result: {
  data: any;
  error: any;
  count?: number | null;
}) {
  const builder: any = {
    // Métodos que devuelven 'this' (permitir encadenamiento)
    select: jest.fn().mockReturnThis(),        // .select('*')
    eq: jest.fn().mockReturnThis(),            // .eq('id', 9)
    gte: jest.fn().mockReturnThis(),           // .gte('fecha', '2024-01-01') - mayor o igual
    lte: jest.fn().mockReturnThis(),           // .lte('fecha', '2024-12-31') - menor o igual
    in: jest.fn().mockReturnThis(),            // .in('estado', ['ABIERTO', 'CERRADO'])
    is: jest.fn().mockReturnThis(),            // .is('campo', null)
    not: jest.fn().mockReturnThis(),           // .not('estado', 'eq', 'BORRADOR')
    or: jest.fn().mockReturnThis(),            // .or('id.eq.1,id.eq.2')
    order: jest.fn().mockReturnThis(),         // .order('fecha', { ascending: false })
    range: jest.fn().mockReturnThis(),         // .range(0, 9) - para paginación
    
    // Métodos que devuelven Promise (terminan la cadena)
    single: jest.fn().mockResolvedValue(result),  // Espera UN resultado
    
    // Implementar la interface thenable/Promise para compatibilidad
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}

/**
 * describe() es el bloque principal que agrupa todos los tests de un servicio
 * Estructura típica:
 *   describe('NombreServicio') {
 *     - beforeEach: se ejecuta ANTES de CADA test
 *     - it(): cada test individual
 *   }
 */
describe('RecoleccionesService', () => {
  // Variables que usaremos en los tests
  let service: RecoleccionesService;
  let supabaseService: { getClient: jest.Mock };
  let ubicacionesReadService: { getUbicacionesByIds: jest.Mock };

  /**
   * beforeEach() se ejecuta ANTES de cada test (it())
   * Aquí configuramos los mocks y el módulo de testing
   */
  beforeEach(async () => {
    // 1. CREAR MOCKS de las dependencias
    // Un mock es un doble de una clase real que controlas en los tests
    
    supabaseService = {
      // jest.fn() crea una función que puedes monitorear
      // .mockReturnValue() establece qué devuelve cuando se llama
      getClient: jest.fn(),
    };
    
    ubicacionesReadService = {
      // .mockResolvedValue() devuelve una Promise resuelta (para funciones async)
      getUbicacionesByIds: jest.fn().mockResolvedValue(new Map()),
    };

    /**
     * 2. CREAR EL MÓDULO DE TESTING (como un módulo NestJS minimizado)
     * 
     * Test.createTestingModule() es el equivalente a NestModule para tests
     * Aquí declaramos:
     * - providers: servicios que el test necesita
     * - useValue: reemplaza el servicio real con un mock
     */
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // Servicios REALES que queremos probar
        RecoleccionesService,
        RecoleccionElegibilidadService,
        RecoleccionHistorialService,
        RecoleccionSnapshotsService,
        
        // MOCKS de dependencias externas
        // Formato: { provide: ClaseReal, useValue: MockObject }
        {
          provide: SupabaseService,
          useValue: supabaseService,  // Usa nuestro mock en lugar del real
        },
        {
          provide: PinataService,
          useValue: {},               // Mock vacío, no se usa en estos tests
        },
        {
          provide: BlockchainService,
          useValue: {},               // Mock vacío, no se usa en estos tests
        },
        {
          provide: UbicacionesReadService,
          useValue: ubicacionesReadService,
        },
        {
          provide: PlantasService,
          useValue: {},
        },
      ],
    }).compile();  // .compile() crea la instancia del módulo

    // 3. OBTENER la instancia del servicio que queremos probar
    service = module.get(RecoleccionesService);
  });

  /**
   * TEST 1: Verifica que el SELECT SQL incluya campos canónicos sin aliases incorrectos
   * 
   * QUÉ PRUEBA:
   * - Que el método getCanonicalRecoleccionSelect() genere un SQL correcto
   * - Que NO tenga aliases legacy (como 'cantidad:cantidad_inicial_canonica')
   * 
   * PATRÓN: Test SIN mocks de Supabase (solo verifica lógica interna)
   */
  it('proyecta columnas canonicas sin aliases legacy de cantidad/unidad', () => {
    // Llamar el método privado del servicio (usamos 'as any' para acceder a privados)
    const select = (service as any).getCanonicalRecoleccionSelect() as string;

    // expect() es la función de aserción de Jest
    // Aquí verificamos que el string contiene ciertos campos
    expect(select).toContain('cantidad_inicial_canonica');
    expect(select).toContain('unidad_canonica');
    expect(select).toContain('blockchain_hash_validacion');
    expect(select).toContain('nombre_cientifico_snapshot');
    expect(select).toContain('nombre_comercial_snapshot');
    expect(select).toContain('variedad_snapshot');
    expect(select).toContain('nombre_comunidad_snapshot');
    expect(select).toContain('nombre_recolector_snapshot');
    
    // Verificar que NO tenga aliases incorrectos
    expect(select).not.toContain('cantidad:cantidad_inicial_canonica');
    expect(select).not.toContain('unidad:unidad_canonica');
  });

  /**
   * TEST 1.1: Verifica la regla RF-REC-01 sobre unidades oficiales.
   *
   * REQUERIMIENTO:
   * - El frontend puede mandar "kg", "g" o "unidad".
   * - El backend solo debe persistir "G" o "UNIDAD".
   * - "kg" existe solo como input y debe convertirse a gramos.
   *
   * POR QUÉ USAMOS EL MÉTODO PRIVADO:
   * - Esta regla vive dentro de la normalización interna del servicio.
   * - Probarla aquí permite ver el contrato sin armar todo un flujo create()
   *   con mocks de usuario, vivero, planta, ubicación, storage y evidencias.
   */
  it('normaliza kg/g/unidad a unidades canonicas persistibles', () => {
    // Caso 1: 2.5 kg de semilla deben persistirse como 2500 G.
    // Importante: la unidad final NO es KG, porque KG no se guarda en DB.
    const semillaEnKg = (service as any).normalizeAndValidateCantidadYUnidad(
      2.5,
      'kg',
      'SEMILLA',
    );

    expect(semillaEnKg).toEqual({
      unidad_canonica: 'G',
      cantidad_canonica: 2500,
    });

    // Caso 2: 125.75 g de semilla ya está en la unidad oficial de peso.
    // La cantidad puede tener decimales porque SEMILLA por peso permite gramos.
    const semillaEnGramos = (service as any).normalizeAndValidateCantidadYUnidad(
      125.75,
      'g',
      'SEMILLA',
    );

    expect(semillaEnGramos).toEqual({
      unidad_canonica: 'G',
      cantidad_canonica: 125.75,
    });

    // Caso 3: 12 unidades de semilla deben persistirse como UNIDAD.
    // Para UNIDAD la cantidad debe ser entera, porque representa conteo.
    const semillaEnUnidades = (service as any).normalizeAndValidateCantidadYUnidad(
      12,
      'unidad',
      'SEMILLA',
    );

    expect(semillaEnUnidades).toEqual({
      unidad_canonica: 'UNIDAD',
      cantidad_canonica: 12,
    });
  });

  /**
   * TEST 1.2: Verifica restricciones especiales de ESQUEJE y conteo entero.
   *
   * REQUERIMIENTO:
   * - ESQUEJE solo admite UNIDAD.
   * - Cualquier captura en UNIDAD debe ser un número entero.
   */
  it('rechaza esqueje por peso y cantidades decimales cuando la unidad es UNIDAD', () => {
    // ESQUEJE no puede registrarse por peso. Si alguien manda G o KG,
    // el servicio debe cortar antes de persistir datos inválidos.
    expect(() =>
      (service as any).normalizeAndValidateCantidadYUnidad(10, 'g', 'ESQUEJE'),
    ).toThrow(BadRequestException);

    // UNIDAD representa conteo. 3.5 unidades no tiene sentido inventariable,
    // así que debe rechazarse para SEMILLA y también para ESQUEJE.
    expect(() =>
      (service as any).normalizeAndValidateCantidadYUnidad(
        3.5,
        'unidad',
        'SEMILLA',
      ),
    ).toThrow(BadRequestException);
  });

  /**
   * TEST 2: Verifica que findOne() retorna recolección con elegibilidad evaluada
   * 
   * QUÉ PRUEBA:
   * - Que el método findOne(id, cantidadSolicitada) devuelve datos completos
   * - Que prioriza snapshots sobre datos base de la tabla planta
   * - Que calcula elegibilidad (false porque no hay saldo suficiente)
   * 
   * PATRÓN: Test CON mocks de Supabase (integración con BD)
   */
  it('incluye elegibilidad y prioriza snapshots en el detalle de recoleccion', async () => {
    // 1. PREPARAR MOCKS (Arrange)
    
    // Mock del query a la tabla 'recoleccion'
    // Este es el objeto que Supabase devolvería cuando haces:
    //   supabase.from('recoleccion').select(...).eq('id', 9).single()
    const recoleccionQuery = createQueryBuilder({
      data: {
        id: 9,
        estado_registro: 'VALIDADO',      // Recolección está validada
        estado_operativo: 'ABIERTO',      // Todavía abierta para operaciones
        saldo_actual: 40,                 // Pero solo quedan 40 unidades
        cantidad_inicial_canonica: 50,    // Se recolectaron 50 inicialmente
        planta_id: 12,
        
        // SNAPSHOTS (datos congelados en el momento de la recolección)
        // El servicio PRIORIZA estos sobre los datos base
        nombre_cientifico_snapshot: 'Swietenia macrophylla snapshot',
        nombre_comercial_snapshot: 'Mara snapshot',
        variedad_snapshot: 'Tardía',
        
        // Datos BASE (podrían estar desactualizados)
        planta: {
          nombre_cientifico: 'Swietenia macrophylla',
          nombre_comun_principal: 'Mara',
          variedad: 'Común',  // Diferente del snapshot!
        },
      },
      error: null,
    });
    
    // Mock del query a la tabla 'evidencias_trazabilidad'
    const evidenciasQuery = createQueryBuilder({
      data: [],  // Sin evidencias en este test
      error: null,
    });

    // 2. CONFIGURAR EL CLIENTE MOCK
    const client = {
      // from() es el método que selecciona qué tabla consultar
      from: jest.fn((table: string) => {
        // Devolver el mock correspondiente según la tabla
        if (table === 'recoleccion') {
          return recoleccionQuery;
        }

        if (table === 'evidencias_trazabilidad') {
          return evidenciasQuery;
        }

        throw new Error(`Tabla no esperada en test: ${table}`);
      }),
      
      // Mock del storage de Supabase (para obtener URLs de imágenes)
      storage: {
        from: jest.fn(() => ({
          getPublicUrl: jest.fn(() => ({
            data: { publicUrl: 'https://example.test/evidencia.jpg' },
          })),
        })),
      },
    };

    // Hacer que supabaseService.getClient() devuelva nuestro cliente mock
    supabaseService.getClient.mockReturnValue(client);

    // 3. EJECUTAR (Act)
    // Llamar findOne con id=9 y cantidad solicitada=45 unidades (pero solo hay 40)
    const response = await service.findOne(9, 45);

    // 4. VERIFICAR (Assert)
    
    // Verificar que devuelve los datos correctos
    expect(response.data.saldo_actual).toBe(40);
    expect(response.data.estado_operativo).toBe('ABIERTO');
    
    // Verificar que PRIORIZA snapshots (no usa datos de la tabla planta)
    expect(response.data.nombre_cientifico).toBe(
      'Swietenia macrophylla snapshot',  // Viene del snapshot, no del planta.nombre_cientifico
    );
    expect(response.data.nombre_comercial).toBe('Mara snapshot');
    expect(response.data.variedad).toBe('Tardía');  // Del snapshot, no 'Común'
    
    // Verificar elegibilidad: NO ES ELEGIBLE porque pidió 45 pero solo hay 40
    expect(response.data.elegible_para_vivero).toBe(false);
    expect(response.data.motivo_no_elegibilidad_para_vivero).toBe(
      'La recoleccion no tiene saldo suficiente para la cantidad solicitada.',
    );
    expect(response.data.cantidad_solicitada_vivero_evaluada).toBe(45);
  });

  /**
   * TEST 3: Verifica que findByVivero() lista recolecciones sin filtros estrictos
   * 
   * QUÉ PRUEBA:
   * - Que el método lista recolecciones para un vivero específico
   * - Que NO filtra obligatoriamente por estado_registro='VALIDADO'
   *   (solo filtra en elegibilidad, no en la query)
   * - Que calcula elegibilidad para cada recolección
   * 
   * PATRÓN: Test con paginación y múltiples resultados
   */
  it('lista recolecciones por vivero sin depender de token_id y expone elegibilidad operativa', async () => {
    // 1. PREPARAR MOCKS (Arrange)
    
    // Mock del query a 'vivero' (para verificar que existe)
    const viveroQuery = createQueryBuilder({
      data: { id: 3 },
      error: null,
    });
    
    // Mock del query a 'recoleccion' (devuelve 2 recolecciones)
    const recoleccionesQuery = createQueryBuilder({
      data: [
        {
          id: 1,
          vivero_id: 3,
          estado_registro: 'BORRADOR',      // ⚠️ NO VALIDADA
          estado_operativo: 'ABIERTO',
          saldo_actual: 20,
          cantidad_inicial_canonica: 20,
          planta_id: 5,
          planta: {
            nombre_cientifico: 'Cedrela odorata',
            nombre_comun_principal: 'Cedro',
          },
        },
        {
          id: 2,
          vivero_id: 3,
          estado_registro: 'VALIDADO',      // ✅ VALIDADA
          estado_operativo: 'ABIERTO',
          saldo_actual: 20,
          cantidad_inicial_canonica: 20,
          planta_id: 6,
          planta: {
            nombre_cientifico: 'Ceiba speciosa',
            nombre_comun_principal: 'Toborochi',
          },
        },
      ],
      error: null,
      count: 2,  // Para paginación (total de resultados)
    });
    
    const evidenciasQuery = createQueryBuilder({
      data: [],
      error: null,
      count: 0,
    });

    // 2. CONFIGURAR CLIENTE MOCK
    const client = {
      from: jest.fn((table: string) => {
        if (table === 'vivero') {
          return viveroQuery;
        }

        if (table === 'recoleccion') {
          return recoleccionesQuery;
        }

        if (table === 'evidencias_trazabilidad') {
          return evidenciasQuery;
        }

        throw new Error(`Tabla no esperada en test: ${table}`);
      }),
      storage: {
        from: jest.fn(() => ({
          getPublicUrl: jest.fn(() => ({
            data: { publicUrl: 'https://example.test/evidencia.jpg' },
          })),
        })),
      },
    };

    supabaseService.getClient.mockReturnValue(client);

    // 3. EJECUTAR (Act)
    // Listar recolecciones del vivero 3, página 1, 10 por página
    // Evaluando elegibilidad para una solicitud de 10 unidades
    const response = await service.findByVivero(3, {
      page: 1,
      limit: 10,
      cantidad_solicitada_vivero: 10,
    });

    // 4. VERIFICAR (Assert)
    
    // Verificar que NO filtra por estado_registro en el query
    // (el filtro es DESPUÉS en la evaluación de elegibilidad)
    expect(recoleccionesQuery.not).not.toHaveBeenCalled();
    expect(recoleccionesQuery.eq).not.toHaveBeenCalledWith(
      'estado_registro',
      'VALIDADO',
    );
    
    // Verificar que devuelve ambas recolecciones
    expect(response.data).toHaveLength(2);
    
    // RECOLECCIÓN 1: NO ELEGIBLE (estado BORRADOR)
    expect(response.data[0].elegible_para_vivero).toBe(false);
    expect(response.data[0].motivo_no_elegibilidad_para_vivero).toBe(
      'La recoleccion no esta validada.',  // Motivo: no está validada aún
    );
    
    // RECOLECCIÓN 2: ELEGIBLE (estado VALIDADO + saldo suficiente)
    expect(response.data[1].elegible_para_vivero).toBe(true);
    expect(response.data[1].cantidad_solicitada_vivero_evaluada).toBe(10);
  });
});
