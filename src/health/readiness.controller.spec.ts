import { ServiceUnavailableException } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { ReadinessController } from './readiness.controller';

describe('ReadinessController', () => {
  let query: jest.Mock;
  let set: jest.Mock;
  let controller: ReadinessController;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    set = jest.fn().mockResolvedValue('OK');
    controller = new ReadinessController({ query } as unknown as DataSource, { set } as unknown as Redis);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is ready when the database answers and the queue accepts a write', async () => {
    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(set).toHaveBeenCalledWith('health:producer-b:ready', expect.any(String), 'PX', 10_000);
  });

  it('is not ready when the database fails', async () => {
    query.mockRejectedValue(new Error('connection refused'));

    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });

  it('is not ready when the queue rejects writes, as a full noeviction Valkey does', async () => {
    set.mockRejectedValue(new Error("OOM command not allowed when used memory > 'maxmemory'."));

    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });

  it('is not ready when a dependency does not answer in time', async () => {
    jest.useFakeTimers();
    query.mockReturnValue(new Promise(() => undefined));

    const readiness = controller.ready();
    await jest.advanceTimersByTimeAsync(1000);

    await expect(readiness).rejects.toThrow(ServiceUnavailableException);
  });
});
