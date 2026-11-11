import { PublishedEvent } from './published-event.type';

/** Delivers events to the processor. Kafka today; the worker does not depend on how. */
export interface EventPublisher {
  publish(event: PublishedEvent): Promise<void>;
}
