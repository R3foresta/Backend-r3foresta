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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
