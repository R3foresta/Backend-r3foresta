import { Module } from '@nestjs/common';
import { PlantasService } from './plantas.service';
import { PlantasController } from './plantas.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [PlantasController],
  providers: [PlantasService],
  exports: [PlantasService],
})
export class PlantasModule {}
