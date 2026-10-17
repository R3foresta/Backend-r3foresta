import { ActorModule } from '../auth/actor.module';
import { Module } from '@nestjs/common';
import { PinataController } from './pinata.controller';
import { PinataService } from './pinata.service';

@Module({
  imports: [ActorModule],
  controllers: [PinataController],
  providers: [PinataService],
  exports: [PinataService],
})
export class PinataModule {}
