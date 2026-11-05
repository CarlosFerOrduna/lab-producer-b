import { Job, UnrecoverableError } from 'bullmq';
import { EventPublishError } from '../publishing/event-publish.error';
import { EventRejectedError } from '../publishing/event-rejected.error';
import { EventPublisher } from '../publishing/types/event-publisher.type';
import { PublishedEvent } from '../publishing/types/published-event.type';
import { EventPublishProcessor } from './event-publish.processor';

describe('EventPublishProcessor', () => {
  const event: PublishedEvent = {
    id: '0b6f3c2e-6c1a-4c55-9a59-1f0d6f2c9b11',
    source: 'producer-b',
    type: 'item.created',
    occurredAt: '2026-11-05T18:00:00.000Z',
    payload: { name: 'first' },
  };
  const job = { data: event } as Job<PublishedEvent>;
  let eventPublisher: jest.Mocked<EventPublisher>;
  let processor: EventPublishProcessor;

  beforeEach(() => {
    eventPublisher = { publish: jest.fn() };
    processor = new EventPublishProcessor(eventPublisher);
  });

  it('publishes the queued event', async () => {
    eventPublisher.publish.mockResolvedValue(undefined);

    await processor.process(job);

    expect(eventPublisher.publish).toHaveBeenCalledWith(event);
  });

  it('marks an event the processor rejected as not retryable', async () => {
    eventPublisher.publish.mockRejectedValue(new EventRejectedError('rejected with 400'));

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('lets any other failure be retried by the queue', async () => {
    const failure = new EventPublishError('processor down');
    eventPublisher.publish.mockRejectedValue(failure);

    await expect(processor.process(job)).rejects.toBe(failure);
  });
});
