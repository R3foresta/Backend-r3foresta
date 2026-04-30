import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { LotesViveroController } from './api/lotes-vivero.controller';
import { LotesViveroService } from './application/lotes-vivero.service';
import { ViveroAuthService } from './application/vivero-auth.service';
import { ViveroCodigosService } from './application/vivero-codigos.service';
import { ViveroConsultasService } from './application/vivero-consultas.service';
import { ViveroEmbolsadoService } from './application/vivero-embolsado.service';
import { ViveroEventosService } from './application/vivero-eventos.service';
import { ViveroEvidenciasService } from './application/vivero-evidencias.service';
import { ViveroInicioService } from './application/vivero-inicio.service';
import { ViveroSnapshotsService } from './application/vivero-snapshots.service';

@Module({
  imports: [SupabaseModule],
  controllers: [LotesViveroController],
  providers: [
    LotesViveroService,
    ViveroAuthService,
    ViveroCodigosService,
    ViveroConsultasService,
    ViveroEmbolsadoService,
    ViveroEventosService,
    ViveroEvidenciasService,
    ViveroInicioService,
    ViveroSnapshotsService,
  ],
  exports: [LotesViveroService],
})
export class LotesViveroModule {}
