import { Module } from '@nestjs/common';
import { EventQueueModule } from '../queue/event-queue.module';
import { ReadinessController } from './readiness.controller';

@Module({
  imports: [EventQueueModule],
  controllers: [ReadinessController],
})
export class ReadinessModule {}
