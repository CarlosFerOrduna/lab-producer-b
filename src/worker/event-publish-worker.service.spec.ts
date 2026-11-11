import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { KafkaStartupService } from '../publishing/kafka-startup.service';
import { EventPublishProcessor } from './event-publish.processor';
import { EventPublishWorkerService } from './event-publish-worker.service';

jest.mock('bullmq', () => ({ Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })) }));

describe('EventPublishWorkerService', () => {
  let start: jest.Mock;
  let stop: jest.Mock;
  let service: EventPublishWorkerService;

  beforeEach(() => {
    jest.mocked(Worker).mockClear();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    start = jest.fn().mockResolvedValue(undefined);
    stop = jest.fn();
    const config = { getOrThrow: jest.fn().mockReturnValue('valkey-queue'), get: jest.fn() };
    service = new EventPublishWorkerService(
      config as unknown as ConfigService,
      {} as EventPublishProcessor,
      { start, stop } as unknown as KafkaStartupService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('takes no job from the queue until Kafka answers', () => {
    service.onApplicationBootstrap();

    expect(start).toHaveBeenCalledTimes(1);
    expect(Worker).not.toHaveBeenCalled();

    const onReachable = start.mock.calls[0][0] as () => void;
    onReachable();

    expect(Worker).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for Kafka on shutdown', async () => {
    service.onApplicationBootstrap();

    await service.beforeApplicationShutdown();

    expect(stop).toHaveBeenCalled();
  });
});
