import { EventPublishError } from './event-publish.error';

/** The processor refused the event as invalid: sending it again would get the same answer. */
export class EventRejectedError extends EventPublishError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EventRejectedError';
  }
}
