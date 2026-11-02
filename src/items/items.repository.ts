import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { ListItemsDto } from './dto/list-items.dto';
import { ItemEntity } from './entities/item.entity';

@Injectable()
export class ItemsRepository extends Repository<ItemEntity> {
  constructor(dataSource: DataSource) {
    super(ItemEntity, dataSource.createEntityManager());
  }

  /** Stores a new item and returns it with its generated id and creation time. */
  addToCatalog(item: CreateItemDto): Promise<ItemEntity> {
    return this.save(this.create(item));
  }

  /** Returns the most recently added items. */
  findLatest({ limit, offset }: ListItemsDto): Promise<ItemEntity[]> {
    return this.find({ order: { createdAt: 'DESC', id: 'ASC' }, take: limit, skip: offset });
  }
}
