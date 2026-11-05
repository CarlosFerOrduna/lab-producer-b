import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUBLISHING } from './constants/publishing.constant';
import { EventPublishError } from './event-publish.error';
import { EventRejectedError } from './event-rejected.error';
import { EventPublisher } from './types/event-publisher.type';
import { PublishedEvent } from './types/published-event.type';

/** Publishes an event with POST /events on the processor, in a single attempt. Retries belong to the queue. */
@Injectable()
export class HttpEventPublisher implements EventPublisher {
  private readonly eventsUrl: string;

  constructor(config: ConfigService) {
    this.eventsUrl = new URL('/events', config.getOrThrow<string>('PROCESSOR_URL')).toString();
  }

  async publish(event: PublishedEvent): Promise<void> {
    let response: Response;
    try {
      response = await fetch(this.eventsUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(PUBLISHING.requestTimeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new EventPublishError(`Event ${event.id} did not reach the processor: ${reason}`, { cause: error });
    }

    if (response.ok) {
      return;
    }

    // Un 4xx es un evento mal formado: reintentarlo daría el mismo resultado.
    if (response.status < 500) {
      throw new EventRejectedError(`The processor rejected event ${event.id} with ${response.status}`);
    }
    throw new EventPublishError(`The processor answered ${response.status} to event ${event.id}`);
  }
}
