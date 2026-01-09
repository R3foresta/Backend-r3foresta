import { Module } from '@nestjs/common';
import { RecoleccionesService } from './recolecciones.service';
import { RecoleccionesController } from './recolecciones.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { PinataModule } from '../pinata/pinata.module';

@Module({
  imports: [SupabaseModule, PinataModule],
  controllers: [RecoleccionesController],
  providers: [RecoleccionesService],
  exports: [RecoleccionesService],
})
export class RecoleccionesModule {}
