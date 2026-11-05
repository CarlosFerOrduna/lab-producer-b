import { Redis } from 'ioredis';
import { ItemEntity } from './entities/item.entity';
import { ItemsCacheService } from './items-cache.service';

describe('ItemsCacheService', () => {
  const item = Object.assign(new ItemEntity(), {
    id: '5d3c1f0e-2a4b-4c6d-8e9f-0a1b2c3d4e5f',
    name: 'first',
    quantity: 2,
    createdAt: new Date('2026-11-05T18:00:00.000Z'),
  });
  let get: jest.Mock;
  let set: jest.Mock;
  let cache: ItemsCacheService;

  beforeEach(() => {
    get = jest.fn();
    set = jest.fn();
    cache = new ItemsCacheService({ get, set } as unknown as Redis);
  });

  it('stores an item with a TTL and reads it back as an entity with its dates', async () => {
    set.mockResolvedValue('OK');
    await cache.remember(item);
    const [key, value, mode, ttl] = set.mock.calls[0];
    expect([key, mode, ttl]).toEqual([`item:${item.id}`, 'EX', 300]);

    get.mockResolvedValue(value);
    const found = await cache.find(item.id);

    expect(found).toBeInstanceOf(ItemEntity);
    expect(found).toEqual(item);
  });

  it('reports a missing key as a miss', async () => {
    get.mockResolvedValue(null);

    await expect(cache.find(item.id)).resolves.toBeNull();
  });

  it('reports a cache that does not answer as a miss', async () => {
    get.mockRejectedValue(new Error('Command timed out'));

    await expect(cache.find(item.id)).resolves.toBeNull();
  });

  it('ignores a failed write', async () => {
    set.mockRejectedValue(new Error("Stream isn't writeable"));

    await expect(cache.remember(item)).resolves.toBeUndefined();
  });
});
