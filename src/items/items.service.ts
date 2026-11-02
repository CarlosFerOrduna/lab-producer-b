import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PUBLISHING } from '../publishing/constants/publishing.constant';
import type { EventPublisher } from '../publishing/types/event-publisher.type';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsDto } from './dto/list-items.dto';
import { ItemEntity } from './entities/item.entity';
import { ItemsRepository } from './items.repository';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    private readonly itemsRepository: ItemsRepository,
    @Inject(PUBLISHING.eventPublisherToken) private readonly eventPublisher: EventPublisher,
  ) {}

  /** Adds an item to the catalog, then publishes item.created. */
  async create(newItem: CreateItemDto): Promise<ItemEntity> {
    const item = await this.itemsRepository.addToCatalog(newItem);
    await this.publishItemCreated(item);
    return item;
  }

  list(query: ListItemsDto): Promise<ItemEntity[]> {
    return this.itemsRepository.findLatest(query);
  }

  async getById(id: string): Promise<ItemEntity> {
    const item = await this.itemsRepository.findOneBy({ id });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found`);
    }

    return item;
  }

  private async publishItemCreated(item: ItemEntity): Promise<void> {
    try {
      await this.eventPublisher.publish({
        id: randomUUID(),
        source: PUBLISHING.eventSource,
        type: 'item.created',
        occurredAt: item.createdAt.toISOString(),
        payload: { itemId: item.id, name: item.name, quantity: item.quantity },
      });
    } catch (error) {
      // El item ya quedó guardado: sin un outbox transaccional el evento se pierde, así que al menos queda registrado.
      this.logger.error(
        `Item ${item.id} was saved but its item.created event was not published`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
