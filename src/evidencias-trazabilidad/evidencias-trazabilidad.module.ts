import { ViveroAccesoModule } from '../lotes-vivero/vivero-acceso.module';
import { RecoleccionesModule } from '../recolecciones/recolecciones.module';
import { ActorModule } from '../auth/actor.module';
import { Module } from '@nestjs/common';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { EvidenciasTrazabilidadController } from './evidencias-trazabilidad.controller';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';

@Module({
  imports: [
    ActorModule,
    SupabaseModule,
    RecoleccionesModule,
    ViveroAccesoModule,
  ],
  controllers: [EvidenciasTrazabilidadController],
  providers: [EvidenciasTrazabilidadService, EvidenceFileService],
  exports: [EvidenciasTrazabilidadService],
})
export class EvidenciasTrazabilidadModule {}
