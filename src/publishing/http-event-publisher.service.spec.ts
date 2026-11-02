import { ConfigService } from '@nestjs/config';
import { EventPublishError } from './event-publish.error';
import { HttpEventPublisher } from './http-event-publisher.service';
import { PublishedEvent } from './types/published-event.type';

describe('HttpEventPublisher', () => {
  const event: PublishedEvent = {
    id: '0b6f3c2e-6c1a-4c55-9a59-1f0d6f2c9b11',
    source: 'producer-b',
    type: 'item.created',
    occurredAt: '2026-11-02T18:00:00.000Z',
    payload: { name: 'first' },
  };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let publisher: HttpEventPublisher;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    const config = { getOrThrow: () => 'http://processor:3000' } as unknown as ConfigService;
    publisher = new HttpEventPublisher(config);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('posts the event to the processor', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    await publisher.publish(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://processor:3000/events');
    expect(JSON.parse(init?.body as string)).toEqual(event);
  });

  it('retries a server error and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));

    await publisher.publish(event);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry an event the processor rejects', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));

    await expect(publisher.publish(event)).rejects.toThrow(EventPublishError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails after the last attempt when the processor is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(publisher.publish(event)).rejects.toThrow(EventPublishError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
