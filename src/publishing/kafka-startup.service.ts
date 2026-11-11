import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { ErrorCausesUtil } from '../common/utils/error-causes.util';
import { PUBLISHING } from './constants/publishing.constant';
import { KafkaConnectionUtil } from './kafka-connection.util';
import { KafkaEventPublisher } from './kafka-event-publisher.service';

/** Checks that Kafka answers before the worker takes any job from the queue. */
@Injectable()
export class KafkaStartupService {
  private readonly logger = new Logger(KafkaStartupService.name);
  private readonly shutdown = new AbortController();

  constructor(
    private readonly config: ConfigService,
    private readonly kafkaEventPublisher: KafkaEventPublisher,
  ) {}

  /**
   * Waits until a broker answers with the topic's metadata, then calls onReachable. A certificate
   * error fails at once; anything else is retried every 2 s for at most 120 s. A failed start logs
   * the root cause and exits with 1. Never rejects.
   */
  async start(onReachable: () => void): Promise<void> {
    try {
      await this.waitForBrokers(Date.now() + PUBLISHING.startupTimeoutMs);
      if (this.shutdown.signal.aborted) {
        this.logger.log('Stopped before publishing started');
        return;
      }
      this.logger.log(`Kafka answers for ${this.config.getOrThrow<string>('KAFKA_TOPIC')}`);
      onReachable();
    } catch (error) {
      this.onStartFailed(error);
    }
  }

  /** Stops waiting for Kafka: a start in progress ends without calling onReachable and without exiting. */
  stop(): void {
    this.shutdown.abort();
  }

  private async waitForBrokers(deadline: number): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.kafkaEventPublisher.checkBrokers();
        return;
      } catch (error) {
        if (KafkaConnectionUtil.isCertificateError(error)) {
          throw error;
        }
        const delay = PUBLISHING.startupRetryDelayMs;
        if (Date.now() + delay >= deadline) {
          const seconds = PUBLISHING.startupTimeoutMs / 1000;
          throw new Error(`Kafka was not reachable within ${seconds} s`, { cause: error });
        }
        this.logger.warn(`Kafka is not reachable yet (attempt ${attempt}): ${ErrorCausesUtil.describe(error)}`);
        await this.wait(delay);
      }
    }
  }

  /** Waits before the next attempt; rejects if the worker shuts down meanwhile. */
  protected async wait(delayMs: number): Promise<void> {
    await sleep(delayMs, undefined, { signal: this.shutdown.signal });
  }

  /** Ends every failed start: logs why and exits. Never throws, so the start never rejects. */
  private onStartFailed(error: unknown): void {
    try {
      if (this.shutdown.signal.aborted) {
        this.logger.log('Stopped before publishing started');
        return;
      }
      this.logger.error(`Could not start publishing: ${ErrorCausesUtil.describe(error)}`);
    } catch {
      // Si hasta el log falla, igual hay que salir: un worker que no puede publicar no puede quedar vivo.
    }
    if (!this.shutdown.signal.aborted) {
      process.exit(1);
    }
  }
}
