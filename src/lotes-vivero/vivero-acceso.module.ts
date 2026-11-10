import { Module } from '@nestjs/common';
import { ActorModule } from '../auth/actor.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ViveroAuthService } from './application/vivero-auth.service';
import { ViveroAccesosService } from './application/vivero-accesos.service';
import { ViveroAccesosController } from './api/vivero-accesos.controller';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { ViveroConciliacionService } from './application/vivero-conciliacion.service';
import { ViveroConciliacionController } from './api/vivero-conciliacion.controller';
@Module({
  imports: [ActorModule, SupabaseModule],
  controllers: [ViveroAccesosController, ViveroConciliacionController],
  providers: [
    ViveroAuthService,
    ViveroAccesosService,
    ViveroConciliacionService,
    EvidenceFileService,
  ],
  exports: [ViveroAuthService],
})
export class ViveroAccesoModule {}
