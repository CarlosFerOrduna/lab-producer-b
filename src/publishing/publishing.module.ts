import { Module } from '@nestjs/common';
import { PUBLISHING } from './constants/publishing.constant';
import { HttpEventPublisher } from './http-event-publisher.service';

@Module({
  providers: [{ provide: PUBLISHING.eventPublisherToken, useClass: HttpEventPublisher }],
  exports: [PUBLISHING.eventPublisherToken],
})
export class PublishingModule {}
