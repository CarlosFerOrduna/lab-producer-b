import { ConfigService } from '@nestjs/config';
import { EventQueueUtil } from './event-queue.util';

describe('EventQueueUtil', () => {
  describe('connectionOptions', () => {
    it('reads the queue connection from the environment', () => {
      const values: Record<string, string | number> = {
        QUEUE_HOST: 'valkey-queue',
        QUEUE_PORT: 6379,
        QUEUE_PASSWORD: 'secret',
      };
      const config = { getOrThrow: (key: string) => values[key] } as unknown as ConfigService;

      expect(EventQueueUtil.connectionOptions(config)).toEqual({
        host: 'valkey-queue',
        port: 6379,
        password: 'secret',
      });
    });
  });

  describe('backoffDelay', () => {
    it('doubles from one second', () => {
      expect([1, 2, 3, 4].map((attemptsMade) => EventQueueUtil.backoffDelay(attemptsMade))).toEqual([
        1000, 2000, 4000, 8000,
      ]);
    });

    it('never waits more than a minute', () => {
      expect(EventQueueUtil.backoffDelay(7)).toBe(60_000);
      expect(EventQueueUtil.backoffDelay(1000)).toBe(60_000);
    });
  });
});
