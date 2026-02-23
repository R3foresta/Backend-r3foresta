import { Module } from '@nestjs/common';
import { LotesFaseViveroService } from './lotes-fase-vivero.service';
import { LotesFaseViveroController } from './lotes-fase-vivero.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { UbicacionesModule } from '../common/ubicaciones/ubicaciones.module';

@Module({
  imports: [SupabaseModule, UbicacionesModule],
  controllers: [LotesFaseViveroController],
  providers: [LotesFaseViveroService],
  exports: [LotesFaseViveroService],
})
export class LotesFaseViveroModule {}
