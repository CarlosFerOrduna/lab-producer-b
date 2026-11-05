import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'bullmq';
import { EVENT_QUEUE } from './constants/event-queue.constant';

/** Helpers for the events queue: how to reach its Valkey, and how long to wait between attempts. */
export class EventQueueUtil {
  /** Connection to the queue's Valkey, from the validated environment. */
  static connectionOptions(config: ConfigService): RedisOptions {
    return {
      host: config.getOrThrow<string>('QUEUE_HOST'),
      port: config.getOrThrow<number>('QUEUE_PORT'),
      password: config.getOrThrow<string>('QUEUE_PASSWORD'),
    };
  }

  /** Delay before the next attempt: doubles from 1 s and never exceeds 60 s. */
  static backoffDelay(attemptsMade: number): number {
    const exponentialDelay = EVENT_QUEUE.initialBackoffMs * 2 ** Math.max(attemptsMade - 1, 0);
    return Math.min(exponentialDelay, EVENT_QUEUE.maxBackoffMs);
  }
}
