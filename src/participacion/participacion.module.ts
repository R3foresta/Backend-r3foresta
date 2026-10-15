import { Module } from '@nestjs/common';
import { ActorModule } from '../auth/actor.module';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { ParticipacionComandosController } from './participacion-comandos.controller';
import { ParticipacionComandosService } from './participacion-comandos.service';
import { ParticipacionLecturasController } from './participacion-lecturas.controller';
import { ParticipacionLecturasService } from './participacion-lecturas.service';

@Module({
  imports: [ActorModule],
  controllers: [
    ParticipacionComandosController,
    ParticipacionLecturasController,
  ],
  providers: [
    VerifiedActorGuard,
    ParticipacionComandosService,
    ParticipacionLecturasService,
  ],
})
export class ParticipacionModule {}
