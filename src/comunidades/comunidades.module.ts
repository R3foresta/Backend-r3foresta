import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ComunidadesController } from './comunidades.controller';
import { ComunidadesService } from './comunidades.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ComunidadesController],
  providers: [ComunidadesService],
  exports: [ComunidadesService],
})
export class ComunidadesModule {}
