import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        '❌ SUPABASE_URL y SUPABASE_KEY deben estar configurados en .env',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client inicializado correctamente');
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
}
