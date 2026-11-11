import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PUBLISHING } from './constants/publishing.constant';
import { KafkaEventPublisher } from './kafka-event-publisher.service';
import { KafkaStartupService } from './kafka-startup.service';

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const altnameError = codedError('ERR_TLS_CERT_ALTNAME_INVALID', "Hostname/IP does not match certificate's altnames");
const refusedError = codedError('ECONNREFUSED', 'connect ECONNREFUSED 10.43.0.10:9093');

describe('KafkaStartupService', () => {
  let checkBrokers: jest.Mock;
  let onReachable: jest.Mock;
  let service: KafkaStartupService;
  let wait: jest.SpyInstance;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  let exit: jest.SpyInstance;
  let now: number;

  beforeEach(() => {
    now = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    checkBrokers = jest.fn().mockResolvedValue(undefined);
    onReachable = jest.fn();
    const config = { getOrThrow: jest.fn().mockReturnValue('producer-b.items') };
    service = new KafkaStartupService(
      config as unknown as ConfigService,
      {
        checkBrokers,
      } as unknown as KafkaEventPublisher,
    );
    wait = jest
      .spyOn(service as unknown as { wait: (ms: number) => Promise<void> }, 'wait')
      .mockImplementation((ms) => {
        now += ms;
        return Promise.resolve();
      });
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    exit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls onReachable once a broker answers', async () => {
    checkBrokers.mockRejectedValueOnce(refusedError).mockResolvedValue(undefined);

    await service.start(onReachable);

    expect(checkBrokers).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('Kafka answers for producer-b.items');
    expect(onReachable).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it('fails at once on a certificate error, without retrying, and exits with 1', async () => {
    checkBrokers.mockRejectedValue(new AggregateError([altnameError], 'Cannot connect to any broker.'));

    await service.start(onReachable);

    expect(checkBrokers).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(onReachable).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('<- Error[ERR_TLS_CERT_ALTNAME_INVALID]'));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('retries an unreachable Kafka until the startup deadline, then exits with 1', async () => {
    checkBrokers.mockRejectedValue(new AggregateError([refusedError], 'Cannot connect to any broker.'));

    await service.start(onReachable);

    expect(checkBrokers).toHaveBeenCalledTimes(PUBLISHING.startupTimeoutMs / PUBLISHING.startupRetryDelayMs);
    expect(onReachable).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Kafka was not reachable within 120 s <- Error[ECONNREFUSED]'),
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('never rejects, even if logging the failure throws', async () => {
    checkBrokers.mockRejectedValue(altnameError);
    error.mockImplementation(() => {
      throw new Error('stdout closed');
    });

    await expect(service.start(onReachable)).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does not treat a shutdown during startup as a failure', async () => {
    checkBrokers.mockRejectedValue(refusedError);
    wait.mockImplementation(() => {
      service.stop();
      return Promise.reject(new DOMException('The operation was aborted', 'AbortError'));
    });

    await service.start(onReachable);

    expect(onReachable).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Stopped before publishing started');
    expect(exit).not.toHaveBeenCalled();
  });

  it('does not start publishing if the shutdown came while the brokers were answering', async () => {
    checkBrokers.mockImplementation(() => {
      service.stop();
      return Promise.resolve();
    });

    await service.start(onReachable);

    expect(onReachable).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
