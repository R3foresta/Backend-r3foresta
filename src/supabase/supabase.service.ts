import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;
  private supabaseAdmin: SupabaseClient | undefined;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    const supabaseServiceKey = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        '❌ SUPABASE_URL y SUPABASE_KEY deben estar configurados en .env',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    if (supabaseServiceKey?.trim()) {
      this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    } else {
      this.supabaseAdmin = undefined;
    }

    console.log('✅ Supabase client inicializado correctamente');
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  getAdminClient(): SupabaseClient {
    if (!this.supabaseAdmin) {
      throw new InternalServerErrorException(
        'SUPABASE_SERVICE_ROLE_KEY no está configurado para las operaciones administrativas.',
      );
    }
    return this.supabaseAdmin;
  }
}
