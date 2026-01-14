import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('test-db')
  async testDbConnection() {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('recolecciones')
        .select('id')
        .limit(1);

      if (error) {
        throw error;
      }

      return { success: true, message: '¡Conexión a Supabase exitosa!', data };
    } catch (error) {
      console.error('Error connecting to Supabase:', error);
      return {
        success: false,
        message: 'Error al conectar con Supabase.',
        error: error.message,
      };
    }
  }
}
