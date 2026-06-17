import { Module } from '@nestjs/common';
import { EvidenceFileService } from '../common/files/evidence-file.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { LotesViveroController } from './api/lotes-vivero.controller';
import { LotesViveroService } from './application/lotes-vivero.service';
import { ViveroAdaptabilidadService } from './application/vivero-adaptabilidad.service';
import { ViveroAsignacionesService } from './application/vivero-asignaciones.service';
import { ViveroAuthService } from './application/vivero-auth.service';
import { ViveroCodigosService } from './application/vivero-codigos.service';
import { ViveroConsultasService } from './application/vivero-consultas.service';
import { ViveroDespachoService } from './application/vivero-despacho.service';
import { ViveroEmbolsadoService } from './application/vivero-embolsado.service';
import { ViveroEventosService } from './application/vivero-eventos.service';
import { ViveroEvidenciasService } from './application/vivero-evidencias.service';
import { ViveroInicioService } from './application/vivero-inicio.service';
import { ViveroMermaService } from './application/vivero-merma.service';
import { ViveroSaldosService } from './application/vivero-saldos.service';
import { ViveroSnapshotsService } from './application/vivero-snapshots.service';
import { ViveroTimelineService } from './application/vivero-timeline.service';

@Module({
  imports: [SupabaseModule],
  controllers: [LotesViveroController],
  providers: [
    LotesViveroService,
    EvidenceFileService,
    ViveroAdaptabilidadService,
    ViveroAsignacionesService,
    ViveroAuthService,
    ViveroCodigosService,
    ViveroConsultasService,
    ViveroDespachoService,
    ViveroEmbolsadoService,
    ViveroEventosService,
    ViveroEvidenciasService,
    ViveroInicioService,
    ViveroMermaService,
    ViveroSaldosService,
    ViveroSnapshotsService,
    ViveroTimelineService,
  ],
  exports: [LotesViveroService],
})
export class LotesViveroModule {}
