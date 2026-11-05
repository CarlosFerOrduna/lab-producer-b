import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PUBLISHING } from '../publishing/constants/publishing.constant';
import { PublishedEvent } from '../publishing/types/published-event.type';
import { EVENT_QUEUE } from '../queue/constants/event-queue.constant';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsDto } from './dto/list-items.dto';
import { ItemEntity } from './entities/item.entity';
import { ItemsRepository } from './items.repository';

@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    private readonly itemsRepository: ItemsRepository,
    @Inject(EVENT_QUEUE.queueToken) private readonly eventQueue: Queue<PublishedEvent>,
  ) {}

  /** Adds an item to the catalog, then queues item.created for the worker to publish. */
  async create(newItem: CreateItemDto): Promise<ItemEntity> {
    const item = await this.itemsRepository.addToCatalog(newItem);
    await this.queueItemCreated(item);
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

  private async queueItemCreated(item: ItemEntity): Promise<void> {
    const event: PublishedEvent = {
      id: randomUUID(),
      source: PUBLISHING.eventSource,
      type: 'item.created',
      occurredAt: item.createdAt.toISOString(),
      payload: { itemId: item.id, name: item.name, quantity: item.quantity },
    };

    try {
      await this.eventQueue.add(EVENT_QUEUE.jobName, event, { jobId: event.id });
    } catch (error) {
      // Escritura doble: el item ya quedó guardado y el evento no. Sin outbox (etapa 07), al menos queda registrado.
      this.logger.error(
        `Item ${item.id} was saved but its item.created event was not queued`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
