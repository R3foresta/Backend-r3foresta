import { Module } from '@nestjs/common';
import { ViverosService } from './viveros.service';
import { ViverosController } from './viveros.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { UbicacionesModule } from '../common/ubicaciones/ubicaciones.module';

@Module({
  imports: [SupabaseModule, UbicacionesModule],
  controllers: [ViverosController],
  providers: [ViverosService],
  exports: [ViverosService],
})
export class ViverosModule {}
