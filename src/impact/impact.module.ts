import { ImpactImagenController } from './impact-imagen.controller';
import { ParticipacionImagenService } from '../participacion/cargas/participacion-imagen.service';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImpactController } from './impact.controller';
import { ImpactService } from './impact.service';
import { ActorModule } from '../auth/actor.module';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import {
  ImpactoConsultaController,
  MisRegistrosController,
} from './impact-consulta.controller';
import { ImpactoConsultaService } from './application/impacto-consulta.service';
import { ImpactoImagenPropiaService } from './application/impacto-imagen-propia.service';
import { SeedBankModule } from './seed-bank/seed-bank.module';

@Module({
  imports: [SupabaseModule, ActorModule, SeedBankModule],
  controllers: [
    ImpactController,
    ImpactImagenController,
    ImpactoConsultaController,
    MisRegistrosController,
  ],
  providers: [
    ImpactService,
    ParticipacionImagenService,
    ImpactoConsultaService,
    ImpactoImagenPropiaService,
    VerifiedActorGuard,
  ],
})
export class ImpactModule {}
