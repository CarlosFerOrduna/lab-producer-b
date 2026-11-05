import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { setTimeout as sleep } from 'node:timers/promises';
import { DataSource } from 'typeorm';
import { EVENT_QUEUE } from '../queue/constants/event-queue.constant';

const DEPENDENCY_TIMEOUT_MS = 1000;
const READINESS_KEY = 'health:producer-b:ready';

/** Readiness checks the database and the queue. */
@Controller('health')
export class ReadinessController {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(EVENT_QUEUE.probeClientToken) private readonly queueClient: Redis,
  ) {}

  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    const [isDatabaseReachable, isQueueWritable] = await Promise.all([
      this.withinTimeout(() => this.dataSource.query('SELECT 1')),
      // Una escritura y no un PING: con noeviction, Valkey lleno responde PING pero rechaza escrituras.
      this.withinTimeout(() => this.queueClient.set(READINESS_KEY, Date.now().toString(), 'PX', 10_000)),
    ]);
    if (!isDatabaseReachable || !isQueueWritable) {
      throw new ServiceUnavailableException({
        message: 'A dependency is not ready',
        database: isDatabaseReachable ? 'ok' : 'unavailable',
        queue: isQueueWritable ? 'ok' : 'unavailable',
      });
    }

    return { status: 'ok' };
  }

  private async withinTimeout(check: () => Promise<unknown>): Promise<boolean> {
    const timeout = new AbortController();
    try {
      const outcome = await Promise.race([
        check().then(() => 'done' as const),
        sleep(DEPENDENCY_TIMEOUT_MS, 'timed-out' as const, { signal: timeout.signal }),
      ]);
      return outcome === 'done';
    } catch {
      return false;
    } finally {
      timeout.abort();
    }
  }
}
