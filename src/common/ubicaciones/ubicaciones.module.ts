import { Module } from '@nestjs/common';
import { UbicacionesReadService } from './ubicaciones-read.service';

@Module({
  providers: [UbicacionesReadService],
  exports: [UbicacionesReadService],
})
export class UbicacionesModule {}
