import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PlantacionesController } from './api/plantaciones.controller';
import { PlantacionAuthService } from './application/plantacion-auth.service';
import { PlantacionCreationService } from './application/plantacion-creation.service';
import { PlantacionEvidenciasService } from './application/plantacion-evidencias.service';
import { PlantacionesService } from './application/plantaciones.service';

@Module({
  imports: [SupabaseModule],
  controllers: [PlantacionesController],
  providers: [
    PlantacionesService,
    PlantacionAuthService,
    PlantacionCreationService,
    PlantacionEvidenciasService,
  ],
  exports: [PlantacionesService],
})
export class PlantacionesModule {}
