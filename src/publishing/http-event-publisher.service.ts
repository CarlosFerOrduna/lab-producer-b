import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { PUBLISHING } from './constants/publishing.constant';
import { EventPublishError } from './event-publish.error';
import { EventPublisher } from './types/event-publisher.type';
import { PublishedEvent } from './types/published-event.type';

/** Publishes events with POST /events on the processor, retrying transient failures. */
@Injectable()
export class HttpEventPublisher implements EventPublisher {
  private readonly logger = new Logger(HttpEventPublisher.name);
  private readonly eventsUrl: string;

  constructor(config: ConfigService) {
    this.eventsUrl = new URL('/events', config.getOrThrow<string>('PROCESSOR_URL')).toString();
  }

  async publish(event: PublishedEvent): Promise<void> {
    let lastFailure = '';

    for (let attempt = 1; attempt <= PUBLISHING.maxAttempts; attempt++) {
      if (attempt > 1) {
        await sleep(PUBLISHING.initialBackoffMs * 2 ** (attempt - 2));
      }

      try {
        const response = await fetch(this.eventsUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(PUBLISHING.requestTimeoutMs),
        });
        if (response.ok) {
          return;
        }

        // Un 4xx es un evento mal formado: reintentarlo daría el mismo resultado.
        if (response.status < 500) {
          throw new EventPublishError(`The processor rejected event ${event.id} with ${response.status}`);
        }
        lastFailure = `status ${response.status}`;
      } catch (error) {
        if (error instanceof EventPublishError) {
          throw error;
        }
        lastFailure = error instanceof Error ? error.message : String(error);
      }

      this.logger.warn(`Attempt ${attempt} to publish event ${event.id} failed: ${lastFailure}`);
    }

    throw new EventPublishError(
      `Event ${event.id} not published after ${PUBLISHING.maxAttempts} attempts: ${lastFailure}`,
    );
  }
}
