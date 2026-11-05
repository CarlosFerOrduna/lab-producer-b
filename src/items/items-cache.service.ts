import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ITEM_CACHE } from '../cache/constants/item-cache.constant';
import { ItemEntity } from './entities/item.entity';

/** Cache-aside storage for items. Every failure counts as a miss: the database stays the source of truth. */
@Injectable()
export class ItemsCacheService {
  private readonly logger = new Logger(ItemsCacheService.name);

  constructor(@Inject(ITEM_CACHE.clientToken) private readonly cacheClient: Redis) {}

  /** Returns the cached item, or null if it is not cached or the cache does not answer. */
  async find(id: string): Promise<ItemEntity | null> {
    try {
      const cached = await this.cacheClient.get(this.key(id));
      if (cached === null) {
        return null;
      }

      const stored = JSON.parse(cached) as Omit<ItemEntity, 'createdAt'> & { createdAt: string };
      return Object.assign(new ItemEntity(), { ...stored, createdAt: new Date(stored.createdAt) });
    } catch (error) {
      this.logger.debug(`Cache read failed for item ${id}: ${this.reason(error)}`);
      return null;
    }
  }

  /** Stores the item for a while. A failure is ignored: the next read goes to the database again. */
  async remember(item: ItemEntity): Promise<void> {
    try {
      await this.cacheClient.set(this.key(item.id), JSON.stringify(item), 'EX', ITEM_CACHE.ttlSeconds);
    } catch (error) {
      this.logger.debug(`Cache write failed for item ${item.id}: ${this.reason(error)}`);
    }
  }

  private key(id: string): string {
    return `${ITEM_CACHE.keyPrefix}${id}`;
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
