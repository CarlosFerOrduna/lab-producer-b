import { EventPublisher } from '../publishing/types/event-publisher.type';
import { ItemEntity } from './entities/item.entity';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

describe('ItemsService', () => {
  const savedItem = Object.assign(new ItemEntity(), {
    id: '5d3c1f0e-2a4b-4c6d-8e9f-0a1b2c3d4e5f',
    name: 'first',
    quantity: 2,
    createdAt: new Date('2026-11-02T18:00:00.000Z'),
  });
  let itemsRepository: jest.Mocked<Pick<ItemsRepository, 'addToCatalog'>>;
  let eventPublisher: jest.Mocked<EventPublisher>;
  let service: ItemsService;

  beforeEach(() => {
    itemsRepository = { addToCatalog: jest.fn().mockResolvedValue(savedItem) };
    eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    service = new ItemsService(itemsRepository as unknown as ItemsRepository, eventPublisher);
  });

  it('publishes item.created after saving the item', async () => {
    await expect(service.create({ name: 'first', quantity: 2 })).resolves.toBe(savedItem);

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      id: expect.any(String),
      source: 'producer-b',
      type: 'item.created',
      occurredAt: '2026-11-02T18:00:00.000Z',
      payload: { itemId: savedItem.id, name: 'first', quantity: 2 },
    });
  });

  it('keeps the saved item when the event cannot be published', async () => {
    eventPublisher.publish.mockRejectedValue(new Error('processor down'));

    await expect(service.create({ name: 'first', quantity: 2 })).resolves.toBe(savedItem);
  });
});
