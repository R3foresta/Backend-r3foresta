import { ImpactImagenController } from './impact-imagen.controller';
import { ParticipacionImagenService } from '../participacion/cargas/participacion-imagen.service';
import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImpactController } from './impact.controller';
import { ImpactService } from './impact.service';

@Module({
  imports: [SupabaseModule],
  controllers: [ImpactController, ImpactImagenController],
  providers: [ImpactService, ParticipacionImagenService],
})
export class ImpactModule {}
