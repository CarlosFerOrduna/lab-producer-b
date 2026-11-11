import type { Producer } from '@platformatic/kafka';

/** The Kafka producer as producer-b uses it: string keys, values and headers. */
export type KafkaProducer = Producer<string, string, string, string>;
