import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Producer, stringSerializers } from '@platformatic/kafka';
import { readFileSync } from 'node:fs';
import { ErrorCausesUtil } from '../common/utils/error-causes.util';
import { PUBLISHING } from './constants/publishing.constant';
import { EventKeyUtil } from './event-key.util';
import { EventPublishError } from './event-publish.error';
import { EventRejectedError } from './event-rejected.error';
import { KafkaConnectionUtil } from './kafka-connection.util';
import { EventPublisher } from './types/event-publisher.type';
import { KafkaProducer } from './types/kafka-producer.type';
import { PublishedEvent } from './types/published-event.type';

/**
 * Publishes each event to the configured Kafka topic, keyed by the id of its item, in a single
 * attempt bounded by a timeout. Retries belong to the queue.
 */
@Injectable()
export class KafkaEventPublisher implements EventPublisher, OnApplicationShutdown {
  private readonly topic: string;
  private producer?: KafkaProducer;

  constructor(private readonly config: ConfigService) {
    this.topic = config.getOrThrow<string>('KAFKA_TOPIC');
  }

  /** Asks the brokers for the topic's metadata once, without retries. Throws if no broker answers. */
  async checkBrokers(): Promise<void> {
    await this.getProducer().metadata({ topics: [this.topic], retries: 0 });
  }

  async publish(event: PublishedEvent): Promise<void> {
    try {
      const sending = this.getProducer().send({
        messages: [
          {
            topic: this.topic,
            key: EventKeyUtil.keyOf(event),
            value: JSON.stringify(event),
          },
        ],
      });
      await this.within(sending, PUBLISHING.sendTimeoutMs);
    } catch (error) {
      const reason = ErrorCausesUtil.describe(error);
      if (KafkaConnectionUtil.isRejectedRecord(error)) {
        throw new EventRejectedError(`Kafka rejected event ${event.id}: ${reason}`, { cause: error });
      }
      throw new EventPublishError(`Event ${event.id} did not reach Kafka: ${reason}`, { cause: error });
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.producer?.close();
  }

  /** The Kafka client, with mTLS from the mounted certificate files. */
  protected createProducer(): KafkaProducer {
    return new Producer({
      clientId: this.config.getOrThrow<string>('KAFKA_CLIENT_ID'),
      bootstrapBrokers: this.config.getOrThrow<string>('KAFKA_BOOTSTRAP_BROKERS').split(','),
      // Solo ca, cert y key: Node verifica la cadena y el hostname del broker por defecto, y no hay que tocarlo.
      tls: {
        ca: readFileSync(this.config.getOrThrow<string>('KAFKA_CA_FILE')),
        cert: readFileSync(this.config.getOrThrow<string>('KAFKA_CERT_FILE')),
        key: readFileSync(this.config.getOrThrow<string>('KAFKA_KEY_FILE')),
      },
      // idempotent: el broker descarta los duplicados de los reintentos internos del cliente (no los de BullMQ).
      idempotent: true,
      acks: -1,
      serializers: stringSerializers,
      connectTimeout: PUBLISHING.clientConnectTimeoutMs,
      requestTimeout: PUBLISHING.clientRequestTimeoutMs,
      timeout: PUBLISHING.produceAckTimeoutMs,
      retries: PUBLISHING.clientRetries,
      retryDelay: PUBLISHING.clientRetryDelayMs,
    });
  }

  private getProducer(): KafkaProducer {
    this.producer ??= this.createProducer();
    return this.producer;
  }

  /** Waits for the send, or rejects once the timeout passes. */
  private async within(sending: Promise<unknown>, timeoutMs: number): Promise<void> {
    // Si vence el plazo, el send sigue en el cliente: su resultado tardío se descarta (y no queda un rechazo sin manejar).
    sending.catch(() => undefined);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Kafka did not answer within ${timeoutMs / 1000} s`)), timeoutMs);
    });
    try {
      await Promise.race([sending, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
