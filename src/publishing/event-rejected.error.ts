import { EventPublishError } from './event-publish.error';

/** The event itself was refused (Kafka rejected the record): sending it again would get the same answer. */
export class EventRejectedError extends EventPublishError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EventRejectedError';
  }
}
