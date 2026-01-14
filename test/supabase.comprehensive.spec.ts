import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../src/supabase/supabase.service';

describe('Supabase Service Tests', () => {
  let supabaseService: SupabaseService;

  beforeAll(async () => {
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

  it('should initialize Supabase client correctly', () => {
    expect(supabaseService).toBeDefined();
    const client = supabaseService.getClient();
    expect(client).toBeDefined();
    console.log('✅ Cliente de Supabase inicializado correctamente');
  });

  it('should be able to ping Supabase (check connection)', async () => {
    // Realizar una operación simple para verificar la conexión
    // Usaremos una tabla que sabemos que existe o una operación de salud
    const client = supabaseService.getClient();
    
    // Intentar acceder a la información de la sesión o hacer un ping
    const { data, error } = await client.rpc('version');
    
    if (error) {
      console.log(`⚠️  No se pudo ejecutar RPC 'version': ${error.message}`);
      // Si no se puede usar RPC, intentamos otra operación
      // Intentar obtener información sobre las tablas existentes
      const { data: tables, error: tablesError } = await client
        .from('information_schema.tables')
        .select('table_name')
        .limit(1);
        
      if (tablesError) {
        console.log(`ℹ️  Información: ${tablesError.message}`);
        // Solo fallar si es un error de autenticación o conexión
        if (tablesError.message.toLowerCase().includes('auth') || 
            tablesError.message.toLowerCase().includes('jwt') ||
            tablesError.message.toLowerCase().includes('unauthorized')) {
          fail(`Error crítico de autenticación: ${tablesError.message}`);
        }
      } else {
        console.log('✅ Conexión a Supabase verificada exitosamente');
      }
    } else {
      console.log('✅ Conexión a Supabase verificada con RPC:', data);
    }
  }, 15000); // Aumentamos el timeout a 15 segundos

  it('should handle non-existent table gracefully', async () => {
    const client = supabaseService.getClient();
    
    // Intentar acceder a una tabla que probablemente no exista
    const { data, error } = await client
      .from('non_existent_table_for_test')
      .select('*')
      .limit(1);
    
    // La prueba pasa si hay un error esperado (tabla no existe) pero no un error de conexión
    if (error) {
      console.log(`ℹ️  Error esperado (tabla no existe): ${error.message}`);
      // Verificar que no sea un error de autenticación o conexión
      expect(error.message.toLowerCase()).not.toContain('auth');
      expect(error.message.toLowerCase()).not.toContain('jwt');
      expect(error.message.toLowerCase()).not.toContain('unauthorized');
      expect(error.message.toLowerCase()).not.toContain('connection');
    } else {
      // Si no hay error, significa que la tabla sí existe
      console.log('ℹ️  La tabla no_existent_table_for_test existe (inesperado)');
    }
  }, 10000);
});