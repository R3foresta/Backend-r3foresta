import { Module } from '@nestjs/common';
import { LotesFaseViveroService } from './lotes-fase-vivero.service';
import { LotesFaseViveroController } from './lotes-fase-vivero.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [LotesFaseViveroController],
  providers: [LotesFaseViveroService],
  exports: [LotesFaseViveroService],
})
export class LotesFaseViveroModule {}
