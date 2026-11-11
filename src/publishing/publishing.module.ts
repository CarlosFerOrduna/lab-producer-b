import { Module } from '@nestjs/common';
import { PUBLISHING } from './constants/publishing.constant';
import { KafkaEventPublisher } from './kafka-event-publisher.service';
import { KafkaStartupService } from './kafka-startup.service';

@Module({
  providers: [
    KafkaEventPublisher,
    // El mismo publisher detrás de la interfaz: el worker no sabe que es Kafka, el arranque sí.
    { provide: PUBLISHING.eventPublisherToken, useExisting: KafkaEventPublisher },
    KafkaStartupService,
  ],
  exports: [PUBLISHING.eventPublisherToken, KafkaStartupService],
})
export class PublishingModule {}
