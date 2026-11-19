import { Module } from '@nestjs/common';
import { ActorModule } from '../auth/actor.module';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [ActorModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
