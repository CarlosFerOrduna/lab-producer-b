import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemCacheModule } from '../cache/item-cache.module';
import { EventQueueModule } from '../queue/event-queue.module';
import { ItemEntity } from './entities/item.entity';
import { ItemsCacheService } from './items-cache.service';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity]), EventQueueModule, ItemCacheModule],
  controllers: [ItemsController],
  providers: [ItemsRepository, ItemsCacheService, ItemsService],
})
export class ItemsModule {}
