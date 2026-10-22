import { Module } from '@nestjs/common';
import { ActorModule } from '../auth/actor.module';
import { VerifiedActorGuard } from '../auth/verified-actor.guard';
import { ParticipacionComandosController } from './participacion-comandos.controller';
import { ParticipacionComandosService } from './participacion-comandos.service';
import { ParticipacionLecturasController } from './participacion-lecturas.controller';
import { ParticipacionLecturasService } from './participacion-lecturas.service';
import { ParticipacionRegistroController } from './participacion-registro.controller';
import { ParticipacionRegistroService } from './application/participacion-registro.service';
import {
  ParticipacionCargasController,
  ParticipacionFotosPublicasController,
} from './cargas/participacion-cargas.controller';
import { ParticipacionCargasService } from './cargas/participacion-cargas.service';
import { ParticipacionImagenService } from './cargas/participacion-imagen.service';
import { ParticipacionCorreccionesController } from './participacion-correcciones.controller';
import { ParticipacionCorreccionesService } from './application/participacion-correcciones.service';

@Module({
  imports: [ActorModule],
  controllers: [
    ParticipacionComandosController,
    ParticipacionLecturasController,
    ParticipacionRegistroController,
    ParticipacionCorreccionesController,
    ParticipacionCargasController,
    ParticipacionFotosPublicasController,
  ],
  providers: [
    VerifiedActorGuard,
    ParticipacionComandosService,
    ParticipacionLecturasService,
    ParticipacionRegistroService,
    ParticipacionCorreccionesService,
    ParticipacionCargasService,
    ParticipacionImagenService,
  ],
})
export class ParticipacionModule {}
