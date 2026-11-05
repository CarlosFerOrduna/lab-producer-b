import { ItemEntity } from '../entities/item.entity';

/** An item, and whether it came from the cache. */
export interface ItemLookup {
  item: ItemEntity;
  cacheStatus: 'HIT' | 'MISS';
}
