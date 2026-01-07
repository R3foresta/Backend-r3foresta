import { Module } from '@nestjs/common';
import { RecoleccionesService } from './recolecciones.service';
import { RecoleccionesController } from './recolecciones.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [RecoleccionesController],
  providers: [RecoleccionesService],
  exports: [RecoleccionesService],
})
export class RecoleccionesModule {}
