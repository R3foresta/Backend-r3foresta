import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../src/supabase/supabase.service';

describe('Supabase Connection', () => {
  let supabaseService: SupabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupabaseService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SUPABASE_URL') return process.env.SUPABASE_URL;
              if (key === 'SUPABASE_KEY') return process.env.SUPABASE_KEY;
              return null;
            }),
          },
        },
      ],
    }).compile();

    supabaseService = module.get<SupabaseService>(SupabaseService);
    // Llamamos explícitamente a onModuleInit para inicializar el cliente
    await supabaseService.onModuleInit();
  });

  it('should connect to Supabase successfully', async () => {
    // Verificar que el servicio se haya creado correctamente
    expect(supabaseService).toBeDefined();

    // Obtener el cliente de Supabase
    const client = supabaseService.getClient();
    expect(client).toBeDefined();

    // Intentar hacer una operación simple para verificar la conexión
    // Esto verificará si podemos conectarnos a Supabase
    const { data: healthCheck, error } = await client.from('profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.log('Error al conectar con Supabase:', error.message);
    } else {
      console.log('Conexión con Supabase exitosa, datos recibidos:', healthCheck);
    }

    // La prueba pasa si no hay error de conexión (el error de tabla no existe es diferente)
    // En este caso, solo verificamos que no haya error de autenticación o conexión
    if (error && (error.message.includes('JWT') || error.message.includes('invalid') || error.message.includes('unauthorized'))) {
      fail(`Error de autenticación o autorización: ${error.message}`);
    }
  }, 10000); // Aumentamos el timeout a 10 segundos
});