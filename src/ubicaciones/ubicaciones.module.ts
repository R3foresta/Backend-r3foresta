import { ActorModule } from '../auth/actor.module';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { UbicacionesController } from './ubicaciones.controller';
import { UbicacionesService } from './ubicaciones.service';

@Module({
  imports: [ActorModule, SupabaseModule],
  controllers: [UbicacionesController],
  providers: [UbicacionesService],
  exports: [UbicacionesService],
})
export class UbicacionesModule {}
