import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SupabaseModule } from './supabase/supabase.module';
import { RecoleccionesModule } from './recolecciones/recolecciones.module';
import { ViverosModule } from './viveros/viveros.module';
import { MetodosRecoleccionModule } from './metodos-recoleccion/metodos-recoleccion.module';
import { PlantasModule } from './plantas/plantas.module';
import { PinataModule } from './pinata/pinata.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { PingrepetModule } from './pingrepet/pingrepet.module';
import { UbicacionesModule } from './ubicaciones/ubicaciones.module';
import { ComunidadesModule } from './comunidades/comunidades.module';
import { EvidenciasTrazabilidadModule } from './evidencias-trazabilidad/evidencias-trazabilidad.module';
import { LotesViveroModule } from './lotes-vivero/lotes-vivero.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    AuthModule,
    UsersModule,
    RecoleccionesModule,
    ViverosModule,
    MetodosRecoleccionModule,
    PlantasModule,
    PinataModule,
    BlockchainModule,
    PingrepetModule,
    UbicacionesModule,
    ComunidadesModule,
    EvidenciasTrazabilidadModule,
    LotesViveroModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
