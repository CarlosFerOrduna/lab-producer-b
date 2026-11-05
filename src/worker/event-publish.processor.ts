import { Inject, Injectable } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { PUBLISHING } from '../publishing/constants/publishing.constant';
import { EventRejectedError } from '../publishing/event-rejected.error';
import type { EventPublisher } from '../publishing/types/event-publisher.type';
import { PublishedEvent } from '../publishing/types/published-event.type';

/** Handles one queued event: publishes it, and never retries an event the processor rejected. */
@Injectable()
export class EventPublishProcessor {
  constructor(@Inject(PUBLISHING.eventPublisherToken) private readonly eventPublisher: EventPublisher) {}

  async process(job: Job<PublishedEvent>): Promise<void> {
    try {
      await this.eventPublisher.publish(job.data);
    } catch (error) {
      if (error instanceof EventRejectedError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
