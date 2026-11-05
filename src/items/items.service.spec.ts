import { NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ItemEntity } from './entities/item.entity';
import { ItemsCacheService } from './items-cache.service';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

describe('ItemsService', () => {
  const savedItem = Object.assign(new ItemEntity(), {
    id: '5d3c1f0e-2a4b-4c6d-8e9f-0a1b2c3d4e5f',
    name: 'first',
    quantity: 2,
    createdAt: new Date('2026-11-05T18:00:00.000Z'),
  });
  let itemsRepository: jest.Mocked<Pick<ItemsRepository, 'addToCatalog' | 'findOneBy'>>;
  let itemsCache: jest.Mocked<Pick<ItemsCacheService, 'find' | 'remember'>>;
  let add: jest.Mock;
  let service: ItemsService;

  beforeEach(() => {
    itemsRepository = { addToCatalog: jest.fn().mockResolvedValue(savedItem), findOneBy: jest.fn() };
    itemsCache = { find: jest.fn(), remember: jest.fn().mockResolvedValue(undefined) };
    add = jest.fn().mockResolvedValue(undefined);
    service = new ItemsService(
      itemsRepository as unknown as ItemsRepository,
      itemsCache as unknown as ItemsCacheService,
      { add } as unknown as Queue,
    );
  });

  it('queues item.created after saving the item, with the event id as the job id', async () => {
    await expect(service.create({ name: 'first', quantity: 2 })).resolves.toBe(savedItem);

    const [jobName, event, options] = add.mock.calls[0];
    expect(jobName).toBe('publish');
    expect(event).toEqual({
      id: expect.any(String),
      source: 'producer-b',
      type: 'item.created',
      occurredAt: '2026-11-05T18:00:00.000Z',
      payload: { itemId: savedItem.id, name: 'first', quantity: 2 },
    });
    expect(options).toEqual({ jobId: event.id });
  });

  it('keeps the saved item when the event cannot be queued', async () => {
    add.mockRejectedValue(new Error('queue down'));

    await expect(service.create({ name: 'first', quantity: 2 })).resolves.toBe(savedItem);
  });

  it('answers from the cache on a hit, without reading the database', async () => {
    itemsCache.find.mockResolvedValue(savedItem);

    await expect(service.getById(savedItem.id)).resolves.toEqual({ item: savedItem, cacheStatus: 'HIT' });
    expect(itemsRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('reads the database on a miss, and fills the cache', async () => {
    itemsCache.find.mockResolvedValue(null);
    itemsRepository.findOneBy.mockResolvedValue(savedItem);

    await expect(service.getById(savedItem.id)).resolves.toEqual({ item: savedItem, cacheStatus: 'MISS' });
    expect(itemsCache.remember).toHaveBeenCalledWith(savedItem);
  });

  it('fails with not found when the item does not exist', async () => {
    itemsCache.find.mockResolvedValue(null);
    itemsRepository.findOneBy.mockResolvedValue(null);

    await expect(service.getById(savedItem.id)).rejects.toThrow(NotFoundException);
  });
});
