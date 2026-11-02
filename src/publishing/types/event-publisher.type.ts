import { PublishedEvent } from './published-event.type';

/** Delivers events to the processor. HTTP today; Kafka replaces the implementation in a later stage. */
export interface EventPublisher {
  publish(event: PublishedEvent): Promise<void>;
}
