import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { EvidenciasTrazabilidadController } from './evidencias-trazabilidad.controller';
import { EvidenciasTrazabilidadService } from './evidencias-trazabilidad.service';

@Module({
  imports: [SupabaseModule],
  controllers: [EvidenciasTrazabilidadController],
  providers: [EvidenciasTrazabilidadService],
  exports: [EvidenciasTrazabilidadService],
})
export class EvidenciasTrazabilidadModule {}

