import { Module } from '@nestjs/common';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { EvidenciasTrazabilidadController } from './evidencias-trazabilidad.controller';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';

@Module({
  imports: [SupabaseModule],
  controllers: [EvidenciasTrazabilidadController],
  providers: [EvidenciasTrazabilidadService, EvidenceFileService],
  exports: [EvidenciasTrazabilidadService],
})
export class EvidenciasTrazabilidadModule {}
