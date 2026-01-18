import { Module } from '@nestjs/common';
import { PingrepetController } from './pingrepet.controller';

@Module({
  controllers: [PingrepetController],
})
export class PingrepetModule {}
