import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../supabase/supabase.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { PinataService } from '../pinata/pinata.service';
import { CampaniasModule } from '../campanias/campanias.module';
import { SubcampaniasModule } from '../subcampanias/subcampanias.module';
import { OrganizacionesModule } from '../organizaciones/organizaciones.module';
import { PlantacionesModule } from '../plantaciones/plantaciones.module';
import { LotesViveroModule } from '../lotes-vivero/lotes-vivero.module';
import { RecoleccionesModule } from '../recolecciones/recolecciones.module';
import { EvidenciasTrazabilidadModule } from '../evidencias-trazabilidad/evidencias-trazabilidad.module';
import { InternalActorGuard } from './internal-actor.guard';

it('arranca los siete módulos privados con dependencias reales del guard sin .env ni red', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({ JWT_SECRET: 'isolated-module-test' })],
      }),
      CampaniasModule,
      SubcampaniasModule,
      OrganizacionesModule,
      PlantacionesModule,
      LotesViveroModule,
      RecoleccionesModule,
      EvidenciasTrazabilidadModule,
    ],
  })
    .overrideProvider(SupabaseService)
    .useValue({})
    .overrideProvider(BlockchainService)
    .useValue({})
    .overrideProvider(PinataService)
    .useValue({})
    .compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    expect(module.get(InternalActorGuard)).toBeDefined();
  } finally {
    await app.close();
  }
});
