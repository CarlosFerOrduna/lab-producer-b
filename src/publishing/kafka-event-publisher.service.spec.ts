import { ConfigService } from '@nestjs/config';
import { ProtocolError } from '@platformatic/kafka';
import { PUBLISHING } from './constants/publishing.constant';
import { EventPublishError } from './event-publish.error';
import { EventRejectedError } from './event-rejected.error';
import { KafkaEventPublisher } from './kafka-event-publisher.service';
import { KafkaProducer } from './types/kafka-producer.type';
import { PublishedEvent } from './types/published-event.type';

describe('KafkaEventPublisher', () => {
  const event: PublishedEvent = {
    id: '0b6f3c2e-6c1a-4c55-9a59-1f0d6f2c9b11',
    source: 'producer-b',
    type: 'item.created',
    occurredAt: '2026-11-06T18:00:00.000Z',
    payload: { itemId: '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f', name: 'bolt', quantity: 3 },
  };
  let send: jest.Mock;
  let metadata: jest.Mock;
  let close: jest.Mock;
  let publisher: KafkaEventPublisher;

  beforeEach(() => {
    send = jest.fn().mockResolvedValue({ offsets: [] });
    metadata = jest.fn().mockResolvedValue({});
    close = jest.fn().mockResolvedValue(undefined);
    const config = { getOrThrow: jest.fn().mockReturnValue('producer-b.items') };
    publisher = new KafkaEventPublisher(config as unknown as ConfigService);
    jest
      .spyOn(publisher as unknown as { createProducer: () => KafkaProducer }, 'createProducer')
      .mockReturnValue({ send, metadata, close } as unknown as KafkaProducer);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('sends the whole event as the value, keyed by its item id, in a single attempt', async () => {
    await publisher.publish(event);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      messages: [
        {
          topic: 'producer-b.items',
          key: '5c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
          value: JSON.stringify(event),
        },
      ],
    });
  });

  it('reports a record Kafka refuses as not retryable', async () => {
    send.mockRejectedValue(new Error('Producing failed.', { cause: new ProtocolError('MESSAGE_TOO_LARGE') }));

    await expect(publisher.publish(event)).rejects.toThrow(EventRejectedError);
  });

  it('reports an unreachable Kafka as retryable, without retrying itself', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.43.0.10:9093'), { code: 'ECONNREFUSED' });
    send.mockRejectedValue(new AggregateError([refused], 'Cannot connect to any broker.'));

    const publishing = publisher.publish(event);

    await expect(publishing).rejects.toThrow(EventPublishError);
    await expect(publishing).rejects.not.toThrow(EventRejectedError);
    await expect(publishing).rejects.toThrow(/<- Error\[ECONNREFUSED\]/);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('gives up when Kafka does not answer in time, as retryable', async () => {
    jest.useFakeTimers();
    send.mockReturnValue(new Promise(() => undefined));

    const publishing = publisher.publish(event);
    const outcome = expect(publishing).rejects.toThrow('Kafka did not answer within 5 s');
    await jest.advanceTimersByTimeAsync(PUBLISHING.sendTimeoutMs);

    await outcome;
    await expect(publishing).rejects.not.toThrow(EventRejectedError);
  });

  it('ignores a send that fails after the timeout, without an unhandled rejection', async () => {
    jest.useFakeTimers();
    let rejectSend: (reason: Error) => void = () => undefined;
    send.mockReturnValue(new Promise((_, reject) => (rejectSend = reject)));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    const publishing = publisher.publish(event);
    const outcome = expect(publishing).rejects.toThrow(EventPublishError);
    await jest.advanceTimersByTimeAsync(PUBLISHING.sendTimeoutMs);
    await outcome;
    rejectSend(new Error('Client is closed.'));
    jest.useRealTimers();
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('checks the brokers once, without retries', async () => {
    await publisher.checkBrokers();

    expect(metadata).toHaveBeenCalledWith({ topics: ['producer-b.items'], retries: 0 });
  });

  it('closes the producer on shutdown, and does nothing if it never started', async () => {
    await publisher.onApplicationShutdown();
    expect(close).not.toHaveBeenCalled();

    await publisher.publish(event);
    await publisher.onApplicationShutdown();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
